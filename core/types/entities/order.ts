/**
 * Represents a customer's order for a product (e.g., subscription, credit pack).
 */

export enum OrderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export interface OrderItem {
  productId: string; // e.g., 'sub_basic_monthly', 'credits_100'
  description: string;
  amount: number; // Price in smallest currency unit (e.g., cents)
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number; // Total price in smallest currency unit
  currency: string; // e.g., 'USD'
  createdAt: Date;
  updatedAt: Date;
}
