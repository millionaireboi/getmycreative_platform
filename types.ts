// Use the modern 'firebase/auth' module for the User type
import type { Template as CoreTemplate } from './core/types/index.ts';
import type { Mark } from './core/types/shared.ts';


// This represents the template object as used by the TemplateGrid and EditorView UI components.
export interface UITemplate extends CoreTemplate {
  // UI-specific properties
  isUploading?: boolean;
  uploadProgress?: number;
  palette?: string[];
  isAnalyzing?: boolean;
  // Add properties for upload error handling
  isError?: boolean;
  errorMessage?: string;
  file?: File; // Store the original file for retries
}

// Re-export shared types for easy consumption by UI components
export * from './core/types/shared.ts';