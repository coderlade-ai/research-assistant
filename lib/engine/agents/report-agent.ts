import type { ApiKeys, AgentResult, AgentContext, ResearchSource } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Report Generation Agent ────────────────────────────────────
// Role: Combine ALL agent outputs into one structured final report
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are an elite Research Report Synthesis Agent — the final authority in a multi-agent research pipeline. Your role is to consume the comprehensive outputs from 5 specialized AI agents (Query Intelligence, Web Search, Deep Analysis, Executive Summary, and Fact-Check) and synthesize them into a single, monolithic, publication-quality research report.

THIS IS THE MOST IMPORTANT AGENT IN THE PIPELINE. Your output IS the final deliverable that the user receives. It must be extraordinary.

═══════════════════════════════════════════════════
REPORT SCOPE & LENGTH REQUIREMENTS
═══════════════════════════════════════════════════

**MANDATORY**: Your final report must span 5-6 full pages (4000-6000 words total across all fields). Each upstream agent has contributed approximately one full page of deeply researched content. Your job is to:
1. **Preserve all depth** — do NOT summarize or condense agent outputs. Expand and interconnect them.
2. **Eliminate only exact duplicates** — if two agents say the exact same thing, merge them. But if they provide different perspectives on the same topic, KEEP BOTH.
3. **Add synthesis value** — draw connections between agent outputs that no individual agent could see. Identify cross-cutting themes, resolve contradictions, and build a coherent narrative arc.
4. **Fill gaps** — if you notice that a subtopic wasn't fully addressed by any agent, fill in the gap using your own knowledge while clearly noting this.

═══════════════════════════════════════════════════
OVERVIEW (500-800 words required)
═══════════════════════════════════════════════════

Write a comprehensive executive summary that:
- Opens with a compelling framing of why this research matters
- Summarizes the most critical findings from ALL agents
- Provides the overall reliability assessment (from Fact-Check Agent)
- Previews the major sections of the report
- Closes with the single most important takeaway
- Structure with ### headers, **bold key findings**, and clear paragraphs
- This should be self-contained — someone reading ONLY the overview should understand the key findings

═══════════════════════════════════════════════════
KEY INSIGHTS (10-15 required)
═══════════════════════════════════════════════════

Each insight must:
- Be drawn from a SPECIFIC agent's output (cite which agent)
- Provide 3-5 sentences of detailed explanation with evidence
- Explain WHY this insight matters and what its implications are
- Be ordered from most impactful to least impactful
- Cover different dimensions: technical, practical, strategic, risk-related, and forward-looking

═══════════════════════════════════════════════════
DETAILS — THE CORE REPORT (3000-4000 words required)
═══════════════════════════════════════════════════

This is the heart of the report. Structure it as a multi-chapter narrative:

### Chapter 1: Research Landscape & Context (500+ words)
- Synthesize the Query Intelligence Agent's expanded context with the Web Search findings
- Establish the foundational understanding of the topic
- Define key terms and concepts for the reader
- Provide historical context and current state-of-the-art

### Chapter 2: Core Analysis & Findings (800+ words)
- Draw primarily from the Analysis Agent's deep dive
- Present the multi-dimensional analysis (technical, economic, practical, risk)
- Highlight all identified patterns with supporting evidence
- Include data points and statistics from the Summary Agent's quick facts

### Chapter 3: Comparative Assessment (400+ words)
- Synthesize the Analysis Agent's comparison with broader context
- Build structured comparison tables or matrices where applicable
- Present clear pros/cons for each alternative/approach
- Provide a reasoned recommendation

### Chapter 4: Practical Applications & Implementation (500+ words)
- Draw from Summary Agent's action items and Analysis Agent's practical dimensions
- Provide step-by-step guidance where applicable
- Include implementation considerations, prerequisites, and dependencies
- If coding output exists, integrate the architectural explanation and usage guidance

### Chapter 5: Verification & Reliability (400+ words)
- Synthesize the Fact-Check Agent's complete assessment
- Present verified claims as established facts
- Flag unverified claims with appropriate caveats
- Discuss contradictions and how they were resolved
- Provide the overall reliability rating with justification

### Chapter 6: Future Outlook & Implications (400+ words)
- Combine forward-looking insights from all agents
- Discuss emerging trends, potential disruptions, and evolving landscapes
- Provide strategic recommendations for different stakeholder groups
- Identify what to watch for in the coming months/years

═══════════════════════════════════════════════════
COMPARISON (300-500 words required)
═══════════════════════════════════════════════════

- Build a comprehensive comparison of all relevant alternatives, approaches, or competing perspectives
- Use a structured format: for each item, provide Description → Strengths → Weaknesses → Best For → Overall Rating
- Include a final recommendation with clear justification

═══════════════════════════════════════════════════
EXPERT INSIGHTS (8-12 required)
═══════════════════════════════════════════════════

Each expert insight must:
- Go beyond what the individual agents stated — draw novel conclusions from cross-agent synthesis
- Provide 3-4 sentences of explanation
- Be genuinely insightful (not restating obvious findings)
- Cover: strategic implications, hidden risks, non-obvious opportunities, contrarian perspectives, and long-term considerations

═══════════════════════════════════════════════════
CONCLUSION (300-500 words required)
═══════════════════════════════════════════════════

- Synthesize the entire report into actionable final recommendations
- Prioritize recommendations by impact and feasibility
- Address different audience segments if applicable
- End with a forward-looking statement about the topic's trajectory
- Include specific next steps the reader should consider

═══════════════════════════════════════════════════
FORMATTING REQUIREMENTS
═══════════════════════════════════════════════════

- Use markdown headers (###, ####) for all chapters and sections
- **Bold** all key terms, important findings, statistics, and critical conclusions
- Use bullet points (- ) for all lists and structured breakdowns
- Use numbered lists (1. 2. 3.) for sequential steps, rankings, or prioritized items
- Include horizontal rules (---) between major chapters in the details section
- Ensure smooth transitions between sections — the report should read as a cohesive narrative, not disconnected blocks
- Every claim should be traceable to an agent's output

Respond with ONLY valid JSON (no markdown fences):
{
  "overview": "Comprehensive 500-800 word executive summary with ### headers, **bold key findings**, and structured paragraphs covering: topic framing, critical findings from all agents, reliability assessment, section preview, and key takeaway.",
  "key_insights": ["**[Insight Title]** (Source: [Agent Name]) — 3-5 sentence detailed explanation with evidence, implications, and why it matters", "... minimum 10-15 key insights"],
  "details": "The core 3000-4000 word multi-chapter report with ### Chapter headers, #### sub-sections, **bold key findings**, organized bullet points, and smooth narrative transitions. Must include all 6 chapters: Research Landscape, Core Analysis, Comparative Assessment, Practical Applications, Verification & Reliability, and Future Outlook.",
  "comparison": "Structured 300-500 word comparison matrix with Description/Strengths/Weaknesses/Best For/Rating for each alternative, plus a final recommendation.",
  "expert_insights": ["**[Expert Insight Title]**: 3-4 sentence novel insight derived from cross-agent synthesis — not restating individual agent findings but drawing new conclusions (must be genuinely non-obvious)", "... minimum 8-12 expert insights"],
  "conclusion": "Comprehensive 300-500 word conclusion with prioritized actionable recommendations, audience-specific guidance, next steps, and forward-looking perspective.",
  "fact_check_summary": "Concise reliability summary derived from the Fact-Check Agent's assessment, including overall score justification and key warnings.",
  "reliability_score": 85
}`;

interface AllAgentOutputs {
  query: string;
  enhanced_query: string;
  queryOutput: Record<string, unknown>;
  searchOutput: Record<string, unknown>;
  analysisOutput: Record<string, unknown>;
  summaryOutput: Record<string, unknown>;
  factCheckOutput: Record<string, unknown>;
  codingOutput: Record<string, unknown>;
  sources: ResearchSource[];
}

export async function runReportAgent(
  context: AgentContext,
  allOutputs: AllAgentOutputs,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("report", context.query);

  const agentSummary = `
═══════════════════════════════════════════════════
AGENT 1: QUERY INTELLIGENCE OUTPUT
═══════════════════════════════════════════════════
Enhanced Query: ${String(allOutputs.enhanced_query)}
Intent: ${String(allOutputs.queryOutput.intent ?? context.intent)}
Subtopics: ${JSON.stringify(allOutputs.queryOutput.subtopics ?? [])}
Key Concepts: ${JSON.stringify(allOutputs.queryOutput.key_concepts ?? [])}
Search Terms: ${JSON.stringify(allOutputs.queryOutput.search_terms ?? [])}

═══════════════════════════════════════════════════
AGENT 2: EXECUTIVE SUMMARY OUTPUT
═══════════════════════════════════════════════════
Overview: ${String(allOutputs.summaryOutput.overview ?? "")}
Key Points: ${JSON.stringify(allOutputs.summaryOutput.key_points ?? [])}
Quick Facts: ${JSON.stringify(allOutputs.summaryOutput.quick_facts ?? [])}
Action Items: ${JSON.stringify(allOutputs.summaryOutput.action_items ?? [])}

═══════════════════════════════════════════════════
AGENT 3: DEEP ANALYSIS OUTPUT (FULL — DO NOT TRUNCATE)
═══════════════════════════════════════════════════
Analysis: ${String(allOutputs.analysisOutput.analysis ?? "")}
Patterns: ${JSON.stringify(allOutputs.analysisOutput.patterns ?? [])}
Comparison: ${String(allOutputs.analysisOutput.comparison ?? "")}
Confidence: ${String(allOutputs.analysisOutput.confidence ?? "")}
Caveats: ${JSON.stringify(allOutputs.analysisOutput.caveats ?? [])}

═══════════════════════════════════════════════════
AGENT 4: FACT-CHECK OUTPUT (FULL — DO NOT TRUNCATE)
═══════════════════════════════════════════════════
Reliability: ${String(allOutputs.factCheckOutput.reliability_label ?? "Unknown")} (${String(allOutputs.factCheckOutput.reliability_score ?? 0)}%)
Fact-Check Summary: ${String(allOutputs.factCheckOutput.fact_check_summary ?? "")}
Verified Claims: ${JSON.stringify(allOutputs.factCheckOutput.verified_claims ?? [])}
Unverified Claims: ${JSON.stringify(allOutputs.factCheckOutput.unverified_claims ?? [])}
Contradictions: ${JSON.stringify(allOutputs.factCheckOutput.contradictions ?? [])}
Warnings: ${JSON.stringify(allOutputs.factCheckOutput.warnings ?? [])}

${Object.keys(allOutputs.codingOutput).length > 0 && allOutputs.codingOutput.code
  ? `═══════════════════════════════════════════════════
AGENT 5: CODING OUTPUT (FULL — DO NOT TRUNCATE)
═══════════════════════════════════════════════════
Language: ${String(allOutputs.codingOutput.language ?? "")}
Code: ${String(allOutputs.codingOutput.code ?? "")}
Explanation: ${String(allOutputs.codingOutput.explanation ?? "")}
Usage Example: ${String(allOutputs.codingOutput.usage_example ?? "")}
Pitfalls: ${JSON.stringify(allOutputs.codingOutput.pitfalls ?? [])}
Alternatives: ${String(allOutputs.codingOutput.alternatives ?? "")}`
  : ""}

═══════════════════════════════════════════════════
WEB SOURCES (${allOutputs.sources.length} found)
═══════════════════════════════════════════════════
${allOutputs.sources.slice(0, 8).map((s, i) => `[${i + 1}] ${s.title} (${s.domain}): ${s.snippet}`).join("\n")}

${context.file_context.length > 0
  ? `═══════════════════════════════════════════════════\nFILE CONTEXT (${context.file_context.length} attached)\n═══════════════════════════════════════════════════\n${context.file_context.slice(0, 10).map(f => `[File: ${f.fileName}]\n${f.content.slice(0, 15000)}`).join("\n\n")}`
  : ""}

${context.conversationHistory && context.conversationHistory.length > 0
  ? `═══════════════════════════════════════════════════\nPREVIOUS CONVERSATION HISTORY\n═══════════════════════════════════════════════════\n${context.conversationHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")}`
  : ""}
`.trim();

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Original Query: ${context.query}

COMPLETE AGENT OUTPUTS TO SYNTHESIZE (all outputs provided in full — use ALL of this data):
${agentSummary}

CRITICAL INSTRUCTIONS:
- Your report MUST be 5-6 pages (4000-6000 words total across all JSON fields).
- The "details" field alone must be 3000-4000 words with 6 clearly structured chapters.
- The "overview" must be 500-800 words.
- Include 10-15 key_insights and 8-12 expert_insights.
- Use ### headers, **bold key points**, and organized bullet points throughout ALL fields.
- Synthesize ALL agent outputs above — do not ignore or skip any agent's contribution.
- Every insight, pattern, fact, and warning from the agents above must appear somewhere in your report.

Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "report-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.reportMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "report-agent",
      output: parsed ?? {
        overview: "",
        key_insights: [],
        details: result.content,
        comparison: "",
        expert_insights: [],
        conclusion: "",
        fact_check_summary: "",
        reliability_score: 0,
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "report-agent",
      output: {
        overview: context.query,
        key_insights: [],
        details: "",
        comparison: "",
        expert_insights: [],
        conclusion: "",
        fact_check_summary: "",
        reliability_score: 0,
      },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Report agent failed",
    };
  }
}
