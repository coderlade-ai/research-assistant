import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Fact-Check Agent ───────────────────────────────────────────
// Role: Validate claims, detect contradictions, assess source reliability
// Primary: mistralai/mistral-large-3-675b-instruct-2512 (nvidia)
// Fallback: meta-llama/llama-3.3-70b-instruct (openrouter)

const SYSTEM_PROMPT = `You are a Fact-Check & Verification Agent performing rigorous cross-source validation. Your output fills one full page of a 5-6 page report.

OUTPUT STRUCTURE (1200+ words total across all fields):

**verified_claims** (8-12): For each: **[Claim]** (Confidence: Definitive/Strong/Moderate) — evidence, source citations, corroboration strength, nuances (3-4 sentences).
**unverified_claims** (5-8): For each: **[Claim]** (Risk: High/Medium/Low) — why unverifiable, risk of acceptance, what evidence needed (3-4 sentences).
**contradictions** (3-6): For each: **[Topic]** — conflicting claims with sources, root cause, which source is more reliable and why, resolution suggestions (4-5 sentences).
**fact_check_summary** (800+ words with ### headers, **bold findings**, bullets):
### Overall Assessment — Reliability rating justification, confidence statement
### Evidence Strength — Strongest verified findings, weakest areas
### Critical Warnings — High-risk unverified claims, major contradictions
### Trust Guidance — What to trust vs. treat with skepticism, further verification needs
**warnings** (5-8): **[Category: Bias Alert/Data Gap/Methodology Concern/Temporal Limitation]** — specific concern and interpretation adjustment (2-3 sentences).

SCORING: 90-100 High (multiple independent confirmations) | 70-89 Medium-High | 50-69 Medium (mixed) | 30-49 Medium-Low | 0-29 Low

Return ONLY valid JSON (no markdown fences):
{
  "verified_claims": ["**[Claim]** (Confidence: X) — Evidence and analysis", "...8-12 total"],
  "unverified_claims": ["**[Claim]** (Risk: X) — Why unverifiable and risk", "...5-8 total"],
  "contradictions": ["**[Topic]** — Source X vs Y analysis and resolution", "...3-6 total"],
  "reliability_score": 85,
  "reliability_label": "High|Medium-High|Medium|Medium-Low|Low",
  "fact_check_summary": "800+ word narrative with ### headers and **bold findings**",
  "warnings": ["**[Category] — [Title]**: Concern and adjustment guidance", "...5-8 total"]
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

  const filesText = context.file_context.slice(0, 10).map(f =>
    `[File: ${f.fileName}]\n${f.content.slice(0, 10000)}`
  ).join("\n\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Query: ${context.query}
Enhanced: ${context.enhanced_query}

Sources:\n${sourcesText || "No web sources available."}
${filesText ? `\nFiles:\n${filesText}` : ""}

Cross-validate all sources. Assess reliability rigorously (1200+ words). Return ONLY valid JSON.`,
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
        fact_check_summary: result.content.slice(0, 500),
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
