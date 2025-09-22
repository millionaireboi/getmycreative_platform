import { useState, useCallback, useEffect, ChangeEvent, FormEvent, useRef, MouseEvent, useMemo, MutableRefObject, CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { removeBackground } from '@imgly/background-removal';
import { UITemplate, BrandAsset, GeneratedImage, Mark, ChatMessage, TemplateStyleSnapshot, TypographyRole } from '../types.ts';
import { generateCreative, editCreativeWithChat, ChatEditOptions, generateHotspotAsset, generateTemplateStyleSnapshot } from '../services/geminiService.ts';
import { fileToBase64, downloadImage, imageUrlToBase64, base64ToBlob } from '../utils/fileUtils.ts';
import { SparklesIcon, ArrowLeftIcon, DownloadIcon, PaperclipIcon, SendIcon, PaletteIcon, XIcon, UploadCloudIcon, EditIcon, FileTextIcon, ImageIcon } from './icons.tsx';
import CreativeElement from './CreativeElement.tsx';

import { BRAND_PALETTES } from '../constants.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { SubscriptionTier, Project } from '../core/types/index.ts';
import { createProject, updateProjectHistory, updateProjectName } from '../core/systems/projectStore.ts';
import { uploadFileToStorage } from '../firebase/config.ts';


const DEFAULT_HOTSPOT_LABEL: Record<'text' | 'image', string> = {
  text: 'New text hotspot',
  image: 'New image hotspot',
};

const TYPOGRAPHY_ROLE_OPTIONS: Array<{ value: TypographyRole; label: string; helper: string }> = [
  { value: 'headline', label: 'Headline', helper: 'Bold, primary attention grabber' },
  { value: 'subheading', label: 'Subheading', helper: 'Secondary line beneath the headline' },
  { value: 'body', label: 'Body', helper: 'Longer descriptive copy' },
  { value: 'caption', label: 'Caption', helper: 'Small supporting note or label' },
  { value: 'accent', label: 'Accent', helper: 'Decorative or emphasis text' },
  { value: 'decorative', label: 'Decorative', helper: 'Ornamental lettering, not meant for paragraphs' },
];

const resolveHotspotDisplayLabel = (mark: Mark): string => {
  const raw = (mark.label ?? '').trim();
  if (!raw || raw === DEFAULT_HOTSPOT_LABEL[mark.type]) {
    return mark.type === 'text' ? 'Text hotspot' : 'Image hotspot';
  }
  return raw;
};

const isHotspotLabelPending = (mark: Mark): boolean => {
  const raw = (mark.label ?? '').trim();
  return !raw || raw === DEFAULT_HOTSPOT_LABEL[mark.type];
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const inferTypographyRoleFromLabel = (label: string): TypographyRole | null => {
  const value = (label || '').toLowerCase();
  if (!value) return null;
  if (value.includes('headline') || value.includes('title') || value.includes('main heading')) {
    return 'headline';
  }
  if (value.includes('subhead') || value.includes('sub-head') || value.includes('subtitle') || value.includes('subheading')) {
    return 'subheading';
  }
  if (value.includes('body') || value.includes('paragraph') || value.includes('copy') || value.includes('description') || value.includes('details')) {
    return 'body';
  }
  if (value.includes('caption') || value.includes('footnote') || value.includes('legal') || value.includes('disclaimer') || value.includes('small print')) {
    return 'caption';
  }
  if (value.includes('tagline') || value.includes('cta') || value.includes('call to action') || value.includes('button') || value.includes('price')) {
    return 'accent';
  }
  if (value.includes('decorative') || value.includes('ornament') || value.includes('flourish')) {
    return 'decorative';
  }
  return null;
};

const withInferredTypographyRole = (mark: Mark): Mark => {
  if (mark.type !== 'text') {
    if (mark.typographyRole) {
      const { typographyRole: _removed, ...rest } = mark;
      return rest;
    }
    return mark;
  }
  if (mark.typographyRole) {
    return mark;
  }
  const inferred = inferTypographyRoleFromLabel(mark.label ?? '');
  return inferred ? { ...mark, typographyRole: inferred } : mark;
};


const buildChatMessagesForState = (isProUser: boolean): ChatMessage[] => [
    {
        id: 'msg-tip',
        role: 'assistant',
        type: 'text',
        text: isProUser
            ? "Tip: use @ to reference any enabled hotspot (e.g. @Headline) when you ask for changes."
            : "Upgrade to Pro to chat with the designer bot and request targeted tweaks using @mentions."
    }
];

const VersionHistory = ({ history, activeIndex, onSelect }: { history: GeneratedImage[], activeIndex: number, onSelect: (index: number) => void }) => (
    <div>
        <h3 className="text-lg font-bold text-gray-800 font-display mb-3">Version History</h3>
        <div className="flex gap-3 overflow-x-auto pb-2">
            {history.map((version, index) => (
                <div key={version.id} className="flex-shrink-0 text-center">
                    <button 
                        onClick={() => onSelect(index)}
                        className={`block w-24 h-24 rounded-lg overflow-hidden border-2 transition-colors ${activeIndex === index ? 'border-emerald-500' : 'border-transparent hover:border-slate-300'}`}
                    >
                        <img src={version.imageUrl} alt={`Version ${index + 1}`} className="w-full h-full object-cover" />
                    </button>
                    <p className="text-xs mt-1 font-medium text-gray-600">{index === 0 ? 'Template' : `V${index}`}</p>
                </div>
            ))}
        </div>
    </div>
);

const ColorPaletteSelector = ({ selectedPalette, onPaletteChange, userBrandColors }: { selectedPalette: string[], onPaletteChange: (colors: string[]) => void, userBrandColors?: string[] }) => {

    const allPalettes: Record<string, string[]> = { ...BRAND_PALETTES };
    if (userBrandColors && userBrandColors.length > 0) {
        allPalettes["My Brand"] = userBrandColors;
    }

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><PaletteIcon className="w-5 h-5" /> Brand Colors</label>
            <div className="flex flex-wrap gap-2">
                {Object.entries(allPalettes).map(([name, colors]) => (
                    <button key={name} onClick={() => onPaletteChange(colors)} className={`p-1 border-2 rounded-md ${JSON.stringify(colors) === JSON.stringify(selectedPalette) ? 'border-emerald-500' : 'border-transparent'}`}>
                        <div className="flex gap-1">
                        {colors.map(color => <div key={color} className="w-5 h-5 rounded" style={{ backgroundColor: color }}/>)}
                        </div>
                         <span className="text-xs text-gray-500">{name}</span>
                    </button>
                ))}
                 <button onClick={() => onPaletteChange([])} className={`p-1 border-2 rounded-md ${selectedPalette.length === 0 ? 'border-emerald-500' : 'border-transparent'}`}>
                        <div className="flex items-center justify-center w-full h-5 text-gray-400">
                           <XIcon className="w-4 h-4" />
                        </div>
                         <span className="text-xs text-gray-500">None</span>
                </button>
            </div>
        </div>
    );
};

interface HotspotAssetPlacement {
  markId: string;
  label: string;
  base64: string;
  mimeType: string;
  hasAlpha: boolean;
  imageUrl: string;
  aspectRatio: number;
  center: { x: number; y: number }; // normalized to the full canvas (0-1)
  scale: number; // multiplier on baseWidthPercent
  baseWidthPercent: number; // relative to canvas width
  lockAspect?: boolean;
  signature: string;
  origin: 'ai-generated' | 'user-upload';
}

type TextLineMode = 'auto' | 'single-line' | 'multi-line';

type RGB = { r: number; g: number; b: number };
type HistogramEntry = { r: number; g: number; b: number; count: number };

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const getPixel = (buffer: Uint8ClampedArray, width: number, x: number, y: number) => {
  const index = (y * width + x) * 4;
  return {
    r: buffer[index],
    g: buffer[index + 1],
    b: buffer[index + 2],
    a: buffer[index + 3],
  };
};

const hasAnyTransparency = (buffer: Uint8ClampedArray) => {
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] < 250) {
      return true;
    }
  }
  return false;
};

const colorDistance = (pixel: RGB, reference: RGB) => {
  const dr = pixel.r - reference.r;
  const dg = pixel.g - reference.g;
  const db = pixel.b - reference.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const quantize = (value: number, step = 16) => Math.round(value / step) * step;

const dominantBorderColor = (buffer: Uint8ClampedArray, width: number, height: number): RGB | null => {
  if (width === 0 || height === 0) {
    return null;
  }

  const histogram = new Map<string, HistogramEntry>();
  let totalSamples = 0;
  const stepX = Math.max(1, Math.floor(width / 25));
  const stepY = Math.max(1, Math.floor(height / 25));

  const addSample = (x: number, y: number) => {
    const { r, g, b } = getPixel(buffer, width, x, y);
    const key = `${quantize(r)}-${quantize(g)}-${quantize(b)}`;
    const existing = histogram.get(key);
    const entry: HistogramEntry = existing ?? { r: 0, g: 0, b: 0, count: 0 };
    if (!existing) {
      histogram.set(key, entry);
    }
    entry.r += r;
    entry.g += g;
    entry.b += b;
    entry.count += 1;
    totalSamples += 1;
  };

  for (let x = 0; x < width; x += stepX) {
    addSample(x, 0);
    if (height > 1) addSample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += stepY) {
    addSample(0, y);
    if (width > 1) addSample(width - 1, y);
  }

  let topBin: HistogramEntry | null = null;
  histogram.forEach(entry => {
    if (!topBin || entry.count > topBin.count) {
      topBin = entry;
    }
  });

  if (!topBin || totalSamples === 0) {
    return null;
  }

  const resolvedTopBin: HistogramEntry = topBin;

  const dominance = resolvedTopBin.count / totalSamples;
  if (dominance < 0.55) {
    return null;
  }

  return {
    r: Math.round(resolvedTopBin.r / resolvedTopBin.count),
    g: Math.round(resolvedTopBin.g / resolvedTopBin.count),
    b: Math.round(resolvedTopBin.b / resolvedTopBin.count),
  };
};

const stripSolidBackground = (
  buffer: Uint8ClampedArray,
  width: number,
  height: number,
  background: RGB,
  tolerance = 20
) => {
  let updated = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const pixel = { r: buffer[index], g: buffer[index + 1], b: buffer[index + 2] };
      if (colorDistance(pixel, background) <= tolerance) {
        if (buffer[index + 3] !== 0) {
          buffer[index + 3] = 0;
          updated = true;
        }
      }
    }
  }
  return updated;
};

const findOpaqueBounds = (
  buffer: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 4
): { left: number; top: number; right: number; bottom: number } | null => {
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = buffer[(y * width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (bottom === -1 || right === -1) {
    return null;
  }

  return { left, top, right, bottom };
};

const prepareOverlayAsset = async (
  asset: { base64: string; mimeType: string; enforceTransparency: boolean }
): Promise<{ base64: string; mimeType: string; width: number; height: number; hasAlpha: boolean; usedMatting: boolean }> => {
  const dataUrl = `data:${asset.mimeType};base64,${asset.base64}`;
  const image = await loadImageElement(dataUrl);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  let canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Unable to initialise canvas for overlay asset.');
  }

  ctx.drawImage(image, 0, 0, width, height);
  let imageData = ctx.getImageData(0, 0, width, height);
  let buffer = imageData.data;
  let hasAlpha = hasAnyTransparency(buffer);
  let usedMatting = false;

  if (!hasAlpha && asset.enforceTransparency) {
    try {
      const transparentBlob = await removeBackground(dataUrl, {
        output: { format: 'image/png' },
      });
      const mimeType = transparentBlob.type || 'image/png';
      const transparentFile = new File([transparentBlob], 'overlay.png', { type: mimeType });
      const cleanedBase64 = await fileToBase64(transparentFile);

      const processed = await prepareOverlayAsset({
        base64: cleanedBase64,
        mimeType,
        enforceTransparency: false,
      });
      return { ...processed, usedMatting: true };
    } catch (error) {
      console.error('Background removal failed with @imgly/background-removal:', error);
    }

    const background = dominantBorderColor(buffer, width, height);
    if (background) {
      usedMatting = stripSolidBackground(buffer, width, height, background, 22);
      if (usedMatting) {
        ctx.putImageData(imageData, 0, 0);
        imageData = ctx.getImageData(0, 0, width, height);
        buffer = imageData.data;
        hasAlpha = hasAnyTransparency(buffer);
      }
    }
  }

  const bounds = findOpaqueBounds(buffer, width, height, 4);
  if (bounds) {
    const trimmedWidth = Math.max(1, bounds.right - bounds.left + 1);
    const trimmedHeight = Math.max(1, bounds.bottom - bounds.top + 1);
    if (trimmedWidth > 0 && trimmedHeight > 0 && (trimmedWidth !== width || trimmedHeight !== height)) {
      const trimmedCanvas = document.createElement('canvas');
      trimmedCanvas.width = trimmedWidth;
      trimmedCanvas.height = trimmedHeight;
      const trimmedCtx = trimmedCanvas.getContext('2d');
      if (!trimmedCtx) {
        throw new Error('Unable to trim overlay asset.');
      }
      const croppedData = ctx.getImageData(bounds.left, bounds.top, trimmedWidth, trimmedHeight);
      trimmedCtx.putImageData(croppedData, 0, 0);
      canvas = trimmedCanvas;
      ctx = trimmedCtx;
      width = trimmedWidth;
      height = trimmedHeight;
      imageData = ctx.getImageData(0, 0, width, height);
      buffer = imageData.data;
      hasAlpha = hasAnyTransparency(buffer);
    }
  }

  // Export as PNG to normalise output regardless of input type.
  const exportDataUrl = canvas.toDataURL('image/png');
  const cleanedBase64 = exportDataUrl.split(',')[1] ?? exportDataUrl;

  return {
    base64: cleanedBase64,
    mimeType: 'image/png',
    width,
    height,
    hasAlpha: hasAlpha,
    usedMatting,
  };
};

interface EditorViewProps {
  project: Project | null;
  pendingTemplate: UITemplate | null;
  onBack: () => void;
  onUpgrade: () => void;
  isDemoMode: boolean;
  onProjectPersisted?: (project: Project) => void;
}

export const EditorView = ({ project, pendingTemplate, onBack, onUpgrade, isDemoMode, onProjectPersisted }: EditorViewProps) => {
  const { appUser } = useAuth();
  const isProUser = appUser?.tier === SubscriptionTier.PRO;

  const initialHistory: GeneratedImage[] = project
    ? project.history
    : pendingTemplate
      ? [{ id: pendingTemplate.id, imageUrl: pendingTemplate.imageUrl, prompt: 'Original Template' }]
      : [];
  const initialMarksSourceRaw = project?.initialMarks ?? pendingTemplate?.initialMarks ?? [];
  const initialMarksSource = initialMarksSourceRaw.map(withInferredTypographyRole);
  const initialName = project?.name ?? pendingTemplate?.title ?? 'Untitled Project';
  const initialPrompt = project?.basePrompt ?? pendingTemplate?.prompt ?? '';
  const initialTemplateImageUrl = project?.templateImageUrl ?? pendingTemplate?.imageUrl ?? '';
  const initialTemplateId = project?.templateId ?? pendingTemplate?.id ?? '';

  const [history, setHistory] = useState<GeneratedImage[]>(initialHistory);
  const [activeIndex, setActiveIndex] = useState(Math.max(initialHistory.length - 1, 0));
  const [projectName, setProjectName] = useState(initialName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [marks, setMarks] = useState<Mark[]>(initialMarksSource);
  const [enabledMarks, setEnabledMarks] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    initialMarksSource.forEach(mark => {
        map[mark.id] = false;
    });
    return map;
  });
  const [textFields, setTextFields] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    initialMarksSource.forEach(mark => {
        if (mark.type === 'text') {
            map[mark.id] = mark.text || `Your ${resolveHotspotDisplayLabel(mark)} Here`;
        }
    });
    return map;
  });
  const [textLineModes, setTextLineModes] = useState<Record<string, TextLineMode>>(() => {
    const map: Record<string, TextLineMode> = {};
    initialMarksSource.forEach(mark => {
      if (mark.type === 'text') {
        map[mark.id] = 'auto';
      }
    });
    return map;
  });
  const [imageAssets, setImageAssets] = useState<Record<string, BrandAsset | null>>({});
  const [imagePrompts, setImagePrompts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    initialMarksSource.forEach(mark => {
        if (mark.type === 'image') {
            map[mark.id] = '';
        }
    });
    return map;
  });
  const [imageModes, setImageModes] = useState<Record<string, 'upload' | 'describe'>>(() => {
    const map: Record<string, 'upload' | 'describe'> = {};
    initialMarksSource.forEach(mark => {
        if (mark.type === 'image') {
            map[mark.id] = 'upload';
        }
    });
    return map;
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => buildChatMessagesForState(!!isProUser));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerationConfirmOpen, setIsGenerationConfirmOpen] = useState(false);
  const [pendingExcludedMarks, setPendingExcludedMarks] = useState<Mark[]>([]);

  const [chatPrompt, setChatPrompt] = useState('');
  const [chatAttachment, setChatAttachment] = useState<BrandAsset | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [brandColors, setBrandColors] = useState<string[]>(appUser?.brandColors ?? []);
  const projectStyleSnapshot = (project && (project as unknown as { styleSnapshot?: TemplateStyleSnapshot }).styleSnapshot) ?? null;
  const [styleSnapshot, setStyleSnapshot] = useState<TemplateStyleSnapshot | null>(projectStyleSnapshot ?? pendingTemplate?.styleSnapshot ?? null);
  const [generatedAssets, setGeneratedAssets] = useState<Record<string, HotspotAssetPlacement>>({});
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [isRenderingComposite, setIsRenderingComposite] = useState(false);

  const [isPlacingMark, setIsPlacingMark] = useState<'text' | 'image' | null>(null);
  const [hoveredMarkId, setHoveredMarkId] = useState<string | null>(null);

  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panSessionRef = useRef<{ pointerId: number; start: { x: number; y: number }; origin: { x: number; y: number } } | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const canvasContentRef = useRef<HTMLDivElement | null>(null);

  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);

  const [showHotspotOverlay, setShowHotspotOverlay] = useState(true);
  const [isDrawingMark, setIsDrawingMark] = useState(false);
  const [draftMark, setDraftMark] = useState<Mark | null>(null);

  const [basePrompt, setBasePrompt] = useState(initialPrompt);
  const [templateImageUrl, setTemplateImageUrl] = useState(initialTemplateImageUrl);
  const [, setTemplateId] = useState(initialTemplateId);
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(project?.id ?? null);
  const [initialProjectName, setInitialProjectName] = useState(initialName);
  const templateRef = useRef<UITemplate | null>(pendingTemplate);
  const lastHydratedRef = useRef<{ projectId: string | null; templateId: string | null }>({
    projectId: project?.id ?? null,
    templateId: project ? null : (pendingTemplate?.id ?? null)
  });
  const baseStyleImageRef = useRef<string>(history[0]?.imageUrl ?? initialTemplateImageUrl);
  const styleSnapshotPromiseRef = useRef<Promise<TemplateStyleSnapshot> | null>(null);
  const templateImageDataRef = useRef<{ base64: string; mimeType: string; width: number; height: number } | null>(null);
  const templateImageElementRef = useRef<HTMLImageElement | null>(null);

  const originalMarks = useMemo(() => project?.initialMarks ?? pendingTemplate?.initialMarks ?? [], [project, pendingTemplate]);
  const originalMarksMap = useMemo(() => {
    const map: Record<string, Mark> = {};
    originalMarks.forEach(mark => {
        map[mark.id] = mark;
    });
    return map;
  }, [originalMarks]);

  const updateMarkLabel = useCallback((markId: string, nextLabel: string) => {
    setMarks(prev => prev.map(mark => {
      if (mark.id !== markId) return mark;
      const nextMarkBase: Mark = { ...mark, label: nextLabel };
      if (mark.type !== 'text') {
        return nextMarkBase;
      }
      const previousInferred = inferTypographyRoleFromLabel(mark.label ?? '');
      const hasManualRole = !!mark.typographyRole && mark.typographyRole !== previousInferred;
      if (hasManualRole) {
        return nextMarkBase;
      }
      const nextInferred = inferTypographyRoleFromLabel(nextLabel);
      if (nextInferred) {
        return { ...nextMarkBase, typographyRole: nextInferred };
      }
      const { typographyRole: _removed, ...rest } = nextMarkBase;
      return rest;
    }));
  }, []);

  const updateMarkTypographyRole = useCallback((markId: string, nextRole: TypographyRole | '') => {
    setMarks(prev => prev.map(mark => {
      if (mark.id !== markId) return mark;
      if (!nextRole) {
        const { typographyRole, ...rest } = mark;
        return rest;
      }
      return { ...mark, typographyRole: nextRole };
    }));
  }, []);

  const canEnableMark = useCallback((markId: string, overrides?: {
    label?: string;
    text?: string;
    asset?: BrandAsset | null;
    prompt?: string;
    mode?: 'upload' | 'describe';
  }) => {
    const mark = marks.find(m => m.id === markId);
    if (!mark) return false;

    const labelRaw = overrides?.label !== undefined ? overrides.label ?? '' : mark.label ?? '';
    const labelTrimmed = labelRaw.trim();
    if (!labelTrimmed || labelTrimmed === DEFAULT_HOTSPOT_LABEL[mark.type]) {
      return false;
    }

    if (mark.type === 'text') {
      const textRaw = overrides?.text !== undefined ? overrides.text ?? '' : textFields[markId] ?? '';
      const trimmed = textRaw.trim();
      if (!trimmed) return false;
      const originalTrimmed = (originalMarksMap[markId]?.text ?? '').trim();
      if (!mark.isNew && originalTrimmed && trimmed === originalTrimmed) {
        return false;
      }
      return true;
    }

    const modeValue = overrides?.mode ?? imageModes[markId] ?? 'upload';
    if (modeValue === 'upload') {
      const assetValue = overrides?.asset !== undefined ? overrides.asset : imageAssets[markId] ?? null;
      return !!assetValue;
    }

    const promptRaw = overrides?.prompt !== undefined ? overrides.prompt ?? '' : imagePrompts[markId] ?? '';
    return promptRaw.trim().length > 0;
  }, [marks, textFields, imageAssets, imagePrompts, imageModes, originalMarksMap]);

  const applyMarkEnabledFromContent = useCallback((markId: string, overrides?: {
    label?: string;
    text?: string;
    asset?: BrandAsset | null;
    prompt?: string;
    mode?: 'upload' | 'describe';
  }) => {
    setEnabledMarks(prev => ({ ...prev, [markId]: canEnableMark(markId, overrides) }));
  }, [canEnableMark]);

  const applyMarksFromSource = useCallback((sourceMarks: Mark[]) => {
    const normalizedMarks = sourceMarks.map(withInferredTypographyRole);
    setMarks(normalizedMarks);
    setEnabledMarks(() => {
        const map: Record<string, boolean> = {};
        normalizedMarks.forEach(mark => {
            map[mark.id] = false;
        });
        return map;
    });
    setTextFields(() => {
        const map: Record<string, string> = {};
        normalizedMarks.forEach(mark => {
            if (mark.type === 'text') {
                map[mark.id] = mark.text || `Your ${resolveHotspotDisplayLabel(mark)} Here`;
            }
        });
        return map;
    });
    setTextLineModes(() => {
      const map: Record<string, TextLineMode> = {};
      normalizedMarks.forEach(mark => {
        if (mark.type === 'text') {
          map[mark.id] = 'auto';
        }
      });
      return map;
    });
    setImagePrompts(() => {
        const map: Record<string, string> = {};
        normalizedMarks.forEach(mark => {
            if (mark.type === 'image') {
                map[mark.id] = '';
            }
        });
        return map;
    });
    setImageModes(() => {
        const map: Record<string, 'upload' | 'describe'> = {};
        normalizedMarks.forEach(mark => {
            if (mark.type === 'image') {
                map[mark.id] = 'upload';
            }
        });
        return map;
    });
    setImageAssets({});
    setGeneratedAssets({});
  }, []);

  const toDataUrl = (base64: string, mimeType: string) => `data:${mimeType};base64,${base64}`;

  const loadImageDimensions = (base64: string, mimeType: string): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = toDataUrl(base64, mimeType);
    });

  const ensureTemplateImageData = useCallback(async () => {
    if (templateImageDataRef.current) {
      return templateImageDataRef.current;
    }
    const sourceUrl = baseStyleImageRef.current || templateImageUrl;
    if (!sourceUrl) {
      throw new Error('Template image unavailable for style sampling.');
    }
    const data = await imageUrlToBase64(sourceUrl);
    templateImageDataRef.current = data;
    return data;
  }, [templateImageUrl]);

  const ensureTemplateImageElement = useCallback(async () => {
    if (templateImageElementRef.current) {
      return templateImageElementRef.current;
    }
    const { base64, mimeType } = await ensureTemplateImageData();
    const dataUrl = toDataUrl(base64, mimeType);
    const img = await loadImageElement(dataUrl);
    templateImageElementRef.current = img;
    return img;
  }, [ensureTemplateImageData]);

  const captureHotspotCrop = useCallback(async (mark: Mark): Promise<{ base64: string; mimeType: string } | null> => {
    if (mark.type !== 'text' && mark.type !== 'image') {
      return null;
    }
    const widthNorm = mark.width ?? mark.scale ?? 0;
    const heightNorm = mark.height ?? mark.scale ?? 0;
    if (widthNorm <= 0 || heightNorm <= 0) {
      return null;
    }
    const [baseImageData, baseImageElement] = await Promise.all([
      ensureTemplateImageData(),
      ensureTemplateImageElement(),
    ]);

    const centerX = clamp(mark.x, 0, 1);
    const centerY = clamp(mark.y, 0, 1);
    const halfWidth = widthNorm / 2;
    const halfHeight = heightNorm / 2;
    const paddingX = Math.min(0.15, Math.max(widthNorm * 0.25, 0.03));
    const paddingY = Math.min(0.15, Math.max(heightNorm * 0.25, 0.03));

    const leftNorm = clamp(centerX - halfWidth - paddingX, 0, 1);
    const rightNorm = clamp(centerX + halfWidth + paddingX, leftNorm, 1);
    const topNorm = clamp(centerY - halfHeight - paddingY, 0, 1);
    const bottomNorm = clamp(centerY + halfHeight + paddingY, topNorm, 1);
    const normalizedWidth = rightNorm - leftNorm;
    const normalizedHeight = bottomNorm - topNorm;
    if (normalizedWidth <= 0 || normalizedHeight <= 0) {
      return null;
    }

    const widthPx = Math.max(4, Math.round(normalizedWidth * baseImageData.width));
    const heightPx = Math.max(4, Math.round(normalizedHeight * baseImageData.height));
    if (widthPx <= 4 || heightPx <= 4) {
      return null;
    }

    const sourceLeftPx = Math.round(leftNorm * baseImageData.width);
    const sourceTopPx = Math.round(topNorm * baseImageData.height);

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.drawImage(
      baseImageElement,
      sourceLeftPx,
      sourceTopPx,
      widthPx,
      heightPx,
      0,
      0,
      widthPx,
      heightPx
    );

    const dataUrl = canvas.toDataURL('image/png');
    const [, base64] = dataUrl.split(',');
    if (!base64) {
      return null;
    }
    return { base64, mimeType: 'image/png' };
  }, [ensureTemplateImageData, ensureTemplateImageElement]);

  const ensureStyleSnapshot = useCallback(async (): Promise<TemplateStyleSnapshot> => {
    if (styleSnapshot) {
      return styleSnapshot;
    }
    if (styleSnapshotPromiseRef.current) {
      return styleSnapshotPromiseRef.current;
    }

    styleSnapshotPromiseRef.current = (async () => {
      const sourceUrl = baseStyleImageRef.current || templateImageUrl;
      const { base64, mimeType } = await imageUrlToBase64(sourceUrl);
      const snapshot = await generateTemplateStyleSnapshot(base64, mimeType);
      setStyleSnapshot(snapshot);
      styleSnapshotPromiseRef.current = null;
      return snapshot;
    })().catch(error => {
      styleSnapshotPromiseRef.current = null;
      throw error;
    });

    return styleSnapshotPromiseRef.current;
  }, [styleSnapshot, templateImageUrl]);

  const computeAspectRatioHint = (mark: Mark): string | undefined => {
    const width = mark.width ?? mark.scale ?? 0;
    const height = mark.height ?? mark.scale ?? 0;
    if (width <= 0 || height <= 0) return undefined;
    const ratio = width / height;
    if (!Number.isFinite(ratio) || ratio <= 0) return undefined;
    if (ratio >= 1) {
      return `${ratio.toFixed(2)}:1`;
    }
    return `1:${(1 / ratio).toFixed(2)}`;
  };

  const includedMarks = useMemo(() => marks.filter(mark => enabledMarks[mark.id]), [marks, enabledMarks]);

  const readyIncludedMarks = useMemo(() => includedMarks.filter(mark => canEnableMark(mark.id)), [includedMarks, canEnableMark]);

  const missingIncludedMarks = useMemo(() => {
    const readyIds = new Set(readyIncludedMarks.map(mark => mark.id));
    return includedMarks.filter(mark => !readyIds.has(mark.id));
  }, [includedMarks, readyIncludedMarks]);

  const missingIncludedMarksCount = Math.max(0, includedMarks.length - readyIncludedMarks.length);

  const editableFields = useMemo(() => {
    return marks.map(mark => ({
      mark,
      isEnabled: !!enabledMarks[mark.id],
    }));
  }, [marks, enabledMarks]);

  const buildHotspotSummary = (mark: Mark): string => {
    const widthPercent = Math.round((mark.width ?? mark.scale ?? 0) * 100);
    const heightPercent = Math.round((mark.height ?? mark.scale ?? 0) * 100);
    const centerX = Math.round(mark.x * 100);
    const centerY = Math.round(mark.y * 100);
    return `Hotspot is roughly ${widthPercent}% of the canvas width by ${heightPercent}% of the height, centered around ${centerX}% across and ${centerY}% down.`;
  };

  const focusHotspot = useCallback((markId: string) => {
    setShowHotspotOverlay(true);
    setIsPlacingMark(null);
    lastFocusedHotspotIdRef.current = markId;
    setActiveHotspotId(markId);
  }, [setActiveHotspotId, setIsPlacingMark, setShowHotspotOverlay]);

  const getAssetDisplayMetrics = (asset: HotspotAssetPlacement) => {
    const widthPercent = clamp(asset.baseWidthPercent * asset.scale, 2, 400);
    let heightPercent = widthPercent / (asset.aspectRatio || 1);
    if (!Number.isFinite(heightPercent) || heightPercent <= 0) {
      heightPercent = widthPercent;
    }
    return { widthPercent, heightPercent };
  };

  const getAssetPlacementRect = useCallback((asset: HotspotAssetPlacement, canvasWidth: number, canvasHeight: number) => {
    if (canvasWidth <= 0 || canvasHeight <= 0) {
      return null;
    }
    const { widthPercent, heightPercent } = getAssetDisplayMetrics(asset);
    const widthPx = (widthPercent / 100) * canvasWidth;
    const heightPx = (heightPercent / 100) * canvasHeight;
    if (widthPx <= 0 || heightPx <= 0) {
      return null;
    }
    const centerX = clamp(asset.center.x, 0, 1) * canvasWidth;
    const centerY = clamp(asset.center.y, 0, 1) * canvasHeight;
    return {
      widthPx,
      heightPx,
      centerX,
      centerY,
      leftPx: centerX - widthPx / 2,
      topPx: centerY - heightPx / 2,
    };
  }, [getAssetDisplayMetrics]);

  const computeInitialWidthPercent = (mark: Mark, scaleHint = 0.85) => {
    const normalized = mark.width ?? mark.scale ?? 0;
    if (normalized > 0) {
      return clamp(normalized * 100 * scaleHint, 5, 100);
    }
    return clamp(30 * scaleHint, 5, 80);
  };

  const getAssetSignature = useCallback((mark: Mark): string | null => {
    if (mark.type === 'text') {
      const text = (textFields[mark.id] ?? '').trim();
      if (!text) {
        return null;
      }
      const lineMode = textLineModes[mark.id] ?? 'auto';
      return `text:${lineMode}:${text}`;
    }
    const mode = imageModes[mark.id] || 'upload';
    if (mode === 'upload') {
      const asset = imageAssets[mark.id];
      return asset?.base64 ? `upload:${asset.base64}` : null;
    }
    const prompt = (imagePrompts[mark.id] ?? '').trim();
    return prompt ? `describe:${prompt}` : null;
  }, [textFields, textLineModes, imageModes, imageAssets, imagePrompts]);

  const updateAssetPlacement = useCallback((markId: string, updates: Partial<HotspotAssetPlacement> | ((current: HotspotAssetPlacement) => Partial<HotspotAssetPlacement> | null)) => {
    setGeneratedAssets(prev => {
      const current = prev[markId];
      if (!current) return prev;
      const nextPatch = typeof updates === 'function' ? updates(current) : updates;
      if (!nextPatch) return prev;
      return { ...prev, [markId]: { ...current, ...nextPatch } };
    });
  }, []);

  const removeAsset = useCallback((markId: string) => {
    setGeneratedAssets(prev => {
      if (!prev[markId]) return prev;
      const next = { ...prev };
      delete next[markId];
      return next;
    });
  }, []);

  const mentionTokens = useMemo(() => {
    return marks.map(mark => ({
        id: mark.id,
        label: resolveHotspotDisplayLabel(mark),
        type: mark.type,
        isIncluded: !!enabledMarks[mark.id]
    }));
  }, [marks, enabledMarks]);

  useEffect(() => {
    setGeneratedAssets(prev => {
      let changed = false;
      const next = { ...prev } as Record<string, HotspotAssetPlacement>;
      Object.values(prev).forEach(asset => {
        const mark = marks.find(m => m.id === asset.markId);
        if (!mark) {
          delete next[asset.markId];
          changed = true;
          return;
        }
        if (!mark.isNew) {
          return;
        }
        const signature = getAssetSignature(mark);
        if (!signature || signature !== asset.signature) {
          delete next[asset.markId];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [marks, getAssetSignature]);

  useEffect(() => {
    setTextLineModes(prev => {
      let changed = false;
      const next: Record<string, TextLineMode> = { ...prev };
      Object.keys(next).forEach(markId => {
        const mark = marks.find(m => m.id === markId && m.type === 'text');
        if (!mark) {
          delete next[markId];
          changed = true;
        }
      });
      marks.forEach(mark => {
        if (mark.type === 'text' && next[mark.id] === undefined) {
          next[mark.id] = 'auto';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [marks]);

  useEffect(() => {
    templateImageDataRef.current = null;
    templateImageElementRef.current = null;
  }, [templateImageUrl]);

  const [mentionSuggestions, setMentionSuggestions] = useState<{ id: string; label: string; type: string; isIncluded: boolean }[]>([]);
  const [, setMentionQuery] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState<{ x: number; y: number } | null>(null);
  const mentionTrackingRef = useRef<{ start: number; end: number } | null>(null);

  const closeMentionSuggestions = useCallback(() => {
    setMentionSuggestions([]);
    setMentionQuery('');
    mentionTrackingRef.current = null;
    setMentionAnchor(null);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const imagePreviewRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);
  const [imageBounds, setImageBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const nameInputRef = useRef<HTMLInputElement>(null);
  const chatTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const canvasHotspotRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastFocusedHotspotIdRef = useRef<string | null>(null);
  const drawStartRef = useRef<{ x: number; y: number; id: string; label: string } | null>(null);
  const drawerLabelInputRef = useRef<HTMLInputElement | null>(null);
  const drawerIncludeButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const assetDragRef = useRef<{
    assetId: string;
    pointerId: number;
    containerRect: { left: number; top: number; width: number; height: number };
    startCenter: { x: number; y: number };
    startPointer: { x: number; y: number };
    widthPercent: number;
    heightPercent: number;
  } | null>(null);

  const handleAssetPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, asset: HotspotAssetPlacement) => {
    event.preventDefault();
    event.stopPropagation();
    if (imageBounds.width <= 0 || imageBounds.height <= 0) return;
    setActiveAssetId(asset.markId);
    const { widthPercent, heightPercent } = getAssetDisplayMetrics(asset);
    assetDragRef.current = {
      assetId: asset.markId,
      pointerId: event.pointerId,
      containerRect: { ...imageBounds },
      startCenter: { ...asset.center },
      startPointer: { x: event.clientX, y: event.clientY },
      widthPercent,
      heightPercent,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [getAssetDisplayMetrics, imageBounds]);

  const handleAssetPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = assetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const { containerRect, startPointer, startCenter, widthPercent, heightPercent, assetId } = drag;
    if (containerRect.width === 0 || containerRect.height === 0) {
      return;
    }
    const deltaXFraction = (event.clientX - startPointer.x) / containerRect.width;
    const deltaYFraction = (event.clientY - startPointer.y) / containerRect.height;
    const widthFraction = clamp(widthPercent / 100, 0, 4);
    const heightFraction = clamp(heightPercent / 100, 0, 4);
    const minX = widthFraction / 2;
    const maxX = 1 - minX;
    const minY = heightFraction / 2;
    const maxY = 1 - minY;
    const nextCenterX = clamp(startCenter.x + deltaXFraction, minX, maxX);
    const nextCenterY = clamp(startCenter.y + deltaYFraction, minY, maxY);
    updateAssetPlacement(assetId, { center: { x: nextCenterX, y: nextCenterY } });
  }, [updateAssetPlacement]);

  const handleAssetPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = assetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    assetDragRef.current = null;
  }, []);

  const updateImageBounds = useCallback(() => {
    if (!imagePreviewRef.current || !imageElementRef.current) return;
    const containerRect = imagePreviewRef.current.getBoundingClientRect();
    const imageRect = imageElementRef.current.getBoundingClientRect();
    setImageBounds({
      left: imageRect.left - containerRect.left,
      top: imageRect.top - containerRect.top,
      width: imageRect.width,
      height: imageRect.height,
    });
  }, []);

  const activeImage = history[activeIndex];
  const activeImageUrl = activeImage?.imageUrl || templateImageUrl;
  const overlaysPresent = Object.keys(generatedAssets).length > 0;
  const canDownloadActiveImage = !!activeImage && (activeIndex > 0 || overlaysPresent);
  const activeMark = useMemo(() => {
    if (!activeHotspotId) return null;
    return marks.find(m => m.id === activeHotspotId) || null;
  }, [activeHotspotId, marks]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateImageBounds());
    return () => cancelAnimationFrame(frame);
  }, [activeImageUrl, updateImageBounds]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateImageBounds());
    return () => cancelAnimationFrame(frame);
  }, [canvasScale, canvasOffset.x, canvasOffset.y, updateImageBounds]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateImageBounds());
    window.addEventListener('resize', updateImageBounds);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && imagePreviewRef.current) {
      observer = new ResizeObserver(() => updateImageBounds());
      observer.observe(imagePreviewRef.current);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateImageBounds);
      observer?.disconnect();
    };
  }, [updateImageBounds]);

  const hydrateFromTemplate = useCallback((template: UITemplate) => {
    const templateHistory: GeneratedImage[] = [{ id: template.id, imageUrl: template.imageUrl, prompt: 'Original Template' }];
    setHistory(templateHistory);
    setActiveIndex(templateHistory.length - 1);
    const name = template.title ?? 'Untitled Project';
    setProjectName(name);
    setInitialProjectName(name);
    setIsEditingName(false);
    applyMarksFromSource(template.initialMarks ?? []);
    setBasePrompt(template.prompt ?? '');
    setTemplateImageUrl(template.imageUrl);
    setTemplateId(template.id);
    setPersistedProjectId(null);
    templateRef.current = template;
    setIsChatDrawerOpen(false);
    hasMountedRef.current = false;
    setChatPrompt('');
    setChatAttachment(null);
    setInvalidMentions([]);
    closeMentionSuggestions();
    setActiveHotspotId(null);
    setHoveredMarkId(null);
    setIsPlacingMark(null);
    setChatMessages(buildChatMessagesForState(!!isProUser));
    lastHydratedRef.current = { projectId: null, templateId: template.id };
  }, [applyMarksFromSource, closeMentionSuggestions, isProUser]);

  const hydrateFromProject = useCallback((source: Project) => {
    const projectHistory: GeneratedImage[] = source.history && source.history.length > 0
        ? source.history
        : [{ id: source.templateId, imageUrl: source.templateImageUrl, prompt: 'Original Template' }];
    setHistory(projectHistory);
    setActiveIndex(Math.max(projectHistory.length - 1, 0));
    const name = source.name ?? 'Untitled Project';
    setProjectName(name);
    setInitialProjectName(name);
    setIsEditingName(false);
    applyMarksFromSource(source.initialMarks ?? []);
    setBasePrompt(source.basePrompt ?? '');
    setTemplateImageUrl(source.templateImageUrl ?? '');
    setTemplateId(source.templateId ?? '');
    setPersistedProjectId(source.id);
    templateRef.current = null;
    setIsChatDrawerOpen(false);
    hasMountedRef.current = false;
    setChatPrompt('');
    setChatAttachment(null);
    setInvalidMentions([]);
    closeMentionSuggestions();
    setActiveHotspotId(null);
    setHoveredMarkId(null);
    setIsPlacingMark(null);
    setChatMessages(buildChatMessagesForState(!!isProUser));
    lastHydratedRef.current = { projectId: source.id, templateId: null };
  }, [applyMarksFromSource, closeMentionSuggestions, isProUser]);

  useEffect(() => {
    if (appUser?.brandColors && appUser.brandColors.length > 0) {
        setBrandColors(appUser.brandColors);
    }
  }, [appUser?.brandColors?.join(',')]);

  useEffect(() => {
    if (pendingTemplate) {
        templateRef.current = pendingTemplate;
    }
  }, [pendingTemplate]);

  useEffect(() => {
    const currentProjectId = project?.id ?? null;
    const currentTemplateId = project ? null : (pendingTemplate?.id ?? null);

    if (currentProjectId && currentProjectId !== lastHydratedRef.current.projectId && project) {
        hydrateFromProject(project);
    } else if (!currentProjectId && currentTemplateId && currentTemplateId !== lastHydratedRef.current.templateId && pendingTemplate) {
        hydrateFromTemplate(pendingTemplate);
    }
  }, [project, pendingTemplate, hydrateFromProject, hydrateFromTemplate]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isGenerating]);

  
  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (activeHotspotId) {
        setHoveredMarkId(activeHotspotId);
    }
  }, [activeHotspotId]);

  useEffect(() => {
    if (!activeMark) return;
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setActiveHotspotId(null);
        }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMark]);

  useEffect(() => {
    if (!activeMark) {
        drawerLabelInputRef.current = null;
        drawerIncludeButtonRef.current = null;
        drawerTextAreaRef.current = null;
        return;
    }

    const labelInput = drawerLabelInputRef.current;
    if (isHotspotLabelPending(activeMark)) {
        labelInput?.focus();
        return;
    }

    if (labelInput && document.activeElement === labelInput) {
        return;
    }

    const activeMode = imageModes[activeMark.id] || 'upload';
    if (activeMark.type === 'text' || (activeMark.type === 'image' && activeMode === 'describe')) {
        drawerTextAreaRef.current?.focus();
    } else {
        drawerIncludeButtonRef.current?.focus();
    }
  }, [activeMark, imageModes]);

  useEffect(() => {
    if (!activeHotspotId && lastFocusedHotspotIdRef.current) {
        const ref = canvasHotspotRefs.current[lastFocusedHotspotIdRef.current];
        ref?.focus();
        lastFocusedHotspotIdRef.current = null;
    }
  }, [activeHotspotId]);

  const ensureProjectPersisted = useCallback(async (updatedHistory: GeneratedImage[]) => {
    if (!appUser) return null;
    if (persistedProjectId) {
        await updateProjectHistory(persistedProjectId, updatedHistory);
        return persistedProjectId;
    }
    const templateForProject = templateRef.current;
    if (!templateForProject) return null;
    try {
        const createdProject = await createProject(appUser.id, templateForProject);
        const effectiveProject: Project = { ...createdProject, name: projectName, history: updatedHistory };
        setPersistedProjectId(createdProject.id);
        setTemplateId(createdProject.templateId);
        setTemplateImageUrl(createdProject.templateImageUrl);
        setBasePrompt(createdProject.basePrompt);
        setInitialProjectName(projectName);
        templateRef.current = null;
        lastHydratedRef.current = { projectId: createdProject.id, templateId: null };
        onProjectPersisted?.(effectiveProject);
        await updateProjectHistory(createdProject.id, updatedHistory);
        if (projectName && projectName !== createdProject.name) {
            await updateProjectName(createdProject.id, projectName);
        }
        return createdProject.id;
    } catch (error) {
        console.error('Failed to persist project:', error);
        return null;
    }
  }, [appUser, persistedProjectId, onProjectPersisted, projectName]);

  const executeGeneration = useCallback(async () => {
    if (!appUser) return;
    setIsGenerationConfirmOpen(false);
    setPendingExcludedMarks([]);
    setIsGenerating(true);
    setIsChatDrawerOpen(true);
    setChatMessages(prev => prev.filter(m => m.type !== 'error'));

    const readyMarks = readyIncludedMarks;
    if (readyMarks.length === 0) {
      const infoMessage: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: 'Select and fill at least one hotspot before generating.',
      };
      setChatMessages(prev => [...prev, infoMessage]);
      setIsGenerating(false);
      return;
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      type: 'text',
      text: 'Generate the creative with the hotspots I selected.'
    };
    setChatMessages(prev => {
      const withoutTip = prev.filter(m => m.id !== 'msg-tip');
      return [...withoutTip, userMessage];
    });

    try {
      const { base64: templateBase64, mimeType: templateMimeType, width: templateWidth, height: templateHeight } = await imageUrlToBase64(templateImageUrl);

      const existingMarks = readyMarks.filter(mark => !mark.isNew);

      const overlayTextMarks = readyMarks.filter(mark => {
        if (mark.type !== 'text' || !mark.isNew) {
          return false;
        }
        const nextText = (textFields[mark.id] ?? '').trim();
        return nextText.length > 0;
      });
      const overlayTextMarkIdSet = new Set(overlayTextMarks.map(mark => mark.id));
      const existingOverlayTextMarkIds: string[] = [];

      const updates: string[] = [];
      let latestBaseImageUrl = templateImageUrl;

      if (existingMarks.length > 0) {
        const enabledForGeneration: Record<string, boolean> = {};
        const existingIds = new Set(existingMarks.map(mark => mark.id));
        marks.forEach(mark => {
          enabledForGeneration[mark.id] = existingIds.has(mark.id);
        });

        const resultBase64 = await generateCreative(
          templateBase64,
          templateMimeType,
          basePrompt,
          textFields,
          imageAssets,
          imagePrompts,
          imageModes,
          enabledForGeneration,
          marks,
          originalMarks,
          {
            canvasDimensions: { width: templateWidth, height: templateHeight },
            overlayTextMarkIds: existingOverlayTextMarkIds,
          }
        );

        const imageBlob = base64ToBlob(resultBase64, 'image/png');
        const newImageUrl = await uploadFileToStorage(imageBlob, `projects/${appUser.id}/generated`);

        const newCreative: GeneratedImage = {
          id: `gen-${Date.now()}`,
          imageUrl: newImageUrl,
          prompt: basePrompt,
        };

        const updatedHistory = [...history, newCreative];
        setHistory(updatedHistory);
        setActiveIndex(updatedHistory.length - 1);
        await ensureProjectPersisted(updatedHistory);
        latestBaseImageUrl = newImageUrl;

        updates.push(existingMarks.length > 1
          ? 'Updated the template with multiple hotspot edits.'
          : `Updated ${resolveHotspotDisplayLabel(existingMarks[0])}.`);
      }

      const marksNeedingAssets = readyMarks.filter(mark => {
        const signature = getAssetSignature(mark);
        if (!signature) {
          return false;
        }

        if (mark.type === 'text') {
          if (!overlayTextMarkIdSet.has(mark.id)) {
            return false;
          }
        } else if (!mark.isNew) {
          return false;
        }

        const existingPlacement = generatedAssets[mark.id];
        return !existingPlacement || existingPlacement.signature !== signature;
      });

      if (marksNeedingAssets.length > 0) {
        const snapshot = await ensureStyleSnapshot();
        const placementUpdates: Record<string, HotspotAssetPlacement> = {};

        for (const mark of marksNeedingAssets) {
          const signature = getAssetSignature(mark);
          if (!signature) {
            continue;
          }

          if (mark.type === 'text') {
            const textContent = (textFields[mark.id] ?? '').trim();
            const lineBreakPreference = textLineModes[mark.id] ?? 'auto';
            const typographyStyle = mark.typographyRole
              ? snapshot.typography.find(style => style.role === mark.typographyRole)
              : undefined;
            const inferredRole = inferTypographyRoleFromLabel(mark.label ?? '') ?? undefined;
            const typographyRoleHint = mark.typographyRole ?? inferredRole;
            const hotspotCrop = await captureHotspotCrop(mark);
            const asset = await generateHotspotAsset({
              styleSnapshot: snapshot,
              intent: 'text',
              hotspotLabel: resolveHotspotDisplayLabel(mark),
              textContent,
              placementSummary: buildHotspotSummary(mark),
              brandColors: brandColors.length > 0 ? brandColors : undefined,
              aspectRatioHint: computeAspectRatioHint(mark),
              sizeHint: {
                widthPx: Math.round((mark.width ?? mark.scale ?? 0) * templateWidth),
                heightPx: Math.round((mark.height ?? mark.scale ?? 0) * templateHeight),
                aspectRatio: (() => {
                  const widthNorm = mark.width ?? mark.scale ?? 0;
                  const heightNorm = mark.height ?? mark.scale ?? 0;
                  if (widthNorm <= 0 || heightNorm <= 0) return undefined;
                  const ratio = widthNorm / heightNorm;
                  return Number.isFinite(ratio) && ratio > 0 ? ratio.toFixed(3) : undefined;
                })(),
              },
              typographyStyle,
              typographyRoleHint,
              hotspotCrop: hotspotCrop ?? undefined,
              lineBreakPreference,
            });
            const prepared = await prepareOverlayAsset({
              base64: asset.base64,
              mimeType: asset.mimeType,
              enforceTransparency: true,
            });

            if (!prepared.hasAlpha) {
              throw new Error(`Unable to create a transparent overlay for ${resolveHotspotDisplayLabel(mark)}. Try adjusting the prompt or retry.`);
            }

            placementUpdates[mark.id] = {
              markId: mark.id,
              label: resolveHotspotDisplayLabel(mark),
              base64: prepared.base64,
              mimeType: prepared.mimeType,
              hasAlpha: prepared.hasAlpha,
              imageUrl: toDataUrl(prepared.base64, prepared.mimeType),
              aspectRatio: prepared.width > 0 && prepared.height > 0 ? prepared.width / prepared.height : 1,
              center: { x: clamp(mark.x, 0, 1), y: clamp(mark.y, 0, 1) },
              scale: 1,
              baseWidthPercent: computeInitialWidthPercent(mark, 0.9),
              signature,
              origin: 'ai-generated',
            };
            continue;
          }

          const mode = imageModes[mark.id] || 'upload';
          if (mode === 'upload') {
            const asset = imageAssets[mark.id];
            if (!asset) {
              continue;
            }
            const dims = await loadImageDimensions(asset.base64, asset.file.type);
            placementUpdates[mark.id] = {
              markId: mark.id,
              label: resolveHotspotDisplayLabel(mark),
              base64: asset.base64,
              mimeType: asset.file.type,
              hasAlpha: asset.file.type.includes('png'),
              imageUrl: asset.previewUrl,
              aspectRatio: dims.width > 0 && dims.height > 0 ? dims.width / dims.height : 1,
              center: { x: clamp(mark.x, 0, 1), y: clamp(mark.y, 0, 1) },
              scale: 1,
              baseWidthPercent: computeInitialWidthPercent(mark, 0.95),
              signature,
              origin: 'user-upload',
            };
          } else {
            const prompt = (imagePrompts[mark.id] ?? '').trim();
            const hotspotCrop = await captureHotspotCrop(mark);
            const asset = await generateHotspotAsset({
              styleSnapshot: snapshot,
              intent: 'image',
              hotspotLabel: resolveHotspotDisplayLabel(mark),
              description: prompt,
              placementSummary: buildHotspotSummary(mark),
              brandColors: brandColors.length > 0 ? brandColors : undefined,
              aspectRatioHint: computeAspectRatioHint(mark),
              sizeHint: {
                widthPx: Math.round((mark.width ?? mark.scale ?? 0) * templateWidth),
                heightPx: Math.round((mark.height ?? mark.scale ?? 0) * templateHeight),
              },
              hotspotCrop: hotspotCrop ?? undefined,
            });
            const prepared = await prepareOverlayAsset({
              base64: asset.base64,
              mimeType: asset.mimeType,
              enforceTransparency: true,
            });

            if (!prepared.hasAlpha) {
              throw new Error(`Unable to create a transparent overlay for ${resolveHotspotDisplayLabel(mark)}. Try adjusting the prompt or retry.`);
            }

            placementUpdates[mark.id] = {
              markId: mark.id,
              label: resolveHotspotDisplayLabel(mark),
              base64: prepared.base64,
              mimeType: prepared.mimeType,
              hasAlpha: prepared.hasAlpha,
              imageUrl: toDataUrl(prepared.base64, prepared.mimeType),
              aspectRatio: prepared.width > 0 && prepared.height > 0 ? prepared.width / prepared.height : 1,
              center: { x: clamp(mark.x, 0, 1), y: clamp(mark.y, 0, 1) },
              scale: 1,
              baseWidthPercent: computeInitialWidthPercent(mark, 0.75),
              signature,
              origin: 'ai-generated',
            };
          }
        }

        if (Object.keys(placementUpdates).length > 0) {
          setGeneratedAssets(prev => ({ ...prev, ...placementUpdates }));
          const lastGenerated = marksNeedingAssets[marksNeedingAssets.length - 1];
          setActiveHotspotId(lastGenerated.id);
          setActiveAssetId(lastGenerated.id);
          setShowHotspotOverlay(true);
          updates.push(`Prepared draggable asset${marksNeedingAssets.length > 1 ? 's' : ''} for ${marksNeedingAssets.length} hotspot${marksNeedingAssets.length > 1 ? 's' : ''}.`);
        }
      }

      const assistantMessage: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: updates.length > 0
          ? `${updates.join(' ')}${marksNeedingAssets.length > 0 ? ' Drag the overlays into place and press “Render final creative” once you are happy.' : ''}`
          : 'No changes were generated—double-check your hotspots and try again.',
      };
      setChatMessages(prev => [...prev, assistantMessage]);

      baseStyleImageRef.current = latestBaseImageUrl;
      templateImageDataRef.current = null;
      templateImageElementRef.current = null;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during generation.';
      const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'assistant', type: 'error', text: errorMessage };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  }, [
    appUser,
    readyIncludedMarks,
    ensureProjectPersisted,
    templateImageUrl,
    basePrompt,
    textFields,
    imageAssets,
    imagePrompts,
    imageModes,
    marks,
    originalMarks,
    originalMarksMap,
    history,
    getAssetSignature,
    generatedAssets,
    ensureStyleSnapshot,
    brandColors,
    buildHotspotSummary,
    computeAspectRatioHint,
    captureHotspotCrop,
  ]);

  const handleGenerateClick = useCallback(() => {
    if (isGenerating || isDemoMode) return;
    const excluded = marks.filter(mark => !enabledMarks[mark.id]);
    if (excluded.length > 0) {
        setPendingExcludedMarks(excluded);
        setIsGenerationConfirmOpen(true);
        return;
    }
    executeGeneration();
  }, [isGenerating, isDemoMode, marks, enabledMarks, executeGeneration]);

  const composeOverlayImage = useCallback(async () => {
    const assetEntries = Object.values(generatedAssets);
    if (assetEntries.length === 0) {
      throw new Error('Nothing to render—generate or adjust hotspot overlays first.');
    }

    const baseImageRecord = history[activeIndex] ?? history[history.length - 1];
    const baseImageUrl = baseImageRecord?.imageUrl ?? templateImageUrl;
    const { base64, mimeType, width, height } = await imageUrlToBase64(baseImageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to obtain canvas context.');
    }

    const baseImage = await loadImageElement(toDataUrl(base64, mimeType));
    ctx.drawImage(baseImage, 0, 0, width, height);

    for (const asset of assetEntries) {
      const placement = getAssetPlacementRect(asset, width, height);
      if (!placement) continue;

      const assetImage = await loadImageElement(asset.imageUrl);
      ctx.drawImage(
        assetImage,
        placement.leftPx,
        placement.topPx,
        placement.widthPx,
        placement.heightPx
      );
    }

    const compositeBlob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!compositeBlob) {
      throw new Error('Failed to render composite image.');
    }

    return { blob: compositeBlob };
  }, [
    generatedAssets,
    history,
    activeIndex,
    templateImageUrl,
    getAssetPlacementRect,
  ]);

  const handleRenderComposite = useCallback(async () => {
    if (isRenderingComposite || !appUser) return;
    if (!overlaysPresent) {
      const infoMessage: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: 'Nothing to render—generate or adjust hotspot overlays first.',
      };
      setChatMessages(prev => [...prev, infoMessage]);
      return;
    }

    setIsRenderingComposite(true);
    try {
      const { blob } = await composeOverlayImage();

      const newImageUrl = await uploadFileToStorage(blob, `projects/${appUser.id}/generated`);
      const newCreative: GeneratedImage = { id: `gen-${Date.now()}`, imageUrl: newImageUrl, prompt: 'Manual overlay composite' };
      const baseHistory = history.slice(0, activeIndex + 1);
      const updatedHistory = [...baseHistory, newCreative];
      setHistory(updatedHistory);
      setActiveIndex(updatedHistory.length - 1);
      await ensureProjectPersisted(updatedHistory);

      const assistantMessage: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        type: 'text',
        text: 'Rendered a new version with your overlays applied.',
      };
      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to render the composite image.';
      const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'assistant', type: 'error', text: message };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsRenderingComposite(false);
    }
  }, [
    isRenderingComposite,
    appUser,
    overlaysPresent,
    composeOverlayImage,
    history,
    activeIndex,
    ensureProjectPersisted,
  ]);

  const handleChatEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatPrompt.trim() || isGenerating || !isProUser || !appUser) return;

    const { valid, invalid } = validateMentions(chatPrompt);
    if (invalid.length > 0) {
        setInvalidMentions(invalid);
        return;
    }

    setIsGenerating(true);
    setIsChatDrawerOpen(true);
    const isFirstGeneration = history.length === 1;
    if (isFirstGeneration) {
        setChatMessages(prev => prev.filter(m => m.id !== 'msg-tip'));
    }

    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', type: 'text', text: chatPrompt, referenceImagePreviewUrl: chatAttachment?.previewUrl };
    setChatMessages(prev => {
        const withoutTip = prev.filter(m => m.id !== 'msg-tip');
        return [...withoutTip, userMessage];
    });
    
    setChatPrompt('');
    closeMentionSuggestions();
    setChatAttachment(null);
    if(fileInputRef.current) fileInputRef.current.value = '';

    const activeImage = history[activeIndex];
    if (!activeImage) {
        setIsGenerating(false);
        return;
    }

    try {
        const { base64: baseImageBase64, mimeType: baseImageMimeType } = await imageUrlToBase64(activeImage.imageUrl);
        const referenceImage = chatAttachment ? { base64: chatAttachment.base64, mimeType: chatAttachment.file.type } : undefined;
        
        const editOptions: ChatEditOptions = { brandColors, mentions: valid };

        const editedImageBase64 = await editCreativeWithChat(
            baseImageBase64, baseImageMimeType, userMessage.text!, referenceImage, editOptions
        );
        
        const imageBlob = base64ToBlob(editedImageBase64, 'image/png');
        const newImageUrl = await uploadFileToStorage(imageBlob, `projects/${appUser.id}/generated`);

        const newCreative: GeneratedImage = { id: `gen-${Date.now()}`, imageUrl: newImageUrl, prompt: userMessage.text! };

        const baseHistory = history.slice(0, activeIndex + 1);
        const updatedHistory = [...baseHistory, newCreative];
        setHistory(updatedHistory);
        setActiveIndex(updatedHistory.length - 1);
        await ensureProjectPersisted(updatedHistory);

        const assistantMessage: ChatMessage = { id: `msg-ai-${Date.now()}`, role: 'assistant', type: 'image', text: "Here's the updated version:", generatedImageUrl: newImageUrl };
        setChatMessages(prev => [...prev, assistantMessage]);

    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during editing.';
        const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'assistant', type: 'error', text: `Sorry, I couldn't make that change. ${errorMessage}` };
        setChatMessages(prev => [...prev, errorMsg]);
    } finally {
        setIsGenerating(false);
    }
  };
  
  const handleProjectNameBlur = () => {
    setIsEditingName(false);
    if (projectName.trim() === '') {
        setProjectName(initialProjectName);
        return;
    }
    if (!persistedProjectId) {
        setInitialProjectName(projectName);
        return;
    }
    if (projectName !== initialProjectName) {
        updateProjectName(persistedProjectId, projectName);
        setInitialProjectName(projectName);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
        const file = event.target.files[0];
        const base64 = await fileToBase64(file);
        setChatAttachment({ file, previewUrl: `data:${file.type};base64,${base64}`, base64 });
    }
  };
  
  const getNormalizedPoint = (event: MouseEvent<HTMLDivElement>) => {
    if (!imageElementRef.current) return null;
    const rect = imageElementRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y))
    };
  };

  const cancelDraftMark = () => {
    setIsDrawingMark(false);
    setDraftMark(null);
    drawStartRef.current = null;
  };

  const resetPanZoom = useCallback(() => {
    setCanvasScale(1);
    setCanvasOffset({ x: 0, y: 0 });
  }, []);

  const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!(event.button === 1 || (event.button === 0 && isSpacePressed))) {
      return;
    }

    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    panSessionRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: canvasOffset.x, y: canvasOffset.y },
    };

    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }, [canvasOffset, isSpacePressed]);

  const handleCanvasPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const nextOffset = {
      x: session.origin.x + (event.clientX - session.start.x),
      y: session.origin.y + (event.clientY - session.start.y),
    };
    setCanvasOffset(nextOffset);
  }, []);

  const releasePanSession = useCallback((pointerId: number) => {
    const viewport = canvasViewportRef.current;
    if (viewport && viewport.hasPointerCapture(pointerId)) {
      viewport.releasePointerCapture(pointerId);
    }
    panSessionRef.current = null;
  }, []);

  const handleCanvasPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    releasePanSession(event.pointerId);
  }, [releasePanSession]);

  const handleCanvasPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    releasePanSession(event.pointerId);
  }, [releasePanSession]);

  const handleCanvasWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const pointer = {
      x: event.clientX - (rect.left + rect.width / 2),
      y: event.clientY - (rect.top + rect.height / 2),
    };

    const zoomFactor = event.deltaY < 0 ? 1.05 : 0.95;
    const nextScaleRaw = canvasScale * zoomFactor;
    const nextScale = clamp(nextScaleRaw, 0.25, 4);
    if (nextScale === canvasScale) {
      return;
    }

    const prevScale = canvasScale;
    setCanvasScale(nextScale);
    setCanvasOffset(prev => {
      const contentPoint = {
        x: (pointer.x - prev.x) / prevScale,
        y: (pointer.y - prev.y) / prevScale,
      };
      return {
        x: pointer.x - nextScale * contentPoint.x,
        y: pointer.y - nextScale * contentPoint.y,
      };
    });
  }, [canvasScale]);

  const handleCanvasDoubleClick = useCallback(() => {
    resetPanZoom();
  }, [resetPanZoom]);

  const handleCanvasMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!isPlacingMark) return;
    if (isSpacePressed || panSessionRef.current) return;
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest('[data-hotspot-button="true"]')) return;

    const point = getNormalizedPoint(event);
    if (!point) return;

    event.preventDefault();
    setShowHotspotOverlay(true);
    setIsDrawingMark(true);

    const label = DEFAULT_HOTSPOT_LABEL[isPlacingMark];
    const id = `${isPlacingMark}-${Date.now()}`;
    drawStartRef.current = { ...point, id, label };
    setDraftMark({
        id,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        label,
        type: isPlacingMark,
        isNew: true,
        category: 'content',
    });
  };

  const handleCanvasMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!isDrawingMark || !drawStartRef.current) return;
    if (isSpacePressed || panSessionRef.current) return;
    const current = getNormalizedPoint(event);
    if (!current) return;
    const start = drawStartRef.current;
    const minX = Math.min(start.x, current.x);
    const minY = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    setDraftMark(prev => prev ? ({
        ...prev,
        x: centerX,
        y: centerY,
        width,
        height,
    }) : prev);
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawingMark || !drawStartRef.current || !draftMark) {
        cancelDraftMark();
        return;
    }

    const width = draftMark.width ?? 0;
    const height = draftMark.height ?? 0;
    const minSize = 0.01;
    if (width < minSize || height < minSize) {
        cancelDraftMark();
        return;
    }

    const newMark: Mark = {
        ...draftMark,
        scale: Math.max(width, height),
    };

    setMarks(prev => [...prev, withInferredTypographyRole(newMark)]);
    setEnabledMarks(prev => ({ ...prev, [newMark.id]: false }));
    if (newMark.type === 'text') {
        setTextFields(prev => ({ ...prev, [newMark.id]: '' }));
        setTextLineModes(prev => ({ ...prev, [newMark.id]: 'auto' }));
    }
    if (newMark.type === 'image') {
        setImageModes(prev => ({ ...prev, [newMark.id]: 'upload' }));
        setImagePrompts(prev => ({ ...prev, [newMark.id]: '' }));
    }

    lastFocusedHotspotIdRef.current = newMark.id;
    setActiveHotspotId(newMark.id);

    cancelDraftMark();
    setIsPlacingMark(null);
  };

  const handleDownload = useCallback(async () => {
    if (!canDownloadActiveImage || !activeImage) return;
    const watermark = isProUser ? undefined : 'Made with getmycreative';

    if (overlaysPresent) {
      try {
        const { blob } = await composeOverlayImage();
        const objectUrl = URL.createObjectURL(blob);
        downloadImage(objectUrl, `creative-${activeImage.id}.png`, watermark);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to prepare download.';
        const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'assistant', type: 'error', text: message };
        setChatMessages(prev => [...prev, errorMsg]);
      }
      return;
    }

    downloadImage(activeImage.imageUrl, `creative-${activeImage.id}.png`, watermark);
  }, [
    canDownloadActiveImage,
    activeImage,
    isProUser,
    overlaysPresent,
    composeOverlayImage,
    setChatMessages,
  ]);
  const renderFloatingActions = () => {
    const disabled = isGenerating || isDemoMode || includedMarks.length === 0;
    const assetsAvailable = overlaysPresent;
    const renderDisabled = isRenderingComposite || !assetsAvailable;
    const handleChatClick = () => {
      if (!isProUser || !appUser) return;
      setIsChatDrawerOpen(true);
      drawerIncludeButtonRef.current?.focus();
    };

    return (
      <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
        <div className="flex w-full max-w-2xl items-center gap-3 rounded-full bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm sm:px-6">
          {isProUser && appUser && (
            <button
              type="button"
              onClick={handleChatClick}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-white/90"
            >
              <SparklesIcon className="h-4 w-4" /> Mention '@' to edit via chat
            </button>
          )}
          <button
            onClick={handleGenerateClick}
            disabled={disabled}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 ${
              disabled ? 'bg-emerald-500/60 text-white/80 cursor-not-allowed' : 'bg-emerald-500 text-white hover:bg-emerald-400'
            }`}
          >
            {isGenerating ? 'Generating…' : (<><SparklesIcon className="h-5 w-5" />Generate creative</>)}
          </button>
          <button
            onClick={handleRenderComposite}
            disabled={renderDisabled}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 ${
              renderDisabled ? 'bg-slate-400/60 text-white/80 cursor-not-allowed' : 'bg-slate-700 text-white hover:bg-slate-600'
            }`}
          >
            {isRenderingComposite ? 'Rendering…' : 'Render final creative'}
          </button>
        </div>
      </div>
    );
  };

  const renderHotspotDrawer = () => {
    if (!activeMark) return null;

    const markId = activeMark.id;
    const isText = activeMark.type === 'text';
    const isImage = activeMark.type === 'image';
    const isEnabled = !!enabledMarks[markId];
    const mode = imageModes[markId] || 'upload';
    const currentAsset = imageAssets[markId] || null;
    const currentPrompt = imagePrompts[markId] || '';
    const originalMark = originalMarksMap[markId];
    const originalText = originalMark?.text || '';
    const displayLabel = resolveHotspotDisplayLabel(activeMark);
    const labelPending = isHotspotLabelPending(activeMark);
    const includeReady = canEnableMark(markId);
    const generatedAsset = generatedAssets[markId];
    const assetScaleValue = generatedAsset ? Math.round(generatedAsset.scale * 100) : 100;
    const typographyRoleValue = activeMark.typographyRole ?? '';
    const lineBreakPreference = textLineModes[markId] ?? 'auto';
    const handleLineBreakChange = (mode: TextLineMode) => {
      setTextLineModes(prev => ({ ...prev, [markId]: mode }));
    };
    const lineBreakOptions: Array<{ key: TextLineMode; label: string }> = [
      { key: 'auto', label: 'Auto' },
      { key: 'single-line', label: 'Single' },
      { key: 'multi-line', label: 'Stack' },
    ];
    const lineBreakDescription = (() => {
      switch (lineBreakPreference) {
        case 'single-line':
          return 'Keep the copy on one line and prevent new line breaks unless absolutely required.';
        case 'multi-line':
          return 'Encourage the AI to stack the copy across two balanced lines when it makes sense.';
        default:
          return 'Let the AI decide. It prefers a single line unless the hotspot is tall or text needs breathing room.';
      }
    })();

    const normalizedLabel = (activeMark.label ?? '').toLowerCase();
    const textRows = normalizedLabel.includes('body') ? 4 : 2;

    const handleClose = () => setActiveHotspotId(null);
    const handleLabelChange = (value: string) => {
        updateMarkLabel(markId, value);
        applyMarkEnabledFromContent(markId, { label: value });
    };
    const toggleInclude = () => {
        setEnabledMarks(prev => {
            const current = !!prev[markId];
            if (current) {
                return { ...prev, [markId]: false };
            }
            if (!canEnableMark(markId)) {
                return prev;
            }
            return { ...prev, [markId]: true };
        });
    };
    const handleReset = () => {
        if (isText) {
            const resetValue = originalText || '';
            setTextFields(prev => ({ ...prev, [markId]: resetValue }));
            applyMarkEnabledFromContent(markId, { text: resetValue });
        } else if (isImage) {
            setImageAssets(prev => {
                const next = { ...prev };
                delete next[markId];
                return next;
            });
            setImagePrompts(prev => ({ ...prev, [markId]: '' }));
            applyMarkEnabledFromContent(markId, { asset: null, prompt: '', mode });
        } else {
            applyMarkEnabledFromContent(markId, {});
        }
    };

    const handleModeChange = (nextMode: 'upload' | 'describe') => {
        const currentAssetForMark = imageAssets[markId] ?? null;
        const currentPromptForMark = imagePrompts[markId] ?? '';
        setImageModes(prev => ({ ...prev, [markId]: nextMode }));
        if (nextMode === 'describe') {
            setImageAssets(prev => {
                const next = { ...prev };
                delete next[markId];
                return next;
            });
            applyMarkEnabledFromContent(markId, { mode: nextMode, prompt: currentPromptForMark, asset: null });
        } else {
            drawerTextAreaRef.current = null;
            applyMarkEnabledFromContent(markId, { mode: nextMode, asset: currentAssetForMark });
        }
    };

    const handleAssetUpload = (asset: BrandAsset) => {
        setImageAssets(prev => ({ ...prev, [markId]: asset }));
        setImageModes(prev => ({ ...prev, [markId]: 'upload' }));
        applyMarkEnabledFromContent(markId, { asset, mode: 'upload' });
    };

    const handleAssetClear = () => {
        setImageAssets(prev => {
            const next = { ...prev };
            delete next[markId];
            return next;
        });
        applyMarkEnabledFromContent(markId, { asset: null });
    };

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={handleClose} aria-hidden="true"></div>
            <aside className="absolute inset-y-0 right-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                    <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{isText ? 'Text hotspot' : 'Image hotspot'}</p>
                        <h3 className="text-2xl font-bold text-gray-900 font-display">{displayLabel}</h3>
                    </div>
                    <button onClick={handleClose} className="rounded-full p-2 text-gray-500 hover:bg-slate-100" aria-label="Close hotspot drawer">
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-800" htmlFor={`hotspot-label-${markId}`}>Hotspot name</label>
                        <input
                            id={`hotspot-label-${markId}`}
                            ref={drawerLabelInputRef}
                            value={activeMark.label ?? ''}
                            onChange={event => handleLabelChange(event.target.value)}
                            type="text"
                            placeholder={isText ? 'e.g. Headline' : 'e.g. Product photo'}
                            className={`w-full rounded-xl border px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${labelPending ? 'border-amber-400 bg-amber-50/60' : 'border-slate-300 bg-white'}`}
                        />
                        <p className={`text-xs ${labelPending ? 'text-amber-600' : 'text-gray-500'}`}>{labelPending ? 'Give this hotspot a clear name so the AI knows what to edit.' : 'This name is used for @mentions and generation instructions.'}</p>
                    </div>

                    {isText && (
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-800" htmlFor={`typography-role-${markId}`}>
                          Style role
                        </label>
                        <select
                          id={`typography-role-${markId}`}
                          value={typographyRoleValue}
                          onChange={event => updateMarkTypographyRole(markId, event.target.value as TypographyRole || '')}
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">Let AI infer</option>
                          {TYPOGRAPHY_ROLE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500">
                          {typographyRoleValue
                            ? TYPOGRAPHY_ROLE_OPTIONS.find(option => option.value === typographyRoleValue)?.helper
                            : 'Optional: pick the typographic role Gemini should mimic for this text.'}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div>
                            <p className="text-xs font-semibold uppercase text-gray-600">Include in next render</p>
                            <p className="text-xs text-gray-500">{isEnabled ? 'This hotspot will be considered when you generate.' : includeReady ? 'Temporarily ignore this hotspot.' : 'Name it and add content before including.'}</p>
                        </div>
                        <button
                            type="button"
                            ref={drawerIncludeButtonRef}
                            onClick={toggleInclude}
                            aria-pressed={isEnabled}
                            disabled={!includeReady && !isEnabled}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 ${isEnabled ? 'bg-emerald-100 text-emerald-700' : includeReady ? 'bg-slate-200 text-gray-600' : 'bg-slate-200/80 text-gray-400'}`}
                        >
                            {isEnabled ? 'Included' : 'Ignored'}
                        </button>
                    </div>

                    {isText && (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <span className="text-xs font-semibold uppercase text-gray-600">Line breaks</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {lineBreakOptions.map(option => (
                                      <button
                                        key={option.key}
                                        type="button"
                                        onClick={() => handleLineBreakChange(option.key)}
                                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                          lineBreakPreference === option.key
                                            ? 'bg-emerald-600 text-white shadow'
                                            : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500">{lineBreakDescription}</p>
                            </div>
                            <label className="text-sm font-semibold text-gray-800" htmlFor={`hotspot-text-${markId}`}>Replacement copy</label>
                            <textarea
                                id={`hotspot-text-${markId}`}
                                ref={drawerTextAreaRef}
                                value={textFields[markId] || ''}
                                onChange={e => {
                                    const nextValue = e.target.value;
                                    setTextFields(prev => ({ ...prev, [markId]: nextValue }));
                                    applyMarkEnabledFromContent(markId, { text: nextValue });
                                }}
                                rows={textRows}
                                placeholder="Enter the text you want to appear in this spot"
                                className="w-full rounded-xl border border-slate-300 py-3 px-4 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            {originalText && (
                                <p className="text-xs text-gray-500">Template copy: “{originalText}”</p>
                            )}
                            <div className="flex items-center justify-between">
                                <button type="button" onClick={handleReset} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                                    Reset to template copy
                                </button>
                                <button type="button" onClick={handleClose} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                                    Done
                                </button>
                            </div>
                        </div>
                    )}

                    {isImage && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                                <button
                                    type="button"
                                    onClick={() => handleModeChange('upload')}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'upload' ? 'bg-white text-emerald-700 shadow' : 'text-gray-600 hover:bg-white/80'}`}
                                >
                                    Upload image
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleModeChange('describe')}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'describe' ? 'bg-white text-emerald-700 shadow' : 'text-gray-600 hover:bg-white/80'}`}
                                >
                                    Describe image
                                </button>
                            </div>

                            {mode === 'upload' ? (
                                <FileUploader
                                    title={activeMark.label}
                                    onFileUpload={handleAssetUpload}
                                    asset={currentAsset}
                                    onClear={handleAssetClear}
                                />
                            ) : (
                                <div className="space-y-2">
                                    <textarea
                                        ref={drawerTextAreaRef as MutableRefObject<HTMLTextAreaElement | null>}
                                        value={currentPrompt}
                                        onChange={e => {
                                            const nextValue = e.target.value;
                                            setImagePrompts(prev => ({ ...prev, [markId]: nextValue }));
                                            applyMarkEnabledFromContent(markId, { prompt: nextValue, mode: 'describe' });
                                        }}
                                        rows={4}
                                        placeholder="Describe the image you want here (colors, subject, style, lighting, etc.)"
                                        className="w-full rounded-xl border border-slate-300 py-3 px-4 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                    <p className="text-xs text-gray-500">We’ll generate (or swap in) an image that matches this description.</p>
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <button type="button" onClick={handleReset} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                                    Reset to template artwork
                                </button>
                                <button type="button" onClick={handleClose} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                                    Done
                                </button>
                            </div>
                        </div>
                    )}

                    {generatedAsset && (
                        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-emerald-900">Overlay asset ready</p>
                                <button
                                    type="button"
                                    onClick={() => removeAsset(markId)}
                                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                                >
                                    Remove
                                </button>
                            </div>
                            <img
                                src={generatedAsset.imageUrl}
                                alt={`${displayLabel} overlay preview`}
                                className="w-full rounded-lg border border-emerald-100 bg-white p-2 shadow-sm"
                            />
                            <div className="space-y-2">
                                <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                    <span>Scale</span>
                                    <span className="font-mono text-emerald-900">{(generatedAsset.scale * 100).toFixed(0)}%</span>
                                </label>
                                <input
                                    type="range"
                                    min={40}
                                    max={160}
                                    value={assetScaleValue}
                                    onChange={event => {
                                        const nextValue = Number(event.target.value);
                                        const nextScale = clamp(nextValue / 100, 0.4, 2);
                                        updateAssetPlacement(markId, { scale: nextScale });
                                    }}
                                    className="w-full accent-emerald-600"
                                />
                                <p className="text-xs text-emerald-900">Drag the overlay on the canvas to reposition. Use the slider to resize without losing proportions.</p>
                            </div>
                            <div className="flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => updateAssetPlacement(markId, { center: { x: clamp(activeMark.x, 0, 1), y: clamp(activeMark.y, 0, 1) }, scale: 1 })}
                                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                                >
                                    Reset placement
                                </button>
                                <span className="text-xs text-emerald-800">Export via “Render final creative”.</span>
                            </div>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
  };

  const renderGenerationConfirm = () => {
    if (!isGenerationConfirmOpen || pendingExcludedMarks.length === 0) return null;

    const handleClose = () => {
        setIsGenerationConfirmOpen(false);
        setPendingExcludedMarks([]);
    };

    const handleIncludeAll = () => {
        setEnabledMarks(prev => {
            const next = { ...prev };
            pendingExcludedMarks.forEach(mark => {
                next[mark.id] = true;
            });
            return next;
        });
        setPendingExcludedMarks([]);
        setIsGenerationConfirmOpen(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
            <div className="absolute inset-0 bg-black/40" onClick={handleClose} aria-hidden="true"></div>
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-5">
                <div className="flex items-start gap-3">
                    <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                        <SparklesIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Generate without every hotspot?</h3>
                        <p className="mt-1 text-sm text-gray-600">You still have {pendingExcludedMarks.length} hotspot{pendingExcludedMarks.length > 1 ? 's' : ''} set to ignore. Include them now or continue with your current selection.</p>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ignored hotspots</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                        {pendingExcludedMarks.map(mark => (
                            <li key={mark.id} className="flex gap-2">
                                <span className="text-gray-400">-</span>
                                <span>{resolveHotspotDisplayLabel(mark)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="w-full sm:w-auto rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-slate-100"
                    >
                        Review hotspots
                    </button>
                    <button
                        type="button"
                        onClick={executeGeneration}
                        className="w-full sm:w-auto rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                    >
                        Generate anyway
                    </button>
                </div>
                <button
                    type="button"
                    onClick={handleIncludeAll}
                    className="w-full text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                    Include all hotspots instead
                </button>
            </div>
        </div>
    );
  };

  const renderChatDrawer = () => {
    if (!appUser || isDemoMode) return null;

    if (!isProUser) {
        return (
            <div className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
                <div className="flex w-full max-w-xl items-center gap-3 rounded-full bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm">
                    <SparklesIcon className="h-5 w-5 text-emerald-500" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">Upgrade to unlock chat edits</p>
                        <p className="text-xs text-gray-500">Pro lets you tweak designs with quick @hotspot prompts.</p>
                    </div>
                    <button onClick={onUpgrade} className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">
                        Upgrade
                    </button>
                </div>
            </div>
        );
    }

    if (!isChatDrawerOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-32">
            <div className="absolute inset-0 bg-black/30" onClick={() => setIsChatDrawerOpen(false)} aria-hidden="true"></div>
            <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div>
                        <p className="text-sm font-semibold text-emerald-700">Chat edits</p>
                        <p className="text-xs text-gray-500">Mention hotspots like <span className="font-mono text-emerald-600">@Headline</span> for targeted tweaks.</p>
                    </div>
                    <button onClick={() => setIsChatDrawerOpen(false)} className="rounded-full p-2 text-gray-500 hover:bg-slate-100" aria-label="Close chat edits">
                        <XIcon className="h-4 w-4" />
                    </button>
                </div>
                <div className="max-h-[50vh] overflow-y-auto px-5 py-4 space-y-3">
                    {chatMessages.map(msg => (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                            {msg.role === 'assistant' && <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100"><SparklesIcon className="h-4 w-4 text-emerald-500" /></div>}
                            <div className={`max-w-[60%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-emerald-500 text-white rounded-br-xl' : msg.type === 'error' ? 'bg-red-100 text-red-800 rounded-bl-xl' : 'bg-slate-100 text-gray-800 rounded-bl-xl'}`}>
                                {msg.text && <p>{msg.text}</p>}
                                {msg.referenceImagePreviewUrl && <img src={msg.referenceImagePreviewUrl} alt="Reference" className="mt-2 rounded-lg" />}
                                {msg.generatedImageUrl && <img src={msg.generatedImageUrl} alt="Generated" className="mt-2 rounded-lg" />}
                            </div>
                        </div>
                    ))}
                    {isGenerating && (
                        <div className="flex gap-3 text-sm text-gray-500">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100"><SparklesIcon className="h-4 w-4 text-emerald-500 animate-spin" /></div>
                            <div className="flex items-center gap-1">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0s' }}></span>
                                <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0.15s' }}></span>
                                <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0.3s' }}></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="border-t border-slate-200 px-5 py-4">
                    <form onSubmit={handleChatEdit} className="space-y-2">
                        {chatAttachment && (
                            <div className="relative flex items-center gap-2 rounded-md bg-slate-100 p-2 text-xs">
                                <img src={chatAttachment.previewUrl} alt="Attachment preview" className="h-8 w-8 rounded object-cover" />
                                <p className="flex-1 truncate text-gray-600">{chatAttachment.file.name}</p>
                                <button type="button" onClick={() => setChatAttachment(null)} className="rounded-full p-1 text-gray-500 hover:bg-slate-200" aria-label="Remove attachment">
                                    <XIcon className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}
                        <div className="relative">
                            <textarea
                                ref={chatTextAreaRef}
                                value={chatPrompt}
                                onChange={e => handleChatPromptChange(e.target.value, e.target)}
                                onKeyDown={e => {
                                    if (e.key === 'Escape' && mentionSuggestions.length > 0) {
                                        e.preventDefault();
                                        closeMentionSuggestions();
                                        return;
                                    }
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleChatEdit(e);
                                    }
                                }}
                                placeholder={isGenerating ? 'Processing…' : 'Describe your tweak. Try @Headline to target a region.'}
                                className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-12 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                rows={2}
                                disabled={isGenerating}
                                onBlur={() => closeMentionSuggestions()}
                            />
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300" disabled={isGenerating}>
                                <PaperclipIcon className="h-5 w-5" />
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                            <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-700 disabled:text-gray-400" disabled={!chatPrompt.trim() || isGenerating}>
                                <SendIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
  };

  const handleChatPromptChange = (value: string, target: HTMLTextAreaElement) => {
    setChatPrompt(value);

    const cursor = target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt >= 0 && (lastAt === 0 || /[^\w]/.test(textBeforeCursor.charAt(lastAt - 1)))) {
        const query = textBeforeCursor.slice(lastAt + 1);
        if (!/\s/.test(query)) {
            const filtered = mentionTokens.filter(token => token.isIncluded && token.id.toLowerCase().startsWith(query.toLowerCase()));
            setMentionSuggestions(filtered);
            setMentionQuery(query);
            mentionTrackingRef.current = { start: lastAt, end: cursor };

            const rect = target.getBoundingClientRect();
            const top = rect.top + window.scrollY + Math.min(rect.height, target.offsetHeight) + 8;
            const left = rect.left + window.scrollX + 16;
            setMentionAnchor({ x: left, y: top });
            return;
        }
    }

    closeMentionSuggestions();
  };

  const insertMention = (token: { id: string; label: string }) => {
    const selection = mentionTrackingRef.current;
    if (!selection) return;
    const textarea = chatTextAreaRef.current;
    const mentionText = `@${token.id}`;
    setChatPrompt(prev => prev.slice(0, selection.start) + mentionText + prev.slice(selection.end));
    closeMentionSuggestions();
    if (textarea) {
        const nextCursor = selection.start + mentionText.length;
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(nextCursor, nextCursor);
        });
    }
  };

  const validateMentions = (message: string): { valid: string[]; invalid: string[] } => {
    const mentionRegex = /@([A-Za-z0-9_-]+)/g;
    const valid: string[] = [];
    const invalid: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(message)) !== null) {
        const token = mentionTokens.find(t => t.id === match![1]);
        if (token && token.isIncluded) {
            valid.push(token.id);
        } else {
            invalid.push(match![1]);
        }
    }
    return { valid, invalid };
  };

  const [invalidMentions, setInvalidMentions] = useState<string[]>([]);

  useEffect(() => {
    if (!isChatDrawerOpen) {
        closeMentionSuggestions();
    }
  }, [isChatDrawerOpen]);

  useEffect(() => {
    if (invalidMentions.length > 0) {
        const timeout = setTimeout(() => setInvalidMentions([]), 3000);
        return () => clearTimeout(timeout);
    }
  }, [invalidMentions]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && target.closest('input, textarea, [contenteditable="true"]')) {
        return;
      }
      setIsSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    const handleWindowBlur = () => setIsSpacePressed(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  const versionsPanel = (
    <div className="space-y-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Versions</p>
      <VersionHistory history={history} activeIndex={activeIndex} onSelect={setActiveIndex} />
    </div>
  );

  const inspectorPanel = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Editable fields</p>
            <p className="mt-1 text-xs text-gray-500">Tap a field to tweak it in the editor. Green cards are included, red cards are currently skipped.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowHotspotOverlay(prev => !prev)}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            {showHotspotOverlay ? 'Hide overlays' : 'Show overlays'}
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {editableFields.length > 0 ? (
            editableFields.map(({ mark, isEnabled }) => {
              const isActive = activeHotspotId === mark.id;
              const typeIcon = mark.type === 'text'
                ? <FileTextIcon className="h-4 w-4" />
                : <ImageIcon className="h-4 w-4" />;
              const cardStateClasses = isEnabled
                ? 'border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100'
                : 'border-rose-300 bg-rose-50 hover:border-rose-400 hover:bg-rose-100';
              const cardClasses = `flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${cardStateClasses} ${
                isActive ? 'ring-2 ring-emerald-400 ring-offset-2' : ''
              }`;
              const iconWrapperClasses = `flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border ${
                mark.type === 'text' ? 'border-sky-200 bg-sky-50 text-sky-600' : 'border-purple-200 bg-purple-50 text-purple-600'
              }`;
              return (
                <button
                  key={mark.id}
                  type="button"
                  onClick={() => focusHotspot(mark.id)}
                  className={cardClasses}
                >
                  <span className={iconWrapperClasses}>{typeIcon}</span>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-900">{resolveHotspotDisplayLabel(mark)}</p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
              <p className="text-sm font-semibold text-gray-700">No fields yet</p>
              <p className="mt-1 text-xs text-gray-500">Add a text or image field below to start editing.</p>
            </div>
          )}
        </div>
        <p className="mt-4 text-xs text-gray-500">
          {marks.length} hotspot{marks.length === 1 ? '' : 's'} detected · {includedMarks.length} included · {missingIncludedMarksCount} need input
        </p>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Add hotspots</p>
          <p className="mt-1 text-xs text-gray-500">Drop a new text or image layer anywhere on the template.</p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={() => setIsPlacingMark('text')}
              className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                isPlacingMark === 'text' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-100'
              }`}
            >
              Add text hotspot
            </button>
            <button
              onClick={() => setIsPlacingMark('image')}
              className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                isPlacingMark === 'image' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-100'
              }`}
            >
              Add image hotspot
            </button>
            {isPlacingMark && (
              <button onClick={() => setIsPlacingMark(null)} className="text-sm font-medium text-gray-500 hover:text-gray-700">
                Cancel placement
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">Brand palette</p>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Adjust
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {brandColors.length > 0 ? (
            brandColors.map(color => (
              <span
                key={color}
                className="h-7 w-7 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))
          ) : (
            <p className="text-xs text-gray-500 leading-relaxed">Stick with the template colors or tap Adjust to choose your brand palette.</p>
          )}
        </div>
        {isSettingsOpen && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <ColorPaletteSelector
              selectedPalette={brandColors}
              onPaletteChange={palette => {
                setBrandColors(palette);
                setIsSettingsOpen(false);
              }}
              userBrandColors={appUser?.brandColors}
            />
          </div>
        )}
      </div>
    </div>
  );

  const scaleDisplay = `${Math.round(canvasScale * 100)}%`;

  return (
    <div className="flex h-screen bg-slate-100">
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 lg:px-8">
            <div className="flex flex-1 items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-emerald-500 hover:text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Back</span>
              </button>
              <div className="flex items-center gap-3 group/editor" onDoubleClick={() => setIsEditingName(true)}>
                <SparklesIcon className="h-6 w-6 text-emerald-600" />
                {isEditingName ? (
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    onBlur={handleProjectNameBlur}
                    onKeyDown={e => e.key === 'Enter' && handleProjectNameBlur()}
                    className="-ml-1 rounded-md bg-slate-100 px-2 text-lg font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                ) : (
                  <h2 className="text-lg font-bold text-gray-800 font-display sm:text-xl">{projectName}</h2>
                )}
                <button onClick={() => setIsEditingName(true)} className="opacity-0 transition-opacity group-hover/editor:opacity-100">
                  <EditIcon className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="hidden flex-shrink-0 text-xs text-gray-500 sm:block">
              {marks.length} hotspot{marks.length === 1 ? '' : 's'} detected · {includedMarks.length} included · {missingIncludedMarksCount} need input
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden h-full w-72 flex-shrink-0 border-r border-slate-200 bg-white lg:flex">
            <div className="flex h-full w-full flex-col overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Timeline</p>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-6">
                {versionsPanel}
              </div>
            </div>
          </aside>

          <main className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 text-xs text-gray-500 sm:px-6">
              <span className="hidden sm:block">Hold space to pan · Cmd/Ctrl + scroll to zoom · Double-click to reset</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-gray-700">{scaleDisplay}</span>
                <button
                  type="button"
                  onClick={resetPanZoom}
                  className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-gray-600 transition hover:border-emerald-500 hover:text-emerald-600"
                >
                  Reset view
                </button>
              </div>
            </div>

            <div
              ref={canvasViewportRef}
              className="relative flex-1 overflow-hidden bg-slate-200"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerCancel}
              onWheel={handleCanvasWheel}
              onDoubleClick={handleCanvasDoubleClick}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  ref={canvasContentRef}
                  className="pointer-events-none"
                  style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)` }}
                >
                  <div
                    className="pointer-events-none"
                    style={{ transform: `scale(${canvasScale})`, transformOrigin: 'center center' }}
                  >
                    <div
                      ref={imagePreviewRef}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={() => {
                        if (isDrawingMark) {
                          cancelDraftMark();
                        }
                      }}
                      className={`pointer-events-auto group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 ${isPlacingMark ? 'cursor-crosshair' : ''}`}
                    >
                      <img
                        ref={imageElementRef}
                        src={activeImageUrl}
                        alt="Creative Preview"
                        className="mx-auto h-auto max-h-[70vh] w-full max-w-4xl object-contain"
                        onLoad={updateImageBounds}
                      />
                      <div className="absolute right-4 top-4 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
                        {activeIndex === 0 ? 'Template' : `Version ${activeIndex}`}
                      </div>
                      {activeImage && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={handleDownload}
                            disabled={!canDownloadActiveImage}
                            className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                              canDownloadActiveImage
                                ? 'bg-white text-black hover:bg-white/90'
                                : 'cursor-not-allowed bg-white/70 text-gray-500'
                            }`}
                          >
                            <DownloadIcon className="h-4 w-4" /> Download
                          </button>
                        </div>
                      )}
                      {imageBounds.width > 0 && imageBounds.height > 0 && (
                        <div
                          className={`absolute ${showHotspotOverlay || isPlacingMark ? '' : 'pointer-events-none'}`}
                          style={{
                            left: imageBounds.left,
                            top: imageBounds.top,
                            width: imageBounds.width,
                            height: imageBounds.height,
                          }}
                        >
                          {(showHotspotOverlay || isPlacingMark) && marks.map(mark => {
                            const left = ((mark.x - (mark.width ?? 0) / 2)) * 100;
                            const top = ((mark.y - (mark.height ?? 0) / 2)) * 100;
                            const width = (mark.width ?? 0) * 100;
                            const height = (mark.height ?? 0) * 100;
                            const textContent = mark.type === 'text'
                              ? (textFields[mark.id] ?? mark.text ?? '')
                              : '';
                            const hasTextContent = mark.type === 'text' && textContent.trim().length > 0;
                            const imagePreviewUrl = mark.type === 'image'
                              ? (imageAssets[mark.id]?.previewUrl ?? '')
                              : '';
                            const hasImageContent = mark.type === 'image' && imagePreviewUrl.trim().length > 0;
                            const displayLabel = resolveHotspotDisplayLabel(mark);
                            return (
                              <CreativeElement
                                key={mark.id}
                                data-hotspot-button="true"
                                ref={el => {
                                  canvasHotspotRefs.current[mark.id] = el;
                                }}
                                type="button"
                                aria-label={`Edit hotspot ${displayLabel}`}
                                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                                onClick={() => {
                                  lastFocusedHotspotIdRef.current = mark.id;
                                  setActiveHotspotId(mark.id);
                                }}
                                onMouseEnter={() => setHoveredMarkId(mark.id)}
                                onMouseLeave={() => setHoveredMarkId(null)}
                                label={displayLabel}
                                elementType={mark.type}
                                textContent={hasTextContent ? textContent : undefined}
                                imageSrc={hasImageContent ? imagePreviewUrl : undefined}
                                isActive={activeHotspotId === mark.id}
                                isHovered={hoveredMarkId === mark.id}
                              />
                            );
                          })}
                          {Object.values(generatedAssets).map(asset => {
                            const mark = marks.find(m => m.id === asset.markId);
                            if (!mark) return null;
                            const placement = getAssetPlacementRect(asset, imageBounds.width, imageBounds.height);
                            if (!placement) return null;
                            const style: CSSProperties = {
                              left: `${(placement.centerX / imageBounds.width) * 100}%`,
                              top: `${(placement.centerY / imageBounds.height) * 100}%`,
                              width: `${(placement.widthPx / imageBounds.width) * 100}%`,
                              height: `${(placement.heightPx / imageBounds.height) * 100}%`,
                              transform: 'translate(-50%, -50%)',
                              aspectRatio: asset.aspectRatio || undefined,
                            };
                            const isActive = activeAssetId === asset.markId;
                            return (
                              <div
                                key={`asset-${asset.markId}`}
                                className={`absolute pointer-events-auto cursor-grab rounded-xl border ${isActive ? 'border-emerald-500 shadow-lg' : 'border-transparent'} ${isGenerating ? 'cursor-wait opacity-70' : 'hover:border-emerald-400 hover:shadow-lg'}`}
                                style={style}
                                onPointerDown={event => handleAssetPointerDown(event, asset)}
                                onPointerMove={handleAssetPointerMove}
                                onPointerUp={handleAssetPointerUp}
                                onPointerCancel={handleAssetPointerUp}
                              >
                                <img
                                  src={asset.imageUrl}
                                  alt={`${resolveHotspotDisplayLabel(mark)} overlay`}
                                  className="h-full w-full select-none rounded-lg object-contain shadow-sm"
                                  draggable={false}
                                  style={{ aspectRatio: asset.aspectRatio || undefined }}
                                />
                              </div>
                            );
                          })}
                          {draftMark && (
                            <div
                              className="pointer-events-none absolute rounded-sm border-2 border-dashed border-emerald-400/80 bg-emerald-400/10"
                              style={{
                                left: `${((draftMark.x - (draftMark.width ?? 0) / 2)) * 100}%`,
                                top: `${((draftMark.y - (draftMark.height ?? 0) / 2)) * 100}%`,
                                width: `${(draftMark.width ?? 0) * 100}%`,
                                height: `${(draftMark.height ?? 0) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                      )}
                      {isPlacingMark && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 p-4 text-center text-white">
                          Click and drag on the template to outline the new {isPlacingMark} hotspot.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute bottom-4 right-4 hidden rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white sm:block">
                {scaleDisplay}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-4 py-4 text-xs text-gray-500 sm:hidden">
              {marks.length} hotspot{marks.length === 1 ? '' : 's'} detected · {includedMarks.length} included · {missingIncludedMarksCount} need input
            </div>
            <div className="border-t border-slate-200 bg-white px-4 py-6 lg:hidden">
              {versionsPanel}
            </div>
            <div className="border-t border-slate-200 bg-white px-4 py-6 lg:hidden">
              {inspectorPanel}
            </div>
          </main>

          <aside className="hidden h-full w-80 flex-shrink-0 border-l border-slate-200 bg-white xl:flex">
            <div className="flex h-full w-full flex-col overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Inspector</p>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-6">
                {inspectorPanel}
              </div>
            </div>
          </aside>
        </div>
      </div>
      {renderFloatingActions()}
      {renderChatDrawer()}
      {mentionSuggestions.length > 0 && mentionAnchor && (
        <div className="fixed z-50" style={{ top: mentionAnchor.y, left: mentionAnchor.x }}>
          <div className="w-48 rounded-lg border border-slate-200 bg-white shadow-lg">
            {mentionSuggestions.map(token => (
              <button
                key={token.id}
                onClick={() => insertMention(token)}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-emerald-50"
              >
                <span className="text-sm font-semibold text-gray-800">@{token.id}</span>
                <span className="text-xs text-gray-500">{token.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {invalidMentions.length > 0 && (
        <div className="fixed bottom-24 right-4 z-50 rounded-full bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          Unknown hotspots: {invalidMentions.join(', ')}
        </div>
      )}
      {renderGenerationConfirm()}
      {renderHotspotDrawer()}
    </div>
  );
};

const FileUploader = ({ onFileUpload, title, asset, onClear }: { onFileUpload: (asset: BrandAsset) => void; title: string; asset: BrandAsset | null; onClear?: () => void; }) => {
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const base64 = await fileToBase64(file);
      onFileUpload({
        file,
        previewUrl: `data:${file.type};base64,${base64}`,
        base64,
      });
    }
  };

  return (
    <div className="w-full mt-2">
      <div className={`flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md ${asset ? 'bg-slate-50' : ''}`}>
        {asset ? (
          <div className="text-center space-y-3">
            <img src={asset.previewUrl} alt="preview" className="mx-auto h-16 w-auto object-contain" />
            <p className="text-xs text-gray-500 mt-2 truncate max-w-[150px]">{asset.file.name}</p>
            <div className="flex justify-center items-center gap-4">
                <label htmlFor={`${title}-file-upload`} className="cursor-pointer text-emerald-600 hover:text-emerald-500 font-medium text-sm">
                  Replace
                </label>
                {onClear && (
                    <button type="button" onClick={onClear} className="text-sm font-medium text-gray-500 hover:text-red-500">
                        Remove
                    </button>
                )}
                <input id={`${title}-file-upload`} type="file" className="sr-only" onChange={handleFileChange} />
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-center">
            <UploadCloudIcon className="mx-auto h-10 w-10 text-gray-400" />
            <div className="flex text-sm text-gray-600">
              <label htmlFor={`${title}-file-upload`} className="relative cursor-pointer bg-white rounded-md font-medium text-emerald-600 hover:text-emerald-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-emerald-500">
                <span>Upload a file</span>
                <input id={`${title}-file-upload`} type="file" className="sr-only" onChange={handleFileChange} />
              </label>
            </div>
            <p className="text-xs text-gray-500">PNG, JPG</p>
          </div>
        )}
      </div>
    </div>
  );
};
