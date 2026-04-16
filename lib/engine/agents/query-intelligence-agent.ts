import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Query Intelligence Agent ───────────────────────────────────
// Role: Expand query, detect intent, generate subtopics
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are a Query Intelligence Agent specialized in understanding user intent and generating structured research plans.

Your job:
1. Expand the query into a comprehensive enhanced version
2. Detect the primary intent (coding|research|comparison|explanation|factual|general)
3. Generate 3-5 focused subtopics for parallel research

Respond with ONLY valid JSON (no markdown fences):
{
  "enhanced_query": "fully expanded version with context and research directives",
  "intent": "one of: coding|research|comparison|explanation|factual|general",
  "subtopics": ["subtopic 1", "subtopic 2", "subtopic 3"],
  "key_concepts": ["concept 1", "concept 2"],
  "search_terms": ["optimized search term 1", "optimized search term 2"]
}`;

export async function runQueryIntelligenceAgent(
  query: string,
  mode: "pro" | "deep" | "corpus",
  apiKeys: ApiKeys
): Promise<AgentResult & { enhanced_query: string; subtopics: string[] }> {
  const start = Date.now();
  const chain = selectModel("query", query);

  const modeHint: Record<string, string> = {
    pro: "Provide a professional, well-structured research expansion.",
    deep: "Conduct a thorough academic-grade query expansion with breadth.",
    corpus: "Focus on literature and evidence-based search directives.",
  };

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Query: "${query}"\nMode: ${mode}\nHint: ${modeHint[mode] ?? ""}`,
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
    // Graceful degradation — return original query
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
