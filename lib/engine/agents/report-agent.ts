import type { ApiKeys, AgentResult, AgentContext, ResearchSource } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Report Generation Agent ────────────────────────────────────
// Role: Combine ALL agent outputs into one structured final report
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are a Report Generation Agent. You receive outputs from multiple specialized AI agents and must synthesize them into a single, comprehensive, and structured research report.

Prioritization order:
1. File context (highest priority — user-provided data)
2. Web data (real-time, sourced)
3. AI insights (analytical layer)

Remove duplicates. Resolve contradictions by citing the more reliable source.

Respond with ONLY valid JSON (no markdown fences):
{
  "overview": "2-3 sentence executive summary of the entire research",
  "key_insights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"],
  "details": "comprehensive multi-paragraph analysis combining all agent findings",
  "comparison": "structured comparison if applicable (empty string if not)",
  "expert_insights": ["non-obvious insight 1", "practical implication 2"],
  "conclusion": "final actionable recommendation (1-2 sentences)",
  "fact_check_summary": "reliability assessment from fact-check agent",
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
QUERY INTELLIGENCE OUTPUT:
Enhanced Query: ${allOutputs.enhanced_query}
Intent: ${String(allOutputs.queryOutput.intent ?? context.intent)}
Subtopics: ${JSON.stringify(allOutputs.queryOutput.subtopics ?? [])}

FAST SUMMARY OUTPUT:
Overview: ${String(allOutputs.summaryOutput.overview ?? "")}
Key Points: ${JSON.stringify(allOutputs.summaryOutput.key_points ?? [])}

ANALYSIS OUTPUT:
Analysis: ${String(allOutputs.analysisOutput.analysis ?? "").slice(0, 600)}
Patterns: ${JSON.stringify(allOutputs.analysisOutput.patterns ?? [])}
Comparison: ${String(allOutputs.analysisOutput.comparison ?? "")}

FACT-CHECK OUTPUT:
Reliability: ${String(allOutputs.factCheckOutput.reliability_label ?? "Unknown")} (${String(allOutputs.factCheckOutput.reliability_score ?? 0)}%)
Summary: ${String(allOutputs.factCheckOutput.fact_check_summary ?? "")}
Contradictions: ${JSON.stringify(allOutputs.factCheckOutput.contradictions ?? [])}
Warnings: ${JSON.stringify(allOutputs.factCheckOutput.warnings ?? [])}

${Object.keys(allOutputs.codingOutput).length > 0 && allOutputs.codingOutput.code
  ? `CODING OUTPUT:\nLanguage: ${String(allOutputs.codingOutput.language ?? "")}\nExplanation: ${String(allOutputs.codingOutput.explanation ?? "").slice(0, 300)}`
  : ""}

WEB SOURCES (${allOutputs.sources.length} found):
${allOutputs.sources.slice(0, 6).map((s, i) => `[${i + 1}] ${s.title} (${s.domain}): ${s.snippet}`).join("\n")}
`.trim();

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Original Query: ${context.query}

Agent Outputs to Synthesize:
${agentSummary}

Synthesize all outputs into a final report. Prioritize accuracy and insight. Return ONLY valid JSON.`,
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
