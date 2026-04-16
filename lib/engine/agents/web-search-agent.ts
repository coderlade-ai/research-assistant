import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { searchWithFallback } from "../search-router";

// ── Web Search Agent ───────────────────────────────────────────
// Role: Fetch real-time web data via Perplexity Sonar (fallback: OpenRouter)
// Output: { sources[], summaries[] }

export async function runWebSearchAgent(
  context: Pick<AgentContext, "query" | "enhanced_query">,
  mode: "pro" | "deep" | "corpus",
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();

  try {
    const { results, provider } = await searchWithFallback(
      {
        query: context.enhanced_query || context.query,
        mode,
        maxResults: 8,
      },
      apiKeys
    );

    const sources = results.map((r, i) => ({
      id: String(i + 1),
      title: r.title,
      url: r.url,
      domain: r.domain,
      snippet: r.snippet,
    }));

    const summaries = results.map(r => `${r.title}: ${r.snippet}`);

    return {
      agent: "web-search-agent",
      output: { sources, summaries, raw_results: results },
      model_used: provider === "perplexity" ? "perplexity/sonar-pro" : "openrouter/search",
      provider,
      durationMs: Date.now() - start,
      isFallback: provider !== "perplexity",
    };
  } catch (err) {
    return {
      agent: "web-search-agent",
      output: { sources: [], summaries: [] },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Search failed",
    };
  }
}
