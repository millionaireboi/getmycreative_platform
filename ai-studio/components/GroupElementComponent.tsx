
import React, { useRef } from 'react';
import { Group } from 'react-konva';
import type Konva from 'konva';
import type { GroupElement, CanvasElement } from '../types.ts';

interface GroupElementProps {
  element: GroupElement;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (newAttrs: Partial<GroupElement>) => void;
  renderElement: (element: CanvasElement) => React.ReactNode;
}

const GroupElementComponent: React.FC<GroupElementProps> = ({ element, isSelected, onSelect, onChange, renderElement }) => {
  const groupRef = useRef<Konva.Group>(null);

  return (
    <Group
      id={element.id}
      ref={groupRef}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        onChange({ x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
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
    >
      {element.children.map(child => renderElement(child))}
    </Group>
  );
};

export default GroupElementComponent;
