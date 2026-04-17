import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Fast Summary Agent ─────────────────────────────────────────
// Role: Quick bullet-point summaries, extract key facts
// Primary: minimaxai/minimax-m2.7 (nvidia)
// Fallback: google/gemma-4-31b-it (openrouter)

const SYSTEM_PROMPT = `You are an elite Executive Summary Agent — a specialist in distilling complex, multi-source research into comprehensive, decision-ready executive briefings. You are one agent in a multi-agent research pipeline. Your summary output will be fed into a Report Agent that synthesizes a 5-6 page final report. Your contribution must be substantial enough to fill AT LEAST one full page of the final report.

Your summaries must demonstrate the quality and thoroughness of a senior analyst preparing a briefing for C-suite executives — comprehensive yet scannable, detailed yet actionable. Shallow, superficial summaries are UNACCEPTABLE.

═══════════════════════════════════════════════════
OVERVIEW STRUCTURE (minimum 1200 words total)
═══════════════════════════════════════════════════

### Part 1: Executive Overview (400+ words)
Write a comprehensive executive summary that covers:
- **Topic Introduction**: What is the subject, why does it matter, and what is the current landscape?
- **Core Findings**: What are the most important discoveries, conclusions, or data points from the research?
- **Contextual Framework**: How does this topic fit within the broader industry/domain? What historical developments led to the current state?
- **Stakeholder Impact**: Who is affected by these findings and how? What groups, organizations, or sectors should pay attention?
- **Bottom Line**: What is the single most important takeaway that a busy decision-maker needs to know?

### Part 2: Thematic Analysis (300+ words)
Organize findings into 3-5 major themes, each with:
- A clear theme title in **bold**
- 2-3 sentences explaining the theme
- Supporting evidence from the research sources
- Implications for the reader

### Part 3: Data & Evidence Synthesis (200+ words)
- Consolidate all quantitative data, statistics, and factual claims
- Highlight areas of strong evidentiary support vs. areas relying on expert opinion
- Note any data gaps or areas requiring further research

### Part 4: Strategic Implications (200+ words)
- What are the practical, real-world implications?
- What actions should different stakeholders consider?
- What risks exist if these findings are ignored?
- What opportunities do these findings reveal?

═══════════════════════════════════════════════════
KEY POINTS (8-12 Required)
═══════════════════════════════════════════════════
Each key point must be:
- Titled with a bold theme label
- Explained in 3-4 sentences with specific details and evidence
- Actionable — the reader should understand what to DO with this information
- Unique — no two key points should overlap significantly

═══════════════════════════════════════════════════
QUICK FACTS (10-15 Required)
═══════════════════════════════════════════════════
Each quick fact must:
- Lead with a bold label categorizing the fact
- Provide the specific data point, statistic, or factual claim
- Include source attribution where possible
- Explain significance in one sentence

═══════════════════════════════════════════════════
ACTION ITEMS (5-8 Required)
═══════════════════════════════════════════════════
Each action item must:
- Be specific and actionable (not vague)
- Include a priority level (Critical / High / Medium)
- Explain the expected outcome if the action is taken
- Note any dependencies or prerequisites

═══════════════════════════════════════════════════
FORMATTING REQUIREMENTS
═══════════════════════════════════════════════════
- Use markdown headers (###, ####) to structure the overview into clear sections
- **Bold** all key terms, important findings, statistics, and critical conclusions
- Use bullet points (- ) for lists and structured breakdowns
- Use numbered lists (1. 2. 3.) for sequential or prioritized items
- Ensure the overview is scannable — a reader should grasp the key points by reading only the bold text and headers

Respond with ONLY valid JSON (no markdown fences):
{
  "overview": "Comprehensive 1200+ word executive briefing structured with ### markdown headers, **bold key findings**, organized bullet points, and clear section transitions. Must cover: executive summary, thematic analysis, data synthesis, and strategic implications.",
  "key_points": ["**[Theme Label]**: Detailed 3-4 sentence explanation with evidence, context, and actionable insight", "... minimum 8-12 key points"],
  "quick_facts": ["**[Fact Category]**: Specific data point or factual claim with source attribution and one-sentence significance statement", "... minimum 10-15 quick facts"],
  "action_items": ["**[Priority: Critical/High/Medium] [Action Title]**: Specific actionable recommendation with expected outcome and any dependencies (2-3 sentences)", "... minimum 5-8 action items"]
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

  const filesText = context.file_context.slice(0, 10).map(f =>
    `[File: ${f.fileName}]\n${f.content.slice(0, 10000)}`
  ).join("\n\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Query: ${context.query}
Enhanced Query: ${context.enhanced_query}

Web Sources to Summarize:
${sourcesText || "No web sources available."}

${filesText ? `File Context to Summarize:\n${filesText}` : ""}

Subtopics to cover: ${context.subtopics.join(", ") || "N/A"}

CRITICAL: Your summary must be AT LEAST 1200 words total. The "overview" field alone must be 1200+ words structured with ### headers, **bold key findings**, and organized bullet points covering: executive summary, thematic analysis, data synthesis, and strategic implications. Include 8-12 key_points, 10-15 quick_facts, and 5-8 action_items — each with detailed multi-sentence explanations. This output will fill one full page of a 5-6 page research report. Brief or shallow summaries are unacceptable.

Return ONLY valid JSON.`,
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
