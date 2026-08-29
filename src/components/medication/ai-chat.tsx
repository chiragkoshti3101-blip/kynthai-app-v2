'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Bot, User, Trash2, Sparkles, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { MedicalDisclaimer } from '@/components/kynthai/medical-disclaimer';
import { useAppStore } from '@/lib/store';
import { getMedicineFromDb } from '@/lib/medicine-db-cache';
import ReactMarkdown from 'react-markdown';
import { safeAIResponse } from '@/lib/ai-output-filter';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PaginatedChatResponse {
  messages: ChatMsg[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Format medicine DB info into readable markdown (used in demo mode, $0 cost). */
function formatMedicineInfoLocal(med: NonNullable<ReturnType<typeof getMedicineFromDb>>): string {
  // ponytail: defensive — the medicine DB has rows with one or more of
  // commonUses / sideEffects / foodInteractions null. Map over them safely
  // so a single bad row doesn't take down the whole AI tab.
  const commonUses = med.commonUses ?? [];
  const sideEffects = med.sideEffects ?? [];
  const foodInteractions = med.foodInteractions ?? [];
  return `## ${med.name}${med.genericName ? ` (${med.genericName})` : ''}

**Category:** ${med.category}

### Common Uses
${commonUses.map((u: string) => `- ${u}`).join('\n')}

### Dosage
${med.dosage}

### How to Take
${med.timing}

### Common Side Effects
${sideEffects.map((s: string) => `- ${s}`).join('\n')}

### Food Interactions
${foodInteractions.map((f: string) => `- ${f}`).join('\n')}

### Pregnancy Safety
${med.pregnancySafety}

### Storage
${med.storage}

---
⚠️ **This is general information from our medicine database, not medical advice. Always consult a qualified healthcare professional.**`;
}

// ponytail: lightweight health-vs-off-topic classifier for demo mode so
// health questions that miss the medicine DB get a real triage answer
// instead of dead-ending on a sign-up pitch. Conservative — only fires
// for clear health/medication/symptom keywords.
const HEALTH_KEYWORDS = [
  'medicine', 'medication', 'med', 'pill', 'pills', 'tablet', 'capsule', 'dose', 'dosage',
  'side effect', 'reaction', 'allergy', 'allergic',
  'pain', 'ache', 'fever', 'nausea', 'vomit', 'dizzy', 'dizziness', 'headache', 'migraine',
  'blood pressure', 'sugar', 'diabetes', 'cholesterol', 'thyroid', 'asthma', 'heart',
  'pregnancy', 'breastfeed', 'sleep', 'insomnia', 'anxiety', 'depression',
  'symptom', 'rash', 'swelling', 'swollen', 'infection', 'antibiotic', 'vitamin', 'supplement',
  'food interaction', 'alcohol', 'missed dose', 'forgot', 'overdose', 'first aid',
  'doctor', 'pharmacist', 'clinic', 'hospital', 'er ', 'urgent care', '911', 'emergency',
];
function isHealthQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return HEALTH_KEYWORDS.some(k => t.includes(k));
}

// Personalised / safety / interaction / symptom questions MUST go to the
// LLM (which has the patient's record + interaction map + contraindication
// map), not the static DB fast path. General drug-info lookups can use
// the fast path safely.
function wantsPersonalisedAdvice(text: string): boolean {
  const t = text.toLowerCase();
  // First-person / "my meds" framing
  if (/\b(i|my|me|i'm|im)\b/.test(t) && /\b(take|taking|prescribed|on)\b/.test(t)) return true;
  // Interaction / safety framing
  if (/\b(interact|interaction|safe|safety|with my|together with|combine|combination)\b/.test(t)) return true;
  // Symptom / side-effect-experience framing
  if (/\b(i feel|i have|my symptom|experiencing|side effect i|am i having)\b/.test(t)) return true;
  // Follow-up / context-dependent questions — these depend on the prior turn
  // and the fast path can't honour context. Catch "what about X", "and Y",
  // "does that add…", "how about…", "what if…", "combined with…", etc.
  if (/^\s*(what about|and |how about|does that|is that|what if|and if|combined|plus|along with|on top|additionally|furthermore|with that|on top of|as well|too[?.])\b/.test(t)) return true;
  if (/\b(add (to|on)|in addition|on top of that|along with that|as well as)\b/.test(t)) return true;
  // Comparative / risk-adding framing
  if (/\b(extra risk|more risk|additional risk|combined risk|together risk)\b/.test(t)) return true;
  return false;
}

// Build personalised initial-suggestion chips from the patient's actual
// medication list. The goal: the first thing a patient sees is a question
// that matters for THEIR regimen, not a generic "what is metformin used
// for". Falls back to the generic SUGGESTIONS if no meds are available.
function buildPersonalisedSuggestions(medNames: string[]): string[] {
  const lower = medNames.map(n => n.toLowerCase());
  const has = (substr: string) => lower.some(n => n.includes(substr));
  const out: string[] = [];

  // Anticoagulants / antiplatelets — bleeding-risk awareness is the #1
  // patient-education priority. The chip should match the actual med.
  if (has('apixaban') || has('rivaroxaban') || has('dabigatran') || has('warfarin')) {
    out.push('What bleeding signs should I watch for with my blood thinner?');
  }
  if (has('aspirin') && (has('apixaban') || has('rivaroxaban') || has('warfarin') || has('clopidogrel'))) {
    out.push('Can I take ibuprofen for a headache with my current medications?');
  } else if (has('aspirin')) {
    out.push("What are aspirin’s most important side effects to watch for?");
  }
  // Diabetes
  if (has('metformin')) {
    out.push('What is the best time of day to take Metformin, and should I take it with food?');
  }
  if (has('insulin')) {
    out.push('What blood sugar level should make me call my doctor?');
  }
  // Cardiovascular
  if (has('atorvastatin') || has('simvastatin') || has('rosuvastatin')) {
    out.push('Why is my statin taken at bedtime, and what should I avoid while on it?');
  }
  if (has('losartan') || has('lisinopril') || has('amlodipine') || has('metoprolol')) {
    out.push('What blood pressure reading should make me call my doctor today?');
  }
  // Mental health
  if (has('sertraline') || has('fluoxetine') || has('escitalopram') || has('venlafaxine')) {
    out.push('What should I do if I miss a dose of my antidepressant?');
  }
  // Thyroid
  if (has('levothyroxine')) {
    out.push('When should I take levothyroxine — and what should I avoid around it?');
  }
  // GI
  if (has('omeprazole') || has('pantoprazole')) {
    out.push('How long is it safe to stay on a PPI, and how do I taper off?');
  }
  // General additions to round out to 4
  if (out.length < 4) out.push('Are there any interactions between my current medications?');
  if (out.length < 4) out.push('When should I call my doctor vs. wait it out?');
  if (out.length < 4) out.push('What side effects should I watch for with my current medications?');

  // De-dupe and cap at 4
  return Array.from(new Set(out)).slice(0, 4);
}

// ponytail: build a safe, conservative triage-style reply for demo
// health questions that don't match a medicine in the DB. Mirrors the
// safety framing of the few-shot examples: no diagnosis, clear when to
// seek care, always defer to a professional.
function buildLocalTriageReply(question: string): string {
  const q = question.toLowerCase();
  const isRedFlag =
    q.includes('chest pain') || q.includes('can\'t breathe') || q.includes('cant breathe') ||
    q.includes('difficulty breathing') || q.includes('stroke') || q.includes('severe bleeding') ||
    q.includes('worst headache') || q.includes('unconscious') || q.includes('suicid');
  if (isRedFlag) {
    return `## This sounds like it could be an emergency

Based on what you're describing, I'd recommend getting help right away rather than waiting.

**Please contact local emergency services or go to your nearest emergency room.** If you can, have someone stay with you while help is on the way.

I can't assess emergencies over chat, and a clinician can evaluate you in person much faster than any app.

---
⚠️ **This is general information, not a diagnosis. If you think you might be having a medical emergency, contact local emergency services immediately.**`;
  }
  return `## Here's a general approach to that

I don't have detailed information about that specific topic in my demo medicine database, so I can't give you a tailored answer here.

In general, for non-urgent symptoms or questions:

- **Track what's happening** — when it started, how often, what makes it better or worse
- **Try safe self-care first** — rest, hydration, avoiding known triggers
- **Know when to escalate** — call your doctor if it lasts more than a few days, gets worse, or comes with fever, severe pain, breathing trouble, or anything that feels "wrong"
- **Ask a pharmacist** — they're often the fastest, free answer for medication questions
- **Bring this question to your next appointment** — your doctor knows your full history

A few questions that would help me give you a better answer:
- Is this about a specific medication, symptom, or condition?
- How long has it been going on?
- Anything that makes it better or worse?

---
⚠️ **This is general information, not medical advice. For personal medical decisions, please talk to a qualified healthcare professional.**`;
}

const SUGGESTIONS = [
  'What are common side effects of Metformin?',
  'How do I remember to take my pills on time?',
  'Can I take Vitamin D with food?',
  'What foods should I avoid while on blood pressure medication?',
];

// Context-aware quick replies shown after the first AI message
const QUICK_REPLIES = [
  {
    label: 'Side effects',
    query: 'What side effects should I watch for with my current medications?',
  },
  { label: 'Diet tips', query: 'What foods should I eat or avoid based on my medications?' },
  { label: 'When to see a doctor', query: 'When should I call my doctor vs. wait it out?' },
  {
    label: 'Drug interactions',
    query: 'Are there any interactions between my current medications?',
  },
  { label: 'Lab results', query: 'How do I understand my recent lab results?' },
  { label: 'Sleep tips', query: 'How can I improve my sleep quality?' },
];

export function AiChat({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(SUGGESTIONS);
  const [limitsDismissed, setLimitsDismissed] = useState(false);
  const { toast } = useToast();
  const { user } = useAppStore();
  const isDemo = !!user?.isDemo;

  const loadMessages = async (cursor?: string) => {
    const url = cursor ? `/api/chat?cursor=${encodeURIComponent(cursor)}` : '/api/chat';
    const res = await fetch(url);
    if (!res.ok) return;
    const data: PaginatedChatResponse = await res.json();
    // GET /api/chat returns a paginated envelope (jsonPage): { data: [...], meta }.
    // Read the message list out of it (also accept a plain array or { messages }
    // shape for robustness) so `messages` is always an array and never undefined.
    const list: ChatMsg[] = Array.isArray(data)
      ? data
      : Array.isArray((data as unknown as { data?: unknown }).data)
        ? ((data as unknown as { data: ChatMsg[] }).data)
        : (Array.isArray((data as unknown as { messages?: unknown }).messages)
            ? (data as unknown as { messages: ChatMsg[] }).messages
            : []);
    if (cursor) {
      // Prepend older messages
      setMessages(prev => [...prev, ...list]);
      setOldestCursor(data.nextCursor);
    } else {
      setMessages(list);
      setOldestCursor(data.nextCursor);
    }
    setHasMore(data.hasMore);
  };

  // Load older messages when user scrolls to top
  useEffect(() => {
    if (!topSentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && oldestCursor) {
          setLoadingMore(true);
          loadMessages(oldestCursor).finally(() => setLoadingMore(false));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(topSentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, oldestCursor]);

  useEffect(() => {
    // Load paginated history from the real API. The account has a real session
    // and the server is the source of truth for the welcome / first message,
    // so we just fetch it like any signed-in user would.
    setLoadingInitial(true);
    setLoadError(false);
    // Also fetch the patient's active medications in parallel so the
    // initial suggestion chips are personalised to their actual regimen
    // (e.g. a patient on apixaban gets a "bleeding signs" chip, a patient
    // on metformin gets a "best time to take" chip). Falls back to the
    // generic suggestions if the fetch fails or returns empty.
    Promise.all([loadMessages(), fetch('/api/medications', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null)])
      .then(([_msgs, medsRes]) => {
        const meds: { name: string }[] = medsRes?.medications ?? [];
        if (meds.length) setSuggestions(buildPersonalisedSuggestions(meds.map(m => m.name)));
      })
      .catch(() => {
        setLoadError(true);
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content:
              "Hi! I'm **Kynthai**, your health & medication assistant. I'm here to help you understand your medicines, manage your health, and feel confident about your care.\n\nHow can I help you today?",
          },
        ]);
      })
      .finally(() => setLoadingInitial(false));
  }, []);

  // Show quick replies after first assistant message
  useEffect(() => {
    const hasAssistantMsg = messages.some(m => m.role === 'assistant' && m.id !== 'welcome');
    setShowQuickReplies(hasAssistantMsg && messages.length <= 3);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    // ── Fast path: if the question is a direct lookup of a medicine in our
    //    verified 122-drug database and isn't asking for personal/safety
    //    advice, serve the verified entry instantly ($0, no LLM latency,
    //    guaranteed accurate — no hallucination). Personal / interaction /
    //    symptom / complex questions fall through to the real LLM which has
    //    the same DB + interaction map + contraindication map + the
    //    patient's actual record.
    const fastPathMatch = getMedicineFromDb(content);
    if (fastPathMatch && !wantsPersonalisedAdvice(content)) {
      const reply = formatMedicineInfoLocal(fastPathMatch);
      setMessages([
        ...nextMessages,
        { id: `a-${Date.now()}`, role: 'assistant', content: reply },
      ]);
      setSending(false);
      return;
    }

    // ── Real user: call the API (prefer streaming for the "feels human" effect) ──
    const assistantId = `a-${Date.now()}`;
    const placeholderAssistant: ChatMsg = {
      id: assistantId,
      role: 'assistant',
      content: '',
    };
    setMessages([...nextMessages, placeholderAssistant]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          message: content,
          history: messages
            .filter(m => m.id !== 'welcome')
            .map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error('Chat failed');

      const contentType = res.headers.get('content-type') || '';

      // ── Streaming (text/event-stream) — append chunks as they arrive ──
      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assembled = '';

        const appendChunk = (text: string) => {
          assembled += text;
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: assembled } : m))
          );
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE events are separated by blank lines; events have `event:` and `data:` lines.
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const eventLines = rawEvent.split('\n');
            let eventName = 'message';
            const dataLines: string[] = [];
            for (const line of eventLines) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            const dataStr = dataLines.join('\n');
            if (!dataStr) continue;
            let parsed: { text?: string; response?: string; message?: string } = {};
            try {
              parsed = JSON.parse(dataStr);
            } catch {
              // ignore malformed chunk
              continue;
            }
            if (eventName === 'delta' && typeof parsed.text === 'string') {
              appendChunk(parsed.text);
            } else if (eventName === 'done') {
              // Final safe response — replace assembled content with the server-sanitized full text
              if (typeof parsed.response === 'string') {
                setMessages(prev =>
                  prev.map(m => (m.id === assistantId ? { ...m, content: parsed.response! } : m))
                );
              }
            } else if (eventName === 'error') {
              throw new Error(parsed.message || 'Stream error');
            }
          }
        }
      } else {
        // ── Non-streaming (JSON) — used for medicine-DB fast path and fallbacks ──
        const data = await res.json();
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content: data.response } : m))
        );
      }
    } catch (e) {
      // Roll back the empty placeholder so the user sees the error, not a blank bubble
      setMessages(prev => prev.filter(m => m.id !== assistantId));
      toast({
        title: 'Failed to get response',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    try {
      await fetch('/api/chat', { method: 'DELETE' });
    } catch {
      /* ignore */
    }
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Conversation cleared. What would you like to ask?',
      },
    ]);
    setHasMore(false);
    setOldestCursor(null);
  };

  return (
    <Card className="flex flex-col h-[60vh] min-h-0 sm:h-[70vh] sm:min-h-[28rem]">
      <CardContent className="p-4 flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 pb-3 border-b">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold leading-tight">Kynthai Assistant</p>
              <p className="text-xs text-muted-foreground">AI-powered medication Q&amp;A</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={clearChat} title="Clear conversation">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll pr-3 min-h-0">
          <div className="space-y-3 pb-2">
            {/* Sentinel for infinite scroll upward */}
            <div ref={topSentinelRef} className="h-1" />

            {hasMore && (
              <div className="flex justify-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (oldestCursor && !loadingMore) {
                      setLoadingMore(true);
                      loadMessages(oldestCursor).finally(() => setLoadingMore(false));
                    }
                  }}
                  disabled={loadingMore || !oldestCursor}
                  className="text-xs text-muted-foreground"
                >
                  {loadingMore ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <ChevronDown className="h-3 w-3 mr-1" />
                  )}
                  {loadingMore ? 'Loading...' : 'Load older messages'}
                </Button>
              </div>
            )}

            {loadingInitial && (messages ?? []).length === 0 && !isDemo && !loadError
              ? [0, 1, 2].map(i => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 animate-pulse">
                      <div className="h-3 w-32 bg-muted-foreground/20 rounded" />
                    </div>
                  </div>
                ))
              : (messages ?? []).map(m => <MessageBubble key={m.id} msg={m} />)}
            {sending && (
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-3 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI limits explainer — dismissible so it doesn't nag */}
        {!limitsDismissed && (
          <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-50/60 px-3 py-2 dark:bg-emerald-950/30">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">
                What I can & can't do
              </p>
              <button
                type="button"
                onClick={() => setLimitsDismissed(true)}
                aria-label="Hide what I can and can't do"
                className="rounded p-1 -mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="text-xs text-emerald-700/90 dark:text-emerald-400/90 leading-relaxed space-y-0.5">
              <li>✓ Answer questions about your medications, side effects, and interactions.</li>
              <li>✓ Help you understand test results and health topics.</li>
              <li>✗ Diagnose conditions — always check with your doctor.</li>
              <li>✗ Replace professional medical advice or prescriptions.</li>
            </ul>
          </div>
        )}

        {/* Initial suggestions (before first message) */}
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 py-3">
            {suggestions.map(s => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className="text-xs h-auto py-1.5"
                onClick={() => send(s)}
              >
                <Sparkles className="h-3 w-3 mr-1 text-primary" />
                {s}
              </Button>
            ))}
          </div>
        )}

        {/* Quick replies (after first exchange) */}
        {showQuickReplies && (
          <div className="flex flex-wrap gap-2 py-2">
            {QUICK_REPLIES.map(q => (
              <Button
                key={q.label}
                size="sm"
                variant="secondary"
                className="text-[11px] h-auto py-1.5 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                onClick={() => send(q.query)}
              >
                {q.label}
              </Button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex items-end gap-2 pt-3 border-t">
          <div className="flex-1">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value.slice(0, 2000))} // 2000 char limit for AI safety
              placeholder="Ask about your medications..."
              maxLength={2000}
              className="min-h-[44px] max-h-32 resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
          </div>
          <Button
            onClick={() => send()}
            disabled={sending || !input.trim()}
            className="bg-primary"
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 border-t border-border/40 pt-2 text-xs leading-relaxed text-muted-foreground">
          <p className="text-muted-foreground">
            I'm an AI assistant — not a doctor.{' '}
            Contact local emergency services in an emergency. For medical care,{' '}
            {onNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate('market')}
                className="text-foreground/80 font-medium hover:underline"
              >
                book a doctor via Find Care
              </button>
            ) : (
              'book a doctor via Find Care'
            )}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-secondary text-secondary-foreground' : 'bg-primary/10 text-primary'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0">
            <ReactMarkdown>{safeAIResponse(msg.content)}</ReactMarkdown>
          </div>
        )}
        {!isUser && (
          <div className="mt-1.5 flex items-center gap-1">
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              AI
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
