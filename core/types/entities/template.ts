import { Mark, TemplateStyleSnapshot } from '../shared.ts';

export enum TemplateStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
}

/**
 * Represents a base template from which creatives are generated.
 * This is the core data model.
 */
export interface Template {
  id: string;
  title: string;
  imageUrl: string;
  tags: string[];
  prompt: string;
  useCases?: string[];
  category?: string;
  // Fallback for templates without pre-analyzed marks
  placeholders: {
    logo: boolean;
    productImage: boolean;
    headline: boolean;
    body: boolean;
  };
  // Pre-analyzed editable regions
  initialMarks?: Mark[];
  
  // -- Designer Workflow Fields --
  status: TemplateStatus;
  designerId: string | null; // null for initial system templates
  rejectionReason?: string;
  palette?: string[]; // Store the palette with the template
  styleSnapshot?: TemplateStyleSnapshot;
  isAnalyzed?: boolean; // True if the template has been analyzed by AI
  
  // -- Versioning Fields --
  parentId?: string; // Links to the original template if this is a new version
  version: number; // e.g., 1, 2, 3
  isArchived: boolean; // True if a newer version has been published

  // -- Analytics Fields --
  analytics: {
    uses: number; // How many times a project has been created from this template
  };
  
  createdAt: Date;
  updatedAt: Date;
}
