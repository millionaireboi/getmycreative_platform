const USD_PER_GB_STORAGE = 0.026; // GCS Standard US multi-region per GB-month

const MODEL_PRICING: Record<string, {
  promptPer1KTokens?: number;
  outputPer1KTokens?: number;
  imagePerCall?: number;
  videoPerSecond?: number;
  flatPerCall?: number;
}> = {
  'gemini-2.5-flash': {
    promptPer1KTokens: 0.0003,
    outputPer1KTokens: 0.0025,
  },
  'gemini-2.5-flash-image-preview': {
    imagePerCall: 0.039,
  },
  'imagen-4.0-generate-001': {
    imagePerCall: 0.04,
  },
  'imagen-3.0-capability-001': {
    imagePerCall: 0.04,
  },
  'veo-2.0-generate-001': {
    videoPerSecond: 0.45,
  },
  'firebase-storage': {
    flatPerCall: 0,
  },
};

const DEFAULT_PROMPT_COST_PER_1K = 0.0003;
const DEFAULT_OUTPUT_COST_PER_1K = 0.0025;

interface CostInput {
  actionType: string;
  modelUsed?: string | null;
  inputTokenCount?: number | null;
  outputTokenCount?: number | null;
  imageCount?: number | null;
  latencyMs?: number | null;
  gcsBytesStored?: number | null;
  videoSeconds?: number | null;
}

export const estimateUsageCostUsd = (input: CostInput): number => {
  const model = input.modelUsed ?? undefined;
  const pricing = model ? MODEL_PRICING[model] : undefined;
  let cost = 0;

  const promptPrice = pricing?.promptPer1KTokens ?? DEFAULT_PROMPT_COST_PER_1K;
  const outputPrice = pricing?.outputPer1KTokens ?? DEFAULT_OUTPUT_COST_PER_1K;

  if (input.inputTokenCount && input.inputTokenCount > 0) {
    cost += (input.inputTokenCount / 1000) * promptPrice;
  }

  if (input.outputTokenCount && input.outputTokenCount > 0) {
    cost += (input.outputTokenCount / 1000) * outputPrice;
  }

  if (pricing?.imagePerCall && (input.imageCount ?? 0) > 0) {
    cost += (input.imageCount ?? 0) * pricing.imagePerCall;
  }

  if (pricing?.flatPerCall) {
    cost += pricing.flatPerCall;
  }

  if (pricing?.videoPerSecond && input.videoSeconds && input.videoSeconds > 0) {
    cost += input.videoSeconds * pricing.videoPerSecond;
  }

  if (!pricing && (input.imageCount ?? 0) > 0) {
    cost += (input.imageCount ?? 0) * 0.039;
  }

  if (input.gcsBytesStored && input.gcsBytesStored > 0) {
    const costPerByte = USD_PER_GB_STORAGE / (1024 ** 3);
    cost += input.gcsBytesStored * costPerByte;
  }

  return Number(cost.toFixed(4));
};

export const describePricingForModel = (model: string) => MODEL_PRICING[model];
