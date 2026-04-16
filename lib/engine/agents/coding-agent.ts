import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON, skippedResult } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Coding Agent ───────────────────────────────────────────────
// Role: Generate code, debug, explain — ONLY when intent is "coding"
// Primary: qwen/qwen3-coder-480b-a35b-instruct (nvidia)
// Fallback: qwen/qwen3-coder (openrouter)

const SYSTEM_PROMPT = `You are an expert Coding Agent. Your role is to:
1. Generate clean, production-ready code for the user's request
2. Include comments and explanations inline
3. Highlight common pitfalls and best practices
4. Provide usage examples

Respond with ONLY valid JSON (no markdown fences):
{
  "language": "the primary programming language",
  "code": "the full code implementation (use \\n for newlines)",
  "explanation": "step-by-step explanation of the code",
  "usage_example": "how to use or run the code",
  "pitfalls": ["pitfall 1", "pitfall 2"],
  "alternatives": "brief note on alternative approaches (empty string if N/A)"
}`;

export async function runCodingAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  // Only run for coding intent
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
  ? `Existing Code Context:\n${context.file_context.map(f => `File: ${f.fileName}\n${f.content.slice(0, 800)}`).join("\n\n")}`
  : "No existing code context."
}

Generate the best implementation. Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "coding-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens * 2, // coding gets more tokens
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
