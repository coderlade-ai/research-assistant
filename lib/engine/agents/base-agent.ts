import type { ApiKeys, AgentResult, AgentName, ResolvedModel, LLMMessage } from "../types";
import { generateAIResponse } from "../providers";
import { classifyError } from "../errors";

// ── Timeouts ──────────────────────────────────────────────────
const PRIMARY_TIMEOUT_MS = 45_000;   // 45s per-model timeout
const FALLBACK_RACE_MS   = 20_000;   // start fallback after 20s if primary is still pending
const REPORT_TIMEOUT_MS  = 90_000;   // report agent gets longer

// ── Base: Call LLM with race-based fallback ──────────────────
// Strategy: fire primary immediately. After FALLBACK_RACE_MS, if
// primary hasn't resolved, fire fallback concurrently. First to
// succeed wins. This cuts latency when the primary is slow but
// still available.

export async function callWithFallback(
  agent: AgentName,
  primary: ResolvedModel,
  fallback: ResolvedModel,
  messages: LLMMessage[],
  maxTokens: number,
  apiKeys: ApiKeys,
  opts?: { temperature?: number }
): Promise<{ content: string; model_used: string; provider: string; isFallback: boolean }> {

  const isReport = agent === "report-agent";
  const timeoutMs = isReport ? REPORT_TIMEOUT_MS : PRIMARY_TIMEOUT_MS;

  const callModel = (model: ResolvedModel) =>
    generateAIResponse({
      model: model.id,
      provider: model.provider,
      messages,
      stream: false,
      apiKeys,
      maxTokens,
      temperature: opts?.temperature ?? 0.3,
      timeoutMs,
    });

  // 1. Try primary
  try {
    const res = await Promise.race([
      callModel(primary),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("__RACE_TIMEOUT__")), FALLBACK_RACE_MS)
      ),
    ]);
    return {
      content: res.content,
      model_used: primary.id,
      provider: primary.provider,
      isFallback: false,
    };
  } catch (primaryErr) {
    const isRaceTimeout =
      primaryErr instanceof Error && primaryErr.message === "__RACE_TIMEOUT__";

    if (isRaceTimeout) {
      // Primary still running — race it against fallback
      console.warn(`[${agent}] Primary ${primary.id} slow (>${FALLBACK_RACE_MS}ms), racing fallback ${fallback.id}`);

      const primaryPromise = callModel(primary).then(res => ({
        content: res.content,
        model_used: primary.id,
        provider: primary.provider,
        isFallback: false,
      })).catch(() => null);

      const fallbackPromise = callModel(fallback).then(res => ({
        content: res.content,
        model_used: fallback.id,
        provider: fallback.provider,
        isFallback: true,
      })).catch(() => null);

      const results = await Promise.allSettled([primaryPromise, fallbackPromise]);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) return r.value;
      }
      throw new Error(`[${agent}] Both primary and fallback failed after race`);
    }

    // Primary genuinely failed — try fallback directly
    const classified = classifyError(primaryErr, primary.provider);
    console.warn(`[${agent}] Primary ${primary.id} failed (${classified.kind}), switching to ${fallback.id}`);

    try {
      const res = await callModel(fallback);
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
