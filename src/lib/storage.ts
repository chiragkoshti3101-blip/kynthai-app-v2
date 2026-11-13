// src/lib/storage.ts
// Supabase Storage client for medical documents

import { createClient } from '@supabase/supabase-js';
import { encryptFile, decryptFile, generateFileId, sanitizeFilename } from './encryption';

// Lazy-initialized Supabase admin client to avoid build-time errors
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          '[storage] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production'
        );
      }
      _supabaseAdmin = createClient(
        supabaseUrl || 'https://placeholder.supabase.co',
        supabaseServiceKey || 'placeholder',
        { auth: { persistSession: false } }
      );
    } else {
      _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });
    }
  }
  return _supabaseAdmin;
}
export { getSupabaseAdmin };
// Re-export as named supabaseAdmin for backward compatibility
export const supabaseAdmin = getSupabaseAdmin;

const BUCKET = 'medical-documents';

/**
 * Initialize the medical documents bucket
 * Run once during deployment or manually
 */
export async function initializeMedicalDocumentsBucket(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Check if bucket exists
    const { data: buckets } = await supabaseAdmin().storage.listBuckets();
    const exists = buckets?.some(b => b.name === BUCKET);

    if (!exists) {
      const { error } = await supabaseAdmin().storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/tiff',
          'application/dicom',
          'application/zip',
          'text/plain',
        ],
      });
      if (error) throw error;
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Upload encrypted file to Supabase Storage
 * Path format: {userId}/{type}/{fileId}.{ext}
 */
export async function uploadMedicalDocument(
  userId: string,
  type: string,
  fileId: string,
  fileExt: string,
  encryptedData: Buffer,
  metadata: Record<string, string> = {}
): Promise<{ path: string; error?: string }> {
  const path = `${userId}/${type}/${fileId}.${fileExt}`;

  const { data, error } = await supabaseAdmin().storage
    .from(BUCKET)
    .upload(path, encryptedData, {
      contentType: 'application/octet-stream', // Encrypted data
      upsert: false,
      metadata: {
        userId,
        type,
        fileId,
        ...metadata,
      },
    });

  if (error) {
    return { path: '', error: error.message };
  }

  return { path: data.path };
}

/**
 * Download encrypted file from Supabase Storage
 */
export async function downloadMedicalDocument(
  path: string
): Promise<{ data: Buffer | null; error?: string }> {
  const { data, error } = await supabaseAdmin().storage
    .from(BUCKET)
    .download(path);

  if (error) {
    return { data: null, error: error.message };
  }

  const arrayBuffer = await data.arrayBuffer();
  return { data: Buffer.from(arrayBuffer) };
}

/**
 * Generate signed URL for temporary access (1 hour default)
 */
export async function getSignedDocumentUrl(
  path: string,
  expiresIn = 3600
): Promise<{ url: string | null; error?: string }> {
  const { data, error } = await supabaseAdmin().storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) {
    return { url: null, error: error.message };
  }

  return { url: data.signedUrl };
}

/**
 * Delete document from storage
 */
export async function deleteMedicalDocument(path: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin().storage.from(BUCKET).remove([path]);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * List user's documents in storage (for verification/cleanup)
 */
export async function listUserDocuments(userId: string): Promise<{ files: string[]; error?: string }> {
  const { data, error } = await supabaseAdmin().storage
    .from(BUCKET)
    .list(userId, { limit: 1000 });

  if (error) return { files: [], error: error.message };

  const files: string[] = [];
  for (const folder of data || []) {
    if (folder.metadata?.type) {
      const typePath = `${userId}/${folder.name}`;
      const { data: typeFiles } = await supabaseAdmin().storage.from(BUCKET).list(typePath);
      for (const f of typeFiles || []) {
        files.push(`${typePath}/${f.name}`);
      }
    }
  }

  return { files };
}

/**
 * High-level upload: encrypt + store + create DB record
 */
export async function uploadAndStoreDocument(
  userId: string,
  uploadedById: string,
  file: Buffer,
  originalFilename: string,
  mimeType: string,
  options: {
    type: string;
    title: string;
    description?: string;
    category?: string;
    familyId?: string;
    visibility?: string;
    sharedWith?: string[];
  }
): Promise<{ documentId: string; error?: string }> {
  const fileId = generateFileId();
  const fileExt = originalFilename.split('.').pop()?.toLowerCase() || 'bin';
  const safeFilename = sanitizeFilename(originalFilename);

  // Encrypt file
  const { encryptedData, iv, salt, authTag } = encryptFile(file);

  // Upload to storage
  const { path, error: uploadError } = await uploadMedicalDocument(
    userId,
    options.type,
    fileId,
    fileExt,
    encryptedData
  );

  if (uploadError) {
    return { documentId: '', error: uploadError };
  }

  // Store encryption metadata (iv, salt, authTag) as base64 strings
  const encryptionKey = `${iv.toString('base64')}:${salt.toString('base64')}:${authTag.toString('base64')}`;

  // Create document record in database
  try {
    const { data: document, error: dbError } = await (supabaseAdmin()
      .from('medical_documents') as any)
      .insert({
        user_id: userId,
        uploaded_by_id: uploadedById,
        family_id: options.familyId || null,
        type: options.type.toUpperCase(),
        category: options.category || 'CLINICAL',
        title: options.title,
        description: options.description || null,
        mime_type: mimeType,
        file_size: file.length,
        storage_path: path,
        bucket: BUCKET,
        encrypted: true,
        encryption_key: encryptionKey,
        visibility: options.visibility || 'PRIVATE',
        shared_with: options.sharedWith || [],
      })
      .select('id')
      .single();

    if (dbError) {
      // Cleanup: delete uploaded file
      await supabaseAdmin().storage.from(BUCKET).remove([path]);
      return { documentId: '', error: dbError.message };
    }

    return { documentId: document.id };
  } catch (error) {
    // Cleanup: delete uploaded file
    await supabaseAdmin().storage.from(BUCKET).remove([path]);
    return {
      documentId: '',
      error: error instanceof Error ? error.message : 'Database error',
    };
  }
}

/**
 * High-level download: get signed URL + decryption info
 */
export async function getDocumentForDownload(
  documentId: string,
  userId: string
): Promise<{
  signedUrl: string;
  encryptionKey: string;
  filename: string;
  mimeType: string;
  error?: string;
}> {
  const { data: document, error } = await (supabaseAdmin() as any)
    .from('medical_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();

  if (error || !document) {
    return { signedUrl: '', encryptionKey: '', filename: '', mimeType: '', error: 'Document not found' };
  }

  // Get signed URL
  const { url, error: urlError } = await getSignedDocumentUrl(document.storage_path);
  if (urlError || !url) {
    return { signedUrl: '', encryptionKey: '', filename: '', mimeType: '', error: 'Failed to generate download URL' };
  }

  return {
    signedUrl: url,
    encryptionKey: document.encryption_key,
    filename: `${document.id}.${document.storage_path.split('.').pop()}`,
    mimeType: document.mime_type,
  };
}

/**
 * Decrypt downloaded file
 */
export function decryptDocument(
  encryptedData: Buffer,
  encryptionKey: string
): Buffer {
  const parts = encryptionKey.split(':');
  if (parts.length < 3) throw new Error('Invalid encryption key format');
  const ivB64 = parts[0]!;
  const saltB64 = parts[1]!;
  const tagB64 = parts[2]!;
  const iv = Buffer.from(ivB64, 'base64');
  const salt = Buffer.from(saltB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');

  return decryptFile(encryptedData, iv, salt, authTag);
}