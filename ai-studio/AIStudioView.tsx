


import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { v4 as uuidv4 } from 'uuid';
import Canvas from './components/Canvas.tsx';
import Toolbar from './components/Toolbar.tsx';
import EditPanel from './components/EditPanel.tsx';
import ActionsToolbar from './components/ActionsToolbar.tsx';
import VideoPromptModal from './components/VideoPromptModal.tsx';
import BoardTypeModal from './components/BoardTypeModal.tsx';
import BrandBoardModal from './components/BrandBoardModal.tsx';
import BrandIdentityChoiceModal from './components/BrandIdentityChoiceModal.tsx';
import UploadBrandAssetsModal from './components/UploadBrandAssetsModal.tsx';
import PromptModal from './components/PromptModal.tsx';
import GeniePanel, { GenieConversationMessage } from './components/GeniePanel.tsx';
import type { BrandAssetData } from './components/UploadBrandAssetsModal.tsx';
import { generateImage, orchestrateRemix, generateVideo, generateTextVariations, generateBrandIdentity, analyzeImageContent, analyzeTextContent, analyzeProductImageContent, removeImageBackground } from './services/aiStudioService.ts';
import { sendGenieMessage } from './services/genieService.ts';
import { isApiConfigured } from '../services/geminiService.ts';
import type { CanvasElement, ImageElement, TextElement, Board, BoardType, Connector } from './types.ts';
import { LogoIcon } from './components/icons.tsx';
import { AiLoadingIndicator } from '../components/AiLoadingIndicator.tsx';
import { ArrowLeftIcon } from '../components/icons.tsx';
import { findElement, findElementAndParent } from './utils/elementUtils.ts';
import { MOTION_TOKEN, prefersReducedMotion } from './utils/motion.ts';
import { withResponsiveBoardSize, BOARD_PADDING } from './utils/layout.ts';
import { loadWhiteboardState, saveWhiteboardState } from './storage/whiteboardStore.ts';
import { useAuth } from '../contexts/AuthContext.tsx';

interface AIStudioViewProps {
  onBack?: () => void;
}

interface RemixContext {
  contentBoards: Board[];
  brandBoard?: Board;
  brandInfo?: { colors?: string[]; logo?: ImageElement };
}

const AIStudioViewComponent: React.FC<AIStudioViewProps> = ({ onBack }) => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]); 
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [showVideoPrompt, setShowVideoPrompt] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoSourceImageId, setVideoSourceImageId] = useState<string | null>(null);
  const [promptForBoard, setPromptForBoard] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showBrandChoiceModal, setShowBrandChoiceModal] = useState(false);
  const [showUploadBrandModal, setShowUploadBrandModal] = useState(false);
  const [busyBoardIds, setBusyBoardIds] = useState<Set<string>>(new Set());

  const [boardCreationRequest, setBoardCreationRequest] = useState<{ prompt: string; type: BoardType; isGenerating: boolean } | null>(null);


  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStartBoardId, setConnectionStartBoardId] = useState<string | null>(null);
  const [connectionStartElementIds, setConnectionStartElementIds] = useState<string[]>([]);
  const [isGenieOpen, setIsGenieOpen] = useState(false);
  const [genieMessages, setGenieMessages] = useState<GenieConversationMessage[]>([]);
  const [isGenieLoading, setIsGenieLoading] = useState(false);
  const { appUser } = useAuth();
  const [hasRestoredWorkspace, setHasRestoredWorkspace] = useState(false);

  const isGeminiReady = isApiConfigured();
  const aiDisabled = !isGeminiReady;

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const actionsToolbarRef = useRef<HTMLDivElement>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const promptDockRef = useRef<HTMLDivElement>(null);
  const previousBoardCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);
  const genieActiveBoardRef = useRef<string | null>(null);

  const computeRemixContext = useCallback((remixBoardId: string): RemixContext | null => {
    const remixBoard = boards.find(b => b.id === remixBoardId);
    if (!remixBoard || remixBoard.type !== 'remix') {
      return null;
    }

    const relevantConnectors = connectors.filter(connector => connector.toBoard === remixBoardId);
    const sourceBoardMeta = new Map<string, { useAll: boolean; elementIds: Set<string> }>();

    relevantConnectors.forEach(connector => {
      if (!connector.fromBoard) return;
      const meta = sourceBoardMeta.get(connector.fromBoard) || { useAll: false, elementIds: new Set<string>() };
      if (!connector.elementIds || connector.elementIds.length === 0) {
        meta.useAll = true;
        meta.elementIds.clear();
      } else if (!meta.useAll) {
        connector.elementIds.forEach(id => meta.elementIds.add(id));
      }
      sourceBoardMeta.set(connector.fromBoard, meta);
    });

    const filteredBoards: Board[] = [];
    sourceBoardMeta.forEach((meta, boardId) => {
      const sourceBoard = boards.find(b => b.id === boardId);
      if (!sourceBoard) return;
      const filteredElements = meta.useAll
        ? sourceBoard.elements
        : sourceBoard.elements.filter(element => meta.elementIds.has(element.id));
      const effectiveElements = (!meta.useAll && filteredElements.length === 0)
        ? sourceBoard.elements
        : filteredElements;
      if (effectiveElements.length === 0) return;
      filteredBoards.push({ ...sourceBoard, elements: effectiveElements });
    });

    const brandBoard =
      filteredBoards.find(board => board.type === 'brand') ??
      boards.find(board => board.type === 'brand' && sourceBoardMeta.has(board.id));

    const brandLogo = brandBoard?.elements.find(element => element.type === 'image') as ImageElement | undefined;
    const contentBoards = filteredBoards.filter(board => board.type !== 'brand');
    const brandInfo = brandBoard ? { colors: brandBoard.colors, logo: brandLogo } : undefined;

    return { contentBoards, brandBoard, brandInfo };
  }, [boards, connectors]);

  const markBoardBusy = useCallback((boardId: string) => {
    setBusyBoardIds(prev => {
      const next = new Set(prev);
      next.add(boardId);
      return next;
    });
  }, []);

  const clearBoardBusy = useCallback((boardId: string) => {
    setBusyBoardIds(prev => {
      if (!prev.has(boardId)) return prev;
      const next = new Set(prev);
      next.delete(boardId);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      if (headerRef.current) {
        gsap.from(headerRef.current, {
          y: -24,
          opacity: 0,
          duration: MOTION_TOKEN.durations.md,
          ease: MOTION_TOKEN.eases.entrance,
        });
      }

      if (actionsToolbarRef.current) {
        gsap.from(actionsToolbarRef.current, {
          x: -24,
          opacity: 0,
          duration: MOTION_TOKEN.durations.md,
          ease: MOTION_TOKEN.eases.entrance,
          delay: 0.1,
        });
      }

      if (canvasShellRef.current) {
        gsap.from(canvasShellRef.current, {
          scale: 0.98,
          opacity: 0,
          duration: MOTION_TOKEN.durations.md,
          ease: MOTION_TOKEN.eases.entrance,
          delay: 0.15,
        });
      }

      if (promptDockRef.current) {
        gsap.from(promptDockRef.current, {
          y: 24,
          opacity: 0,
          duration: MOTION_TOKEN.durations.sm,
          ease: MOTION_TOKEN.eases.standard,
          delay: 0.2,
        });
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const restoreState = async () => {
      setHasRestoredWorkspace(false);
      try {
        const stored = await loadWhiteboardState(appUser?.id);
        if (isCancelled) return;
        if (stored) {
          const sizedBoards = stored.boards.map(b => withResponsiveBoardSize(b));
          setBoards(sizedBoards);
          setConnectors(stored.connectors);
        } else {
          setBoards([]);
          setConnectors([]);
        }
      } finally {
        if (!isCancelled) {
          setSelectedBoardIds([]);
          setSelectedElementIds([]);
          setHasRestoredWorkspace(true);
        }
      }
    };

    restoreState();

    return () => {
      isCancelled = true;
    };
  }, [appUser?.id]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (!canvasShellRef.current) return;

    if (boards.length > previousBoardCountRef.current) {
      gsap.fromTo(
        canvasShellRef.current,
        { boxShadow: '0 0 0 rgba(16,185,129,0)' },
        {
          boxShadow: '0 0 0 3px rgba(16,185,129,0.35)',
          duration: 0.25,
          ease: 'power2.out',
          yoyo: true,
          repeat: 1,
        }
      );
    }

    previousBoardCountRef.current = boards.length;
  }, [boards.length]);

  useEffect(() => {
    if (!hasRestoredWorkspace) return;

    const persistState = async () => {
      await saveWhiteboardState(appUser?.id, { boards, connectors });
    };

    void persistState();
  }, [boards, connectors, appUser?.id, hasRestoredWorkspace]);

  const handleSubmitPrompt = (currentPrompt: string) => {
    const selectedBoardId = selectedBoardIds[0];
    const selectedBoard = boards.find(b => b.id === selectedBoardId);

    if (selectedBoard && selectedBoard.type === 'remix') {
      handleRemix(selectedBoard.id);
    } else {
      setPromptForBoard(currentPrompt);
    }
  };

  const handleSendGenie = useCallback(async (message: string): Promise<boolean> => {
    const activeBoard = boards.find(b => b.id === selectedBoardIds[0]);
    if (!activeBoard || activeBoard.type !== 'remix') {
      setError('Select a Remix board to chat with Genie.');
      return false;
    }

    const context = computeRemixContext(activeBoard.id);
    if (!context || context.contentBoards.length === 0) {
      setError('Connect at least one content board to your Remix board so Genie has context.');
      return false;
    }

    const goal = prompt.trim() || activeBoard.remixPrompt || 'Creative brief not yet specified.';
    const historyPayload = genieMessages.map(({ role, text }) => ({ role, text }));
    const userMessage: GenieConversationMessage = { id: uuidv4(), role: 'user', text: message };

    setGenieMessages(prev => [...prev, userMessage]);
    setIsGenieLoading(true);

    try {
      const reply = await sendGenieMessage({
        goal,
        boards: context.contentBoards,
        brandInfo: context.brandInfo,
        message,
        history: historyPayload,
      });

      const genieReply: GenieConversationMessage = { id: uuidv4(), role: 'genie', text: reply };
      setGenieMessages(prev => [...prev, genieReply]);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Genie failed to respond.';
      setError(errorMessage);
      const fallbackReply: GenieConversationMessage = {
        id: uuidv4(),
        role: 'genie',
        text: `I ran into an issue processing that request: ${errorMessage}`,
      };
      setGenieMessages(prev => [...prev, fallbackReply]);
      return false;
    } finally {
      setIsGenieLoading(false);
    }
  }, [boards, selectedBoardIds, computeRemixContext, prompt, genieMessages]);

  const handleRemix = async (remixBoardId: string) => {
     if (!prompt.trim()) {
        setError("Please enter a prompt to generate a remix.");
        return;
     }

     const remixContext = computeRemixContext(remixBoardId);
     if (!remixContext || remixContext.contentBoards.length === 0) {
        setError("Connect at least one board with assets to your Remix board before generating a remix.");
        return;
     }

     markBoardBusy(remixBoardId);
     setIsLoading(true);
     setError(null);
     setLoadingMessage('Remixing in progress...');
     try {
        const newImageSrcs = await orchestrateRemix(
            prompt,
            remixContext.contentBoards,
            remixContext.brandInfo,
            setLoadingMessage // Pass the progress callback
        );

        const itemSize = 256;
        const padding = BOARD_PADDING;

        const newImages: ImageElement[] = newImageSrcs.map((src, index) => ({
            id: uuidv4(),
            type: 'image',
            src,
            x: (index % 2) * (itemSize + padding) + padding,
            y: Math.floor(index / 2) * (itemSize + padding) + padding,
            width: itemSize,
            height: itemSize,
            rotation: 0,
            generationPrompt: prompt,
            label: `Remix ${index + 1}`,
        }));

        setBoards(prevBoards => prevBoards.map(b => {
            if (b.id === remixBoardId) {
                // Replace existing elements with the new ones and track the prompt used
                const nextBoard: Board = { ...b, elements: newImages, remixPrompt: prompt };
                return withResponsiveBoardSize(nextBoard);
            }
            return b;
        }));
        
        setPrompt(''); // Clear prompt after generation

     } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to remix content.`);
        console.error(err);
     } finally {
        setIsLoading(false);
        setLoadingMessage(null);
        clearBoardBusy(remixBoardId);
     }
  };
  
  const handleCreateBoard = useCallback(async (prompt: string, type: BoardType, boardName: string) => {
    if (type === 'brand') return; // Brand boards are created via a different flow now
    setIsLoading(true);
    setError(null);
    setPromptForBoard(null);

    try {
        let newElements: CanvasElement[] = [];
        const boardWidth = 550;
        const itemSize = 256;
        const padding = BOARD_PADDING;

        const labelPrefix = boardName.replace(/[^a-zA-Z0-9]/g, '');


        if (type === 'image') {
            const results: string[] = [];
            for (let i = 1; i <= 4; i++) {
                setLoadingMessage(`Generating image ${i} of 4...`);
                const src = await generateImage(prompt);
                results.push(src);
            }
            newElements = results.map((src, index) => ({
                id: uuidv4(),
                type: 'image',
                src,
                x: (index % 2) * (itemSize + padding) + padding,
                y: Math.floor(index / 2) * (itemSize + padding) + padding,
                width: itemSize,
                height: itemSize,
                rotation: 0,
                generationPrompt: prompt,
                label: `${labelPrefix}${index + 1}`,
            } as ImageElement));
        } else if (type === 'text') {
            const results = await generateTextVariations(prompt);
            newElements = results.map((text, index) => ({
                id: uuidv4(),
                type: 'text',
                text,
                x: (index % 2) * (itemSize + padding) + padding,
                y: Math.floor(index / 2) * (itemSize + padding) + padding,
                width: itemSize,
                fontSize: 24,
                fill: '#0f172a',
                fontFamily: 'Inter',
                rotation: 0,
                label: `${labelPrefix}${index + 1}`,
            } as TextElement));
        }

        const newBoardBase: Board = {
            id: uuidv4(),
            type,
            title: boardName,
            x: 50 + (boards.length % 3) * (boardWidth + 50),
            y: 50 + Math.floor(boards.length / 3) * 650,
            width: boardWidth,
            height: 600,
            elements: newElements,
        };
        const newBoard = withResponsiveBoardSize(newBoardBase);

        setBoards(prev => [...prev, newBoard]);

    } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to generate ${type} board.`);
        console.error(err);
    } finally {
        setIsLoading(false);
        setLoadingMessage(null);
    }
  }, [boards.length]);

  const handleCreateEmptyBoard = (type: BoardType, boardName: string) => {
    const boardWidth = 550;
    const newBoardBase: Board = {
      id: uuidv4(),
      type: type,
      title: boardName,
      x: 50 + (boards.length % 3) * (boardWidth + 50),
      y: 50 + Math.floor(boards.length / 3) * 650,
      width: boardWidth,
      height: 600,
      elements: [],
    };
    const newBoard = withResponsiveBoardSize(newBoardBase);
    setBoards(prev => [...prev, newBoard]);
    setSelectedBoardIds([newBoard.id]);
  };
  
  const handleNameBoard = (boardName: string) => {
    if (!boardCreationRequest) return;

    if (boardCreationRequest.isGenerating) {
        handleCreateBoard(boardCreationRequest.prompt, boardCreationRequest.type, boardName);
    } else {
        handleCreateEmptyBoard(boardCreationRequest.type, boardName);
    }
    setBoardCreationRequest(null);
  };
  
  const handleCreateBrandBoard = useCallback(async (
    brandConcept: string, 
    palettePrompt: string, 
    textStyle: string
  ) => {
    setIsLoading(true);
    setError(null);
    setShowBrandModal(false);
    setLoadingMessage('Generating brand identity...');

    try {
        const { logoSrc, colors, texts } = await generateBrandIdentity(brandConcept, palettePrompt, textStyle);
        
        const logoElement: ImageElement = {
            id: uuidv4(),
            type: 'image',
            src: logoSrc,
            x: 20, y: 20, width: 128, height: 128, rotation: 0,
            label: 'Logo',
        };

        const textElements: TextElement[] = texts.map((text, index) => ({
            id: uuidv4(),
            type: 'text', text,
            x: 170, y: 20 + index * 45, width: 360,
            fontSize: 20, fontFamily: 'Inter', fill: '#0f172a', rotation: 0,
            label: `Copy${index + 1}`,
        }));

        const boardWidth = 550;
        const newBoardBase: Board = {
            id: uuidv4(),
            type: 'brand',
            title: `${brandConcept} - Brand Kit`,
            x: 50 + (boards.length % 3) * (boardWidth + 50),
            y: 50 + Math.floor(boards.length / 3) * 650,
            width: boardWidth,
            height: 600,
            elements: [logoElement, ...textElements],
            colors: colors
        };
        const newBoard = withResponsiveBoardSize(newBoardBase);

        setBoards(prev => [...prev, newBoard]);

    } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to generate brand board.`);
        console.error(err);
    } finally {
        setIsLoading(false);
        setLoadingMessage(null);
    }
  }, [boards.length]);
  
  const handleCreateBrandBoardFromUpload = useCallback((data: BrandAssetData) => {
    setIsLoading(true);
    setError(null);
    setShowUploadBrandModal(false);
    setLoadingMessage('Creating brand board...');

    try {
        const logoElement: ImageElement | null = data.logoSrc ? {
            id: uuidv4(),
            type: 'image',
            src: data.logoSrc,
            x: 20, y: 20, width: 128, height: 128, rotation: 0,
            label: 'Logo',
        } : null;

        const textElements: TextElement[] = data.textStyle ? [{
            id: uuidv4(),
            type: 'text',
            text: data.textStyle,
            x: 170, y: 20, width: 360,
            fontSize: 18, fontFamily: 'Inter', fill: '#ffffff', rotation: 0,
            label: 'BrandCopy',
        }] : [];

        const boardWidth = 550;
        const newBoardBase: Board = {
            id: uuidv4(),
            type: 'brand',
            title: `${data.brandName} - Brand Kit`,
            x: 50 + (boards.length % 3) * (boardWidth + 50),
            y: 50 + Math.floor(boards.length / 3) * 650,
            width: boardWidth,
            height: 600,
            elements: [
                ...(logoElement ? [logoElement] : []),
                ...textElements
            ],
            colors: data.colors,
        };
        
        const newBoard = withResponsiveBoardSize(newBoardBase);
        setBoards(prev => [...prev, newBoard]);

    } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to create brand board.`);
        console.error(err);
    } finally {
        setIsLoading(false);
        setLoadingMessage(null);
    }
  }, [boards.length]);

  const handleCreateImageBoardRequest = () => {
    setBoardCreationRequest({ prompt: '', type: 'image', isGenerating: false });
  };

  const handleCreateTextBoardRequest = () => {
    setBoardCreationRequest({ prompt: '', type: 'text', isGenerating: false });
  };

  const handleCreateRemixBoard = () => {
    const boardWidth = 550;
    const newBoardBase: Board = {
      id: uuidv4(),
      type: 'remix',
      title: 'Remix Stage',
      x: 50 + (boards.length % 3) * (boardWidth + 50),
      y: 50 + Math.floor(boards.length / 3) * 650,
      width: boardWidth,
      height: 600,
      elements: [],
    };
    const newBoard = withResponsiveBoardSize(newBoardBase);
    setBoards(prev => [...prev, newBoard]);
  };

  const handleCreateBrandBoardRequest = () => {
    setShowBrandChoiceModal(true);
  };
  
  const handleCreateProductBoard = () => {
    setBoardCreationRequest({ prompt: '', type: 'product', isGenerating: false });
  };


  const handleStartConnection = (boardId: string) => {
    setIsConnecting(true);
    setConnectionStartBoardId(boardId);
    const sourceBoard = boards.find(b => b.id === boardId);
    if (sourceBoard) {
      const elementSet = new Set(sourceBoard.elements.map(el => el.id));
      const selectedForBoard = selectedElementIds.filter(id => elementSet.has(id));
      setConnectionStartElementIds(selectedForBoard);
    } else {
      setConnectionStartElementIds([]);
    }
  };
  
  const handleBoardClick = (boardId: string) => {
    const clickedBoard = boards.find(b => b.id === boardId);
    if (!clickedBoard) return;

    if (isConnecting) {
      if (!connectionStartBoardId) {
        // This case should not happen with the new flow
      } else {
        if (clickedBoard.type === 'remix' && connectionStartBoardId !== boardId) {
          const startBoard = boards.find(b => b.id === connectionStartBoardId);
          if (startBoard) {
            const startElementSet = new Set(startBoard.elements.map(el => el.id));
            const resolvedElementIds = connectionStartElementIds.filter(id => startElementSet.has(id));
            const uniqueElementIds = Array.from(new Set(resolvedElementIds));
            const sanitizedElementIds = uniqueElementIds.length > 0 ? uniqueElementIds : undefined;

            const existingConnectionIndex = connectors.findIndex(c => c.fromBoard === connectionStartBoardId && c.toBoard === boardId);
            if (existingConnectionIndex >= 0) {
              setConnectors(prev => prev.map((conn, index) => {
                if (index !== existingConnectionIndex) return conn;
                if (sanitizedElementIds) {
                  return { ...conn, elementIds: sanitizedElementIds };
                }
                const { elementIds: _omit, ...rest } = conn;
                return { ...rest } as Connector;
              }));
            } else {
              setConnectors(prev => [...prev, {
                id: uuidv4(),
                fromBoard: connectionStartBoardId,
                toBoard: boardId,
                ...(sanitizedElementIds ? { elementIds: sanitizedElementIds } : {}),
              }]);
            }
          }
        }
        // Always exit connection mode after a second click
        cancelConnection();
      }
    } else {
      setSelectedBoardIds([boardId]);
      setSelectedElementIds([]);
    }
  };

  const handleElementSelect = useCallback((boardId: string, elementId: string, additive: boolean) => {
    const board = boards.find(b => b.id === boardId);
    const boardElementIds = board ? new Set(board.elements.map(el => el.id)) : new Set<string>();
    setSelectedBoardIds([boardId]);
    setSelectedElementIds(prev => {
      const scopedSelection = prev.filter(id => boardElementIds.has(id));
      if (additive) {
        if (scopedSelection.includes(elementId)) {
          return scopedSelection.filter(id => id !== elementId);
        }
        return [...scopedSelection, elementId];
      }
      return [elementId];
    });
  }, [boards]);

  const cancelConnection = useCallback(() => {
    setIsConnecting(false);
    setConnectionStartBoardId(null);
    setConnectionStartElementIds([]);
  }, []);

  const handleDeleteBoards = useCallback((boardIdsToDelete: string[]) => {
    if (boardIdsToDelete.length === 0) return;
    setBoards(prev => prev.filter(b => !boardIdsToDelete.includes(b.id)));
    setConnectors(prev => prev.filter(c => !boardIdsToDelete.includes(c.fromBoard) && !boardIdsToDelete.includes(c.toBoard)));
    setSelectedBoardIds([]);
    setSelectedElementIds([]);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBoardIds.length > 0) {
        e.preventDefault();
        handleDeleteBoards(selectedBoardIds);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBoardIds, handleDeleteBoards]);
  
  // TODO: Refactor edit/remix/animate functions to work with the new board structure
  const handleEdit = useCallback(async (prompt: string) => {}, []);
  const handleRegenerate = useCallback(async (elementId: string) => {}, []);
  const handleGenerateVideoRequest = () => setShowVideoPrompt(true);
  const handleAnimateImageRequest = () => {};
  const handleGenerateVideo = async (prompt: string) => {};
  const handleUploadClick = () => fileInputRef.current?.click();
  const handleUploadTextClick = () => textFileInputRef.current?.click();
  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const selectedBoardId = selectedBoardIds[0];
    if (!selectedBoardId) {
        setError("Please select a board first.");
        return;
    }

    const selectedBoardIndex = boards.findIndex(b => b.id === selectedBoardId);
    const selectedBoard = boards[selectedBoardIndex];

    if (!selectedBoard || (selectedBoard.type !== 'product' && selectedBoard.type !== 'image')) {
        setError("Please select a 'Product Visuals' or 'Image' board to upload images to.");
        if(fileInputRef.current) fileInputRef.current.value = "";
        return;
    }
    markBoardBusy(selectedBoardId);
    
    setIsLoading(true);
    setLoadingMessage('Analyzing uploaded images...');
    setError(null);

    try {
        const itemSize = 256;
        const padding = BOARD_PADDING;
        const startingCount = selectedBoard.elements.length;
        const labelPrefix = selectedBoard.title.replace(/[^a-zA-Z0-9]/g, '');

        const filePromises = Array.from(files).map((file, index) => 
            new Promise<ImageElement>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const src = e.target?.result as string;
                        setLoadingMessage(`Analyzing image ${index + 1} of ${files.length}...`);
                        
                        const analysis = selectedBoard.type === 'product'
                            ? await analyzeProductImageContent(src)
                            : await analyzeImageContent(src);

                        const newImage: ImageElement = {
                            id: uuidv4(),
                            type: 'image',
                            src,
                            x: ((startingCount + index) % 2) * (itemSize + padding) + padding,
                            y: Math.floor((startingCount + index) / 2) * (itemSize + padding) + padding,
                            width: itemSize,
                            height: itemSize,
                            rotation: 0,
                            label: `${labelPrefix}${startingCount + index + 1}`,
                            analysis,
                        };
                        resolve(newImage);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            })
        );

        const newImages = await Promise.all(filePromises);

        setBoards(prevBoards => prevBoards.map(b => {
            if (b.id === selectedBoardId) {
                const nextBoard: Board = { ...b, elements: [...b.elements, ...newImages] };
                return withResponsiveBoardSize(nextBoard);
            }
            return b;
        }));

    } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload and analyze images.");
        console.error(err);
    } finally {
        setIsLoading(false);
        setLoadingMessage(null);
        if(fileInputRef.current) fileInputRef.current.value = "";
        clearBoardBusy(selectedBoardId);
    }
  };

  const handleTextFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const selectedBoardId = selectedBoardIds[0];
    const selectedBoard = boards.find(b => b.id === selectedBoardId);

    if (!selectedBoard || selectedBoard.type !== 'text') {
        setError("Please select a 'Text' board to upload documents to.");
        if(textFileInputRef.current) textFileInputRef.current.value = "";
        return;
    }
    markBoardBusy(selectedBoardId);
    
    setIsLoading(true);
    setLoadingMessage('Analyzing uploaded document...');
    setError(null);

    const file = files[0];
    
    try {
        const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
        });

        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        
        const itemSize = 256;
        const padding = BOARD_PADDING;
        const startingCount = selectedBoard.elements.length;
        const labelPrefix = selectedBoard.title.replace(/[^a-zA-Z0-9]/g, '');

        const elementPromises = paragraphs.map(async (text, index) => {
            setLoadingMessage(`Analyzing paragraph ${index + 1} of ${paragraphs.length}...`);
            const analysis = await analyzeTextContent(text.trim());
            const newElement: TextElement = {
                id: uuidv4(),
                type: 'text',
                text: text.trim(),
                x: ((startingCount + index) % 2) * (itemSize + padding) + padding,
                y: Math.floor((startingCount + index) / 2) * (itemSize + padding) + padding,
                width: itemSize,
                fontSize: 18,
                fill: '#0f172a',
                fontFamily: 'Inter',
                rotation: 0,
                label: `${labelPrefix}${startingCount + index + 1}`,
                analysis,
            };
            return newElement;
        });

        const newElements = await Promise.all(elementPromises);
        
        setBoards(prevBoards => prevBoards.map(b => {
            if (b.id === selectedBoardId) {
                const nextBoard: Board = { ...b, elements: [...b.elements, ...newElements] };
                return withResponsiveBoardSize(nextBoard);
            }
            return b;
        }));
    } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to process text file.");
        console.error(err);
    } finally {
        setIsLoading(false);
        setLoadingMessage(null);
        if(textFileInputRef.current) textFileInputRef.current.value = "";
        clearBoardBusy(selectedBoardId);
    }
  };

  const handleRemoveBackgrounds = async () => {
    const selectedBoardId = selectedBoardIds[0];
    if (!selectedBoardId) return;

    const boardIndex = boards.findIndex(b => b.id === selectedBoardId);
    const board = boards[boardIndex];

    if (!board || board.type !== 'product') {
        setError("Background removal is only available for 'Product Visuals' boards.");
        return;
    }

    const imageElements = board.elements.filter(el => el.type === 'image') as ImageElement[];
    if (imageElements.length === 0) return;

    setIsLoading(true);
    setLoadingMessage('Removing backgrounds...');
    setError(null);
    markBoardBusy(selectedBoardId);

    try {
        const updates = await Promise.all(
            imageElements.map(async (el, index) => {
                setLoadingMessage(`Removing background from image ${index + 1} of ${imageElements.length}...`);
                const newSrc = await removeImageBackground(el.src);
                return { elementId: el.id, newSrc };
            })
        );
        
        setBoards(prevBoards => prevBoards.map(b => {
            if (b.id === selectedBoardId) {
                const newElements = b.elements.map(el => {
                    const update = updates.find(u => u.elementId === el.id);
                    if (update && el.type === 'image') {
                        return { ...el, src: update.newSrc, originalSrc: el.src };
                    }
                    return el;
                });
                const nextBoard: Board = { ...b, elements: newElements };
                return withResponsiveBoardSize(nextBoard);
            }
            return b;
        }));

    } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove backgrounds.");
        console.error(err);
    } finally {
        setIsLoading(false);
        setLoadingMessage(null);
        clearBoardBusy(selectedBoardId);
    }
  };
  
  const selectedElements = useMemo(() => {
    if (selectedBoardIds.length === 0) return [];
    const activeBoard = boards.find(b => b.id === selectedBoardIds[0]);
    if (!activeBoard) return [];
    return activeBoard.elements.filter(el => selectedElementIds.includes(el.id));
  }, [boards, selectedBoardIds, selectedElementIds]);
  
  const toolbarPlaceholder = useMemo(() => {
      const selectedBoard = boards.find(b => b.id === selectedBoardIds[0]);
      if (selectedBoard && selectedBoard.type === 'remix') {
          return "Describe the campaign you want to create...";
      }
      return "Describe your vision... e.g., 'a futuristic urban cafe at night'";
  }, [boards, selectedBoardIds]);
  
  const mentionSuggestions = useMemo(() => {
    const selectedBoard = boards.find(b => b.id === selectedBoardIds[0]);
    if (!selectedBoard || selectedBoard.type !== 'remix') {
      return [];
    }

    const relevantConnectors = connectors.filter(c => c.toBoard === selectedBoard.id);
    const labelSet = new Set<string>();

    relevantConnectors.forEach(conn => {
      const sourceBoard = boards.find(b => b.id === conn.fromBoard);
      if (!sourceBoard) return;
      const elementFilter = conn.elementIds && conn.elementIds.length > 0 ? new Set(conn.elementIds) : null;
      const filtered = elementFilter ? sourceBoard.elements.filter(el => elementFilter.has(el.id)) : sourceBoard.elements;
      const elementsToUse = elementFilter && filtered.length === 0 ? sourceBoard.elements : filtered;
      elementsToUse.forEach(el => {
        if ('label' in el && el.label) {
          labelSet.add(el.label);
        }
      });
    });

    return Array.from(labelSet);
  }, [boards, selectedBoardIds, connectors]);

  const selectedBoard = useMemo(() => boards.find(b => b.id === selectedBoardIds[0]), [boards, selectedBoardIds]);
  const selectedRemixContext = useMemo(() => {
    if (!selectedBoard || selectedBoard.type !== 'remix') {
      return null;
    }
    return computeRemixContext(selectedBoard.id);
  }, [selectedBoard, computeRemixContext]);
  const canUseGenie = !!selectedRemixContext && selectedRemixContext.contentBoards.length > 0;

  useEffect(() => {
    const activeRemixBoardId = selectedBoard && selectedBoard.type === 'remix' ? selectedBoard.id : null;
    if (genieActiveBoardRef.current !== activeRemixBoardId) {
      setGenieMessages([]);
      genieActiveBoardRef.current = activeRemixBoardId;
    }

    if (!activeRemixBoardId) {
      setIsGenieOpen(false);
    }
  }, [selectedBoard?.id, selectedBoard?.type]);

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-[var(--ai-surface-base)] font-sans text-slate-900">
      <div ref={canvasShellRef} className="absolute inset-0">
        <Canvas
          boards={boards}
          setBoards={setBoards}
          connectors={connectors}
          selectedBoardIds={selectedBoardIds}
          onBoardClick={handleBoardClick}
          setSelectedBoardIds={setSelectedBoardIds}
          selectedElementIds={selectedElementIds}
          setSelectedElementIds={setSelectedElementIds}
          isConnecting={isConnecting}
          connectionStartBoardId={connectionStartBoardId}
          onStartConnection={handleStartConnection}
          onCancelConnection={cancelConnection}
          onUploadClick={handleUploadClick}
          onUploadTextClick={handleUploadTextClick}
          onDeleteBoard={(boardId) => handleDeleteBoards([boardId])}
          onGenerateRemix={handleRemix}
          busyBoardIds={busyBoardIds}
          onElementSelect={handleElementSelect}
        />
      </div>

      <header ref={headerRef} className="pointer-events-none absolute left-6 top-6 z-30 flex items-center gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </button>
        )}
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-slate-200/80 bg-white px-5 py-3 shadow-sm shadow-emerald-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <LogoIcon className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-500">getmycreative</p>
            <p className="text-lg font-semibold text-slate-900">AI Studio</p>
          </div>
        </div>
      </header>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        accept="image/png, image/jpeg, image/webp"
        multiple
      />
      <input
        type="file"
        ref={textFileInputRef}
        onChange={handleTextFileChange}
        style={{ display: 'none' }}
        accept=".txt"
      />

      <div className="pointer-events-none absolute left-6 top-[55%] z-30 hidden -translate-y-1/2 lg:block">
        <ActionsToolbar
          ref={actionsToolbarRef}
          className="pointer-events-auto bg-white/95 shadow-xl"
          onUpload={handleUploadClick}
          onUploadText={handleUploadTextClick}
          onGenerateVideo={handleGenerateVideoRequest}
          onCreateImageBoard={handleCreateImageBoardRequest}
          onCreateTextBoard={handleCreateTextBoardRequest}
          onCreateRemixBoard={handleCreateRemixBoard}
          onCreateBrandBoard={handleCreateBrandBoardRequest}
          onCreateProductBoard={handleCreateProductBoard}
          onRemoveBackgrounds={handleRemoveBackgrounds}
          selectedBoard={selectedBoard}
          aiDisabled={aiDisabled}
        />
      </div>

      <div className="pointer-events-none absolute bottom-24 right-4 z-30 flex md:hidden">
        <ActionsToolbar
          className="pointer-events-auto bg-white/95 shadow-xl"
          onUpload={handleUploadClick}
          onUploadText={handleUploadTextClick}
          onGenerateVideo={handleGenerateVideoRequest}
          onCreateImageBoard={handleCreateImageBoardRequest}
          onCreateTextBoard={handleCreateTextBoardRequest}
          onCreateRemixBoard={handleCreateRemixBoard}
          onCreateBrandBoard={handleCreateBrandBoardRequest}
          onCreateProductBoard={handleCreateProductBoard}
          onRemoveBackgrounds={handleRemoveBackgrounds}
          selectedBoard={selectedBoard}
          aiDisabled={aiDisabled}
        />
      </div>

      <div className="absolute bottom-[150px] right-6 z-30 flex flex-col items-end gap-2">
        <button
          onClick={() => setIsGenieOpen(true)}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-600 shadow-lg shadow-emerald-100 transition hover:bg-emerald-50"
        >
          Ask Genie
        </button>
      </div>

      <div ref={promptDockRef} className="absolute inset-x-0 bottom-6 z-30 flex w-full justify-center px-4 lg:px-12">
        <Toolbar 
          prompt={prompt}
          setPrompt={setPrompt}
          onSubmit={handleSubmitPrompt} 
          isLoading={isLoading || isVideoLoading || !!loadingMessage}
          placeholder={toolbarPlaceholder}
          mentionSuggestions={mentionSuggestions}
        />
      </div>

      <GeniePanel
        isOpen={isGenieOpen}
        onClose={() => setIsGenieOpen(false)}
        messages={genieMessages}
        isLoading={isGenieLoading}
        onSend={handleSendGenie}
        onUsePrompt={(finalPrompt) => {
          setPrompt(finalPrompt);
          setIsGenieOpen(false);
        }}
        contextReady={canUseGenie}
        contextHelp="Connect at least one board of assets to your Remix board so Genie has context."
      />

      {loadingMessage && (
        <div className="absolute bottom-28 left-1/2 z-30 -translate-x-1/2 rounded-full border border-emerald-100 bg-white/95 px-5 py-2 text-sm font-medium text-emerald-700 shadow-lg shadow-emerald-100/50 backdrop-blur">
          <div className="flex items-center gap-2">
            <AiLoadingIndicator size={40} ariaLabel="Generating" />
            <span>{loadingMessage}</span>
          </div>
        </div>
      )}

      {selectedElements.length > 0 && (
        <EditPanel
          elements={selectedElements}
          onEdit={handleEdit}
          onRegenerate={() => handleRegenerate(selectedElementIds[0])}
          onRemix={() => {}}
          onAnimate={handleAnimateImageRequest}
          onClose={() => setSelectedElementIds([])}
          isLoading={isLoading || !!editingElementId}
        />
      )}

      {error && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-medium text-red-600 shadow-xl">
          <button onClick={() => setError(null)} className="absolute right-2 top-2 text-lg text-red-400 hover:text-red-600">&times;</button>
          <p className="pr-4">{error}</p>
        </div>
      )}

      {promptForBoard && (
        <BoardTypeModal
            onSelect={(type) => {
              if (promptForBoard) {
                setBoardCreationRequest({ prompt: promptForBoard, type, isGenerating: true });
              }
              setPromptForBoard(null);
            }}
            onClose={() => setPromptForBoard(null)}
        />
      )}

      {boardCreationRequest && (
        <PromptModal
            title="Name Your New Board"
            placeholder="e.g., Coffee Bean Ideas"
            isLoading={isLoading}
            onSubmit={handleNameBoard}
            onClose={() => setBoardCreationRequest(null)}
        />
      )}

      {showBrandChoiceModal && (
        <BrandIdentityChoiceModal
            onGenerate={() => {
                setShowBrandChoiceModal(false);
                setShowBrandModal(true);
            }}
            onUpload={() => {
                setShowBrandChoiceModal(false);
                setShowUploadBrandModal(true);
            }}
            onClose={() => setShowBrandChoiceModal(false)}
        />
      )}
      
      {showUploadBrandModal && (
        <UploadBrandAssetsModal
            onSubmit={handleCreateBrandBoardFromUpload}
            onClose={() => setShowUploadBrandModal(false)}
            isLoading={isLoading}
        />
      )}

      {showBrandModal && (
        <BrandBoardModal
            onSubmit={handleCreateBrandBoard}
            onClose={() => setShowBrandModal(false)}
            isLoading={isLoading}
        />
      )}

      {showVideoPrompt && (
        <VideoPromptModal 
            onSubmit={handleGenerateVideo}
            onClose={() => {
              setShowVideoPrompt(false);
              setVideoSourceImageId(null);
            }}
            isLoading={isVideoLoading}
        />
      )}
    </div>
  );
};

export const AIStudioView = AIStudioViewComponent;

export default AIStudioViewComponent;
