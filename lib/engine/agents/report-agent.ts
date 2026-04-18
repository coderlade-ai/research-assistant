import type { ApiKeys, AgentResult, AgentContext, ResearchSource } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Report Generation Agent ────────────────────────────────────
// Role: Combine ALL agent outputs into one structured final report
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are the Report Synthesis Agent — the final stage of a multi-agent research pipeline. Synthesize ALL agent outputs into a comprehensive 5-6 page (4000-6000 words) research report.

PRINCIPLES: Preserve all depth from agents. Only merge exact duplicates. Add cross-agent synthesis. Fill gaps with your knowledge (noted).

REQUIRED OUTPUT STRUCTURE:

**overview** (500-800 words): Executive summary with ### headers, **bold findings**. Cover: why this matters, critical findings from ALL agents, reliability assessment, section preview, key takeaway. Must be self-contained.

**key_insights** (10-15 items): Each: **[Title]** (Source: [Agent]) — 3-5 sentences with evidence and implications. Ordered by impact. Cover technical, practical, strategic, risk, forward-looking dimensions.

**details** (3000-4000 words): Multi-chapter narrative with ### headers, **bold terms**, bullets, --- between chapters:
### Chapter 1: Research Landscape & Context (500+ words) — Query Intelligence + Web Search synthesis, key terms, historical context
### Chapter 2: Core Analysis & Findings (800+ words) — Analysis Agent deep dive, patterns, Summary Agent data points
### Chapter 3: Comparative Assessment (400+ words) — Structured comparison matrix, pros/cons, recommendation
### Chapter 4: Practical Applications (500+ words) — Action items, implementation guide, coding output if present
### Chapter 5: Verification & Reliability (400+ words) — Fact-Check synthesis, verified/unverified claims, contradictions resolved
### Chapter 6: Future Outlook (400+ words) — Emerging trends, strategic recommendations, what to watch

**comparison** (300-500 words): Structured matrix — Description/Strengths/Weaknesses/Best For/Rating per alternative + final recommendation.
**expert_insights** (8-12 items): Novel cross-agent synthesis, not restating individual findings. 3-4 sentences each.
**conclusion** (300-500 words): Prioritized recommendations, audience-specific guidance, next steps, forward-looking statement.

FORMAT: ### and #### headers, **bold** all key terms/findings/statistics, bullet points for lists, numbered lists for sequences. Smooth transitions. Every claim traceable to agent output.

Return ONLY valid JSON (no markdown fences):
{
  "overview": "500-800 words",
  "key_insights": ["**[Title]** (Source: [Agent]) — explanation", "...10-15 total"],
  "details": "3000-4000 word multi-chapter report",
  "comparison": "300-500 word comparison matrix",
  "expert_insights": ["**[Title]**: novel cross-agent insight", "...8-12 total"],
  "conclusion": "300-500 words",
  "fact_check_summary": "reliability summary with score justification",
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
