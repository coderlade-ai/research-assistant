import { nvidiaWithRetry } from "./nvidia";
import { openrouterWithRetry } from "./openrouter";
import type { ApiKeys, LLMMessage, LLMResponse, StreamCallback } from "../types";

export interface GenerateAIResponseArgs {
  model: string;
  provider: "nvidia" | "openrouter" | string;
  messages: LLMMessage[];
  stream: boolean;
  apiKeys: ApiKeys;
  onChunk?: StreamCallback;
}

export async function generateAIResponse({
  model,
  provider,
  messages,
  stream,
  apiKeys,
  onChunk
}: GenerateAIResponseArgs): Promise<LLMResponse> {
  const options = {
    model,
    messages,
    maxTokens: 4096, // default or fetch from registry
    temperature: 0.3,
    stream,
  };

  if (provider === "nvidia") {
    if (!apiKeys.nvidiaKey) throw new Error("Missing NVIDIA API key");
    return nvidiaWithRetry(apiKeys.nvidiaKey, options, onChunk);
  } else if (provider === "openrouter") {
    if (!apiKeys.openrouterKey) throw new Error("Missing OpenRouter API key");
    return openrouterWithRetry(apiKeys.openrouterKey, options, onChunk);
  }

  // Fallback if provider not matched but openrouter is available
  if (!apiKeys.openrouterKey) throw new Error("Missing OpenRouter API key");
  return openrouterWithRetry(apiKeys.openrouterKey, options, onChunk);
}
