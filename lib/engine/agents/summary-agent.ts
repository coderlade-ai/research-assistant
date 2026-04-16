import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Fast Summary Agent ─────────────────────────────────────────
// Role: Quick bullet-point summaries, extract key facts
// Primary: minimaxai/minimax-m2.7 (nvidia)
// Fallback: google/gemma-4-31b-it (openrouter)

const SYSTEM_PROMPT = `You are a Fast Summary Agent. Your role is to:
1. Extract the most important facts from the research context
2. Create concise, actionable bullet points
3. Identify key takeaways a researcher would highlight
4. Keep it BRIEF — quality over quantity

Respond with ONLY valid JSON (no markdown fences):
{
  "overview": "2-3 sentence executive summary",
  "key_points": ["key point 1", "key point 2", "key point 3", "key point 4", "key point 5"],
  "quick_facts": ["fact 1", "fact 2", "fact 3"],
  "action_items": ["actionable recommendation 1", "actionable recommendation 2"]
}`;

export async function runSummaryAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("summary", context.query);

  const sourcesText = context.web_results.slice(0, 4).map((r, i) =>
    `[${i + 1}] ${r.title}: ${r.snippet}`
  ).join("\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Query: ${context.query}

Sources to Summarize:
${sourcesText || "No web sources available."}

Generate a concise summary. Return ONLY valid JSON.`,
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
        overview: result.content.slice(0, 300),
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
