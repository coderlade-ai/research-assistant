import type { ResolvedModel, ModelFallbackChain } from "./types";
import { MODEL_REGISTRY, getFallbackChain } from "./config";

// ── Auto-Selection Logic ───────────────────────────────────────
// Smart routing based on query content

export function autoSelectModel(query: string): ResolvedModel {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes("code") || lowerQuery.includes("debug")) {
    return MODEL_REGISTRY.nvidia.find(m => m.type === "coding") || MODEL_REGISTRY.nvidia[0];
  }
  
  if (lowerQuery.includes("deep research")) {
    return MODEL_REGISTRY.nvidia.find(m => m.type === "reasoning") || MODEL_REGISTRY.nvidia[0];
  }
  
  if (lowerQuery.includes("summary")) {
    return MODEL_REGISTRY.nvidia.find(m => m.type === "fast") || MODEL_REGISTRY.nvidia[0];
  }
  
  return MODEL_REGISTRY.nvidia.find(m => m.type === "balanced") || MODEL_REGISTRY.nvidia[0];
}

// ── Public API ─────────────────────────────────────────────────

export function selectModel(
  userModelId: string | undefined,
  query: string
): ModelFallbackChain {
  let primary: ResolvedModel | undefined;

  if (userModelId) {
    primary = [...MODEL_REGISTRY.nvidia, ...MODEL_REGISTRY.openrouter].find(m => m.id === userModelId);
  }

  if (!primary) {
    primary = autoSelectModel(query);
  }

  const fallbacks = getFallbackChain(primary);

  return { primary, fallbacks };
}

export function getNextFallback(
  chain: ModelFallbackChain,
  failedModelIds: Set<string>
): ResolvedModel | null {
  for (const model of chain.fallbacks) {
    if (!failedModelIds.has(model.id)) return model;
  }
  return null;
}
