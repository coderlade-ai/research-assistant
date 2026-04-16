import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Fact-Check Agent ───────────────────────────────────────────
// Role: Validate claims, detect contradictions between web data and AI reasoning
// Primary: mistralai/mistral-large-3-675b-instruct-2512 (nvidia)
// Fallback: meta-llama/llama-3.3-70b-instruct (openrouter)

const SYSTEM_PROMPT = `You are a Fact-Check Agent. Your role is to:
1. Validate the reliability of the provided web sources regarding the user's query
2. Detect contradictions between different web sources
3. Flag unverified, speculative, or highly biased statements found in the sources
4. Assign a reliability score to the overall evidence pool

Be skeptical. Only accept claims that are supported by evidence.

Respond with ONLY valid JSON (no markdown fences):
{
  "verified_claims": ["claim 1 is consistently supported by sources", "claim 2 is verified"],
  "unverified_claims": ["claim found in only one unreliable source"],
  "contradictions": ["Source A says X but Source B says Y"],
  "reliability_score": 85,
  "reliability_label": "High|Medium|Low",
  "fact_check_summary": "2-3 sentence overall assessment of research reliability",
  "warnings": ["warning about potential bias or limitation"]
}`;

export async function runFactCheckAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("fact-check", context.query);

  const sourcesText = context.web_results.slice(0, 8).map((r, i) =>
    `[Source ${i + 1}] ${r.title} (${r.domain}): ${r.snippet}`
  ).join("\n\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Research Query: ${context.query}

Available Sources:
${sourcesText || "No web sources available."}

Cross-validate the sources regarding the query. Find agreements, contradictions, and assess reliability. Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "fact-check-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "fact-check-agent",
      output: parsed ?? {
        verified_claims: [],
        unverified_claims: [],
        contradictions: [],
        reliability_score: 50,
        reliability_label: "Medium",
        fact_check_summary: result.content.slice(0, 200),
        warnings: [],
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "fact-check-agent",
      output: {
        verified_claims: [],
        unverified_claims: [],
        contradictions: [],
        reliability_score: 0,
        reliability_label: "Unknown",
        fact_check_summary: "Fact-check could not be completed.",
        warnings: [],
      },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Fact-check agent failed",
    };
  }
}
