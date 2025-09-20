import { SubscriptionTier } from './subscription.ts';

/**
 * Represents a user of the application.
 */

export enum UserRole {
  ADMIN = 'admin',
  DESIGNER = 'designer',
  CUSTOMER = 'customer',
}

export interface User {
  id: string; // Unique identifier (e.g., from Firebase Auth)
  email: string;
  role: UserRole;
  tier: SubscriptionTier;
  displayName?: string;
  photoURL?: string; // URL for the user's profile picture
  brandColors?: string[]; // Array of hex color codes
  subscriptionId?: string; // Link to their subscription
  creditBalance?: number; // For pay-as-you-go users
  createdAt: Date;
}
