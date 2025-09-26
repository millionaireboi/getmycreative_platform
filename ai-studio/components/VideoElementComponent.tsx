
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Group, Image, Text, Rect, Arc } from 'react-konva';
import Konva from 'konva';
import type { VideoElement } from '../types.ts';

interface VideoElementProps {
  element: VideoElement;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (newAttrs: Partial<VideoElement>) => void;
}

const useImage = (url?: string, crossOrigin?: string): [HTMLImageElement | undefined] => {
  const [image, setImage] = React.useState<HTMLImageElement>();

  React.useEffect(() => {
    if (!url) {
        setImage(undefined);
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

const VideoElementComponent: React.FC<VideoElementProps> = ({ element, isSelected, onSelect, onChange }) => {
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const videoElement = useMemo(() => {
      if (typeof window === 'undefined') return undefined;
      const el = document.createElement('video');
      el.muted = true;
      el.loop = true;
      el.playsInline = true;
      return el;
  }, []);

  const [posterImg] = useImage(element.poster, 'anonymous');
  const [isPlaying, setIsPlaying] = useState(false);
  
  useEffect(() => {
      if (element.src && videoElement) {
        videoElement.src = element.src;
      }
  }, [element.src, videoElement]);

  useEffect(() => {
    if (!isSelected) {
      setIsPlaying(false);
    }
  }, [isSelected]);
  
  useEffect(() => {
      if(!videoElement) return;

      if (isPlaying) {
          const playPromise = videoElement.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => console.error("Video play failed:", error));
          }
      } else {
          videoElement.pause();
      }
  }, [isPlaying, videoElement]);

  useEffect(() => {
    if (!videoElement) return;
    const layer = imageRef.current?.getLayer();

    // FIX: A layer is required for the animation.
    if (!layer) {
      return;
    }
    
    const anim = new Konva.Animation(() => {}, layer);
    
    if (isPlaying) {
      anim.start();
    } else {
      anim.stop();
    }
    
    // FIX: The useEffect cleanup function must return void or a function that returns void.
    // The `stop()` method on a Konva.Animation returns the animation instance, which was causing a type error.
    return () => {
      anim.stop();
    };
  }, [isPlaying, videoElement]);

  // FIX: Broaden the event type to handle both mouse and touch events from onClick and onTap.
  const togglePlay = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;
      if (element.status === 'complete') {
          setIsPlaying(!isPlaying);
      }
  };

  const renderStatusOverlay = () => {
    const centerX = element.width / 2;
    const centerY = element.height / 2;

    switch (element.status) {
        case 'pending':
        case 'generating':
            return (
                <Group>
                    <Rect width={element.width} height={element.height} fill="#1F2937" cornerRadius={8}/>
                    <Arc x={centerX} y={centerY - 10} innerRadius={15} outerRadius={20} angle={Date.now() / 2 % 360} fill="#A78BFA" rotation={Date.now() / 2 % 360} />
                    <Text 
                        text={element.statusMessage || "Generating..."}
                        width={element.width - 20}
                        x={10}
                        y={centerY + 20}
                        align="center"
                        fill="white"
                        fontFamily="Inter"
                        fontSize={14}
                        wrap="word"
                    />
                </Group>
            );
        case 'error':
            return (
                <Group>
                    <Rect width={element.width} height={element.height} fill="#1F2937" stroke="red" strokeWidth={2} cornerRadius={8}/>
                     <Text 
                        text={"Error"}
                        width={element.width - 20}
                        x={10}
                        y={centerY - 20}
                        align="center"
                        fill="red"
                        fontFamily="Inter"
                        fontSize={18}
                        fontStyle="bold"
                    />
                     <Text 
                        text={element.statusMessage || "Failed to generate."}
                        width={element.width - 20}
                        x={10}
                        y={centerY + 5}
                        align="center"
                        fill="white"
                        fontFamily="Inter"
                        fontSize={12}
                        wrap="word"
                    />
                </Group>
            );
        case 'complete':
            return (
                <Group>
                    <Image
                        ref={imageRef}
                        image={isPlaying ? videoElement : posterImg}
                        width={element.width}
                        height={element.height}
                        cornerRadius={8}
                    />
                    {!isPlaying && (
                        <Group onTap={togglePlay} onClick={togglePlay}>
                            <Rect width={element.width} height={element.height} fill="rgba(0,0,0,0.3)" cornerRadius={8}/>
                            <Text text="▶" x={centerX - 12} y={centerY - 22} fontSize={44} fill="white" shadowColor="black" shadowBlur={10} />
                        </Group>
                    )}
                </Group>
            );
        default: return null;
    }
  };

  return (
    <Group
      id={element.id}
      ref={groupRef}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      draggable={element.status === 'complete'}
      shadowColor={isSelected ? 'rgba(16, 185, 129, 0.4)' : undefined}
      shadowBlur={isSelected ? 18 : 0}
      shadowOpacity={isSelected ? 0.85 : 0}
      shadowOffset={{ x: 0, y: isSelected ? 6 : 0 }}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
      // FIX: Explicitly type event objects to resolve type inference issues.
      onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
        if (element.status === 'complete' && isPlaying) {
             togglePlay(e);
             return;
        }
        onSelect(e);
      }}
      // FIX: Explicitly type event objects to resolve type inference issues.
      onTap={(e: Konva.KonvaEventObject<TouchEvent>) => {
        if (element.status === 'complete' && isPlaying) {
             togglePlay(e);
             return;
        }
        onSelect(e);
      }}
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
      {renderStatusOverlay()}
    </Group>
  );
};

export default VideoElementComponent;
