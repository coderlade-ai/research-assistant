// ── Intent & Mode ──────────────────────────────────────────────

export type SearchMode = "pro" | "deep" | "corpus";

export type IntentType =
  | "coding"
  | "research"
  | "comparison"
  | "explanation"
  | "factual"
  | "general";

// ── Providers ──────────────────────────────────────────────────

export type ModelProvider = "nvidia" | "openrouter" | "perplexity";

export type SearchProvider = "perplexity" | "openrouter";

// ── Query Enhancement ──────────────────────────────────────────

export interface EnhancedQuery {
  original: string;
  enhanced: string;
  intent: IntentType;
  subtopics: string[];
}

// ── Search ─────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  relevanceScore: number;
}

export interface SearchOptions {
  query: string;
  mode: SearchMode;
  maxResults: number;
  provider?: SearchProvider;
}

// ── Files ──────────────────────────────────────────────────────

export interface FileContext {
  fileName: string;
  fileType: string;
  content: string;
}

// ── Model Routing ──────────────────────────────────────────────

export interface ResolvedModel {
  id: string;
  provider: "nvidia" | "openrouter";
  type: "fast" | "reasoning" | "coding" | "balanced";
  context_length: number;
  cost_priority: number;
  displayName: string;
}

export interface ModelFallbackChain {
  primary: ResolvedModel;
  fallbacks: ResolvedModel[];
}

// ── Standard LLM Response (all providers return this) ──────────

export interface LLMResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model_used: string;
  provider: string;
}

export interface LLMStreamChunk {
  delta: string;
  done: boolean;
  model?: string;
  provider?: ModelProvider;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequestOptions {
  model: string;
  messages: LLMMessage[];
  maxTokens: number;
  temperature: number;
  stream?: boolean;
  jsonMode?: boolean;
}

// ── Context ────────────────────────────────────────────────────

export interface BuiltContext {
  text: string;
  sourceCount: number;
  estimatedTokens: number;
  sources: SearchResult[];
}

// ── Response ───────────────────────────────────────────────────

export interface ResearchSource {
  id: string;
  title: string;
  snippet: string;
  url: string;
  domain: string;
}

export interface ResearchResult {
  overview: string;
  keyInsights: string[];
  details: string;
  comparison: string;
  expertInsights: string[];
  conclusion: string;
  sources: ResearchSource[];
  references: ResearchSource[];
  metadata: {
    model: string;
    provider: string;
    searchProvider: string;
    intent: IntentType;
    tokensUsed: number;
    durationMs: number;
    isFallback?: boolean;
  };
}

// ── Orchestrator ───────────────────────────────────────────────

export interface ResearchOptions {
  mode: SearchMode;
  userModelId?: string;
  maxSources?: number;
  maxTokens?: number;
  files?: FileContext[];
}

export type StreamCallback = (chunk: string, done: boolean) => void;

// ── API Route ──────────────────────────────────────────────────

export interface ResearchRequest {
  query: string;
  mode: SearchMode;
  model?: string;
  stream?: boolean;
  files?: FileContext[];
}

export interface ResearchApiResponse {
  success: boolean;
  data?: ResearchResult;
  error?: string;
}

// ── API Keys ───────────────────────────────────────────────────

export interface ApiKeys {
  nvidiaKey?: string;
  openrouterKey?: string;
  perplexityKey?: string;
}

// ── Response Section (UI-compatible) ───────────────────────────

export interface ResponseSection {
  type: "heading" | "paragraph" | "bullets";
  content: string;
  items?: string[];
}
