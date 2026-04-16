import type {
  ResearchResult,
  ResearchOptions,
  ResolvedModel,
  IntentType,
  ApiKeys,
  LLMResponse,
  StreamCallback,
} from "./types";
import { TOKEN_LIMITS } from "./config";
import { enhanceQuery } from "./query-enhancer";
import { searchWithFallback } from "./search-router";
import { selectModel, getNextFallback } from "./model-router";
import { buildContext } from "./context-builder";
import { normalizeResponse } from "./response-normalizer";
import { generateAIResponse } from "./providers";
import { classifyError, userFacingMessage } from "./errors";

// ── System Prompt (Research Agent Core Identity) ───────────────

const SYSTEM_PROMPT = `You are an advanced AI research agent. Your job is to generate structured, accurate, and insightful research reports.

BEHAVIORAL RULES:
1. Do NOT hallucinate unknown facts. If you are unsure about something, explicitly state: "Based on general knowledge" before that claim.
2. Prefer clarity over verbosity. Every sentence must add value.
3. Prioritize reasoning over generic answers. Provide WHY, not just WHAT.
4. Provide comparisons when the query involves alternatives, trade-offs, or choices.
5. Highlight important insights — non-obvious findings that a researcher would care about.
6. Use a professional, analytical, developer-friendly tone throughout.
7. All output must be optimized for export as Markdown or PDF — use clean hierarchy.

OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object (no markdown fences, no extra text) in this exact structure:
{
  "overview": "A concise 2-3 sentence summary of the answer",
  "key_insights": ["insight 1 — with brief reasoning", "insight 2", "insight 3"],
  "details": "In-depth analysis with supporting evidence. Use bullet-point style with sub-points where appropriate. Reference sources by [Source N] notation.",
  "comparison": "Structured comparison if the query involves alternatives or trade-offs. Use clear criteria. Empty string if not applicable.",
  "expert_insights": ["Non-obvious insight 1 that goes beyond surface-level", "Practical implication or hidden trade-off"],
  "conclusion": "Final takeaway with actionable recommendation (1-2 sentences)",
  "reference_notes": ["Brief note on source quality or type for each key source used"]
}`;

// ── Generation Prompt ──────────────────────────────────────────

function buildPrompt(query: string, context: string, intent: IntentType): { system: string; user: string } {
  const intentHint: Partial<Record<IntentType, string>> = {
    coding:
      "Focus on practical implementation details, code patterns, and common pitfalls. Structure the details section with clear sub-points for each approach.",
    comparison:
      "You MUST fill the comparison field with a structured analysis. Use clear evaluation criteria. Include pros/cons for each option.",
    research:
      "Cite the provided sources by [Source N] notation throughout. Focus on evidence quality, methodology, and areas of consensus vs. debate.",
    explanation:
      "Explain from first principles. Build understanding progressively. Use concrete examples to illustrate abstract concepts.",
    factual:
      "Be precise and concise. Lead with the direct answer, then provide supporting context.",
  };

  const system = `${SYSTEM_PROMPT}${intentHint[intent] ? `\n\nSPECIAL INSTRUCTIONS FOR THIS QUERY:\n${intentHint[intent]}` : ""}`;

  const user = `Query: ${query}

Sources:
${context}

Remember: Return ONLY valid JSON. No markdown fences, no explanatory text outside the JSON.`;

  return { system, user };
}

// ── Main Orchestrator ──────────────────────────────────────────

export async function runResearch(
  query: string,
  options: ResearchOptions,
  apiKeys: ApiKeys,
  onChunk?: StreamCallback
): Promise<ResearchResult> {
  const startTime = Date.now();

  // ── Step 1: Enhance Query ────────────────────────────────────
  const enhanced = enhanceQuery(query, options.mode);
  console.log("[orchestrator] Intent:", enhanced.intent, "| Mode:", options.mode);

  // ── Step 2: Select Model ─────────────────────────────────────
  const modelChain = selectModel(options.userModelId, query);
  let activeModel = modelChain.primary;
  const failedModels = new Set<string>();

  // ── Step 3: Search ───────────────────────────────────────────
  const { results: searchResults, provider: searchProvider } = await searchWithFallback(
    {
      query: enhanced.enhanced,
      mode: options.mode,
      maxResults: options.maxSources ?? 6,
    },
    apiKeys
  );
  console.log("[orchestrator] Search:", searchResults.length, "results from", searchProvider);

  // ── Step 4: Build Context ────────────────────────────────────
  const context = buildContext(
    searchResults,
    options.files || [],
    options.maxTokens ?? TOKEN_LIMITS.contextWindow,
    enhanced.enhanced
  );

  // ── Step 5: Generate Answer (with fallback) ──────────────────
  const { system, user } = buildPrompt(query, context.text, enhanced.intent);
  let llmResponse: LLMResponse | null = null;

  while (true) {
    try {
      console.log("[orchestrator] Generating with:", activeModel.displayName, `(${activeModel.provider})`);
      
      const messages = [
        { role: "system" as const, content: system },
        { role: "user" as const, content: user },
      ];
      
      llmResponse = await generateAIResponse({
        model: activeModel.id,
        provider: activeModel.provider,
        messages,
        stream: !!onChunk,
        apiKeys,
        onChunk
      });
      break;
    } catch (err) {
      const researchErr = classifyError(err, activeModel.provider);
      failedModels.add(activeModel.id);
      console.warn(`[orchestrator] Model ${activeModel.id} failed:`, userFacingMessage(researchErr));

      if (!researchErr.retryable) throw researchErr;

      const nextModel = getNextFallback(modelChain, failedModels);
      if (!nextModel) throw researchErr;

      console.warn(`[orchestrator] FALLBACK EVENT: Switching from ${activeModel.id} to ${nextModel.id}`);
      activeModel = nextModel;
    }
  }

  // ── Step 6: Normalize Response ───────────────────────────────
  const result = normalizeResponse(llmResponse.content, context.sources, {
    model: activeModel.id,
    provider: activeModel.provider,
    searchProvider,
    intent: enhanced.intent,
    tokensUsed: llmResponse.usage.total_tokens || context.estimatedTokens,
    durationMs: Date.now() - startTime,
    isFallback: activeModel.id !== modelChain.primary.id,
  });

  console.log(
    "[orchestrator] Complete:",
    result.sources.length, "sources |",
    activeModel.provider + "/" + activeModel.id, "|",
    result.metadata.durationMs + "ms"
  );

  return result;
}
