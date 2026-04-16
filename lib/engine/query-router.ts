import type { ApiKeys } from "./types";
import { nvidiaComplete } from "./providers/nvidia";
import { openrouterComplete } from "./providers/openrouter";

// ── Classification Result ──────────────────────────────────────

export type QueryComplexity = "simple" | "research";

export interface QueryRouterResult {
  complexity: QueryComplexity;
  reason: string;
  confidence: number; // 0-1
}

// ── Routing prompt ─────────────────────────────────────────────
// Must be extremely fast: small prompt, tiny output, low tokens

const ROUTER_SYSTEM = `You are a query classifier. Classify the user's query into exactly one category:

"simple" — for:
- Casual conversation / greetings (hi, hello, how are you, thanks)
- Very short factual questions answerable in 1-2 sentences
- Questions about basic definitions or simple concepts
- Opinion requests, jokes, or personal questions to an AI
- Quick calculations or unit conversions
- Questions with an obvious, immediate answer

"research" — for:
- Requests for comprehensive reports, analysis, or deep dives
- Multi-faceted questions requiring multiple sources
- Technical research, academic topics, or industry analysis
- Comparisons, trend analysis, or market research
- Questions explicitly asking for a "report", "summary", "analysis", or "overview"
- Coding help, code generation, debugging requests
- Questions about recent events, current data, or statistics
- Anything that genuinely benefits from searching multiple sources

Return ONLY a JSON object: {"complexity":"simple"|"research","reason":"one sentence","confidence":0.0-1.0}
No other text.`;

// ── Classification Call ────────────────────────────────────────

async function classifyViaOpenRouter(
  apiKey: string,
  query: string
): Promise<QueryRouterResult> {
  const res = await openrouterComplete(apiKey, {
    model: "meta-llama/llama-3.3-70b-instruct:free",
    messages: [
      { role: "system", content: ROUTER_SYSTEM },
      { role: "user", content: `Query: "${query}"` },
    ],
    maxTokens: 80,
    temperature: 0.1,
    jsonMode: true,
  });

  const parsed = JSON.parse(res.content);
  return {
    complexity: parsed.complexity === "simple" ? "simple" : "research",
    reason: String(parsed.reason ?? ""),
    confidence: Number(parsed.confidence ?? 0.8),
  };
}

async function classifyViaNvidia(
  apiKey: string,
  query: string
): Promise<QueryRouterResult> {
  const res = await nvidiaComplete(apiKey, {
    model: "minimaxai/minimax-m2.7", // fastest NVIDIA model
    messages: [
      { role: "system", content: ROUTER_SYSTEM },
      { role: "user", content: `Query: "${query}"` },
    ],
    maxTokens: 80,
    temperature: 0.1,
  });

  // Strip markdown fences if present
  const raw = res.content.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(raw);
  return {
    complexity: parsed.complexity === "simple" ? "simple" : "research",
    reason: String(parsed.reason ?? ""),
    confidence: Number(parsed.confidence ?? 0.8),
  };
}

// ── Heuristic fast-path (no API call needed) ───────────────────
// Catches the most obvious cases instantly

const SIMPLE_PATTERNS = [
  /^(hi+|hello|hey|yo|howdy|sup|greetings)[\s!?,.]*/i,
  /^(how are you|what's up|how do you do|how's it going)/i,
  /^(thanks|thank you|thx|ty|cheers|appreciate it)/i,
  /^(ok|okay|got it|sure|yes|no|yep|nope|alright)[\s!?.]*$/i,
  /^(good morning|good night|good evening|good afternoon)/i,
  /^(bye|goodbye|see you|cya|later)[\s!?.]*$/i,
  /^what (is|are) (a|an|the) \w+\??$/i,        // "what is a variable?"
  /^(who|what) (created|made|invented|founded) .+\??$/i,
  /^(what does \w+ stand for|what does .{1,30} mean)/i,
  /^(convert|calculate|how many) .{1,40}$/i,
];

const RESEARCH_PATTERNS = [
  /\b(report|analysis|analyze|analyse|summarize|overview|breakdown)\b/i,
  /\b(compare|comparison|versus|vs\.?)\b/i,
  /\b(research|study|investigate|explore|deep.?dive)\b/i,
  /\b(trend|market|industry|statistics|data|recent|latest)\b/i,
  /\b(explain in detail|comprehensive|in-depth|thorough)\b/i,
  /\b(code|debug|implement|build|create a|write a program|function|algorithm)\b/i,
  /\b(pros and cons|advantages|disadvantages|benefits)\b/i,
];

function heuristicClassify(query: string): QueryComplexity | null {
  const trimmed = query.trim();

  // Too short to be research
  if (trimmed.length < 4) return "simple";

  // Explicit simple patterns
  for (const pat of SIMPLE_PATTERNS) {
    if (pat.test(trimmed)) return "simple";
  }

  // Explicit research patterns
  for (const pat of RESEARCH_PATTERNS) {
    if (pat.test(trimmed)) return "research";
  }

  // Medium length with question mark — could go either way
  if (trimmed.length < 30 && trimmed.split(" ").length < 6) return "simple";

  // Long queries default to research
  if (trimmed.length > 80) return "research";

  return null; // Uncertain — use AI classifier
}

// ── Public API ─────────────────────────────────────────────────

export async function classifyQuery(
  query: string,
  apiKeys: ApiKeys
): Promise<QueryRouterResult> {
  // 1. Try heuristic first (instant, no API cost)
  const heuristic = heuristicClassify(query);
  if (heuristic) {
    return {
      complexity: heuristic,
      reason: "Heuristic match",
      confidence: 0.95,
    };
  }

  // 2. Use AI classifier for uncertain cases
  // Prefer OpenRouter (free model) to save NVIDIA quota for actual research
  if (apiKeys.openrouterKey) {
    try {
      return await classifyViaOpenRouter(apiKeys.openrouterKey, query);
    } catch {
      // fall through
    }
  }

  // 3. Fallback to NVIDIA fast model
  if (apiKeys.nvidiaKey) {
    try {
      return await classifyViaNvidia(apiKeys.nvidiaKey, query);
    } catch {
      // fall through
    }
  }

  // 4. Ultimate fallback — treat as research (safe default)
  return { complexity: "research", reason: "Classifier unavailable", confidence: 0.5 };
}
