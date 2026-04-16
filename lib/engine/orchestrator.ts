import type {
  ResearchResult,
  ResearchOptions,
  ApiKeys,
  StreamCallback,
  AgentContext,
  AgentStatusCallback,
  AgentStatusEvent,
  ResearchSource,
  SearchResult,
} from "./types";
import { TOKEN_LIMITS } from "./config";
import { enhanceQuery } from "./query-enhancer";
import { selectModelByUserId, getNextFallback } from "./model-router";
import { buildContext } from "./context-builder";
import { classifyError, userFacingMessage } from "./errors";
import { generateAIResponse } from "./providers";

// ── Agent imports ──────────────────────────────────────────────
import { runWebSearchAgent } from "./agents/web-search-agent";
import { runQueryIntelligenceAgent } from "./agents/query-intelligence-agent";
import { runAnalysisAgent } from "./agents/analysis-agent";
import { runCodingAgent } from "./agents/coding-agent";
import { runSummaryAgent } from "./agents/summary-agent";
import { runFactCheckAgent } from "./agents/fact-check-agent";
import { runReportAgent } from "./agents/report-agent";

// ── Helper ─────────────────────────────────────────────────────

function searchResultToSource(r: SearchResult, i: number): ResearchSource {
  return {
    id: String(i + 1),
    title: r.title,
    snippet: r.snippet,
    url: r.url,
    domain: r.domain,
  };
}

// ── Main Multi-Agent Orchestrator ──────────────────────────────

export async function runResearch(
  query: string,
  options: ResearchOptions,
  apiKeys: ApiKeys,
  onChunk?: StreamCallback,
  onAgentStatus?: AgentStatusCallback
): Promise<ResearchResult> {
  const startTime = Date.now();

  const emit = (event: AgentStatusEvent) => {
    onAgentStatus?.(event);
  };

  // ═══════════════════════════════════════════════════════════
  // PHASE 1: Query Intelligence + Web Search (parallel)
  // ═══════════════════════════════════════════════════════════

  emit({ agent: "query-intelligence-agent", status: "running", model: "moonshotai/kimi-k2-thinking", provider: "nvidia" });
  emit({ agent: "web-search-agent", status: "running", model: "perplexity/sonar-pro", provider: "perplexity" });

  const [queryResult, searchResult] = await Promise.all([
    runQueryIntelligenceAgent(query, options.mode, apiKeys).then(r => {
      emit({
        agent: "query-intelligence-agent",
        status: r.error ? "failed" : "done",
        model: r.model_used,
        provider: r.provider,
        durationMs: r.durationMs,
        isFallback: r.isFallback,
        error: r.error,
      });
      return r;
    }),
    runWebSearchAgent(
      {
        query,
        enhanced_query: query, // will be refined after query agent completes
      },
      options.mode,
      apiKeys
    ).then(r => {
      emit({
        agent: "web-search-agent",
        status: r.error ? "failed" : "done",
        model: r.model_used,
        provider: r.provider,
        durationMs: r.durationMs,
        isFallback: r.isFallback,
        error: r.error,
      });
      return r;
    }),
  ]);

  // Build shared AgentContext from Phase 1 outputs
  const webResults: SearchResult[] = (searchResult.output.raw_results as SearchResult[]) ?? [];
  const enhancedQuery = queryResult.enhanced_query || query;
  const subtopics = queryResult.subtopics || [];
  const intent = (queryResult.output.intent as ResearchResult["metadata"]["intent"]) ||
    enhanceQuery(query, options.mode).intent;

  const agentContext: AgentContext = {
    query,
    enhanced_query: enhancedQuery,
    intent,
    subtopics,
    web_results: webResults,
    file_context: options.files || [],
  };

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: Analysis + Summary + Coding (parallel, share context)
  // ═══════════════════════════════════════════════════════════

  emit({ agent: "analysis-agent", status: "running", model: "deepseek-ai/deepseek-v3.2", provider: "nvidia" });
  emit({ agent: "summary-agent", status: "running", model: "minimaxai/minimax-m2.7", provider: "nvidia" });
  emit({ agent: "coding-agent", status: intent === "coding" ? "running" : "skipped", model: "qwen/qwen3-coder-480b-a35b-instruct", provider: "nvidia" });

  const [analysisResult, summaryResult, codingResult] = await Promise.all([
    runAnalysisAgent(agentContext, apiKeys).then(r => {
      emit({
        agent: "analysis-agent",
        status: r.error ? "failed" : "done",
        model: r.model_used,
        provider: r.provider,
        durationMs: r.durationMs,
        isFallback: r.isFallback,
        error: r.error,
      });
      return r;
    }),
    runSummaryAgent(agentContext, apiKeys).then(r => {
      emit({
        agent: "summary-agent",
        status: r.error ? "failed" : "done",
        model: r.model_used,
        provider: r.provider,
        durationMs: r.durationMs,
        isFallback: r.isFallback,
        error: r.error,
      });
      return r;
    }),
    runCodingAgent(agentContext, apiKeys).then(r => {
      emit({
        agent: "coding-agent",
        status: r.error === "skipped" ? "skipped" : r.error ? "failed" : "done",
        model: r.model_used,
        provider: r.provider,
        durationMs: r.durationMs,
        isFallback: r.isFallback,
        error: r.error,
      });
      return r;
    }),
  ]);

  // ═══════════════════════════════════════════════════════════
  // PHASE 2b: Fact-Check (uses summary output to validate)
  // ═══════════════════════════════════════════════════════════

  emit({ agent: "fact-check-agent", status: "running", model: "mistralai/mistral-large-3-675b-instruct-2512", provider: "nvidia" });

  const factCheckResult = await runFactCheckAgent(
    agentContext,
    summaryResult.output,
    apiKeys
  ).then(r => {
    emit({
      agent: "fact-check-agent",
      status: r.error ? "failed" : "done",
      model: r.model_used,
      provider: r.provider,
      durationMs: r.durationMs,
      isFallback: r.isFallback,
      error: r.error,
    });
    return r;
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 3: Report Agent — Aggregate Everything
  // ═══════════════════════════════════════════════════════════

  emit({ agent: "report-agent", status: "running", model: "moonshotai/kimi-k2-thinking", provider: "nvidia" });

  const sources = webResults.map((r, i) => searchResultToSource(r, i));

  const reportResult = await runReportAgent(
    agentContext,
    {
      query,
      enhanced_query: enhancedQuery,
      queryOutput: queryResult.output,
      searchOutput: searchResult.output,
      analysisOutput: analysisResult.output,
      summaryOutput: summaryResult.output,
      factCheckOutput: factCheckResult.output,
      codingOutput: codingResult.output,
      sources,
    },
    apiKeys
  ).then(r => {
    emit({
      agent: "report-agent",
      status: r.error ? "failed" : "done",
      model: r.model_used,
      provider: r.provider,
      durationMs: r.durationMs,
      isFallback: r.isFallback,
      error: r.error,
    });
    return r;
  });

  const reportOutput = reportResult.output as Record<string, unknown>;

  // ═══════════════════════════════════════════════════════════
  // Build final ResearchResult
  // ═══════════════════════════════════════════════════════════

  const allAgentResults = [
    queryResult,
    searchResult,
    analysisResult,
    summaryResult,
    codingResult,
    factCheckResult,
    reportResult,
  ];

  const agentTrace: AgentStatusEvent[] = allAgentResults.map(r => ({
    agent: r.agent,
    status: r.error === "skipped" ? "skipped" : r.error ? "failed" : "done",
    model: r.model_used,
    provider: r.provider,
    durationMs: r.durationMs,
    isFallback: r.isFallback,
  }));

  // Code section from coding agent
  const codingOutput = codingResult.output as Record<string, unknown>;
  const codeBlock = codingOutput.code
    ? `\`\`\`${String(codingOutput.language ?? "")}\n${String(codingOutput.code)}\n\`\`\`\n\n${String(codingOutput.explanation ?? "")}`
    : undefined;

  // Fact-check summary
  const factOutput = factCheckResult.output as Record<string, unknown>;
  const factCheckSummary = factOutput.fact_check_summary
    ? `**Reliability: ${String(factOutput.reliability_label ?? "Unknown")} (${String(factOutput.reliability_score ?? 0)}%)**\n\n${String(factOutput.fact_check_summary)}\n\n${(factOutput.contradictions as string[] | undefined ?? []).length > 0 ? `⚠️ Contradictions found:\n${(factOutput.contradictions as string[]).map(c => `- ${c}`).join("\n")}` : ""}`
    : undefined;

  const totalDuration = Date.now() - startTime;

  // Stream a done signal if needed
  if (onChunk) {
    onChunk("", true);
  }

  return {
    overview: String(reportOutput.overview ?? summaryResult.output.overview ?? ""),
    keyInsights: (reportOutput.key_insights as string[] | undefined) ?? (summaryResult.output.key_points as string[] | undefined) ?? [],
    details: String(reportOutput.details ?? analysisResult.output.analysis ?? ""),
    comparison: String(reportOutput.comparison ?? analysisResult.output.comparison ?? ""),
    expertInsights: (reportOutput.expert_insights as string[] | undefined) ?? [],
    conclusion: String(reportOutput.conclusion ?? ""),
    code: codeBlock,
    factCheck: factCheckSummary,
    sources,
    references: sources,
    agentResults: allAgentResults,
    metadata: {
      model: reportResult.model_used,
      provider: reportResult.provider,
      searchProvider: (searchResult.provider as string) || "perplexity",
      intent,
      tokensUsed: 0, // multi-agent: no single token count
      durationMs: totalDuration,
      isFallback: reportResult.isFallback,
      agentTrace,
    },
  };
}

// ── Legacy single-model path (kept for non-streaming fallback) ──

const LEGACY_SYSTEM_PROMPT = `You are an advanced AI research agent. Your job is to generate structured, accurate, and insightful research reports.

OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object in this exact structure:
{
  "overview": "A concise 2-3 sentence summary",
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "details": "In-depth analysis with supporting evidence.",
  "comparison": "Structured comparison if applicable, empty string otherwise.",
  "expert_insights": ["Non-obvious insight 1", "Practical implication"],
  "conclusion": "Final takeaway with actionable recommendation (1-2 sentences)",
  "reference_notes": ["Brief note on source quality"]
}`;

export async function runResearchLegacy(
  query: string,
  options: ResearchOptions,
  apiKeys: ApiKeys,
  onChunk?: StreamCallback
): Promise<ResearchResult> {
  const startTime = Date.now();
  const enhanced = enhanceQuery(query, options.mode);
  const modelChain = selectModelByUserId(options.userModelId, query);
  let activeModel = modelChain.primary;
  const failedModels = new Set<string>();

  const { buildContext: bc } = await import("./context-builder");
  const { searchWithFallback } = await import("./search-router");
  const { normalizeResponse } = await import("./response-normalizer");

  const { results: searchResults, provider: searchProvider } = await searchWithFallback(
    { query: enhanced.enhanced, mode: options.mode, maxResults: options.maxSources ?? 6 },
    apiKeys
  );

  const context = bc(searchResults, options.files || [], options.maxTokens ?? TOKEN_LIMITS.contextWindow, enhanced.enhanced);

  const system = LEGACY_SYSTEM_PROMPT;
  const user = `Query: ${query}\n\nSources:\n${context.text}\n\nReturn ONLY valid JSON.`;

  let llmResponse = null as Awaited<ReturnType<typeof generateAIResponse>> | null;

  while (true) {
    try {
      llmResponse = await generateAIResponse({
        model: activeModel.id,
        provider: activeModel.provider,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: !!onChunk,
        apiKeys,
        onChunk,
      });
      break;
    } catch (err) {
      const researchErr = classifyError(err, activeModel.provider);
      failedModels.add(activeModel.id);
      if (!researchErr.retryable) throw researchErr;
      const nextModel = getNextFallback(modelChain, failedModels);
      if (!nextModel) throw researchErr;
      activeModel = nextModel;
    }
  }

  return normalizeResponse(llmResponse!.content, searchResults, {
    model: activeModel.id,
    provider: activeModel.provider,
    searchProvider,
    intent: enhanced.intent,
    tokensUsed: llmResponse!.usage.total_tokens || context.estimatedTokens,
    durationMs: Date.now() - startTime,
    isFallback: activeModel.id !== modelChain.primary.id,
  });
}
