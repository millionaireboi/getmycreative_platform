/**
 * This file contains shared data structures used across both the core systems
 * and the UI components to avoid circular dependencies.
 */

export interface BrandAsset {
  file: File;
  previewUrl: string;
  base64: string;
}

export interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
}

export interface Mark {
  id: string; // e.g., 'logo', 'headline', 'phoneNumber' - AI-generated
  x: number; // normalized 0-1 (center)
  y: number; // normalized 0-1 (center)
  width?: number; // normalized 0-1
  height?: number; // normalized 0-1
  scale?: number; // normalized 0-1, e.g., 0.2 means 20% of canvas width
  label: string; // e.g., 'Logo', 'Headline', 'Phone Number' - AI-generated
  type: 'text' | 'image';
  text?: string; // OCR'd text content for more specific prompts
  isNew?: boolean; // Flag for dynamically added marks
}

export type TypographyRole =
  | 'headline'
  | 'subheading'
  | 'body'
  | 'caption'
  | 'accent'
  | 'decorative';

export interface TemplateTypographyStyle {
  role: TypographyRole;
  description: string;
  primaryColor?: string;
  casing?: 'uppercase' | 'title' | 'sentence' | 'mixed';
}

export interface TemplateStyleSnapshot {
  version: number;
  extractedAt: Date;
  palette: string[];
  accentPalette?: string[];
  typography: TemplateTypographyStyle[];
  motifKeywords: string[];
  textureSummary?: string;
  lightingSummary?: string;
  additionalNotes?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  type: 'text' | 'form' | 'image' | 'error';
  text?: string;
  // For user-uploaded reference images
  referenceImagePreviewUrl?: string;
  // For AI-generated image responses
  generatedImageUrl?: string;
}
