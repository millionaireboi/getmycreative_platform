

import React, { useRef, useLayoutEffect, useState } from 'react';
import { gsap } from 'gsap';
import { Stage, Layer, Arrow } from 'react-konva';
import type Konva from 'konva';
import type { Board, Connector } from '../types.ts';
import BoardComponent from './BoardComponent';

interface CanvasProps {
  boards: Board[];
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  connectors: Connector[];
  selectedBoardIds: string[];
  setSelectedBoardIds: (ids: string[]) => void;
  onBoardClick: (boardId: string) => void;
  selectedElementIds: string[];
  setSelectedElementIds: (ids: string[]) => void;
  isConnecting: boolean;
  connectionStartBoardId: string | null;
  onStartConnection: (boardId: string) => void;
  onUploadClick: () => void;
  onUploadTextClick: () => void;
  onDeleteBoard: (boardId: string) => void;
  onGenerateRemix: (boardId: string) => void;
  busyBoardIds: Set<string> | string[];
}

const Canvas: React.FC<CanvasProps> = ({ boards, setBoards, connectors, selectedBoardIds, setSelectedBoardIds, onBoardClick, selectedElementIds, setSelectedElementIds, isConnecting, connectionStartBoardId, onStartConnection, onUploadClick, onUploadTextClick, onDeleteBoard, onGenerateRemix, busyBoardIds }) => {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 1280, height: 720 });
  const glowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      setStageSize({
        width: Math.max(clientWidth, 600),
        height: Math.max(clientHeight, 600),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);
  
  const checkDeselect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      setSelectedBoardIds([]);
      // Fix: 'setSelectedElementIds' was not defined because it was missing from the props destructuring.
      setSelectedElementIds([]);
    }
  };
  
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const scaleBy = 1.1;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    
    stage.scale({ x: newScale, y: newScale });
    
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    stage.batchDraw();
  };

  const renderConnectors = () => {
    return connectors.map(conn => {
        const fromBoard = boards.find(b => b.id === conn.fromBoard);
        const toBoard = boards.find(b => b.id === conn.toBoard);

        if (!fromBoard || !toBoard) return null;

        const fromCenter = {
            x: fromBoard.x + fromBoard.width / 2,
            y: fromBoard.y + fromBoard.height / 2,
        };
        const toCenter = {
            x: toBoard.x + toBoard.width / 2,
            y: toBoard.y + toBoard.height / 2,
        };

        return (
            <Arrow
                key={conn.id}
                points={[fromCenter.x, fromCenter.y, toCenter.x, toCenter.y]}
                pointerLength={12}
                pointerWidth={12}
                fill="#0EA5E9"
                stroke="#0EA5E9"
                strokeWidth={2.5}
                shadowColor="rgba(14, 165, 233, 0.35)"
                shadowBlur={8}
                shadowOpacity={0.6}
            />
        );
    });
  };
  
  useLayoutEffect(() => {
    if (!glowRef.current) return;
    const ctx = gsap.context(() => {
      gsap.to(glowRef.current, {
        x: '+=320',
        y: '+=220',
        duration: 12,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0 bg-dot-pattern opacity-80" />
      <div ref={glowRef} className="pointer-events-none absolute -top-48 -left-48 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
      <Stage
        width={stageSize.width}
        height={stageSize.height}
        onMouseDown={checkDeselect}
        onTouchStart={checkDeselect}
        onWheel={handleWheel}
        draggable
        ref={stageRef}
      >
        <Layer>
            {renderConnectors()}
            {boards.map(board => (
              <BoardComponent 
                key={board.id}
                board={board}
                onBoardClick={() => onBoardClick(board.id)}
                onChange={(newAttrs) => {
                    setBoards(prevBoards => prevBoards.map(b => b.id === board.id ? {...b, ...newAttrs} : b));
                }}
                isConnecting={isConnecting}
                isConnectionStart={connectionStartBoardId === board.id}
                isSelected={selectedBoardIds.includes(board.id)}
                onStartConnection={() => onStartConnection(board.id)}
                onUploadClick={onUploadClick}
                onUploadTextClick={onUploadTextClick}
                onDelete={() => onDeleteBoard(board.id)}
                onGenerateRemix={() => onGenerateRemix(board.id)}
                isBusy={Array.isArray(busyBoardIds) ? busyBoardIds.includes(board.id) : busyBoardIds.has(board.id)}
              />
            ))}
        </Layer>
      </Stage>
    </div>
  );
};

export default Canvas;
