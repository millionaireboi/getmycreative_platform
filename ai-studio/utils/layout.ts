import type { Board, CanvasElement, GroupElement, ImageElement, TextElement, VideoElement } from '../types.ts';

export const HEADER_BASE_HEIGHT = 40;
export const REMIX_HEADER_HEIGHT = 88;
export const BOARD_PADDING = 32;
export const LABEL_LINE_HEIGHT = 22;
export const LABEL_MARGIN = 8;
export const MIN_BOARD_WIDTH = 320;
export const MIN_BOARD_HEIGHT = 280;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const estimateTextHeight = (element: TextElement): number => {
  const safeWidth = Math.max(12, element.width || element.fontSize * 8);
  const averageCharWidth = clamp(element.fontSize * 0.55, 7, 14);
  const approxCharsPerLine = Math.max(8, Math.floor(safeWidth / averageCharWidth));
  const normalizedText = (element.text || '').replace(/\s+/g, ' ').trim();
  if (!normalizedText) {
    return element.fontSize * 1.35;
  }
  const lines = Math.max(1, Math.ceil(normalizedText.length / approxCharsPerLine));
  const lineHeight = element.fontSize * 1.35;
  return clamp(lines, 1, 8) * lineHeight;
};

const getGroupElementBounds = (group: GroupElement): { right: number; bottom: number } => {
  if (!group.children || group.children.length === 0) {
    return { right: group.x, bottom: group.y };
  }

  let maxRight = 0;
  let maxBottom = 0;

  group.children.forEach(child => {
    const bounds = getElementBounds(child);
    maxRight = Math.max(maxRight, group.x + bounds.right);
    maxBottom = Math.max(maxBottom, group.y + bounds.bottom);
  });

  return { right: maxRight, bottom: maxBottom };
};

export const getElementBounds = (element: CanvasElement): { right: number; bottom: number } => {
  switch (element.type) {
    case 'image': {
      const img = element as ImageElement;
      return {
        right: img.x + img.width,
        bottom: img.y + img.height,
      };
    }
    case 'text': {
      const text = element as TextElement;
      return {
        right: text.x + text.width,
        bottom: text.y + estimateTextHeight(text),
      };
    }
    case 'video': {
      const video = element as VideoElement;
      return {
        right: video.x + video.width,
        bottom: video.y + video.height,
      };
    }
    case 'group': {
      return getGroupElementBounds(element as GroupElement);
    }
    default:
      return { right: element.x, bottom: element.y };
  }
};

const hasLabel = (element: CanvasElement): boolean => {
  return 'label' in element && !!(element as ImageElement | TextElement | VideoElement).label;
};

export const withResponsiveBoardSize = (board: Board): Board => {
  const hasElements = board.elements && board.elements.length > 0;
  const headerHeight = board.type === 'remix' && board.remixPrompt ? REMIX_HEADER_HEIGHT : HEADER_BASE_HEIGHT;

  if (!hasElements) {
    const minHeight = Math.max(MIN_BOARD_HEIGHT, headerHeight + 200);
    return {
      ...board,
      width: Math.max(board.width, MIN_BOARD_WIDTH),
      height: Math.max(board.height, minHeight),
    };
  }

  let maxRight = 0;
  let maxBottom = 0;

  board.elements.forEach(element => {
    const bounds = getElementBounds(element);
    const labelOffset = hasLabel(element) ? LABEL_LINE_HEIGHT + LABEL_MARGIN : 0;
    maxRight = Math.max(maxRight, bounds.right);
    maxBottom = Math.max(maxBottom, bounds.bottom + labelOffset);
  });

  const paddedWidth = Math.max(MIN_BOARD_WIDTH, Math.ceil(maxRight + BOARD_PADDING));
  const paddedHeight = Math.max(
    MIN_BOARD_HEIGHT,
    Math.ceil(headerHeight + maxBottom + BOARD_PADDING * 0.5)
  );

  return {
    ...board,
    width: paddedWidth,
    height: paddedHeight,
  };
};

export const getElementBottomWithLabel = (element: CanvasElement): number => {
  const bounds = getElementBounds(element);
  const labelOffset = hasLabel(element) ? LABEL_LINE_HEIGHT + LABEL_MARGIN : 0;
  return bounds.bottom + labelOffset;
};

type ElementInfo = {
  height: number;
};

export const getElementVisualInfo = (element: CanvasElement): ElementInfo => {
  const bounds = getElementBounds(element);
  const labelExtra = hasLabel(element) ? LABEL_LINE_HEIGHT + LABEL_MARGIN : 0;
  return {
    height: bounds.bottom - element.y + labelExtra,
  };
};

export const REMIX_PROMPT_MAX_CHARS = 160;
