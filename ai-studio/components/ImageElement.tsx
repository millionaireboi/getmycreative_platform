
import React, { useRef, useEffect } from 'react';
import { Image } from 'react-konva';
import Konva from 'konva';
import type { ImageElement } from '../types.ts';

interface ImageElementProps {
  element: ImageElement;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (newAttrs: Partial<ImageElement>) => void;
}

const ImageElementComponent: React.FC<ImageElementProps> = ({ element, isSelected, onSelect, onChange }) => {
  const imageRef = useRef<Konva.Image>(null);
  const [img] = useImage(element.src, 'anonymous');

  useEffect(() => {
    if (isSelected) {
      // No need to manually manage transformer nodes here; handled in Canvas.tsx
    }
  }, [isSelected]);

  return (
    <Image
      id={element.id}
      ref={imageRef}
      image={img}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
      onDragEnd={(e) => {
        onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = imageRef.current;
        if (node) {
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
            rotation: node.rotation(),
          });
        }
      }}
      perfectDrawEnabled={false}
      stroke={isSelected ? '#10B981' : undefined}
      strokeWidth={isSelected ? 2 : 0}
      shadowColor={isSelected ? 'rgba(16, 185, 129, 0.45)' : undefined}
      shadowBlur={isSelected ? 14 : 0}
      shadowOpacity={isSelected ? 0.8 : 0}
      shadowOffset={{ x: 0, y: isSelected ? 4 : 0 }}
    />
  );
};

// Simple hook for loading images
const useImage = (url: string, crossOrigin?: string): [HTMLImageElement | undefined] => {
  const [image, setImage] = React.useState<HTMLImageElement>();

  React.useEffect(() => {
    if (!url) {
      return;
    }
    const img = document.createElement('img');

    function onload() {
      setImage(img);
    }

    function onerror() {
       console.error('failed to load image');
    }

    img.addEventListener('load', onload);
    img.addEventListener('error', onerror);
    if(crossOrigin){
      img.crossOrigin = crossOrigin;
    }
    img.src = url;

    return function cleanup() {
      img.removeEventListener('load', onload);
      img.removeEventListener('error', onerror);
    };
  }, [url, crossOrigin]);

  return [image];
};

export default ImageElementComponent;
