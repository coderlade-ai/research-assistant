import type { ResolvedModel, ModelFallbackChain, TaskType } from "./types";
import { MODEL_REGISTRY, AGENT_MODEL_MAP, getFallbackChain } from "./config";

// ── Task-Type Based Selection ──────────────────────────────────
// Primary model: NVIDIA NIM (high quality)
// Fallback: OpenRouter equivalent

export function selectModel(
  taskType: TaskType,
  query?: string,
  depth?: number
): ModelFallbackChain {
  const map = AGENT_MODEL_MAP[taskType] ?? AGENT_MODEL_MAP["default"];

  const primary =
    [...MODEL_REGISTRY.nvidia, ...MODEL_REGISTRY.openrouter].find(m => m.id === map.primary) ??
    MODEL_REGISTRY.nvidia[0];

  // deeper research gets the same model but may trigger extended context later
  void query;
  void depth;

  const fallback =
    [...MODEL_REGISTRY.nvidia, ...MODEL_REGISTRY.openrouter].find(
      m => m.id === map.fallback || m.id === map.fallback.replace(":free", "") + ":free"
    ) ?? MODEL_REGISTRY.openrouter[0];

  return { primary, fallbacks: [fallback] };
}

// ── Legacy: User-Selected Model (backwards compat) ─────────────

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

export function selectModelByUserId(
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
