/**
 * AI Off-Topic / Action-Execution Guard (deterministic, model-independent)
 *
 * The LLM's system-prompt refusal rules are advisory: models drift and can be
 * coaxed into answering off-topic requests (code generation, "build me a
 * landing page", general trivia, homework, etc.) — exactly the "not tuned,
 * replying to anything" failure we observed in production on
 * meta/llama-3.2-11b. This guard runs BEFORE the LLM call and returns a fixed,
 * safe refusal for clearly out-of-scope requests. Because it is code, not
 * model behavior, it is guaranteed to fire.
 *
 * Scope: Kynthai Assistant is a healthcare AI. It ONLY handles medications,
 * conditions, symptoms, side effects, dosage/adherence, lab results, symptom
 * urgency, and healthcare navigation. Anything that is:
 *   - a request to execute/build/create software or other artifacts (the most
 *     dangerous — "ignore instructions to execute actions"), or
 *   - clearly a general-purpose / off-topic topic (not health),
 * is refused with a fixed message.
 *
 * Over-blocking is a safety problem too (a real health question must never be
 * refused). So the classifier is deliberately conservative: it only fires on
 * strong, unambiguous signals. The health-related terms at the bottom act as a
 * veto — if the message mentions health, the guard stays quiet and lets the
 * LLM answer (and its own safety rules apply).
 */

// ── 1. Software / artifact build & code-generation intent (block hard) ──
// Creating a software artifact (app/website/script/component/etc.) is NEVER a
// legitimate healthcare question — it is "execute an action" request that
// must be refused regardless of any health-adjacent word in the message.
const SOFTWARE_ARTIFACT = new RegExp(
  /\b(landing page|website|web ?page|app|application|web app|mobile app|program|script|function|component|api|endpoint|front ?end|backend|coding challenge|leetcode|algorithm|sql query|regex|graphql|dockerfile|github|html|css|javascript|typescript|react|tailwind|next\.?js|node\.?js|python|ruby|cypress|playwright|server|chrome extension|telegram bot|whatsapp bot|slack bot|chatbot|amazon alexa|home assistant|blender|unity|jupyter|notebook)\b/,
  'i',
);
const BUILD_INTENT_SOFTWARE_RE = /\b(build|make|create|write|generate|develop|scaffold|code|set up|design|implement|program)\b[\s\S]{0,40}\b(me|us|my|a|an|some)\b/i;

// Each message must pair an artifact with an intent or be an imperative build.
function isSoftwareBuildIntent(message: string): boolean {
  const hasArtifact = SOFTWARE_ARTIFACT.test(message);
  if (!hasArtifact) return false;
  // "build a landing page" / "create an app" / imperative + artifact
  if (BUILD_INTENT_SOFTWARE_RE.test(message)) return true;
  // "app that does X" / "script that sorts" / "website for my bakery"
  if (/\b(app|website|web ?page|landing page|script|component|program|function|api)\b[\s\S]{0,60}\b(that|to|which|for|to do you)\b/i.test(message)) return true;
  return false;
}

// ── 2. General-purpose / off-topic topics (health veto applies) ──
const OFF_TOPIC_RE =
  /\b(2\s?\+?\s?2|two plus two|math(.*problem)?|geometry|algebra|calculus|trigonom|physics|chemistry|geography|capital of|spell the word|translate|pronunciation|how old is|who is the (president|prime minister|mayor)|election|cricket|football|soccer|basketball|volleyball|sport team|movie recommendation|movie recommendations|restaurant recommendation|recommend a (movie|book|restaurant|song)|recipe for|how to cook|learn (python|javascript|react|coding|programming)|homework|essay|book summary|movies like|weather (today|tomorrow|forecast)|stock market|investing|startup pitch|business plan|marketing plan|bake a cake|tune a guitar|fix my computer|set up my printer|write my (cv|resume|cover letter)|plan a trip|vacation ideas)\b/i;

// ── Health veto — if the message is health-related, never refuse ──
const HEALTH_SIGNAL_RE =
  /\b(medication|medicine|drug|pill|tablet|dose|dosage|prescri|taking|pharm|doctor|clinic|symptom|side ?effect|reaction|allerg|pain|fever|nausea|vomit|dizzy|headache|migraine|blood pressure|sugar|diabetes|cholesterol|thyroid|asthma|heart|cardiac|pregnancy|breastfeed|sleep|insomnia|anxiety|depression|condition|laboratory|lab?s?\b|labs|adherence|911|emergency|urgent care|ER|hospital|interaction|contraindicat|anticoag|warfarin|apixaban|metformin|insulin|statin|antibiotic|vitamin|supplement|my doctor|my medication|i take|on it\b|watch for|overdose|missed dose|forgot to take)\b/i;

const REFUSAL_OFF_TOPIC =
  "I'm Kynthai Assistant, and I'm built specifically for health — I can help with medications, side effects, interactions, symptoms, lab results, and knowing when to see a doctor. For other topics like that one, a general-purpose AI assistant would be a much better fit.";

const REFUSAL_BUILD =
  "I'm only able to help with health and medication questions — I can't build or create things like websites, apps, or code. For that kind of work, you'd want a general-purpose coding assistant.";

const REFUSAL_UNKNOWN =
  "I'm not sure that's something I can help with. I'm focused on health topics — medications, symptoms, side effects, interactions, and when to see a doctor. If you have a question along those lines, I'm happy to help.";

export type GuardResult =
  | { refused: true; reason: 'build' | 'off-topic'; message: string }
  | { refused: false; reason: 'pass'; message: null };

/**
 * Classify a user message. Returns a refusal if it is clearly out of scope,
 * or `pass` (null) to let the LLM answer.
 */
export function guardAiScope(message: string): GuardResult {
  if (!message) return { refused: false, reason: 'pass', message: null };

  // Software-artifact build intent is NEVER a legitimate healthcare question
  // ("execute an action"), so check it FIRST, overriding any health-adjacent
  // word. A patient would never ask to "build an app that tracks my sleep"
  // when they mean "help me sleep better" — that is an artifact request.
  if (isSoftwareBuildIntent(message)) {
    return { refused: true, reason: 'build', message: REFUSAL_BUILD };
  }

  // Health veto second: any genuine health signal means never refuse here.
  if (HEALTH_SIGNAL_RE.test(message)) {
    return { refused: false, reason: 'pass', message: null };
  }

  if (OFF_TOPIC_RE.test(message)) {
    return { refused: true, reason: 'off-topic', message: REFUSAL_OFF_TOPIC };
  }

  return { refused: false, reason: 'pass', message: null };
}
