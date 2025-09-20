import { GeneratedImage, Mark } from '../shared.ts';

/**
 * Represents a user's project, which starts with a template and contains multiple generated variants.
 */
export interface Project {
  id: string; // Unique identifier for the project
  userId: string; // The user who owns this project
  name: string; // User-defined name for the project (e.g., "Q3 Campaign")
  templateId: string; // The base template used for this project
  templateImageUrl: string; // For dashboard preview and editor
  basePrompt: string; // The original prompt from the template
  initialMarks: Mark[]; // Pre-analyzed editable regions
  history: GeneratedImage[]; // All generated images for this project, including the original template
  createdAt: Date;
  updatedAt: Date;
}