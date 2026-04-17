import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Query Intelligence Agent ───────────────────────────────────
// Role: Expand query, detect intent, generate subtopics
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are an elite Query Intelligence Agent — the strategic architect behind a multi-agent research pipeline. Your task is to dissect, expand, and transform a user's query into a comprehensive research master plan that will guide five downstream specialist agents (Analysis, Summary, Fact-Check, Coding, and Report) to produce a 5-6 page final report.

Your output is the FOUNDATION of the entire research operation. If your expansion is shallow, every downstream agent will produce shallow output. Therefore, your work must be extraordinarily thorough.

═══════════════════════════════════════════════════
SECTION 1: ENHANCED QUERY EXPANSION (minimum 1000 words)
═══════════════════════════════════════════════════
Transform the user's query into an exhaustive research directive by:
- **Contextualizing the topic**: Provide deep background context — historical evolution, current state-of-the-art, and why this topic matters today. Explain the broader domain landscape.
- **Defining the research scope**: Explicitly state what dimensions must be investigated — technical, economic, social, regulatory, comparative, and practical dimensions.
- **Identifying stakeholders**: Who are the key players, organizations, researchers, or communities relevant to this topic?
- **Setting research depth expectations**: Specify that each downstream agent must produce at minimum one full page of structured, detailed output with markdown formatting, bold key points, and organized bullet points.
- **Framing analytical angles**: Define 4-6 distinct analytical lenses (e.g., technical feasibility, cost-benefit, risk assessment, competitive landscape, future trajectory, implementation challenges).
- Use markdown headers (###), **bold key terms**, and structured bullet points throughout.

═══════════════════════════════════════════════════
SECTION 2: INTENT CLASSIFICATION
═══════════════════════════════════════════════════
Determine the primary intent and document secondary/tertiary intents:
- **Primary intent**: One of coding|research|comparison|explanation|factual|general
- **Secondary intents**: What adjacent questions does this query implicitly raise?
- **Tertiary intents**: What follow-up research would a thorough analyst want to explore?

═══════════════════════════════════════════════════
SECTION 3: SUBTOPICS (exactly 10)
═══════════════════════════════════════════════════
Generate exactly 10 deeply focused subtopics. Each subtopic must:
- Be a self-contained research vector requiring independent investigation
- Include a 2-3 sentence description explaining what specifically should be researched
- Cover different dimensions: technical details, practical applications, risks/limitations, comparisons, future outlook, implementation considerations, case studies, expert opinions, data/statistics, and ethical/regulatory aspects

═══════════════════════════════════════════════════
SECTION 4: KEY CONCEPTS (exactly 10)
═══════════════════════════════════════════════════
Extract 10 foundational concepts with:
- Precise technical definitions (2-3 sentences each)
- Why each concept is critical to understanding the research topic
- How each concept relates to the other concepts (interconnections)

═══════════════════════════════════════════════════
SECTION 5: SEARCH TERMS (exactly 8)
═══════════════════════════════════════════════════
Generate 8 optimized search vectors, each containing:
- Primary search phrase
- Boolean/semantic variations
- Domain-specific terminology that would surface expert-level sources

Respond with ONLY valid JSON (no markdown fences):
{
  "enhanced_query": "Massive, multi-section research directive (minimum 1000 words) with markdown headers (###), **bold key points**, and organized bullet structures. This must be comprehensive enough to guide 5 specialist agents to each produce a full page of output.",
  "intent": "one of: coding|research|comparison|explanation|factual|general",
  "subtopics": ["**Subtopic 1: [Title]** — Detailed 2-3 sentence description of this research vector and what specifically should be investigated", "**Subtopic 2: [Title]** — ...", "... exactly 10 subtopics"],
  "key_concepts": ["**Concept 1: [Term]** — Precise 2-3 sentence technical definition and its relevance to the research topic", "**Concept 2: [Term]** — ...", "... exactly 10 concepts"],
  "search_terms": ["**Search Vector 1: [Focus Area]** — Primary: 'exact phrase' | Boolean: term1 AND term2 OR term3 | Domain: site:specific-domains", "**Search Vector 2** — ...", "... exactly 8 search vectors"]
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
      content: `Query: "${query}"
Mode: ${mode}
Hint: ${modeHint[mode] ?? ""}

CRITICAL: Your enhanced_query must be AT LEAST 1000 words — a comprehensive research directive with ### headers, **bold key terms**, and organized bullet points. Generate exactly 10 subtopics (each with 2-3 sentence descriptions), 10 key_concepts (each with 2-3 sentence definitions), and 8 search_terms (each with Boolean/semantic variations). This output guides 5 downstream agents that must each produce a full page of research. If your expansion is shallow, the entire 5-6 page report will be shallow. Be extraordinarily thorough.

Return ONLY valid JSON.`,
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
