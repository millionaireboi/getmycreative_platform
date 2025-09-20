/**
 * Represents a financial invoice for a subscription or one-time purchase.
 */

export enum InvoiceStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  PAID = 'paid',
  VOID = 'void',
  UNCOLLECTIBLE = 'uncollectible',
}

export interface InvoiceLineItem {
  description: string;
  amount: number; // Price in smallest currency unit (e.g., cents)
  quantity: number;
}

export interface Invoice {
  id: string;
  userId: string;
  orderId: string;
  status: InvoiceStatus;
  totalAmount: number; // Total price in smallest currency unit
  dueDate: Date;
  paidAt?: Date;
  lineItems: InvoiceLineItem[];
  downloadUrl: string; // URL to the PDF invoice
  createdAt: Date;
}
