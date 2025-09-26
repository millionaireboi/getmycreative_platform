export interface ImageAnalysis {
  style?: string;
  mood?: string;
  colorPalette?: string[];
  typography?: string;
  composition?: string;
  objects?: string[];
}

export interface ProductAnalysis {
  productName?: string;
  productType?: string;
  keyFeatures?: string[];
}

export interface TextAnalysis {
  sentiment?: string;
  keywords?: string[];
  style?: string;
}

export interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  height: number;
  generationPrompt?: string;
  label?: string;
  analysis?: ImageAnalysis | ProductAnalysis;
  originalSrc?: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
  label?: string;
  analysis?: TextAnalysis;
}

export interface GroupElement extends BaseElement {
  type: 'group';
  children: CanvasElement[];
  height: number;
}

export interface VideoElement extends BaseElement {
  type: 'video';
  src?: string;
  poster?: string;
  height: number;
  generationPrompt: string;
  status: 'pending' | 'generating' | 'complete' | 'error';
  statusMessage?: string;
  label?: string;
}

export type CanvasElement = ImageElement | TextElement | GroupElement | VideoElement;

export interface Connector {
  id: string;
  fromBoard: string;
  toBoard: string;
  elementIds?: string[];
}

export type BoardType = 'image' | 'text' | 'remix' | 'brand' | 'product';

export interface Board {
  id: string;
  type: BoardType;
  x: number;
  y: number;
  width: number;
  height: number;
  elements: CanvasElement[];
  title: string;
  colors?: string[];
  remixPrompt?: string;
}

export interface OrchestrationTask {
  id: string;
  type: 'copywriting' | 'heroShot' | 'socialMediaTemplate';
  description: string;
  prompt: string;
  dependencies: string[];
}

export interface OrchestrationPlan {
  tasks: OrchestrationTask[];
}
