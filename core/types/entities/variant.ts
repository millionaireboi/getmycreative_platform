/**
 * Represents a single generated creative variation within a project.
 */
export interface Variant {
  id: string; // Unique identifier for the variant
  projectId: string; // The project this variant belongs to
  imageUrl: string; // URL to the generated image
  generatedFromPrompt: string; // The prompt that generated this specific variant
  createdAt: Date;
}
