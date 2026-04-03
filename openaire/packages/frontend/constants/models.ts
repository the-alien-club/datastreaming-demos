import type { Model } from "@/types/research";

export const AVAILABLE_MODELS: Model[] = [
  { id: "claude-sonnet-4-6", name: "Sonnet 4.6 (Recommended)" },
  { id: "claude-opus-4-6", name: "Opus 4.6" },
  { id: "claude-haiku-4-6", name: "Haiku 4.6 (Fast)" },
];

export const DEFAULT_MODEL = AVAILABLE_MODELS[0].id;
