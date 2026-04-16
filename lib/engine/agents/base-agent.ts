import type { ApiKeys, AgentResult, AgentName, ResolvedModel, LLMMessage } from "../types";
import { generateAIResponse } from "../providers";
import { classifyError } from "../errors";

// ── Base: Call LLM with automatic fallback ─────────────────────

export async function callWithFallback(
  agent: AgentName,
  primary: ResolvedModel,
  fallback: ResolvedModel,
  messages: LLMMessage[],
  maxTokens: number,
  apiKeys: ApiKeys
): Promise<{ content: string; model_used: string; provider: string; isFallback: boolean }> {
  const tryModel = async (model: ResolvedModel) => {
    return generateAIResponse({
      model: model.id,
      provider: model.provider,
      messages,
      stream: false,
      apiKeys,
    });
  };

  try {
    const res = await tryModel(primary);
    return {
      content: res.content,
      model_used: primary.id,
      provider: primary.provider,
      isFallback: false,
    };
  } catch (err) {
    const classified = classifyError(err, primary.provider);
    console.warn(`[${agent}] Primary ${primary.id} failed (${classified.kind}), switching to ${fallback.id}`);

    try {
      const res = await tryModel(fallback);
      return {
        content: res.content,
        model_used: fallback.id,
        provider: fallback.provider,
        isFallback: true,
      };
    } catch (fallbackErr) {
      const fbErr = classifyError(fallbackErr, fallback.provider);
      throw new Error(`[${agent}] Both primary and fallback failed: ${fbErr.message}`);
    }
  }
}

// ── Null result for skipped agents ────────────────────────────

export function skippedResult(agent: AgentName): AgentResult {
  return {
    agent,
    output: {},
    model_used: "none",
    provider: "none",
    durationMs: 0,
    isFallback: false,
    error: "skipped",
  };
}

// ── Safe JSON parse ────────────────────────────────────────────

export function safeParseJSON(raw: string): Record<string, unknown> | null {
  // Direct parse
  try { return JSON.parse(raw); } catch { /* continue */ }
  // Fence extraction
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* continue */ } }
  // First brace block
  const brace = raw.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch { /* continue */ } }
  return null;
}


