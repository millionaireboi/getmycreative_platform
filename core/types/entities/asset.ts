/**
 * Represents a single media or brand element that can be used in creatives.
 */

export enum AssetType {
  LOGO = 'logo',
  IMAGE = 'image',
  FONT = 'font',
  COLOR_PALETTE = 'color_palette',
}

export interface Asset {
  id: string; // Unique identifier for the asset
  userId: string; // The user who owns this asset
  brandKitId?: string; // Optional: links asset to a specific brand kit
  name: string; // User-defined name for the asset (e.g., "Primary Logo")
  type: AssetType; // The category of the asset
  url: string; // URL to the hosted asset file (e.g., on a CDN)
  metadata: {
    // Type-specific metadata
    [key: string]: any; 
    // e.g., for IMAGE: { width: number, height: number, format: string }
    // e.g., for COLOR_PALETTE: { colors: string[] }
  };
  createdAt: Date;
  updatedAt: Date;
}
