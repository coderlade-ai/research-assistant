import { nvidiaWithRetry } from "./nvidia";
import { openrouterWithRetry } from "./openrouter";
import type { ApiKeys, LLMMessage, LLMResponse, StreamCallback } from "../types";
import { TOKEN_LIMITS } from "../config";

export interface GenerateAIResponseArgs {
  model: string;
  provider: "nvidia" | "openrouter" | string;
  messages: LLMMessage[];
  stream: boolean;
  apiKeys: ApiKeys;
  onChunk?: StreamCallback;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export async function generateAIResponse({
  model,
  provider,
  messages,
  stream,
  apiKeys,
  onChunk,
  maxTokens,
  temperature,
  timeoutMs,
}: GenerateAIResponseArgs): Promise<LLMResponse> {
  const options = {
    model,
    messages,
    maxTokens: maxTokens ?? TOKEN_LIMITS.agentMaxTokens,
    temperature: temperature ?? 0.3,
    stream,
    timeoutMs,
  };

  if (provider === "nvidia") {
    if (!apiKeys.nvidiaKey) throw new Error("Missing NVIDIA API key");
    return nvidiaWithRetry(apiKeys.nvidiaKey, options, onChunk);
  } else if (provider === "openrouter") {
    if (!apiKeys.openrouterKey) throw new Error("Missing OpenRouter API key");
    return openrouterWithRetry(apiKeys.openrouterKey, options, onChunk);
  }

  if (!apiKeys.openrouterKey) throw new Error("Missing OpenRouter API key");
  return openrouterWithRetry(apiKeys.openrouterKey, options, onChunk);
}
