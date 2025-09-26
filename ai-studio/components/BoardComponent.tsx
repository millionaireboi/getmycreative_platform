import React, { useCallback, useState } from 'react';
import { Group, Rect, Text, Path } from 'react-konva';
import 'konva/lib/shapes/Path'; // Import to register Path shape with Konva
import type Konva from 'konva';
// Fix: Import TextElement type to be used for casting.
import type { Board, CanvasElement, ImageElement, TextElement, VideoElement } from '../types.ts';
import ImageElementComponent from './ImageElement.tsx';
import TextElementComponent from './TextElement.tsx';
import VideoElementComponent from './VideoElementComponent.tsx';
import { HEADER_BASE_HEIGHT, LABEL_LINE_HEIGHT, LABEL_MARGIN, REMIX_HEADER_HEIGHT, REMIX_PROMPT_MAX_CHARS, getElementBounds } from '../utils/layout.ts';

interface BoardComponentProps {
  board: Board;
  onBoardClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (newAttrs: Partial<Board>) => void;
  isSelected: boolean;
  isConnecting: boolean;
  isConnectionStart: boolean;
  onStartConnection: () => void;
  onUploadClick: () => void;
  onUploadTextClick: () => void;
  onDelete: () => void;
  onGenerateRemix: () => void;
  isBusy?: boolean;
  selectedElementIds: string[];
  onElementSelect: (boardId: string, elementId: string, additive: boolean) => void;
}

const KonvaConnectIcon: React.FC<{isActive: boolean}> = ({ isActive }) => {
    const iconPath = "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1";
    const offsetX = (30 - 24) / 2;
    const offsetY = (30 - 24) / 2;

    return (
        <Path
            data={iconPath} x={offsetX} y={offsetY}
            stroke={isActive ? '#10B981' : '#475569'} strokeWidth={1.5}
            listening={false}
            shadowColor={isActive ? '#10B981' : undefined} shadowBlur={isActive ? 8 : 0} shadowOpacity={isActive ? 0.6 : 0}
        />
    );
};

const KonvaTrashIcon: React.FC = () => {
    const iconPath = "M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2";
    const offsetX = (30 - 24) / 2;
    const offsetY = (30 - 24) / 2;

    return (
        <Path
            data={iconPath} x={offsetX} y={offsetY}
            stroke={'#EF4444'} strokeWidth={1.5}
            listening={false}
        />
    );
};

const KonvaGenerateIcon: React.FC = () => {
    const iconPath = "M13 10V3L4 14h7v7l9-11h-7z";
    const offsetX = (30 - 24) / 2;
    const offsetY = (30 - 24) / 2;

    return (
        <Path
            data={iconPath} x={offsetX} y={offsetY}
            fill={'#6366F1'}
            listening={false}
        />
    );
};


const BoardComponent: React.FC<BoardComponentProps> = ({
  board,
  onBoardClick,
  onChange,
  isSelected,
  isConnecting,
  isConnectionStart,
  onStartConnection,
  onUploadClick,
  onUploadTextClick,
  onDelete,
  onGenerateRemix,
  isBusy,
  selectedElementIds,
  onElementSelect,
}) => {

  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleCopyPrompt = useCallback(() => {
    if (!board.remixPrompt) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(board.remixPrompt).then(() => {
        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 1600);
      }).catch(() => {
        setCopiedPrompt(false);
      });
    }
  }, [board.remixPrompt]);

  const handleElementSelect = useCallback((elementId: string, event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
    const isMultiSelect = event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey;
    onElementSelect(board.id, elementId, isMultiSelect);
  }, [board.id, onElementSelect]);

  const headerHeight = board.type === 'remix' && board.remixPrompt ? REMIX_HEADER_HEIGHT : HEADER_BASE_HEIGHT;

  const renderBrandBoardElements = () => {
    const logo = board.elements.find(el => el.type === 'image') as ImageElement;
    // Fix: Cast the filtered elements to `TextElement[]` to resolve the type mismatch when passing to `TextElementComponent`.
    const texts = board.elements.filter(el => el.type === 'text') as TextElement[];
    const colors = board.colors || [];

    return (
        <Group>
            {logo && (
              <ImageElementComponent
                element={logo}
                isSelected={selectedElementIds.includes(logo.id)}
                onSelect={(evt) => handleElementSelect(logo.id, evt)}
                onChange={() => {}}
              />
            )}
            {texts.map(t => (
              <TextElementComponent
                key={t.id}
                element={t}
                isSelected={selectedElementIds.includes(t.id)}
                onSelect={(evt) => handleElementSelect(t.id, evt)}
                onChange={() => {}}
              />
            ))}
            {colors.map((color, index) => (
                <Group key={color + index} x={20} y={170 + index * 40}>
                    <Rect width={128} height={30} fill={color} cornerRadius={4} />
                    <Text text={color.toUpperCase()} x={10} y={8} fill={index < 2 ? '#FFFFFF' : '#000000'} fontFamily="monospace" fontSize={14}/>
                </Group>
            ))}
        </Group>
    );
  };
  
  const renderEmptyState = () => {
    const isUploadableImageBoard = board.type === 'product' || board.type === 'image';
    const isUploadableTextBoard = board.type === 'text';

    const contentHeight = board.height - headerHeight;

    if (board.type === 'remix') {
         return (
            <Text
                text={"Your remixed variations will appear here."}
                x={0}
                y={contentHeight / 2 - 24}
                width={board.width}
                align="center"
                fill="#9CA3AF"
                fontFamily="Inter"
                fontSize={16}
            />
        );
    }

    if (!isUploadableImageBoard && !isUploadableTextBoard) {
        return null;
    }

    const promptText = isUploadableImageBoard ? "Your visuals will appear here." : "Your copy will appear here.";
    const buttonText = isUploadableImageBoard ? "➕ Upload Images" : "➕ Upload Document (.txt)";
    const handleClick = isUploadableImageBoard ? onUploadClick : onUploadTextClick;

    return (
        <Group 
            onClick={(e) => { e.cancelBubble=true; handleClick(); }}
            onTap={(e) => { e.cancelBubble=true; handleClick(); }}
            onMouseEnter={e => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = 'pointer';
            }}
            onMouseLeave={e => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = 'default';
            }}
        >
            <Text
                text={promptText}
                x={0}
                y={contentHeight / 2 - 120}
                width={board.width}
                align="center"
                fill="#9CA3AF"
                fontFamily="Inter"
                fontSize={16}
            />
            <Rect 
                x={board.width / 2 - 110}
                y={contentHeight / 2 - 70}
                width={220}
                height={40}
                fill="#10B981"
                cornerRadius={8}
            />
            <Text
                text={buttonText}
                x={board.width / 2 - 110}
                y={contentHeight / 2 - 62}
                width={220}
                align="center"
                fill="#FFF"
                fontFamily="Inter"
                fontSize={16}
                fontStyle="bold"
            />
        </Group>
    );
  };

  const renderDefaultBoardElements = () => {
    return board.elements.map(element => {
        const isElSelected = selectedElementIds.includes(element.id);
        const onElementChange = () => {};
        const bounds = getElementBounds(element);
        const labelY = bounds.bottom + (('label' in element && element.label) ? LABEL_MARGIN : 0);

        switch (element.type) {
            case 'image':
                return (
                    <Group key={element.id}>
                        <ImageElementComponent element={element} isSelected={isElSelected} onSelect={(evt) => handleElementSelect(element.id, evt)} onChange={onElementChange} />
                        {element.label && (
                          <Group x={element.x} y={labelY} listening={false}>
                            <Rect
                              width={element.width}
                              height={LABEL_LINE_HEIGHT}
                              cornerRadius={6}
                              fill="rgba(148, 163, 184, 0.16)"
                            />
                            <Text
                              text={element.label}
                              width={element.width}
                              height={LABEL_LINE_HEIGHT}
                              align="center"
                              fill="#475569"
                              fontFamily="Inter"
                              fontSize={13}
                              verticalAlign="middle"
                            />
                          </Group>
                        )}
                    </Group>
                );
            case 'text':
                const textEl = element as TextElement;
                return (
                    <Group key={textEl.id}>
                        <TextElementComponent element={textEl} isSelected={isElSelected} onSelect={(evt) => handleElementSelect(textEl.id, evt)} onChange={onElementChange} />
                        {textEl.label && (
                          <Group x={textEl.x} y={labelY} listening={false}>
                            <Rect
                              width={textEl.width}
                              height={LABEL_LINE_HEIGHT}
                              cornerRadius={6}
                              fill="rgba(148, 163, 184, 0.16)"
                            />
                            <Text
                              text={textEl.label}
                              width={textEl.width}
                              height={LABEL_LINE_HEIGHT}
                              align="center"
                              fill="#475569"
                              fontFamily="Inter"
                              fontSize={13}
                              verticalAlign="middle"
                            />
                          </Group>
                        )}
                    </Group>
                );
            case 'group':
                return null; 
            case 'video':
                 const videoEl = element as VideoElement;
                 return (
                    <Group key={videoEl.id}>
                        <VideoElementComponent element={videoEl} isSelected={isElSelected} onSelect={(evt) => handleElementSelect(videoEl.id, evt)} onChange={onElementChange} />
                        {videoEl.label && (
                          <Group x={videoEl.x} y={labelY} listening={false}>
                            <Rect
                              width={videoEl.width}
                              height={LABEL_LINE_HEIGHT}
                              cornerRadius={6}
                              fill="rgba(148, 163, 184, 0.16)"
                            />
                            <Text
                              text={videoEl.label}
                              width={videoEl.width}
                              height={LABEL_LINE_HEIGHT}
                              align="center"
                              fill="#475569"
                              fontFamily="Inter"
                              fontSize={13}
                              verticalAlign="middle"
                            />
                          </Group>
                        )}
                    </Group>
                );
            default:
                return null;
        }
    });
  };

  const renderBoardContent = () => {
    switch (board.type) {
        case 'brand':
            return renderBrandBoardElements();
        default:
            return renderDefaultBoardElements();
    }
  };

  const headerColor =
      board.type === 'remix' ? '#6366F1' :
      board.type === 'brand' ? '#10B981' :
      board.type === 'product' ? '#0EA5E9' :
      '#64748B';

  const strokeColor = isSelected && !isConnecting ? '#10B981' : '#E2E8F0';
  const strokeWidth = isSelected && !isConnecting ? 3 : 2;

  const shadowProps = isConnectionStart ? {
      shadowColor: '#10B981',
      shadowBlur: 20,
      shadowOpacity: 0.9,
  } : {
      shadowColor: 'rgba(15, 23, 42, 0.25)',
      shadowBlur: 18,
      shadowOpacity: 0.6,
      shadowOffsetX: 0,
      shadowOffsetY: 10,
  };


  return (
    <Group
      id={board.id}
      x={board.x}
      y={board.y}
      draggable
      onClick={onBoardClick}
      onTap={onBoardClick}
      onDragEnd={(e) => {
        onChange({ x: e.target.x(), y: e.target.y() });
      }}
    >
        {/* Board Frame and Title */}
        <Rect
            width={board.width}
            height={board.height}
            fill="#FFFFFF"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            cornerRadius={10}
            {...shadowProps}
        />
        <Rect
            width={board.width}
            height={headerHeight}
            fill={headerColor}
            cornerRadius={[10, 10, 0, 0]}
        />
        <Text
            text={board.title}
            x={12}
            y={12}
            fill="#0F172A"
            fontSize={16}
            fontFamily="Inter"
            fontStyle="bold"
        />

        {board.type === 'remix' && board.remixPrompt && (
          <Group x={12} y={42}>
            <Rect
              width={board.width - 24}
              height={REMIX_HEADER_HEIGHT - 52}
              cornerRadius={8}
              fill="rgba(255, 255, 255, 0.78)"
            />
            <Text
              text={board.remixPrompt.length > REMIX_PROMPT_MAX_CHARS ? `${board.remixPrompt.slice(0, REMIX_PROMPT_MAX_CHARS - 1)}…` : board.remixPrompt}
              x={12}
              y={10}
              width={board.width - 132}
              fill="#1F2937"
              fontFamily="Inter"
              fontSize={13}
              lineHeight={1.4}
            />
            <Group
              x={board.width - 108}
              y={10}
              onClick={(e) => { e.cancelBubble = true; handleCopyPrompt(); }}
              onTap={(e) => { e.cancelBubble = true; handleCopyPrompt(); }}
              onMouseEnter={e => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = 'pointer';
              }}
              onMouseLeave={e => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = 'default';
              }}
            >
              <Rect
                width={84}
                height={28}
                cornerRadius={6}
                fill={copiedPrompt ? 'rgba(16, 185, 129, 0.9)' : 'rgba(99, 102, 241, 0.85)'}
              />
              <Text
                text={copiedPrompt ? 'Copied' : 'Copy'}
                width={84}
                height={28}
                align="center"
                verticalAlign="middle"
                fill="#FFFFFF"
                fontFamily="Inter"
                fontStyle="bold"
                fontSize={12}
              />
            </Group>
          </Group>
        )}

        {isSelected && (
           <Group>
                {board.type === 'remix' && (
                     <Group
                        x={board.width - 110} y={5}
                        onClick={(e) => { e.cancelBubble = true; onGenerateRemix(); }}
                        onTap={(e) => { e.cancelBubble = true; onGenerateRemix(); }}
                        onMouseEnter={e => {
                            const stage = e.target.getStage();
                            if (stage) stage.container().style.cursor = 'pointer';
                            (e.currentTarget as Konva.Group).find('Rect')[0]?.setAttr('fill', '#4F46E5');
                            e.currentTarget.getLayer()?.batchDraw();
                        }}
                        onMouseLeave={e => {
                            const stage = e.target.getStage();
                            if (stage) stage.container().style.cursor = 'default';
                            (e.currentTarget as Konva.Group).find('Rect')[0]?.setAttr('fill', 'rgba(99, 102, 241, 0.12)');
                            e.currentTarget.getLayer()?.batchDraw();
                        }}
                    >
                        <Rect width={30} height={30} cornerRadius={6} fill={'rgba(99, 102, 241, 0.12)'} />
                        <KonvaGenerateIcon />
                    </Group>
                )}
                <Group
                    x={board.width - 75} y={5}
                    onClick={(e) => { e.cancelBubble = true; onDelete(); }}
                    onTap={(e) => { e.cancelBubble = true; onDelete(); }}
                    onMouseEnter={e => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'pointer';
                        // FIX: Cast currentTarget to Konva.Group to use the 'find' method.
                        (e.currentTarget as Konva.Group).find('Rect')[0]?.setAttr('fill', 'rgba(248, 113, 113, 0.45)');
                        e.currentTarget.getLayer()?.batchDraw();
                    }}
                    onMouseLeave={e => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'default';
                        // FIX: Cast currentTarget to Konva.Group to use the 'find' method.
                        (e.currentTarget as Konva.Group).find('Rect')[0]?.setAttr('fill', 'rgba(248, 113, 113, 0.18)');
                        e.currentTarget.getLayer()?.batchDraw();
                    }}
                >
                    <Rect width={30} height={30} cornerRadius={6} fill={'rgba(248, 113, 113, 0.18)'} />
                    <KonvaTrashIcon />
                </Group>
           
               {board.type !== 'remix' && (
                    <Group
                        x={board.width - 40} y={5}
                        onClick={(e) => { e.cancelBubble = true; onStartConnection(); }}
                        onTap={(e) => { e.cancelBubble = true; onStartConnection(); }}
                         onMouseEnter={e => {
                            const stage = e.target.getStage();
                            if (stage) stage.container().style.cursor = 'pointer';
                            // FIX: Cast currentTarget to Konva.Group to use the 'find' method.
                            (e.currentTarget as Konva.Group).find('Rect')[0]?.setAttr('fill', 'rgba(16, 185, 129, 0.35)');
                            e.currentTarget.getLayer()?.batchDraw();
                        }}
                        onMouseLeave={e => {
                            const stage = e.target.getStage();
                            if (stage) stage.container().style.cursor = 'default';
                             // FIX: Cast currentTarget to Konva.Group to use the 'find' method.
                             (e.currentTarget as Konva.Group).find('Rect')[0]?.setAttr('fill', 'rgba(16, 185, 129, 0.14)');
                             e.currentTarget.getLayer()?.batchDraw();
                        }}
                    >
                        <Rect width={30} height={30} cornerRadius={6} fill={'rgba(16, 185, 129, 0.14)'} />
                        <KonvaConnectIcon isActive={isConnecting || isConnectionStart} />
                    </Group>
                )}
            </Group>
        )}
      
      {/* Group to clip the content area */}
      <Group clip={{ x: 0, y: headerHeight, width: board.width, height: board.height - headerHeight }}>
         <Group x={0} y={headerHeight}>
           {
               board.elements.length === 0 ? renderEmptyState() : renderBoardContent()
           }
         </Group>
         {isBusy && (
            <Group x={0} y={headerHeight}>
              <Rect
                width={board.width}
                height={board.height - headerHeight}
                fill="rgba(15,23,42,0.35)"
                cornerRadius={[0, 0, 10, 10]}
              />
              <Text
                text="🪄 Magic in progress..."
                x={board.width / 2 - 120}
                y={(board.height - headerHeight) / 2 - 12}
                width={240}
                align="center"
                fontSize={18}
                fontStyle="bold"
                fill="#F8FAFC"
              />
              <Text
                text="Our genie is working on your board."
                x={board.width / 2 - 140}
                y={(board.height - headerHeight) / 2 + 16}
                width={280}
                align="center"
                fontSize={14}
                fill="rgba(241,245,249,0.8)"
              />
            </Group>
         )}
      </Group>

    </Group>
  );
};

export default BoardComponent;
