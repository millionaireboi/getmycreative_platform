
import React, { useRef, useEffect } from 'react';
import { Text } from 'react-konva';
import type Konva from 'konva';
import type { TextElement } from '../types.ts';

interface TextElementProps {
  element: TextElement;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (newAttrs: Partial<TextElement>) => void;
}

const TextElementComponent: React.FC<TextElementProps> = ({ element, isSelected, onSelect, onChange }) => {
  const textRef = useRef<Konva.Text>(null);
  
  useEffect(() => {
    if (isSelected) {
       // No need to manually manage transformer nodes here; handled in Canvas.tsx
    }
  }, [isSelected]);

  return (
    <Text
      id={element.id}
      ref={textRef}
      text={element.text}
      x={element.x}
      y={element.y}
      fontSize={element.fontSize}
      fontFamily={element.fontFamily}
      fill={element.fill}
      width={element.width}
      rotation={element.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = textRef.current;
        if (node) {
          const scaleX = node.scaleX();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            rotation: node.rotation(),
          });
        }
      }}
    />
  );
};

export default TextElementComponent;
