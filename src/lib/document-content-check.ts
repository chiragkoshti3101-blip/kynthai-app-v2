/**
 * Static content inspection for uploaded documents.
 *
 * Uploads cannot assume a malware scanner is installed. The production
 * deployment runs on a serverless host where the `clamav` binary does not
 * exist, so signature scanning is unavailable there (see `lib/antivirus.ts`).
 * Rather than rejecting every upload when no engine is present, the upload
 * route runs these checks first and refuses documents that carry the active
 * content those engines are mainly there to catch.
 *
 * Scope: this is content validation, not antivirus. It is cheap, runs on every
 * upload, and never claims a file is clean.
 */

export type ContentFinding = {
  /** Stable machine-readable code, safe to log and audit. */
  code: string;
  /** Human-readable description; never includes document contents. */
  label: string;
};

export type ContentInspection = {
  /** Findings that must reject the upload. */
  blocking: ContentFinding[];
  /** Findings worth recording but that do not reject the upload. */
  advisory: ContentFinding[];
};

const EXECUTABLE_MAGIC: ContentFinding[] = [
  { code: 'EXECUTABLE_MZ', label: 'Windows executable header' },
  { code: 'EXECUTABLE_ELF', label: 'ELF executable header' },
  { code: 'EXECUTABLE_MACHO', label: 'Mach-O executable header' },
];

/**
 * PDF tokens that turn a document into a program: embedded JavaScript, launch
 * actions (spawn an external handler), embedded files, and rich media.
 * Scanned licences, degrees and identity documents do not contain these.
 */
const PDF_ACTIVE_TOKENS: { token: string; finding: ContentFinding }[] = [
  { token: '/javascript', finding: { code: 'PDF_JAVASCRIPT', label: 'embedded JavaScript' } },
  { token: '/launch', finding: { code: 'PDF_LAUNCH', label: 'launch action' } },
  { token: '/embeddedfile', finding: { code: 'PDF_EMBEDDED_FILE', label: 'embedded file' } },
  { token: '/richmedia', finding: { code: 'PDF_RICH_MEDIA', label: 'rich media annotation' } },
  { token: '/xfa', finding: { code: 'PDF_XFA', label: 'XFA form scripts' } },
];

/** `/JS` alone also matches unrelated names, so only accept it as a bare key. */
const PDF_JS_KEY = /\/JS(?=[\s/[(<])/;

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buffer[i] !== bytes[i]) return false;
  return true;
}

function executableFinding(buffer: Buffer): ContentFinding | null {
  if (startsWith(buffer, [0x4d, 0x5a])) return EXECUTABLE_MAGIC[0]; // "MZ"
  if (startsWith(buffer, [0x7f, 0x45, 0x4c, 0x46])) return EXECUTABLE_MAGIC[1]; // \x7fELF
  if (
    startsWith(buffer, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWith(buffer, [0xfe, 0xed, 0xfa, 0xce])
  ) {
    return EXECUTABLE_MAGIC[2];
  }
  return null;
}

/**
 * Inspect an uploaded document's bytes.
 *
 * `mimeType` is the already-validated declared type; this runs after the
 * magic-byte check, so the declared type matches the leading bytes.
 */
export function inspectDocumentContent(buffer: Buffer, mimeType: string): ContentInspection {
  const blocking: ContentFinding[] = [];
  const advisory: ContentFinding[] = [];

  const executable = executableFinding(buffer);
  if (executable) blocking.push(executable);

  if (mimeType === 'application/pdf') {
    // PDF syntax is ASCII for its structure, therefore a latin1 read keeps a
    // 1:1 byte mapping while giving us simple case-insensitive searches.
    const text = buffer.toString('latin1').toLowerCase();
    for (const { token, finding } of PDF_ACTIVE_TOKENS) {
      if (text.includes(token)) blocking.push(finding);
    }
    if (PDF_JS_KEY.test(buffer.toString('latin1'))) {
      blocking.push({ code: 'PDF_JS_KEY', label: 'embedded JavaScript' });
    }
  }

  // A declared image or plain-text file that is secretly an archive is a
  // polyglot; archives themselves are only accepted when declared as such.
  if (mimeType !== 'application/zip' && startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    advisory.push({ code: 'POLYGLOT_ZIP', label: 'archive content under a non-archive type' });
  }

  return { blocking, advisory };
}
