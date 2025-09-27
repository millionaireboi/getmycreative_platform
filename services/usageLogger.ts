import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config.ts';
import { getCachedUser } from '../core/systems/identityCache.ts';
import { estimateUsageCostUsd } from './costEstimator.ts';

export type UsageEventStatus = 'success' | 'error' | 'retry';

export interface UsageEventInput {
  actionType: string;
  modelUsed?: string;
  status?: UsageEventStatus;
  imageCount?: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
  totalTokenCount?: number;
  gcsBytesStored?: number;
  latencyMs?: number;
  errorCode?: string;
  userId?: string | null;
  subscriptionTier?: string | null;
  extra?: Record<string, unknown>;
  videoSeconds?: number;
}

const usageEventsCollection = collection(db, 'usageEvents');

export const recordUsageEvent = async (input: UsageEventInput): Promise<void> => {
  try {
    const cachedUser = getCachedUser();
    const firebaseUser = auth.currentUser;

    const payload = {
      actionType: input.actionType,
      modelUsed: input.modelUsed ?? null,
      status: input.status ?? 'success',
      imageCount: input.imageCount ?? null,
      inputTokenCount: input.inputTokenCount ?? null,
      outputTokenCount: input.outputTokenCount ?? null,
      totalTokenCount: input.totalTokenCount ?? null,
      gcsBytesStored: input.gcsBytesStored ?? null,
      latencyMs: input.latencyMs ?? null,
      errorCode: input.errorCode ?? null,
      userId: input.userId ?? cachedUser?.id ?? firebaseUser?.uid ?? null,
      subscriptionTier: input.subscriptionTier ?? cachedUser?.tier ?? null,
      extra: input.extra ?? null,
      timestamp: serverTimestamp(),
      estimatedCostUsd: estimateUsageCostUsd({
        actionType: input.actionType,
        modelUsed: input.modelUsed,
        inputTokenCount: input.inputTokenCount,
        outputTokenCount: input.outputTokenCount,
        imageCount: input.imageCount,
        gcsBytesStored: input.gcsBytesStored,
        videoSeconds: input.videoSeconds,
      }),
    };

    await addDoc(usageEventsCollection, payload);
  } catch (error) {
    console.warn('Usage logging failed', error);
  }
};
