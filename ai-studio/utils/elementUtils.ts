import type { CanvasElement, GroupElement } from '../types';

export const findElement = (elements: CanvasElement[], id: string): CanvasElement | null => {
  for (const element of elements) {
    if (element.id === id) {
      return element;
    }
    if (element.type === 'group') {
      const found = findElement(element.children, id);
      if (found) return found;
    }
  }
  return null;
};

export const findElementAndParent = (
  elements: CanvasElement[],
  id: string,
  parent: GroupElement | null = null
): { element: CanvasElement | null; parent: GroupElement | null } => {
  for (const el of elements) {
    if (el.id === id) {
      return { element: el, parent };
    }
    if (el.type === 'group') {
      const result = findElementAndParent(el.children, id, el);
      if (result.element) {
        return result;
      }
    }
  }
  return { element: null, parent: null };
};

export const findElementAndAbsPosition = (
  elements: CanvasElement[],
  id: string,
  offset = { x: 0, y: 0 }
): { element: CanvasElement; absPos: { x: number; y: number } } | null => {
  for (const el of elements) {
    if (el.id === id) {
      return {
        element: el,
        absPos: {
          x: el.x + offset.x,
          y: el.y + offset.y,
        },
      };
    }
    if (el.type === 'group') {
      const found = findElementAndAbsPosition(el.children, id, {
        x: offset.x + el.x,
        y: offset.y + el.y,
      });
      if (found) return found;
    }
  }
  return null;
};

export const getElementsBoundingBox = (elements: CanvasElement[]) => {
  if (elements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  elements.forEach(el => {
    const height = el.type === 'text' ? 50 : el.height;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + height);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};
