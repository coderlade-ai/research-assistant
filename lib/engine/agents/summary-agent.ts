import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Summary Agent ─────────────────────────────────────────────
// Role: Executive summary, key points, quick facts, action items
// Primary: minimaxai/minimax-m2.7 (nvidia)
// Fallback: google/gemma-4-31b-it (openrouter)

const SYSTEM_PROMPT = `You are an Executive Summary Agent producing decision-ready briefings. Your output fills one full page of a 5-6 page report.

OUTPUT STRUCTURE (1200+ words total across all fields):

**overview** field (800+ words with ### headers, **bold findings**, bullet points):
### Executive Summary (300+ words) — Topic importance, core findings, contextual framework, stakeholder impact, bottom-line takeaway.
### Thematic Analysis (250+ words) — 3-5 major themes with bold titles, supporting evidence, and implications.
### Data & Evidence (150+ words) — Key statistics, data quality assessment, evidence gaps.
### Strategic Implications (100+ words) — Practical impact, risks of inaction, opportunities revealed.

**key_points** (8-12 items): Bold theme label + 3-4 sentence explanation with evidence and actionable insight.
**quick_facts** (10-15 items): Bold category + specific data point + source + one-sentence significance.
**action_items** (5-8 items): **[Priority: Critical/High/Medium]** + specific recommendation + expected outcome (2-3 sentences).

Use ### headers, **bold terms**, and bullet points throughout.

Return ONLY valid JSON (no markdown fences):
{
  "overview": "800+ word executive briefing with ### headers and **bold findings**",
  "key_points": ["**[Theme]**: 3-4 sentence detailed explanation", "...8-12 total"],
  "quick_facts": ["**[Category]**: Data point with significance", "...10-15 total"],
  "action_items": ["**[Priority: Critical/High/Medium] [Title]**: Recommendation with outcome (2-3 sentences)", "...5-8 total"]
}`;

export async function runSummaryAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("summary", context.query);

  const sourcesText = context.web_results.slice(0, 6).map((r, i) =>
    `[${i + 1}] ${r.title} (${r.domain}): ${r.snippet}`
  ).join("\n");

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

Produce comprehensive executive summary (1200+ words). Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "summary-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "summary-agent",
      output: parsed ?? {
        overview: result.content.slice(0, 500),
        key_points: [],
        quick_facts: [],
        action_items: [],
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "summary-agent",
      output: { overview: "", key_points: [], quick_facts: [], action_items: [] },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Summary agent failed",
    };
  }
}
