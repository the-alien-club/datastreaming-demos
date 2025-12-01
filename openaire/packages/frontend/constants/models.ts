import type { Model } from "@/types/research";

export const AVAILABLE_MODELS: Model[] = [
  { id: "claude-sonnet-4-5-20250929", name: "Claude 4.5 Sonnet (Recommended)" },
  { id: "claude-haiku-4-5-20251001", name: "Claude 4.5 Haiku (Fast)" },
];

export const DEFAULT_MODEL = AVAILABLE_MODELS[0].id;
