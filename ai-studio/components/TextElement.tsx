
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
      stroke={isSelected ? '#10B981' : undefined}
      strokeWidth={isSelected ? 0.6 : 0}
      shadowColor={isSelected ? 'rgba(16, 185, 129, 0.35)' : undefined}
      shadowBlur={isSelected ? 12 : 0}
      shadowOpacity={isSelected ? 0.8 : 0}
    />
  );
};

export default TextElementComponent;
