/**
 * Represents the credit system for users (e.g., for pay-per-generation).
 */

export enum CreditTransactionType {
  PURCHASE = 'purchase',
  USAGE = 'usage',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
}

export interface CreditTransaction {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amount: number; // Positive for additions, negative for deductions
  description: string; // e.g., "Generation of 5 variants", "Purchase of 100 credits"
  relatedOrderId?: string; // Link to an order if it was a purchase
  createdAt: Date;
}

export interface CreditBalance {
  userId: string;
  balance: number;
  updatedAt: Date;
}
