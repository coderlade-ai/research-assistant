import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON, skippedResult } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Coding Agent ───────────────────────────────────────────────
// Role: Generate code, debug, explain — ONLY when intent is "coding"
// Primary: qwen/qwen3-coder-480b-a35b-instruct (nvidia)
// Fallback: qwen/qwen3-coder (openrouter)

const SYSTEM_PROMPT = `You are a Senior Coding Agent producing production-grade code with comprehensive documentation. Your output fills one full page of a 5-6 page report.

OUTPUT REQUIREMENTS:

**code**: Complete, runnable implementation — not snippets. Handle edge cases, include error handling, type annotations, inline comments for complex logic. Follow language idioms. Address security concerns (injection, XSS, auth).
**explanation** (1000+ words with ### headers, **bold terms**, bullets):
### Architecture Overview (250+ words) — Design decisions, component breakdown, data flow, pattern justification.
### Implementation Deep Dive (300+ words) — Step-by-step walkthrough, key algorithms, error handling strategy.
### Integration Guide (200+ words) — Prerequisites, installation, API surface, configuration.
### Testing Strategy (200+ words) — Unit test examples, edge case tests, integration approach.
**pitfalls** (5-8): **[Category: Security/Performance/Compatibility/Maintenance]** — danger and mitigation (2-3 sentences).
**alternatives** (300+ words): Compare 3+ approaches with pros/cons and clear recommendation.

Return ONLY valid JSON (no markdown fences):
{
  "language": "primary language",
  "code": "Complete implementation with comments and error handling (use \\\\n for newlines)",
  "explanation": "1000+ word guide with ### headers and **bold terms**",
  "usage_example": "Complete integration and test example",
  "pitfalls": ["**[Category] — [Title]**: Danger and mitigation", "...5-8 total"],
  "alternatives": "300+ word comparison of 3+ approaches with recommendation"
}`;

export async function runCodingAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  if (context.intent !== "coding") {
    return skippedResult("coding-agent");
  }

  const start = Date.now();
  const chain = selectModel("coding", context.query);

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Coding Request: ${context.query}
Enhanced: ${context.enhanced_query}

${context.file_context.length > 0
  ? `Code Context:\n${context.file_context.slice(0, 10).map(f => `File: ${f.fileName}\n${f.content.slice(0, 15000)}`).join("\n\n")}`
  : "No existing code context."
}

Produce production-ready code with comprehensive docs (1200+ words total). Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "coding-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens * 2, // coding gets double tokens
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "coding-agent",
      output: parsed ?? {
        language: "unknown",
        code: result.content,
        explanation: "",
        usage_example: "",
        pitfalls: [],
        alternatives: "",
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "coding-agent",
      output: { language: "", code: "", explanation: "", pitfalls: [], alternatives: "" },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Coding agent failed",
    };
  }
}
