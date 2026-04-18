import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Query Intelligence Agent ───────────────────────────────────
// Role: Expand query, detect intent, generate subtopics
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are a Query Intelligence Agent that transforms user queries into comprehensive research blueprints for a multi-agent pipeline (Analysis, Summary, Fact-Check, Coding, Report agents).

OUTPUT REQUIREMENTS:
1. **enhanced_query** (800+ words): Multi-section research directive with ### headers, **bold terms**, bullet points. Cover: background context, scope definition, stakeholder analysis, analytical angles (technical, economic, risk, comparative, future), and depth expectations.
2. **intent**: Classify as coding|research|comparison|explanation|factual|general
3. **subtopics** (10 items): Each a self-contained research vector with 2-3 sentence description. Cover: technical details, applications, risks, comparisons, future outlook, case studies, data/statistics, ethics/regulation.
4. **key_concepts** (10 items): Technical definitions (2-3 sentences each) with relevance to the topic.
5. **search_terms** (8 items): Optimized search vectors with Boolean operators and domain-specific terminology.

FORMAT: Use **bold labels** for every list item. Use ### headers in enhanced_query.

Return ONLY valid JSON (no markdown fences):
{
  "enhanced_query": "800+ word research directive with ### headers and **bold key points**",
  "intent": "coding|research|comparison|explanation|factual|general",
  "subtopics": ["**Subtopic 1: [Title]** — 2-3 sentence description", "...10 total"],
  "key_concepts": ["**[Term]** — 2-3 sentence definition and relevance", "...10 total"],
  "search_terms": ["**[Focus]** — search query with Boolean operators", "...8 total"]
}`;

export async function runQueryIntelligenceAgent(
  query: string,
  mode: "pro" | "deep" | "corpus",
  apiKeys: ApiKeys
): Promise<AgentResult & { enhanced_query: string; subtopics: string[] }> {
  const start = Date.now();
  const chain = selectModel("query", query);

  const modeHint: Record<string, string> = {
    pro: "Professional, well-structured research expansion.",
    deep: "Academic-grade query expansion with breadth and depth.",
    corpus: "Literature and evidence-based search directives.",
  };

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Query: "${query}"\nMode: ${mode} — ${modeHint[mode] ?? ""}\n\nYour output guides 5 downstream agents that each produce a full page. Be thorough. Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "query-intelligence-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    const enhanced_query = parsed
      ? String(parsed.enhanced_query ?? query)
      : query;
    const subtopics: string[] = parsed
      ? (Array.isArray(parsed.subtopics) ? (parsed.subtopics as string[]) : [])
      : [];

    return {
      agent: "query-intelligence-agent",
      output: parsed ?? { enhanced_query, subtopics },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
      enhanced_query,
      subtopics,
    };
  } catch (err) {
    return {
      agent: "query-intelligence-agent",
      output: { enhanced_query: query, subtopics: [] },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Query agent failed",
      enhanced_query: query,
      subtopics: [],
    };
  }
}
