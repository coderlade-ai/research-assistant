import type { ResolvedModel } from "./types";

// ── API Endpoints ──────────────────────────────────────────────

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";

// ── Retry Configuration ────────────────────────────────────────

export const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
} as const;

// ── Token Limits ───────────────────────────────────────────────

export const TOKEN_LIMITS = {
  contextWindow: 6000,
  maxResponseTokens: 2048,
  wordsToTokenRatio: 1.3,
} as const;

// ── Model Registry ─────────────────────────────────────────────

export const MODEL_REGISTRY: Record<"nvidia" | "openrouter", ResolvedModel[]> = {
  nvidia: [
    {
      id: "minimaxai/minimax-m2.7",
      provider: "nvidia",
      type: "fast",
      context_length: 8192,
      cost_priority: 1,
      displayName: "MiniMax M2.7",
    },
    {
      id: "moonshotai/kimi-k2-thinking",
      provider: "nvidia",
      type: "reasoning",
      context_length: 32768,
      cost_priority: 2,
      displayName: "Kimi K2 Thinking",
    },
    {
      id: "abacusai/dracarys-llama-3.1-70b-instruct",
      provider: "nvidia",
      type: "balanced",
      context_length: 8192,
      cost_priority: 2,
      displayName: "Dracarys Llama 3.1 70B",
    },
    {
      id: "mistralai/mistral-large-3-675b-instruct-2512",
      provider: "nvidia",
      type: "balanced",
      context_length: 32768,
      cost_priority: 3,
      displayName: "Mistral Large 3",
    },
    {
      id: "deepseek-ai/deepseek-v3.2",
      provider: "nvidia",
      type: "reasoning",
      context_length: 32768,
      cost_priority: 3,
      displayName: "DeepSeek V3.2",
    },
    {
      id: "z-ai/glm4.7",
      provider: "nvidia",
      type: "balanced",
      context_length: 8192,
      cost_priority: 2,
      displayName: "GLM 4.7",
    },
    {
      id: "qwen/qwen3-coder-480b-a35b-instruct",
      provider: "nvidia",
      type: "coding",
      context_length: 32768,
      cost_priority: 3,
      displayName: "Qwen 3 Coder 480B",
    },
  ],
  openrouter: [
    {
      id: "nvidia/nemotron-3-super-120b-a12b:free",
      provider: "openrouter",
      type: "balanced",
      context_length: 8192,
      cost_priority: 1,
      displayName: "Nemotron 3 Super",
    },
    {
      id: "qwen/qwen3-coder:free",
      provider: "openrouter",
      type: "coding",
      context_length: 8192,
      cost_priority: 1,
      displayName: "Qwen 3 Coder (Free)",
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct:free",
      provider: "openrouter",
      type: "balanced",
      context_length: 8192,
      cost_priority: 1,
      displayName: "Llama 3.3 70B",
    },
    {
      id: "openai/gpt-oss-120b:free",
      provider: "openrouter",
      type: "balanced",
      context_length: 8192,
      cost_priority: 1,
      displayName: "GPT-OSS 120B",
    },
    {
      id: "z-ai/glm-4.5-air:free",
      provider: "openrouter",
      type: "fast",
      context_length: 8192,
      cost_priority: 1,
      displayName: "GLM 4.5 Air",
    },
    {
      id: "google/gemma-4-31b-it:free",
      provider: "openrouter",
      type: "fast",
      context_length: 8192,
      cost_priority: 1,
      displayName: "Gemma 4 31B",
    },
    {
      id: "minimax/minimax-m2.5:free",
      provider: "openrouter",
      type: "fast",
      context_length: 8192,
      cost_priority: 1,
      displayName: "MiniMax M2.5",
    },
  ]
};

// ── Fallback Builder ───────────────────────────────────────────
// Generates fallback chains on the fly based on type
export const getFallbackChain = (primary: ResolvedModel): ResolvedModel[] => {
  return MODEL_REGISTRY.openrouter.filter(m => m.type === primary.type && m.id !== primary.id);
};
