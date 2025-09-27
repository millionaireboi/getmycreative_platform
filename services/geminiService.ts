


import { GoogleGenAI, Modality, Type } from "@google/genai";
import { BrandAsset, Mark, MarkCategory, TemplateStyleSnapshot, TemplateTypographyStyle, TypographyRole } from '../core/types/shared.ts';
import { ALL_TAGS } from "../constants.ts";
import { recordUsageEvent, type UsageEventStatus } from './usageLogger.ts';

type PlacementGeometry = {
  widthNorm: number;
  heightNorm: number;
  leftNorm: number;
  rightNorm: number;
  topNorm: number;
  bottomNorm: number;
  centerXNorm: number;
  centerYNorm: number;
  widthPx: number;
  heightPx: number;
  leftPx: number;
  rightPx: number;
  topPx: number;
  bottomPx: number;
  centerXpx: number;
  centerYpx: number;
};

// Prefer Vite-style env var; fall back to legacy define for compatibility.
const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

const GENERATIVE_FILL_FLAG = (import.meta as any).env?.VITE_ENABLE_VERTEX_GENERATIVE_FILL
  ?? process.env.VITE_ENABLE_VERTEX_GENERATIVE_FILL
  ?? process.env.ENABLE_VERTEX_GENERATIVE_FILL;

const GENERATIVE_FILL_SUPPORTED = String(GENERATIVE_FILL_FLAG).toLowerCase() === 'true';
const GENERATIVE_FILL_ENDPOINT = (import.meta as any).env?.VITE_GENERATIVE_FILL_ENDPOINT
  ?? process.env.VITE_GENERATIVE_FILL_ENDPOINT
  ?? '/api/generative-fill';

const ALLOWED_TYPOGRAPHY_ROLES: TypographyRole[] = ['headline', 'subheading', 'body', 'caption', 'accent', 'decorative'];
const ALLOWED_MARK_CATEGORIES: MarkCategory[] = ['content', 'decorative', 'silhouette', 'background'];

const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

const countInlineImages = (result: { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> }): number => {
  if (!result?.candidates) return 0;
  return result.candidates.reduce((candidateTotal, candidate) => {
    const parts = candidate?.content?.parts ?? [];
    const inlineCount = parts.reduce((partTotal, part) => {
      return part?.inlineData?.data ? partTotal + 1 : partTotal;
    }, 0);
    return candidateTotal + inlineCount;
  }, 0);
};

const logGeminiUsage = (
  params: {
    actionType: string;
    modelUsed: string;
    result?: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } };
    imageCount?: number;
    status?: UsageEventStatus;
    latencyMs: number;
    error?: unknown;
    extra?: Record<string, unknown>;
  }
): void => {
  const { result, actionType, modelUsed, imageCount, status = 'success', latencyMs, error, extra } = params;
  const usageMetadata = result?.usageMetadata;
  const errorCode = status === 'error'
    ? (error instanceof Error ? error.message : String(error ?? 'unknown'))
    : undefined;

  void recordUsageEvent({
    actionType,
    modelUsed,
    status,
    imageCount: typeof imageCount === 'number' ? imageCount : null,
    inputTokenCount: usageMetadata?.promptTokenCount ?? null,
    outputTokenCount: usageMetadata?.candidatesTokenCount ?? null,
    totalTokenCount: usageMetadata?.totalTokenCount ?? null,
    latencyMs,
    errorCode,
    extra,
  });
};

const normalizeHex = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(prefixed) ? prefixed.toUpperCase() : null;
};

const sanitizePalette = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  input.forEach(value => {
    if (typeof value !== 'string') return;
    const normalized = normalizeHex(value);
    if (!normalized) return;
    if (!seen.has(normalized)) {
      seen.add(normalized);
    }
  });
  return Array.from(seen).slice(0, 8);
};

const sanitizeTypography = (input: unknown): TemplateTypographyStyle[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const role = (entry as { role?: unknown }).role;
      const description = (entry as { description?: unknown }).description;
      if (typeof role !== 'string' || typeof description !== 'string') return null;
      const normalizedRole = role.toLowerCase() as TypographyRole;
      if (!ALLOWED_TYPOGRAPHY_ROLES.includes(normalizedRole)) return null;
      const clean: TemplateTypographyStyle = {
        role: normalizedRole,
        description: description.trim(),
      };
      const casing = (entry as { casing?: unknown }).casing;
      if (typeof casing === 'string' && ['uppercase', 'title', 'sentence', 'mixed'].includes(casing)) {
        clean.casing = casing as TemplateTypographyStyle['casing'];
      }
      const primaryColor = (entry as { primaryColor?: unknown }).primaryColor;
      if (typeof primaryColor === 'string') {
        const normalized = normalizeHex(primaryColor);
        if (normalized) {
          clean.primaryColor = normalized;
        }
      }
      return clean;
    })
    .filter((item): item is TemplateTypographyStyle => !!item && item.description.length > 0)
    .slice(0, 6);
};

const sanitizeMotifs = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => entry.trim())
    .slice(0, 12);
};

const inferTypographyRoleFromLabel = (label: unknown): TypographyRole | undefined => {
  if (typeof label !== 'string' || !label) {
    return undefined;
  }
  const normalized = label.toLowerCase();
  if (normalized.includes('headline') || normalized.includes('title') || normalized.includes('main heading')) {
    return 'headline';
  }
  if (normalized.includes('subhead') || normalized.includes('sub-head') || normalized.includes('subtitle') || normalized.includes('subheading')) {
    return 'subheading';
  }
  if (normalized.includes('body') || normalized.includes('paragraph') || normalized.includes('copy') || normalized.includes('description') || normalized.includes('details')) {
    return 'body';
  }
  if (normalized.includes('caption') || normalized.includes('footnote') || normalized.includes('legal') || normalized.includes('disclaimer') || normalized.includes('small print')) {
    return 'caption';
  }
  if (normalized.includes('tagline') || normalized.includes('cta') || normalized.includes('call to action') || normalized.includes('button') || normalized.includes('price')) {
    return 'accent';
  }
  if (normalized.includes('decorative') || normalized.includes('ornament') || normalized.includes('flourish')) {
    return 'decorative';
  }
  return undefined;
};

const classifyCategoryFromString = (raw: string): MarkCategory | undefined => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (ALLOWED_MARK_CATEGORIES.includes(normalized as MarkCategory)) {
    return normalized as MarkCategory;
  }
  if (
    normalized.includes('silhou') ||
    normalized.includes('cutout') ||
    normalized.includes('cut-out') ||
    normalized.includes('stencil') ||
    normalized.includes('outline')
  ) {
    return 'silhouette';
  }
  if (
    normalized.includes('background') ||
    normalized.includes('backdrop') ||
    normalized.includes('wallpaper') ||
    normalized.includes('canvas fill') ||
    normalized.includes('texture layer')
  ) {
    return 'background';
  }
  if (
    normalized.includes('decor') ||
    normalized.includes('ornament') ||
    normalized.includes('flourish') ||
    normalized.includes('motif') ||
    normalized.includes('pattern') ||
    normalized.includes('accent') ||
    normalized.includes('frame') ||
    normalized.includes('border') ||
    normalized.includes('icon') ||
    normalized.includes('sticker') ||
    normalized.includes('shape')
  ) {
    return 'decorative';
  }
  if (
    normalized.includes('product') ||
    normalized.includes('primary') ||
    normalized.includes('hero') ||
    normalized.includes('content') ||
    normalized.includes('focus') ||
    normalized.includes('photo') ||
    normalized.includes('image')
  ) {
    return 'content';
  }
  return undefined;
};

const sanitizeMarkCategory = (candidate: unknown, label: unknown, type: unknown): MarkCategory => {
  if (typeof candidate === 'string') {
    const normalized = classifyCategoryFromString(candidate);
    if (normalized) {
      return type === 'text' && normalized !== 'content' ? 'content' : normalized;
    }
  }

  if (typeof label === 'string') {
    const inferredFromLabel = classifyCategoryFromString(label);
    if (inferredFromLabel) {
      if (type === 'text') {
        return 'content';
      }
      return inferredFromLabel;
    }
  }

  if (typeof candidate === 'string') {
    const looseNormalized = candidate.trim().toLowerCase();
    if (looseNormalized === 'bg') {
      return 'background';
    }
  }

  if (type === 'text') {
    return 'content';
  }

  return 'content';
};

const pngHasAlphaChannel = (base64: string): boolean => {
  try {
    const binaryString = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
    if (binaryString.length < 26) {
      return true; // Too small to validate, assume ok to avoid false negatives.
    }
    const colorType = binaryString.charCodeAt(25);
    if (colorType === 4 || colorType === 6) {
      return true;
    }
    // Look for tRNS chunk which also implies transparency.
    if (binaryString.indexOf('tRNS') !== -1) {
      return true;
    }
    return false;
  } catch (error) {
    console.warn('Could not verify PNG alpha channel:', error);
    return true; // Fail open if environment does not support validation.
  }
};

let ai: GoogleGenAI | null = null;

if (API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (error) {
    console.error("Failed to initialize GoogleGenAI. Check if API key is valid.", error);
  }
} else {
  console.warn("GEMINI_API_KEY environment variable not set. App is in demo mode. AI features will be disabled.");
}

const getAi = (): GoogleGenAI => {
    if (!ai) {
        throw new Error("Gemini API is not configured. An API_KEY must be provided for AI features to work.");
    }
    return ai;
}

export const getGeminiClient = (): GoogleGenAI => getAi();

export const isGenerativeFillConfigured = (): boolean => GENERATIVE_FILL_SUPPORTED;

export interface EditToggles {
  [markId: string]: boolean;
}

export interface ChatEditOptions {
    brandColors?: string[];
    mentions?: string[];
}

export interface HotspotAssetRequest {
  styleSnapshot: TemplateStyleSnapshot;
  intent: 'text' | 'image';
  hotspotLabel: string;
  textContent?: string;
  description?: string;
  brandColors?: string[];
  placementSummary?: string;
  aspectRatioHint?: string;
  sizeHint?: { widthPx?: number; heightPx?: number; aspectRatio?: string };
  typographyStyle?: TemplateTypographyStyle;
  typographyRoleHint?: TypographyRole;
  hotspotCrop?: { base64: string; mimeType: string };
  templateThumbnail?: { base64: string; mimeType: string };
  lineBreakPreference?: 'auto' | 'single-line' | 'multi-line';
}

export interface HotspotAssetResult {
  base64: string;
  mimeType: string;
  hasAlpha: boolean;
}

export interface GenerativeFillRequest {
  baseImageBase64: string;
  baseImageMimeType: string;
  maskBase64: string;
  prompt: string;
  brandColors?: string[];
}

export interface GenerativeFillResult {
  base64: string;
  mimeType: string;
}


export const generateCreative = async (
  originalTemplateBase64: string,
  originalTemplateMimeType: string,
  basePrompt: string,
  textFields: Record<string, string>,
  imageAssets: Record<string, BrandAsset | null>,
  imagePrompts: Record<string, string>,
  imageModes: Record<string, 'upload' | 'describe'>,
  enabledMarks: Record<string, boolean>,
  marks: Mark[],
  initialMarks: Mark[],
  options: {
    canvasDimensions?: { width: number; height: number };
    overlayTextMarkIds?: string[];
  } = {}
): Promise<string> => {
  const ai = getAi();
  const promptParts: any[] = [];
  const requestStartedAt = now();
  let apiLatencyMs = 0;
  let apiResult: any;
  let inlineImageCount = 0;

  const escapeSingleQuotes = (value: string) => value.replace(/'/g, "\\'");
  const newTextHotspots: string[] = [];
  const newImageHotspots: string[] = [];
  const overlayNewTextHotspots: string[] = [];

  const canvasDimensions = options.canvasDimensions;
  const overlayTextMarkIdSet = new Set(options.overlayTextMarkIds ?? []);

  const canvasWidth = canvasDimensions?.width ?? 0;
  const canvasHeight = canvasDimensions?.height ?? 0;
  const hasCanvasDimensions = canvasWidth > 0 && canvasHeight > 0;
  const alignmentTolerancePx = hasCanvasDimensions ? Math.max(Math.round(Math.max(canvasWidth, canvasHeight) * 0.01), 8) : 0;

  const clampNormalized = (value: number) => Math.min(1, Math.max(0, value));
  const readableLabel = (mark: Mark) => {
    const label = mark.label?.trim();
    return label && label.length > 0 ? label : mark.id;
  };

  const computeGeometry = (mark: Mark): PlacementGeometry | null => {
    if (!hasCanvasDimensions) {
      return null;
    }

    const rawWidth = mark.width ?? mark.scale ?? 0;
    const rawHeight = mark.height ?? mark.scale ?? 0;
    const widthNorm = clampNormalized(rawWidth);
    const heightNorm = clampNormalized(rawHeight);

    if (widthNorm <= 0 || heightNorm <= 0) {
      return null;
    }

    const centerXNorm = clampNormalized(mark.x);
    const centerYNorm = clampNormalized(mark.y);
    const halfWidth = widthNorm / 2;
    const halfHeight = heightNorm / 2;
    const leftNorm = clampNormalized(centerXNorm - halfWidth);
    const rightNorm = clampNormalized(centerXNorm + halfWidth);
    const topNorm = clampNormalized(centerYNorm - halfHeight);
    const bottomNorm = clampNormalized(centerYNorm + halfHeight);

    const widthPx = Math.max(1, Math.round(widthNorm * canvasWidth));
    const heightPx = Math.max(1, Math.round(heightNorm * canvasHeight));
    const leftPx = Math.round(leftNorm * canvasWidth);
    const rightPx = Math.round(rightNorm * canvasWidth);
    const topPx = Math.round(topNorm * canvasHeight);
    const bottomPx = Math.round(bottomNorm * canvasHeight);
    const centerXpx = Math.round(centerXNorm * canvasWidth);
    const centerYpx = Math.round(centerYNorm * canvasHeight);

    return {
      widthNorm,
      heightNorm,
      leftNorm,
      rightNorm,
      topNorm,
      bottomNorm,
      centerXNorm,
      centerYNorm,
      widthPx,
      heightPx,
      leftPx,
      rightPx,
      topPx,
      bottomPx,
      centerXpx,
      centerYpx,
    };
  };

  const geometryMap = new Map<string, PlacementGeometry>();
  marks.forEach(mark => {
    const geometry = computeGeometry(mark);
    if (geometry) {
      geometryMap.set(mark.id, geometry);
    }
  });

  const contextMarksForHints = initialMarks.length > 0 ? initialMarks : marks;

  const getGeometryFor = (mark: Mark): PlacementGeometry | null => {
    const cached = geometryMap.get(mark.id);
    if (cached) {
      return cached;
    }

    const computed = computeGeometry(mark);
    if (computed) {
      geometryMap.set(mark.id, computed);
      return computed;
    }

    return null;
  };

  const buildPaddingText = (geometry: PlacementGeometry): string => {
    const topPadding = Math.max(0, Math.round(geometry.topPx));
    const bottomPadding = Math.max(0, Math.round(canvasHeight - geometry.bottomPx));
    const leftPadding = Math.max(0, Math.round(geometry.leftPx));
    const rightPadding = Math.max(0, Math.round(canvasWidth - geometry.rightPx));

    const verticalParts: string[] = [];
    if (topPadding > 0) verticalParts.push(`${topPadding}px above`);
    if (bottomPadding > 0) verticalParts.push(`${bottomPadding}px below`);

    const horizontalParts: string[] = [];
    if (leftPadding > 0) horizontalParts.push(`${leftPadding}px on the left`);
    if (rightPadding > 0) horizontalParts.push(`${rightPadding}px on the right`);

    if (verticalParts.length === 0 && horizontalParts.length === 0) {
      return '';
    }

    const segments: string[] = [];
    if (verticalParts.length > 0) segments.push(verticalParts.join(' and '));
    if (horizontalParts.length > 0) segments.push(horizontalParts.join(' and '));

    return `This leaves about ${segments.join(', ')} of breathing room relative to the canvas edges.`;
  };

  const buildContextHints = (mark: Mark, geometry: PlacementGeometry): string => {
    if (!hasCanvasDimensions) {
      return '';
    }

    const candidates = contextMarksForHints
      .filter(ctxMark => ctxMark.id !== mark.id)
      .map(ctxMark => {
        const ctxGeometry = getGeometryFor(ctxMark);
        return ctxGeometry ? { mark: ctxMark, geometry: ctxGeometry } : null;
      })
      .filter((entry): entry is { mark: Mark; geometry: PlacementGeometry } => entry !== null);

    if (candidates.length === 0) {
      return '';
    }

    const hints: string[] = [];

    const aboveCandidate = candidates
      .filter(entry => entry.geometry.centerYpx < geometry.centerYpx)
      .sort((a, b) => b.geometry.centerYpx - a.geometry.centerYpx)[0];
    if (aboveCandidate) {
      hints.push(`It should sit below the ${readableLabel(aboveCandidate.mark)} region.`);
    }

    const belowCandidate = candidates
      .filter(entry => entry.geometry.centerYpx > geometry.centerYpx)
      .sort((a, b) => a.geometry.centerYpx - b.geometry.centerYpx)[0];
    if (belowCandidate) {
      hints.push(`Keep it above the ${readableLabel(belowCandidate.mark)} region.`);
    }

    const leftCandidate = candidates
      .filter(entry => entry.geometry.centerXpx < geometry.centerXpx)
      .sort((a, b) => b.geometry.centerXpx - a.geometry.centerXpx)[0];
    if (leftCandidate) {
      const delta = Math.round(geometry.leftPx - leftCandidate.geometry.leftPx);
      const label = readableLabel(leftCandidate.mark);
      if (Math.abs(delta) <= alignmentTolerancePx) {
        hints.push(`Align its left edge with the ${label} region.`);
      } else if (delta > 0) {
        hints.push(`Keep its left edge about ${delta}px to the right of the ${label} region's left edge.`);
      } else {
        hints.push(`Let it extend about ${Math.abs(delta)}px to the left of the ${label} region's left edge.`);
      }
    }

    const rightCandidate = candidates
      .filter(entry => entry.geometry.centerXpx > geometry.centerXpx)
      .sort((a, b) => a.geometry.centerXpx - b.geometry.centerXpx)[0];
    if (rightCandidate) {
      const delta = Math.round(rightCandidate.geometry.rightPx - geometry.rightPx);
      const label = readableLabel(rightCandidate.mark);
      if (Math.abs(delta) <= alignmentTolerancePx) {
        hints.push(`Align its right edge with the ${label} region.`);
      } else if (delta > 0) {
        hints.push(`Keep its right edge about ${delta}px to the left of the ${label} region's right edge.`);
      } else {
        hints.push(`Let its right edge extend about ${Math.abs(delta)}px beyond the ${label} region's right edge while staying inside the hotspot area.`);
      }
    }

    const centerAlignedCandidate = candidates.find(entry => Math.abs(entry.geometry.centerXpx - geometry.centerXpx) <= alignmentTolerancePx);
    if (centerAlignedCandidate) {
      const label = readableLabel(centerAlignedCandidate.mark);
      const centerHint = `Center it horizontally with the ${label} region.`;
      if (!hints.includes(centerHint)) {
        hints.push(centerHint);
      }
    }

    return hints.slice(0, 4).join(' ');
  };

  const fallbackPlacementText = 'Keep the element inside the original canvas bounds and size proportionally to match surrounding design. Treat the requested location as an invisible hotspot used only for planning—its edges must never show in the final art, even if multiple hotspots are addressed at once. Absolutely no outlines, strokes, halos, drop shadows, or borders may appear in the final output.';

  const describePlacementArea = (mark: Mark) => {
    if (!hasCanvasDimensions) {
      return fallbackPlacementText;
    }

    const geometry = getGeometryFor(mark);
    if (!geometry) {
      const centerX = clampNormalized(mark.x).toFixed(2);
      const centerY = clampNormalized(mark.y).toFixed(2);
      return `${fallbackPlacementText} The hotspot is centered roughly at normalized coordinates (${centerX}, ${centerY}).`;
    }

    const widthPercent = Math.round(geometry.widthNorm * 100);
    const heightPercent = Math.round(geometry.heightNorm * 100);
    const baseText = `Keep the element inside the ${geometry.widthPx}px × ${geometry.heightPx}px placement zone centered at (${geometry.centerXpx}px, ${geometry.centerYpx}px) on the ${canvasWidth}×${canvasHeight}px canvas (normalized center ≈ (${geometry.centerXNorm.toFixed(3)}, ${geometry.centerYNorm.toFixed(3)})).`;
    const extentText = `This invisible area spans roughly from (${geometry.leftPx}px, ${geometry.topPx}px) to (${geometry.rightPx}px, ${geometry.bottomPx}px), covering about ${widthPercent}% of the canvas width and ${heightPercent}% of its height. Normalized bounds ≈ (${geometry.leftNorm.toFixed(3)}, ${geometry.topNorm.toFixed(3)}) to (${geometry.rightNorm.toFixed(3)}, ${geometry.bottomNorm.toFixed(3)}).`;
    const paddingText = buildPaddingText(geometry);
    const contextHints = buildContextHints(mark, geometry);

    return `${baseText} ${extentText}${paddingText ? ` ${paddingText}` : ''}${contextHints ? ` ${contextHints}` : ''} Treat this area as a purely imaginary placement zone—keep every pixel inside it, but leave no visible trace that the guide ever existed, even when several hotspots are filled at once.`;
  };

  const noBorderClause = 'Never introduce or retain any outline, stroke, drop shadow, glow, halo, or border around the element or its bounding box. The hotspot rectangle is only a planning guide—do not render, trace, or hint at it. If any border or placeholder appears during drafting, remove it completely so the element melts seamlessly into the surrounding background, even when multiple hotspots are being filled at once.';

  promptParts.push({
    inlineData: {
      data: originalTemplateBase64,
      mimeType: originalTemplateMimeType,
    },
  });

  // Add all enabled user-provided images (product image, logo, etc.)
  for (const markId in imageAssets) {
    const asset = imageAssets[markId];
    const mode = imageModes[markId] || 'upload';
    if (asset && enabledMarks[markId] && mode === 'upload') {
      const markLabel = marks.find(m => m.id === markId)?.label || markId;
       promptParts.push({ text: `This is the user's new '${markLabel}' image.` });
       promptParts.push({
        inlineData: {
          data: asset.base64,
          mimeType: asset.file.type,
        },
      });
    }
  }

  const editInstructions: string[] = [];
  const initialMarkIds = new Set(initialMarks.map(m => m.id));

  marks.forEach(mark => {
    if (!enabledMarks[mark.id]) return;

    const isExistingMark = initialMarkIds.has(mark.id);

    if (mark.type === 'text') {
      const proposedText = typeof textFields[mark.id] === 'string' ? textFields[mark.id].trim() : '';
      const useOverlay = overlayTextMarkIdSet.has(mark.id);

      if (useOverlay) {
        if (mark.isNew) {
          overlayNewTextHotspots.push(readableLabel(mark));
        }

        if (isExistingMark) {
          const originalText = initialMarks.find(m => m.id === mark.id)?.text?.trim();
          const placementSummary = describePlacementArea(mark);
          const removalLabel = readableLabel(mark);
          const removalInstruction = originalText && originalText.length > 0
            ? `- Remove the existing ${removalLabel} copy "${originalText}" entirely. After erasing, repaint the exposed background using colours, gradients, and lighting sampled from the surrounding design so the zone looks untouched. Leave the hotspot completely blank for a separate overlay. ${placementSummary} ${noBorderClause} Absolutely no new lettering, glyphs, placeholders, or guide marks may remain after this cleanup.`
            : `- Clear the ${removalLabel} hotspot of any lettering. Rebuild the underlying background so it blends seamlessly with the adjacent artwork, then leave the area blank for a later overlay. ${placementSummary} ${noBorderClause} Do not introduce fresh text, tracings, or placeholder hints at this stage.`;
          editInstructions.push(removalInstruction);
        }

        // Skip default text replacement logic when operating in overlay mode.
        return;
      }

      if (proposedText) {
        if (isExistingMark) {
          const originalText = initialMarks.find(m => m.id === mark.id)?.text;
          if (originalText && originalText.trim() !== '') {
            editInstructions.push(`- Find the text "${originalText}" and replace it with: "${proposedText}". The new text must perfectly replicate the font family, weight, size, color, style, and any effects (like shadows or outlines) of the original text.`);
          } else {
            editInstructions.push(`- Replace the text labeled '${mark.label}' with: "${proposedText}". The new text must perfectly replicate the font family, weight, size, color, style, and any effects (like shadows or outlines) of the original text.`);
          }
        } else {
          editInstructions.push(`- Add a brand-new text element for '${mark.label}' inside the designated hotspot. This MUST create additional copy without replacing or hiding any existing text elsewhere in the creative. Insert exactly: "${proposedText}". Critical instructions: Place this text ON TOP of the existing template canvas. ${describePlacementArea(mark)} Keep the text horizontally and vertically centered within that invisible guide. The baseline should sit midway between the top and bottom edges of the imagined zone. ${noBorderClause} Do NOT place the copy inside a capsule, label, speech bubble, or box unless the original template already used one in that location. It is absolutely forbidden to alter the original template's dimensions or aspect ratio to fit this new text. The text's style, font, kerning, leading, and color should match the overall aesthetic of the template.`);
          newTextHotspots.push(proposedText);
        }
      }
    } else if (mark.type === 'image') {
       const mode = imageModes[mark.id] || 'upload';
       const asset = imageAssets[mark.id];
       const description = (imagePrompts[mark.id] || '').trim();
       const widthPercent = mark.width ? Math.max(1, Math.round((mark.width || 0) * 100)) : null;
       const heightPercent = mark.height ? Math.max(1, Math.round((mark.height || 0) * 100)) : null;
       const sizeInstruction = (widthPercent && heightPercent)
         ? `Scale it so it naturally fills roughly ${widthPercent}% of the canvas width and ${heightPercent}% of the canvas height while staying inside the invisible hotspot—never indicate that boundary with frames, rules, or glow.`
         : mark.scale
           ? `Aim for it to cover about ${Math.round(mark.scale * 100)}% of the image's width while blending into the composition without framing it.`
           : `Size it appropriately for the scene (for example, a small logo) but keep it frameless and integrated.`;
       if (mode === 'upload' && asset) {
         if (isExistingMark) {
           editInstructions.push(`- Replace the image labeled '${mark.label}' with the user's new provided '${mark.label}' image. The new image's lighting, shadows, perspective, and reflections MUST perfectly match the surrounding scene.`);
         } else {
            editInstructions.push(`- Add a brand-new image element for '${mark.label}' inside the described hotspot. This MUST be additional artwork layered on top of the existing design; do not remove or overwrite surrounding imagery. Critical instructions: Place this image ON TOP of the existing template canvas. ${describePlacementArea(mark)} ${sizeInstruction} ${noBorderClause} Ensure the image fits entirely within the invisible hotspot while appearing natural—never draw borders, trays, stickers, Polaroid frames, or placeholders around it. It is absolutely forbidden to alter the original template's dimensions or aspect ratio to fit this new image. The new image must be placed ENTIRELY within the original boundaries. Adjust the new image's lighting, shadows, and perspective to perfectly match the surrounding scene.`);
            newImageHotspots.push(mark.label);
         }
       } else if (mode === 'describe' && description) {
         if (isExistingMark) {
            editInstructions.push(`- Replace the image labeled '${mark.label}' with a new image that matches this description: ${description}. Ensure lighting, shadows, and perspective align perfectly with the existing design.`);
         } else {
            editInstructions.push(`- Add a brand-new image element for '${mark.label}' based on this description: ${description}. This must be additional artwork that coexists with the original design—do not delete or repaint existing elements. Place it ON TOP of the existing template canvas. ${describePlacementArea(mark)} ${sizeInstruction} ${noBorderClause} Ensure the image fits squarely inside the invisible hotspot while blending seamlessly—never draw borders, mats, stickers, or placeholder boxes. Do not alter the template dimensions; keep the new element entirely within the original boundaries and match the surrounding lighting and perspective.`);
            newImageHotspots.push(mark.label);
         }
       }
    }
  });
  const aspectRatioInstruction = "The output image's aspect ratio and dimensions MUST EXACTLY match the original template's.";

  const hasNewHotspots = newTextHotspots.length > 0 || newImageHotspots.length > 0 || overlayNewTextHotspots.length > 0;
  const newHotspotDirective = hasNewHotspots
    ? `    5.  **NEW HOTSPOT CONTENT:** When instructions say "add" or reference a new hotspot, treat that hotspot area as an empty, invisible layer that needs fresh content. Keep all existing text, logos, and imagery untouched. Generate only the new element within the specified bounds—never rewrite, remove, or restyle other parts of the creative. Hotspot guides are invisible; never display their outlines, boxes, or alignment aids in the finished render, even when multiple hotspots are added together. Fulfil each hotspot independently—do not group them into a shared card, banner, or container.`
    : '';

  const fewShotBase = hasNewHotspots
    ? [
        "User input: 'Add new text: Happy Holidays'. Expected Output: 'Happy Holidays' inserted directly into the hotspot with no box, label, or outline.",
        "User input: 'Add new image: fresh orange juice'. Expected Output: 'fresh orange juice' seamlessly placed inside the hotspot with zero frames, stickers, or borders."
      ]
    : [];

  const fewShotForNewText = newTextHotspots.map(text => {
    const escaped = escapeSingleQuotes(text.trim());
    return `User input: 'Add new text: ${escaped}'. Expected Output: '${escaped}'.`;
  });

  const fewShotGuidance = (fewShotBase.length + fewShotForNewText.length) > 0
    ? `
    **Few-shot guidance for new text hotspots:**
    ${[...fewShotBase, ...fewShotForNewText].join('\n    ')}
  `
    : '';

  const overlayReminder = overlayNewTextHotspots.length > 0
    ? `\n    Additional context: The user will place independent PNG overlays for these hotspots: ${overlayNewTextHotspots.join(', ')}. After you restore their backgrounds, leave them completely blank so the overlays can sit directly on top.`
    : '';

  const textPrompt = `
    You are a precise and expert creative director AI. Your task is to perform specific in-place edits on a template image. You must follow all instructions exactly.

    **CRITICAL DIRECTIVES - READ AND FOLLOW STRICTLY:**
    1.  **DO NOT RECREATE:** You are only modifying small, specified parts of the template. The rest of the image MUST remain identical to the original.
    2.  **ABSOLUTE DIMENSION LOCK:** It is absolutely forbidden to alter the original template's dimensions or aspect ratio unless an explicit 'Aspect Ratio Requirement' is given below. Do NOT expand, crop, or change the canvas size to fit new elements. New elements are always placed ON TOP of the existing canvas, within its original boundaries. This is the most important rule.
    3.  **SEAMLESS INTEGRATION:** All new or replaced elements (text and images) must be perfectly integrated. Match the original template's lighting, perspective, style, and quality.
    4.  **BOUNDING BOX COMPLIANCE:** When a placement region is described, treat it as an invisible clipping mask. The new element must stay fully inside its bounds with no drift. If the request mentions centering, keep the element centered in both axes within that region. Never add borders, strokes, halos, stickers, or shadows around the region—and when multiple hotspots are generated together, keep each element frameless with no shared panels or outlines. Remove any placeholder guides before delivering the final image.
${newHotspotDirective ? `\n${newHotspotDirective}` : ''}${overlayReminder}

    **Task Description from Original Brief:** ${basePrompt}
        
    **Aspect Ratio Requirement**: ${aspectRatioInstruction}

    **SPECIFIC EDITING TASKS:**
    ${editInstructions.length > 0 ? editInstructions.join('\n') : "No specific edits requested. Generate the creative based on the original brief while keeping the original canvas dimensions."}
    ${fewShotGuidance}
    ---
  `;
  
  promptParts.unshift({ text: textPrompt });

  try {
    apiResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts: promptParts },
      config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
          temperature: 0.4,
      },
    });
    apiLatencyMs = now() - requestStartedAt;
    inlineImageCount = countInlineImages(apiResult);

    if (!apiResult.candidates || apiResult.candidates.length === 0 || !apiResult.candidates[0].content || !apiResult.candidates[0].content.parts) {
      const blockReason = apiResult.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(`Generation failed due to: ${blockReason}. Please adjust your inputs.`);
      }
      throw new Error("No content was generated by the API. The response was empty.");
    }

    for (const part of apiResult.candidates[0].content.parts) {
      const data = part.inlineData?.data;
      if (data) {
        logGeminiUsage({
          actionType: 'generateCreative',
          modelUsed: 'gemini-2.5-flash-image-preview',
          result: apiResult,
          imageCount: inlineImageCount,
          latencyMs: apiLatencyMs,
          extra: {
            newTextHotspots: newTextHotspots.length,
            newImageHotspots: newImageHotspots.length,
            overlayTextHotspots: overlayNewTextHotspots.length,
          },
        });
        return data;
      }
    }

    throw new Error("No image was found in the generated content.");
  } catch (error) {
    if (apiLatencyMs === 0) {
      apiLatencyMs = now() - requestStartedAt;
    }
    logGeminiUsage({
      actionType: 'generateCreative',
      modelUsed: 'gemini-2.5-flash-image-preview',
      result: apiResult,
      imageCount: inlineImageCount,
      latencyMs: apiLatencyMs,
      status: 'error',
      error,
      extra: {
        newTextHotspots: newTextHotspots.length,
        newImageHotspots: newImageHotspots.length,
        overlayTextHotspots: overlayNewTextHotspots.length,
      },
    });
    throw error;
  }
};


export const editCreativeWithChat = async (
  baseImageBase64: string,
  baseImageMimeType: string,
  prompt: string,
  referenceImage?: { base64: string; mimeType: string },
  editOptions: ChatEditOptions = {},
): Promise<string> => {
  const ai = getAi();
  const requestStartedAt = now();
  let apiLatencyMs = 0;
  let apiResult: any;
  let inlineImageCount = 0;
  let instructionPrompt = `You are a helpful and expert creative assistant. The user has provided an image they want to edit. Follow their text instructions precisely to modify the image. You can also take stylistic cues from the optional reference image if one is provided.
  
  **Core Directives:**
  1. **Modify, Don't Recreate:** You are editing specific parts of the image, not creating a new image from scratch.
  2. **Preserve Integrity:** The majority of the image must remain UNCHANGED unless the user explicitly asks for a broad change.
  3. **Seamless Integration:** All new elements or changes must be seamlessly integrated, matching the original image's lighting, perspective, and style.
  `;

  if (editOptions.brandColors && editOptions.brandColors.length > 0) {
    instructionPrompt += `\n- **Color Palette Constraint:** The final image must strictly adhere to this color palette: ${editOptions.brandColors.join(', ')}. Use these colors intelligently to theme the creative. The primary color is ${editOptions.brandColors[0]}.`;
  }

  if (editOptions.mentions && editOptions.mentions.length > 0) {
     instructionPrompt += `\n- **Targeted Hotspots:** The user referenced these editable regions: ${editOptions.mentions.join(', ')}. Prioritize edits that affect only these regions unless the user explicitly reports otherwise.`;
  }

  const promptParts: any[] = [
    { text: instructionPrompt },
    { text: "This is the image to edit:" },
    { inlineData: { data: baseImageBase64, mimeType: baseImageMimeType } },
  ];

  if (referenceImage) {
    promptParts.push({ text: "Use this image as a style reference:" });
    promptParts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });
  }

  promptParts.push({ text: `User's instruction: "${prompt}"` });
  try {
    apiResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts: promptParts },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        temperature: 0.4,
      },
    });
    apiLatencyMs = now() - requestStartedAt;
    inlineImageCount = countInlineImages(apiResult);

    if (!apiResult.candidates || apiResult.candidates.length === 0 || !apiResult.candidates[0].content || !apiResult.candidates[0].content.parts) {
      const blockReason = apiResult.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(`Editing failed due to: ${blockReason}. Please modify your request.`);
      }
      throw new Error("AI failed to edit the image. The response was empty.");
    }

    for (const part of apiResult.candidates[0].content.parts) {
      const data = part.inlineData?.data;
      if (data) {
        logGeminiUsage({
          actionType: 'editCreativeWithChat',
          modelUsed: 'gemini-2.5-flash-image-preview',
          result: apiResult,
          imageCount: inlineImageCount,
          latencyMs: apiLatencyMs,
          extra: {
            hasReferenceImage: Boolean(referenceImage),
            mentionsCount: editOptions.mentions?.length ?? 0,
            brandColorsCount: editOptions.brandColors?.length ?? 0,
          },
        });
        return data; // Return the base64 of the edited image
      }
    }

    throw new Error("No edited image was found in the response.");
  } catch (error) {
    if (apiLatencyMs === 0) {
      apiLatencyMs = now() - requestStartedAt;
    }
    logGeminiUsage({
      actionType: 'editCreativeWithChat',
      modelUsed: 'gemini-2.5-flash-image-preview',
      result: apiResult,
      imageCount: inlineImageCount,
      latencyMs: apiLatencyMs,
      status: 'error',
      error,
      extra: {
        hasReferenceImage: Boolean(referenceImage),
        mentionsCount: editOptions.mentions?.length ?? 0,
        brandColorsCount: editOptions.brandColors?.length ?? 0,
      },
    });
    throw error;
  }
};

export const detectEditableRegions = async (imageBase64: string, mimeType: string): Promise<Mark[]> => {
    const ai = getAi();
    const requestStartedAt = now();
    let apiLatencyMs = 0;
    let apiResult: any;
    const prompt = `
        Analyze the provided creative template. Your task is to identify ALL distinct editable regions and extract their content. This includes logos, product visuals, headlines, body text, background plates, decorative flourishes, silhouettes, stickers, icons, and any other accents a designer might want to swap or recolor.
        
        For each region, you must provide:
        1.  A machine-friendly 'id' in camelCase (e.g., 'mainHeadline', 'contactEmail', 'logo'). The ID for the main brand logo should always be 'logo'.
        2.  A human-friendly 'label' (e.g., 'Main Headline', 'Contact Email', 'Logo').
        3.  The 'type' of the region, which MUST be either "text" or "image". Decorative, silhouette, or background elements should still be typed as "image".
        4.  The 'category' describing the region's visual intent. Use exactly one of: "content" (primary brand/product/message elements), "decorative" (ornamental accents, frames, motifs, icons, stickers), "silhouette" (cut-outs, stencils, contour overlays), or "background" (replaceable backdrops or canvases). Always include this field.
        5.  For regions of type "text", you MUST perform OCR and return the exact 'text' content you see. This field should be omitted for image regions.
        6.  The normalized center point coordinates (x, y) and dimensions (width, height), all between 0 and 1, where (0,0) is top-left.

        Treat stacked or layered accents as distinct regions if they can be edited independently. Do not omit subtle decorative, silhouette, or background assets if they are visually significant in the composition.
    `;

    try {
        apiResult = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { data: imageBase64, mimeType: mimeType } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        regions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING, description: "Unique ID in camelCase (e.g., mainHeadline). Use 'logo' for the primary brand logo." },
                                    label: { type: Type.STRING, description: 'Human-friendly label (e.g., Main Headline).' },
                                    type: { type: Type.STRING, description: 'Must be "text" or "image".' },
                                    category: { type: Type.STRING, description: 'One of "content", "decorative", "silhouette", or "background" describing the visual intent.' },
                                    text: { type: Type.STRING, description: "The OCR-extracted text content. Only for type 'text'." },
                                    x: { type: Type.NUMBER, description: 'Normalized center X coordinate (0-1).' },
                                    y: { type: Type.NUMBER, description: 'Normalized center Y coordinate (0-1).' },
                                    width: { type: Type.NUMBER, description: 'Normalized width (0-1).' },
                                    height: { type: Type.NUMBER, description: 'Normalized height (0-1).' },
                                },
                                propertyOrdering: ["id", "label", "type", "category", "text", "x", "y", "width", "height"],
                            }
                        }
                    },
                    propertyOrdering: ["regions"],
                }
            }
        });
        apiLatencyMs = now() - requestStartedAt;

        const jsonString = apiResult.text;
        if (!jsonString) {
            const blockReason = apiResult.promptFeedback?.blockReason;
            if (blockReason) {
                throw new Error(`Region detection failed due to: ${blockReason}.`);
            }
            throw new Error("Region detection failed: The API returned no content.");
        }

        const parsed = JSON.parse(jsonString.trim());
        let regions: Mark[] = [];

        if (parsed && parsed.regions && Array.isArray(parsed.regions)) {
            regions = parsed.regions
                .filter((r: any) =>
                    typeof r.id === 'string' &&
                    typeof r.label === 'string' &&
                    (r.type === 'text' || r.type === 'image') &&
                    typeof r.x === 'number' &&
                    typeof r.y === 'number' &&
                    typeof r.width === 'number' &&
                    typeof r.height === 'number'
                )
                .map((region: any) => {
                    const category = sanitizeMarkCategory(region.category, region.label, region.type);
                    const mark: Mark = {
                        id: region.id,
                        label: region.label,
                        type: region.type,
                        x: region.x,
                        y: region.y,
                        width: region.width,
                        height: region.height,
                        category,
                        ...(region.scale ? { scale: region.scale } : {}),
                        ...(region.text ? { text: region.text } : {}),
                    };
                    if (mark.type === 'text') {
                        const inferred = inferTypographyRoleFromLabel(mark.label);
                        if (inferred) {
                            mark.typographyRole = inferred;
                        }
                    }
                    return mark;
                });
        }

        logGeminiUsage({
            actionType: 'detectEditableRegions',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            extra: { detectedRegions: regions.length },
        });

        return regions;
    } catch (error) {
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'detectEditableRegions',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
        });
        throw error;
    }
};

export const generateTemplateMetadata = async (
    imageBase64: string,
    mimeType: string
): Promise<{ title: string; prompt: string; tags: string[]; useCases: string[] }> => {
    const ai = getAi();
    const requestStartedAt = now();
    let apiLatencyMs = 0;
    let apiResult: any;
    const prompt = `
        You are an expert creative director and marketing analyst. Analyze the provided image, which is a creative template. Your task is to generate metadata that will help designers and users understand and use this template effectively.

        Provide the following in a JSON object:
        1.  **title**: A concise, descriptive, and SEO-friendly title for the template (max 10 words).
        2.  **prompt**: A detailed "AI Prompt" for end-users. This prompt should describe the template's scene, style, mood, composition, and key elements. It must guide the AI in maintaining the template's aesthetic when a user adds their own content.
        3.  **tags**: An array of 3-5 relevant keywords from the master list. The tags should accurately describe the template's style, use case, and industry.
        4.  **useCases**: An array of 3 highly practical recommendations, each no longer than 12 words. Focus on crisp distribution or activation ideas (e.g., "WhatsApp festival greeting for premium clients").
            - Master Tag List: ${ALL_TAGS.join(', ')}
    `;

    try {
        apiResult = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "A concise, SEO-friendly title." },
                        prompt: { type: Type.STRING, description: "A detailed AI prompt for creative generation." },
                        tags: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING, description: "A relevant tag from the master list." }
                        },
                        useCases: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING, description: "A concise, actionable use case for the template." }
                        }
                    },
                    propertyOrdering: ["title", "prompt", "tags", "useCases"],
                }
            }
        });
        apiLatencyMs = now() - requestStartedAt;

        const jsonString = apiResult.text;
        if (!jsonString) {
            throw new Error("Metadata generation failed: The API returned no content.");
        }
        
        const parsed = JSON.parse(jsonString.trim());

        if (
            parsed &&
            typeof parsed.title === 'string' &&
            typeof parsed.prompt === 'string' &&
            Array.isArray(parsed.tags) &&
            Array.isArray(parsed.useCases)
        ) {
            const payload = {
                title: parsed.title,
                prompt: parsed.prompt,
                tags: parsed.tags.filter((t: any) => typeof t === 'string' && ALL_TAGS.includes(t)),
                useCases: parsed.useCases
                    .filter((u: any) => typeof u === 'string')
                    .map((u: string) => u.trim())
                    .filter((u: string) => u.length > 0)
                    .map((u: string) => {
                        const words = u.split(/\s+/).filter(Boolean);
                        const limit = 12;
                        if (words.length <= limit) return u;
                        return words.slice(0, limit).join(' ');
                    })
            };

            logGeminiUsage({
                actionType: 'generateTemplateMetadata',
                modelUsed: 'gemini-2.5-flash',
                result: apiResult,
                imageCount: 0,
                latencyMs: apiLatencyMs,
                extra: { tagsCount: payload.tags.length, useCasesCount: payload.useCases.length },
            });

            return payload;
        }

        throw new Error("Metadata generation failed: The API response was not in the expected format.");
    } catch (error) {
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'generateTemplateMetadata',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
        });
        throw error;
    }
};


export const extractColorsFromImage = async (imageBase64: string, mimeType: string): Promise<string[]> => {
    const ai = getAi();
    const requestStartedAt = now();
    let apiLatencyMs = 0;
    let apiResult: any;
    const prompt = `
        You are an expert brand designer. Analyze the provided logo image and identify its primary color palette.
        
        Return a JSON object containing an array of the 4 most prominent and representative colors as hex codes.
        The colors should be ordered from most dominant to least dominant.
    `;
    try {
        apiResult = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { data: imageBase64, mimeType: mimeType } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        colors: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.STRING,
                                description: "A hex color code string (e.g., '#FFFFFF')."
                            }
                        }
                    },
                    propertyOrdering: ["colors"],
                }
            }
        });
        apiLatencyMs = now() - requestStartedAt;
        const jsonString = apiResult.text;
        if (!jsonString) {
            const blockReason = apiResult.promptFeedback?.blockReason;
            if (blockReason) {
                throw new Error(`Color extraction failed due to: ${blockReason}.`);
            }
            throw new Error("Color extraction failed: The API returned no candidates.");
        }
        
        const parsed = JSON.parse(jsonString.trim());

        if (parsed && parsed.colors && Array.isArray(parsed.colors)) {
            const colors = parsed.colors.filter((c: any) => typeof c === 'string' && c.startsWith('#'));
            logGeminiUsage({
                actionType: 'extractColorsFromImage',
                modelUsed: 'gemini-2.5-flash',
                result: apiResult,
                imageCount: 0,
                latencyMs: apiLatencyMs,
                extra: { colorsCount: colors.length },
            });
            return colors;
        }

        throw new Error("Color extraction failed: The API response was not in the expected format.");
    } catch (error) {
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'extractColorsFromImage',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
        });
        throw error;
    }
};


export const generateTemplateStyleSnapshot = async (
  imageBase64: string,
  mimeType: string
): Promise<TemplateStyleSnapshot> => {
  const ai = getAi();
  const requestStartedAt = now();
  let apiLatencyMs = 0;
  let apiResult: any;
  const prompt = `
    You are a senior brand designer. Analyze this creative template and summarise its visual language so future overlays can stay consistent.

    Respond with a JSON object following this contract:
    {
      "palette": string[3-6],                    // Dominant brand colors as hex codes.
      "accentPalette": string[0-4],             // Supporting or contrasting colors as hex codes.
      "typography": Array<{
        "role": "headline" | "subheading" | "body" | "caption" | "accent" | "decorative",
        "description": string,                 // Concise but vivid description of the letterforms and styling.
        "primaryColor"?: string,               // Hex color primarily used for this style.
        "casing"?: "uppercase" | "title" | "sentence" | "mixed"
      }>                                          // Include up to 5 distinctive styles.
      "motifKeywords": string[3-8],             // Distinct motifs/patterns/illustration cues as short phrases.
      "textureSummary"?: string,                // Describe texture/finishing if relevant.
      "lightingSummary"?: string,               // Summarise lighting or glow behaviour.
      "additionalNotes"?: string               // Guardrails for future assets.
    }

    Keep every string under 160 characters.
  `;

  try {
    apiResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            palette: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Primary color palette as hex codes.',
            },
            accentPalette: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Accent colors as hex codes.',
            },
            typography: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  role: { type: Type.STRING },
                  description: { type: Type.STRING },
                  primaryColor: { type: Type.STRING },
                  casing: { type: Type.STRING },
                },
                required: ['role', 'description'],
              },
              description: 'Typography treatments.',
            },
            motifKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key stylistic motifs.',
            },
            textureSummary: { type: Type.STRING },
            lightingSummary: { type: Type.STRING },
            additionalNotes: { type: Type.STRING },
          },
          required: ['palette', 'typography', 'motifKeywords'],
          propertyOrdering: [
            'palette',
            'accentPalette',
            'typography',
            'motifKeywords',
            'textureSummary',
            'lightingSummary',
            'additionalNotes',
          ],
        },
        temperature: 0.2,
      },
    });

    apiLatencyMs = now() - requestStartedAt;

    const json = apiResult.text;
    if (!json) {
      const blockReason = apiResult.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(`Style analysis blocked: ${blockReason}.`);
      }
      throw new Error('Style analysis failed: empty response from Gemini.');
    }

    const parsed = JSON.parse(json.trim()) as Record<string, unknown>;
    const palette = sanitizePalette(parsed.palette);
    if (palette.length === 0) {
      throw new Error('Style analysis failed: no palette detected.');
    }
    const accentPalette = sanitizePalette(parsed.accentPalette);
    const typography = sanitizeTypography(parsed.typography);
    const motifKeywords = sanitizeMotifs(parsed.motifKeywords);

    logGeminiUsage({
      actionType: 'generateTemplateStyleSnapshot',
      modelUsed: 'gemini-2.5-flash',
      result: apiResult,
      imageCount: 0,
      latencyMs: apiLatencyMs,
      extra: {
        paletteCount: palette.length,
        accentPaletteCount: accentPalette.length,
        typographyCount: typography.length,
        motifCount: motifKeywords.length,
      },
    });

    return {
      version: 1,
      extractedAt: new Date(),
      palette,
      accentPalette: accentPalette.length > 0 ? accentPalette : undefined,
      typography,
      motifKeywords,
      textureSummary: typeof parsed.textureSummary === 'string' ? parsed.textureSummary.trim() || undefined : undefined,
      lightingSummary: typeof parsed.lightingSummary === 'string' ? parsed.lightingSummary.trim() || undefined : undefined,
      additionalNotes: typeof parsed.additionalNotes === 'string' ? parsed.additionalNotes.trim() || undefined : undefined,
    };
  } catch (error) {
    if (apiLatencyMs === 0) {
      apiLatencyMs = now() - requestStartedAt;
    }
    logGeminiUsage({
      actionType: 'generateTemplateStyleSnapshot',
      modelUsed: 'gemini-2.5-flash',
      result: apiResult,
      imageCount: 0,
      latencyMs: apiLatencyMs,
      status: 'error',
      error,
    });
    throw error;
  }
};

export const generateHotspotAsset = async (request: HotspotAssetRequest): Promise<HotspotAssetResult> => {
  const ai = getAi();
  const { styleSnapshot, intent, hotspotLabel } = request;
  const requestStartedAt = now();

  const paletteText = styleSnapshot.palette.join(', ');
  const accentText = styleSnapshot.accentPalette?.join(', ');
  const typographyBullets = styleSnapshot.typography
    .map(typo => `- ${typo.role.toUpperCase()}: ${typo.description}${typo.primaryColor ? ` (color ${typo.primaryColor})` : ''}`)
    .join('\n');
  const targetedTypographyLine = (() => {
    const style = request.typographyStyle;
    if (style) {
      const fragments: string[] = [style.description];
      if (style.casing) {
        fragments.push(`set in ${style.casing} case`);
      }
      if (style.primaryColor) {
        fragments.push(`typically ${style.primaryColor}`);
      }
      return `- Primary typography target: ${style.role.toUpperCase()} — ${fragments.join(', ')}.`;
    }
    if (request.typographyRoleHint) {
      return `- If multiple styles exist, bias toward a convincing ${request.typographyRoleHint.toUpperCase()} treatment.`;
    }
    return '';
  })();
  const motifText = styleSnapshot.motifKeywords.join(', ');
  const motifBullet = motifText
    ? intent === 'text'
      ? `- Lettering may nod to these motifs through internal styling only—never add separate ornaments, badges, or backdrop art: ${motifText}.`
      : `- Echo these motifs: ${motifText}.`
    : '- Echo these motifs: n/a.';
  const textOnlyBullets = intent === 'text'
    ? `- Output must consist solely of the rendered letterforms; keep all other pixels fully transparent.
- Do not generate plates, ribbons, flourishes, gradients, or shadows that depend on an added background.
- Maintain clean negative space around the text without inventing extra copy.
- Keep each word intact; never split a single word across multiple lines or add hyphenation.`
    : '';

  const roleDirective = intent === 'text'
    ? `Render only the exact text content supplied below as crisp, legible typography. Do not invent alternate copy, and do not add any containers, icons, illustrations, or decorative frames. The overlay must consist solely of the lettering with every other pixel transparent.`
    : `Render the described imagery as a decorative element that reads well atop varied backgrounds.`;

  const textDirective = request.textContent
    ? `Text to render exactly: "${request.textContent}"`
    : '';
  const descriptionDirective = request.description ? `Subject description: ${request.description}` : '';
  const placementDirective = request.placementSummary ? `Placement context: ${request.placementSummary}` : '';
  const aspectRatioDirective = request.aspectRatioHint ? `Target aspect ratio hint: ${request.aspectRatioHint}` : '';
  const sizeDirective = request.sizeHint
    ? `Ideal rendered bounds: about ${request.sizeHint.widthPx ? `${request.sizeHint.widthPx}px wide` : ''}${request.sizeHint.widthPx && request.sizeHint.heightPx ? ' × ' : ''}${request.sizeHint.heightPx ? `${request.sizeHint.heightPx}px tall` : ''}.`
    : '';
  const brandDirective = request.brandColors && request.brandColors.length > 0
    ? `The user's brand palette to honour if possible: ${request.brandColors.join(', ')}.`
    : '';
  const accentDirective = accentText ? `Accent palette cues: ${accentText}.` : '';
  const textureDirective = styleSnapshot.textureSummary ? `Texture guidance: ${styleSnapshot.textureSummary}.` : '';
  const lightingDirective = styleSnapshot.lightingSummary ? `Lighting guidance: ${styleSnapshot.lightingSummary}.` : '';
  const notesDirective = styleSnapshot.additionalNotes ? `Additional guardrails: ${styleSnapshot.additionalNotes}.` : '';

  const normalizedAspectRatio = (() => {
    if (request.sizeHint?.aspectRatio) {
      const parsed = Number.parseFloat(request.sizeHint.aspectRatio);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    const width = request.sizeHint?.widthPx ?? 0;
    const height = request.sizeHint?.heightPx ?? 0;
    if (width > 0 && height > 0) {
      const ratio = width / height;
      return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined;
    }
    return undefined;
  })();

  const aspectRatioCategory: 'wide' | 'square' | 'tall' = (() => {
    if (!normalizedAspectRatio) {
      return 'square';
    }
    if (normalizedAspectRatio >= 1.15) {
      return 'wide';
    }
    if (normalizedAspectRatio <= 0.85) {
      return 'tall';
    }
    return 'square';
  })();

  const lineBreakPreference = request.lineBreakPreference ?? 'auto';
  const lineBreakDirective = intent === 'text'
    ? (() => {
        switch (lineBreakPreference) {
          case 'single-line':
            return '- Lay the copy out on a single uninterrupted line. Adjust kerning or scale before wrapping, and never insert manual line breaks.';
          case 'multi-line':
            return '- Intentionally stack the copy across two balanced lines. Keep the lines centered vertically and do not invent extra decorative separators.';
          default:
            if (aspectRatioCategory === 'tall') {
              return '- A two-line stack is acceptable because the hotspot is tall; cap it at two lines and keep both centered.';
            }
            if (aspectRatioCategory === 'wide') {
              return '- Prefer a single line of text; only break onto a second line if it would otherwise be illegible at the given width.';
            }
            return '- Default to a single line. Allow a gentle two-line stack only if it meaningfully improves legibility.';
        }
      })()
    : '';

  const buildPromptParts = (forceTransparent: boolean) => {
    const transparencyDirective = forceTransparent
      ? 'Your previous attempt produced a non-transparent background. Re-render the asset as a PNG with a genuine alpha channel. Trim away all backdrop pixels—checkerboards, solids, gradients, and photographic backplates are forbidden. Do not quit until the background is fully transparent.'
      : 'Critical: the PNG must keep all pixels outside the artwork fully transparent. Do not include drop shadows that rely on a background rectangle; instead bake soft internal shading if required. No background, no borders, no guidelines. Return just the asset.';

    const promptParts: any[] = [
      {
        text: `You are producing a standalone overlay asset for hotspot "${hotspotLabel}". ${roleDirective}

The asset must:
- Be delivered as a single PNG with a fully transparent background (no residual canvas, no checkerboard fill).
- Use the template's core palette: ${paletteText || 'n/a'}.
- Reflect these typography treatments:\n${typographyBullets || '- Keep typography minimal if not provided.'}
${targetedTypographyLine ? `${targetedTypographyLine}\n` : ''}
${textOnlyBullets ? `${textOnlyBullets}\n` : ''}${motifBullet}
- Avoid flattening over the supplied references; treat them only as style cues.

${textDirective}
${lineBreakDirective}
${descriptionDirective}
${placementDirective}
${brandDirective}
${sizeDirective}
${aspectRatioDirective}
${accentDirective}
${textureDirective}
${lightingDirective}
${notesDirective}

${transparencyDirective}`
      }
    ];

    if (request.hotspotCrop) {
      promptParts.push({ text: 'Style reference crop (do NOT paste directly; study colors, linework, hierarchy, and texture only):' });
      promptParts.push({ inlineData: { data: request.hotspotCrop.base64, mimeType: request.hotspotCrop.mimeType } });
    }

    if (request.templateThumbnail) {
      promptParts.push({ text: 'Overall template reference (for mood only, never to composite with):' });
      promptParts.push({ inlineData: { data: request.templateThumbnail.base64, mimeType: request.templateThumbnail.mimeType } });
    }

    return promptParts;
  };

  const maxAttempts = 2;
  let lastResult: any = null;
  let lastLatencyMs = 0;
  let lastExtra: Record<string, unknown> | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const forceTransparent = attempt > 0;
    let fallbackOpaque: HotspotAssetResult | null = null;
    const attemptStart = now();
    let result: any;
    try {
      result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: buildPromptParts(forceTransparent) },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
          temperature: forceTransparent ? 0.2 : 0.35,
        },
      });
      const latencyMs = now() - attemptStart;
      const inlineImageCount = countInlineImages(result);

      if (!result.candidates || result.candidates.length === 0) {
        const blockReason = result.promptFeedback?.blockReason;
        if (blockReason) {
          throw new Error(`Asset generation blocked: ${blockReason}.`);
        }
        throw new Error('Asset generation failed: no candidates returned.');
      }

      lastResult = result;
      lastLatencyMs = latencyMs;
      lastExtra = {
        attempt,
        forceTransparent,
        intent,
      };

      const primaryCandidate = result.candidates[0];
      const parts = primaryCandidate?.content?.parts ?? [];
      for (const part of parts) {
        const data = part.inlineData?.data;
        const mimeType = part.inlineData?.mimeType || 'image/png';
        if (!data) {
          continue;
        }
        const hasAlpha = mimeType.includes('png') ? pngHasAlphaChannel(data) : true;
        if (hasAlpha) {
          logGeminiUsage({
            actionType: 'generateHotspotAsset',
            modelUsed: 'gemini-2.5-flash-image-preview',
            result,
            imageCount: inlineImageCount,
            latencyMs,
            extra: {
              ...lastExtra,
              deliveredAlpha: true,
            },
          });
          return { base64: data, mimeType, hasAlpha };
        }
        fallbackOpaque = { base64: data, mimeType, hasAlpha };
      }

      if (fallbackOpaque) {
        if (forceTransparent) {
          logGeminiUsage({
            actionType: 'generateHotspotAsset',
            modelUsed: 'gemini-2.5-flash-image-preview',
            result,
            imageCount: inlineImageCount,
            latencyMs,
            extra: {
              ...lastExtra,
              deliveredAlpha: false,
            },
          });
          return fallbackOpaque;
        }

        logGeminiUsage({
          actionType: 'generateHotspotAsset',
          modelUsed: 'gemini-2.5-flash-image-preview',
          result,
          imageCount: inlineImageCount,
          latencyMs,
          status: 'retry',
          extra: {
            ...lastExtra,
            deliveredAlpha: false,
          },
        });
        continue;
      }
    } catch (error) {
      const latencyMs = now() - attemptStart;
      lastLatencyMs = latencyMs;
      logGeminiUsage({
        actionType: 'generateHotspotAsset',
        modelUsed: 'gemini-2.5-flash-image-preview',
        result,
        imageCount: 0,
        latencyMs,
        status: 'error',
        error,
        extra: {
          attempt,
          forceTransparent,
          intent,
        },
      });
      throw error;
    }
  }

  const finalError = new Error('Asset generation failed: no image content detected.');
  logGeminiUsage({
    actionType: 'generateHotspotAsset',
    modelUsed: 'gemini-2.5-flash-image-preview',
    result: lastResult ?? undefined,
    imageCount: lastResult ? countInlineImages(lastResult) : 0,
    latencyMs: lastLatencyMs || (now() - requestStartedAt),
    status: 'error',
    error: finalError,
    extra: {
      ...(lastExtra ?? {}),
      intent,
    },
  });
  throw finalError;
};

export const generativeFill = async (request: GenerativeFillRequest): Promise<GenerativeFillResult> => {
  if (!GENERATIVE_FILL_SUPPORTED) {
    throw new Error('Generative fill requires Vertex AI credentials. Configure the backend proxy and set VITE_ENABLE_VERTEX_GENERATIVE_FILL=true.');
  }
  const prompt = request.prompt.trim();
  if (!prompt) {
    throw new Error('Describe what you want the generative fill to create.');
  }
  if (!request.maskBase64) {
    throw new Error('A selection mask is required to run generative fill.');
  }

  const requestStartedAt = now();
  const maskBytes = Math.floor((request.maskBase64.length * 3) / 4);
  const baseImageBytes = request.baseImageBase64 ? Math.floor((request.baseImageBase64.length * 3) / 4) : 0;

  try {
    const response = await fetch(GENERATIVE_FILL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseImageBase64: request.baseImageBase64,
        baseImageMimeType: request.baseImageMimeType,
        maskBase64: request.maskBase64,
        prompt,
        brandColors: request.brandColors,
      }),
    });

    const latencyMs = now() - requestStartedAt;
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result?.error || result?.message || `Generative fill failed with status ${response.status}.`;
      recordUsageEvent({
        actionType: 'generativeFill',
        modelUsed: 'imagen-3.0-capability-001',
        status: 'error',
        latencyMs,
        errorCode: message,
        extra: {
          maskBytes,
          baseImageBytes,
        },
      });
      throw new Error(message);
    }

    const base64 = result?.base64;
    const mimeType = result?.mimeType || 'image/png';
    if (typeof base64 !== 'string' || base64.length === 0) {
      const errorMessage = result?.error || 'Generative fill failed: no image returned by the server.';
      recordUsageEvent({
        actionType: 'generativeFill',
        modelUsed: 'imagen-3.0-capability-001',
        status: 'error',
        latencyMs,
        errorCode: errorMessage,
        extra: {
          maskBytes,
          baseImageBytes,
        },
      });
      throw new Error(errorMessage);
    }

    recordUsageEvent({
      actionType: 'generativeFill',
      modelUsed: 'imagen-3.0-capability-001',
      imageCount: 1,
      latencyMs,
      extra: {
        maskBytes,
        baseImageBytes,
        brandColorsCount: request.brandColors?.length ?? 0,
      },
    });

    return { base64, mimeType };
  } catch (error) {
    const latencyMs = now() - requestStartedAt;
    recordUsageEvent({
      actionType: 'generativeFill',
      modelUsed: 'imagen-3.0-capability-001',
      status: 'error',
      latencyMs,
      errorCode: error instanceof Error ? error.message : String(error ?? 'unknown'),
      extra: {
        maskBytes,
        baseImageBytes,
        brandColorsCount: request.brandColors?.length ?? 0,
      },
    });
    throw error;
  }
};

export const getTagsForSearchQuery = async (query: string): Promise<string[]> => {
    const ai = getAi();
    const requestStartedAt = now();
    let apiLatencyMs = 0;
    let apiResult: any;
    const prompt = `
        You are an expert creative director's assistant. A user is searching for a template with the following "wish": "${query}".
        
        Your task is to analyze this request and return a JSON array of 3-5 relevant keywords or tags that can be used to filter a library of creative templates.
        
        The available tags are: ${ALL_TAGS.join(', ')}. You can also generate other relevant keywords.
        
        Only return the JSON array of strings.
    `;
    try {
        apiResult = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        tags: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.STRING,
                                description: "A relevant tag or keyword."
                            }
                        }
                    },
                    propertyOrdering: ["tags"],
                }
            }
        });
        apiLatencyMs = now() - requestStartedAt;

        const jsonString = apiResult.text;
        if (!jsonString) {
            const blockReason = apiResult.promptFeedback?.blockReason;
            if (blockReason) {
                throw new Error(`Tag generation failed due to: ${blockReason}.`);
            }
            logGeminiUsage({
                actionType: 'getTagsForSearchQuery',
                modelUsed: 'gemini-2.5-flash',
                result: apiResult,
                imageCount: 0,
                latencyMs: apiLatencyMs,
                status: 'error',
                error: new Error('Empty response'),
                extra: { queryLength: query.length },
            });
            return [];
        }
        
        const parsed = JSON.parse(jsonString.trim());
        const tags = parsed && parsed.tags && Array.isArray(parsed.tags)
            ? parsed.tags.filter((t: any) => typeof t === 'string')
            : [];

        logGeminiUsage({
            actionType: 'getTagsForSearchQuery',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            extra: { tagsCount: tags.length, queryLength: query.length },
        });

        return tags;
    } catch (error) {
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'getTagsForSearchQuery',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
            extra: { queryLength: query.length },
        });
        throw error;
    }
};


export const isApiConfigured = () => !!ai;
