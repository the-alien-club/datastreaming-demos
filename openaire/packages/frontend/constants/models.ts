import type { Model } from "@/types/research";

export const AVAILABLE_MODELS: Model[] = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6 (Recommended)" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Fast)" },
  { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
];

export const DEFAULT_MODEL = AVAILABLE_MODELS[0].id;
