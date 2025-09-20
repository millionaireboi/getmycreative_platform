import { Asset } from './asset.ts';

/**
 * Represents a collection of brand assets for a user or team.
 */
export interface BrandKit {
  id: string; // Unique identifier for the brand kit
  userId: string; // The user who owns this brand kit
  name: string; // Name of the brand kit (e.g., "Primary Brand")
  assets: Asset[]; // A collection of assets belonging to this kit
  createdAt: Date;
  updatedAt: Date;
}
