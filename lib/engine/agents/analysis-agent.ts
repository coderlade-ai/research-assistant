import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Analysis Agent ─────────────────────────────────────────────
// Role: Deep analysis, compare insights, identify patterns
// Primary: nvidia/nemotron-3-super-120b-a12b (nvidia)
// Fallback: nvidia/nemotron-3-super-120b-a12b:free (openrouter)

const SYSTEM_PROMPT = `You are a Deep Analysis Agent producing rigorous multi-dimensional research analysis. Your output fills one full page of a 5-6 page report.

OUTPUT STRUCTURE (1200+ words total across all fields):

**analysis** field (1000+ words with ### headers, **bold findings**, bullet points):
### Foundational Context (300+ words) — Topic landscape, key players, historical context, current significance.
### Multi-Dimensional Analysis (400+ words) — Analyze through 4+ lenses: technical mechanisms, economic/practical impact, comparative assessment, risks/limitations, future trajectory.
### Pattern Recognition (200+ words) — 5+ non-obvious patterns with evidence and significance.
### Critical Evaluation (100+ words) — Strongest/weakest arguments, unresolved questions.

**patterns** (5 items): Each with bold title, evidence, and significance (3-4 sentences).
**comparison** (300+ words): Structured pros/cons for each alternative. If N/A, compare methodologies/perspectives.
**caveats** (3 items): Each with bold title, impact, and how to account for it.

Every claim must reference source numbers. Use ### headers, **bold terms**, and bullet points throughout.

Return ONLY valid JSON (no markdown fences):
{
  "analysis": "1000+ word structured analysis with ### headers and **bold findings**",
  "patterns": ["**Pattern 1: [Name]** — Evidence and significance (3-4 sentences)", "...5 total"],
  "comparison": "300+ word structured comparison with pros/cons",
  "confidence": "high|medium|low",
  "caveats": ["**Caveat 1: [Title]** — Impact and mitigation (2-3 sentences)", "...3 total"]
}`;

export async function runAnalysisAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("analysis", context.query);

  const sourcesText = context.web_results.slice(0, 8).map((r, i) =>
    `[Source ${i + 1}] ${r.title} (${r.domain})\n${r.snippet}`
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
Subtopics: ${context.subtopics.join("; ") || "N/A"}

Produce deep, structured analysis (1200+ words). Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "analysis-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "analysis-agent",
      output: parsed ?? { analysis: result.content, patterns: [], comparison: "", confidence: "medium", caveats: [] },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "analysis-agent",
      output: { analysis: "", patterns: [], comparison: "", confidence: "low", caveats: [] },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Analysis agent failed",
    };
  }
}
