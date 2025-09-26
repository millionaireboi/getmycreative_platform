import type { Board, CanvasElement, ImageElement } from '../types.ts';
import type { ImageAnalysis, ProductAnalysis, TextAnalysis } from '../types.ts';

type BrandInfo = {
  colors?: string[];
  logo?: ImageElement;
};

const getElementLabel = (element: CanvasElement): string => {
  if ('label' in element && typeof element.label === 'string' && element.label.trim()) {
    return element.label.trim();
  }
  return element.id.substring(0, 4);
};

const describeAnalysis = (element: CanvasElement): string => {
  if (!('analysis' in element) || !element.analysis) {
    return 'No analysis available.';
  }

  const analysis = element.analysis;

  if (element.type === 'image') {
    const imageAnalysis = analysis as ImageAnalysis | ProductAnalysis;
    if ('productName' in imageAnalysis && imageAnalysis.productName) {
      const features = imageAnalysis.keyFeatures?.join(', ') || 'No key features detected';
      const type = imageAnalysis.productType || 'Unknown category';
      return `Analyzed as: Product: ${imageAnalysis.productName} (${type}), Features: ${features}.`;
    }
    if ('style' in imageAnalysis || 'mood' in imageAnalysis || 'colorPalette' in imageAnalysis || 'typography' in imageAnalysis) {
      const style = imageAnalysis.style || 'Style not identified';
      const mood = imageAnalysis.mood || 'Mood not identified';
      const colors = imageAnalysis.colorPalette?.join(', ') || 'No palette identified';
      const typography = imageAnalysis.typography || 'No typography insight';
      return `Analyzed as: Style: ${style}, Mood: ${mood}, Colors: ${colors}, Typography: ${typography}.`;
    }
  }

  if (element.type === 'text') {
    const textAnalysis = analysis as TextAnalysis;
    const style = textAnalysis.style || 'Style not identified';
    const sentiment = textAnalysis.sentiment || 'Sentiment not identified';
    const keywords = textAnalysis.keywords?.join(', ') || 'No keywords detected';
    return `Analyzed as: Style: ${style}, Sentiment: ${sentiment}, Keywords: ${keywords}.`;
  }

  return 'No analysis available.';
};

export interface WhiteboardContextSummary {
  availableBoardsDescription: string;
  brandInfoDescription: string;
}

export const buildWhiteboardContextSummary = (
  boards: Board[],
  brandInfo?: BrandInfo
): WhiteboardContextSummary => {
  const availableBoardsDescription = boards
    .map(board => {
      const elementSummaries = board.elements
        .map(element => {
          const label = getElementLabel(element);
          const analysisSummary = describeAnalysis(element);
          return `    - Element @${label}: ${analysisSummary}`;
        })
        .join('\n');

      return `- Board (Type: '${board.type}', Title: '${board.title}') contains:\n${elementSummaries}`;
    })
    .join('\n');

  const brandInfoDescriptionLines: string[] = [];
  if (brandInfo?.logo?.label) {
    brandInfoDescriptionLines.push(`- A Brand Board with a logo (@${brandInfo.logo.label})`);
  }
  if (brandInfo?.colors && brandInfo.colors.length > 0) {
    brandInfoDescriptionLines.push(`- Brand Colors are available: ${brandInfo.colors.join(', ')}`);
  }

  const brandInfoDescription = brandInfoDescriptionLines.join('\n');

  return {
    availableBoardsDescription,
    brandInfoDescription,
  };
};
