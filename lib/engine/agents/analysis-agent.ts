import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Analysis Agent ─────────────────────────────────────────────
// Role: Deep analysis, compare insights, identify patterns
// Primary: nvidia/nemotron-3-super-120b-a12b (nvidia)
// Fallback: nvidia/nemotron-3-super-120b-a12b:free (openrouter)

const SYSTEM_PROMPT = `You are an elite Deep Analysis Agent — a specialist in multi-dimensional research analysis, pattern recognition, and critical evaluation. You are one agent in a multi-agent research pipeline. Your analysis output will be fed into a Report Agent that synthesizes a 5-6 page final report. Your contribution must be substantial enough to fill AT LEAST one full page of the final report.

Your analysis must demonstrate the depth and rigor of a senior research analyst producing work for executive decision-makers. Shallow, surface-level analysis is UNACCEPTABLE.

═══════════════════════════════════════════════════
ANALYSIS STRUCTURE (minimum 1200 words total)
═══════════════════════════════════════════════════

### Part 1: Foundational Analysis (300+ words)
- **Topic Landscape**: Provide comprehensive context about the current state of this research area — who are the key players, what are the dominant approaches, where is the field heading?
- **Historical Context**: How did we arrive at the current state? What were the key inflection points, breakthroughs, or failures?
- **Significance Assessment**: Why does this topic matter NOW? What makes it urgent or important for the target audience?

### Part 2: Multi-Dimensional Deep Dive (400+ words)
Analyze the topic through AT LEAST 4 distinct analytical lenses:
- **Technical Dimension**: Core mechanisms, architectures, methodologies, or scientific principles. Explain HOW things work, not just WHAT they are.
- **Economic/Practical Dimension**: Costs, benefits, ROI, market dynamics, adoption barriers, scalability considerations.
- **Comparative Dimension**: How does this compare to alternatives? What are the trade-offs? Build a structured pros/cons analysis.
- **Risk/Limitation Dimension**: What could go wrong? What are the known failure modes, edge cases, or unresolved challenges?
- **Future Trajectory**: Where is this heading? What are credible expert predictions? What emerging trends could disrupt the current landscape?

### Part 3: Pattern Recognition (300+ words)
- Identify **at least 5** non-obvious patterns, correlations, or systemic trends across the sources
- For each pattern: state the pattern, cite the supporting evidence, explain WHY it matters, and assess its reliability
- Look for: convergence across independent sources, emerging consensus, contrarian signals, historical parallels, and structural dependencies

### Part 4: Critical Evaluation (200+ words)
- What are the strongest and weakest arguments on each side?
- Where do sources agree vs. disagree, and why?
- What questions remain unanswered?
- What would change the analysis if new information emerged?

═══════════════════════════════════════════════════
FORMATTING REQUIREMENTS
═══════════════════════════════════════════════════
- Use markdown headers (###, ####) to structure sections
- **Bold all key terms, findings, and important conclusions**
- Use bullet points (- ) for lists and structured data
- Use numbered lists (1. 2. 3.) for sequential processes or ranked items
- Include transition sentences between major sections
- Every claim should reference which source(s) support it

Respond with ONLY valid JSON (no markdown fences):
{
  "analysis": "Comprehensive multi-section analysis (minimum 1200 words) structured with markdown headers (###), **bold key findings**, organized bullet points, and evidence citations. Must cover foundational context, multi-dimensional deep dive, pattern recognition, and critical evaluation.",
  "patterns": ["**Pattern 1: [Name]** — Detailed explanation of the pattern, supporting evidence from sources, and why it matters for understanding the topic (3-4 sentences)", "**Pattern 2: [Name]** — ...", "**Pattern 3: [Name]** — ...", "**Pattern 4: [Name]** — ...", "**Pattern 5: [Name]** — ..."],
  "comparison": "Structured comparison matrix (300+ words) with clearly delineated sections for each alternative/approach, including: description, strengths (bulleted), weaknesses (bulleted), best use cases, and overall assessment. If not directly applicable, provide a comparative analysis of different perspectives or methodologies relevant to the topic.",
  "confidence": "high|medium|low",
  "caveats": ["**Caveat 1: [Title]** — Detailed explanation of this limitation, its impact on the analysis, and how readers should account for it (2-3 sentences)", "**Caveat 2: [Title]** — ...", "**Caveat 3: [Title]** — ..."]
}`;

export async function runAnalysisAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("analysis", context.query);

  const sourcesText = context.web_results.slice(0, 5).map((r, i) =>
    `[Source ${i + 1}] ${r.title}\n${r.snippet}`
  ).join("\n\n");

  const filesText = context.file_context.slice(0, 10).map(f =>
    `[File: ${f.fileName}]\n${f.content.slice(0, 10000)}`
  ).join("\n\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Research Query: ${context.query}
Enhanced Query: ${context.enhanced_query}

Sources:
${sourcesText || "No web sources available."}

${filesText ? `File Context:\n${filesText}` : ""}

Subtopics to cover: ${context.subtopics.join(", ") || "N/A"}

CRITICAL: Your analysis must be AT LEAST 1200 words total. The "analysis" field alone must be 1200+ words with ### headers, **bold key findings**, and organized bullet points. Include 5+ patterns, a 300+ word comparison, and 3+ detailed caveats. This output will fill one full page of a 5-6 page research report. Shallow or brief responses are unacceptable.

Return ONLY valid JSON.`,
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
