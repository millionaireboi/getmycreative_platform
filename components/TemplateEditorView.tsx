import React, { useState, useEffect, useRef, MouseEvent, useCallback } from 'react';
import { Template, Mark, TemplateStatus } from '../core/types/index.ts';
import { UITemplate } from '../types.ts';
import { updateTemplate } from '../core/systems/templateStore.ts';
import { ALL_TAGS, TEMPLATE_CATEGORIES } from '../constants.ts';
import { ArrowLeftIcon, XIcon, TrashIcon, SparklesIcon } from './icons.tsx';
import { imageUrlToBase64 } from '../utils/fileUtils.ts';
import { detectEditableRegions, generateTemplateMetadata, isApiConfigured } from '../services/geminiService.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { uploadFileToStorage } from '../firebase/config.ts';

type InteractionMode = 'select' | 'drawing';
type DrawingType = 'text' | 'image';

type ResizeHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const RESIZE_HANDLE_SIZE = 8; // in pixels
const MIN_MARK_DIMENSION = 0.01;
const RESIZE_HANDLES: ResizeHandle[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const HANDLE_POSITION_CLASSES: Record<ResizeHandle, string> = {
    'top-left': 'absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
    'top-right': 'absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
    'bottom-left': 'absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
    'bottom-right': 'absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getMarkBounds = (mark: Mark) => {
    const width = mark.width ?? 0;
    const height = mark.height ?? 0;
    return {
        left: mark.x - width / 2,
        top: mark.y - height / 2,
        right: mark.x + width / 2,
        bottom: mark.y + height / 2,
    };
};

export const TemplateEditorView = ({ template, onBack }: { template: UITemplate, onBack: () => void }) => {
    const { appUser } = useAuth();
    const [title, setTitle] = useState(template.title);
    const [prompt, setPrompt] = useState(template.prompt);
    const [tags, setTags] = useState<string[]>(template.tags);
    const [category, setCategory] = useState(template.category || '');
    const [marks, setMarks] = useState<Mark[]>(template.initialMarks || []);
    const [useCases, setUseCases] = useState<string[]>(template.useCases || []);
    
    const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
    const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
    const [drawingType, setDrawingType] = useState<DrawingType>('text');
    const [drawingStart, setDrawingStart] = useState<{ x: number, y: number } | null>(null);
    const [currentDrawing, setCurrentDrawing] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    const imageContainerRef = useRef<HTMLDivElement>(null);
    const imageElementRef = useRef<HTMLImageElement>(null);
    const [imageBounds, setImageBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });
    const isDraggingRef = useRef(false);
    const resizeInfoRef = useRef<{ markId: string; handle: ResizeHandle } | null>(null);
    const resizeBoundsRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null);
    const dragStartPosRef = useRef({ x: 0, y: 0 });

    const updateImageBounds = useCallback(() => {
        if (!imageContainerRef.current || !imageElementRef.current) return;
        const containerRect = imageContainerRef.current.getBoundingClientRect();
        const imageRect = imageElementRef.current.getBoundingClientRect();
        setImageBounds({
            left: imageRect.left - containerRect.left,
            top: imageRect.top - containerRect.top,
            width: imageRect.width,
            height: imageRect.height,
        });
    }, []);

    const getNormalizedPoint = useCallback((event: MouseEvent<HTMLDivElement>) => {
        if (!imageElementRef.current) return null;
        const rect = imageElementRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) {
            return null;
        }
        return {
            x: clamp(x, 0, 1),
            y: clamp(y, 0, 1),
        };
    }, []);

    useEffect(() => {
        setTitle(template.title);
        setPrompt(template.prompt);
        setTags(template.tags);
        setCategory(template.category || '');
        setMarks(template.initialMarks || []);
        setUseCases(template.useCases || []);
        requestAnimationFrame(() => updateImageBounds());
    }, [template, updateImageBounds]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => updateImageBounds());
        window.addEventListener('resize', updateImageBounds);
        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && imageContainerRef.current) {
            observer = new ResizeObserver(() => updateImageBounds());
            observer.observe(imageContainerRef.current);
        }
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', updateImageBounds);
            observer?.disconnect();
        };
    }, [updateImageBounds]);

    const handleTagToggle = (tag: string) => {
        setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    const handleSaveChanges = async (submitForReview = false) => {
        setIsSaving(true);
        
        let finalImageUrl = template.imageUrl;
        // Ensure we never persist a blob: URL. If the preview is a blob,
        // upload either the original File or fetch the Blob from the blob URL.
        if (template.imageUrl.startsWith('blob:') && appUser) {
            try {
                let blobToUpload: File | Blob | null = null;
                if (template.file instanceof File) {
                    blobToUpload = template.file;
                } else {
                    // Fallback: fetch the blob from the current imageUrl
                    const res = await fetch(template.imageUrl);
                    if (!res.ok) throw new Error(`Failed to resolve blob URL: ${res.status}`);
                    blobToUpload = await res.blob();
                }
                finalImageUrl = await uploadFileToStorage(blobToUpload, `templates/${appUser.id}`);
            } catch (error) {
                console.error("Failed to upload template image before saving:", error);
                alert("Error: Could not upload the template image. Your changes were not saved. Please try again.");
                setIsSaving(false);
                return;
            }
        }

        const newStatus = submitForReview ? TemplateStatus.PENDING_REVIEW : template.status;
        const updates: Partial<Template> = {
            title,
            prompt,
            tags,
            category,
            initialMarks: marks,
            status: newStatus,
            imageUrl: finalImageUrl,
            useCases,
        };
        try {
            await updateTemplate(template.id, updates);
        } catch (err) {
            // If this was a temporary client-side template without a Firestore ID,
            // surface a friendly message.
            console.error('Update failed', err);
            alert('Saving failed. If the upload is still in progress, please wait until it completes, then try again.');
            setIsSaving(false);
            return;
        }
        setIsSaving(false);
        onBack();
    };

    const handleResizeMouseDown = (event: MouseEvent<HTMLDivElement>, markId: string, handle: ResizeHandle) => {
        event.preventDefault();
        event.stopPropagation();
        if (!imageContainerRef.current) return;

        const targetMark = marks.find(m => m.id === markId);
        if (!targetMark) return;

        resizeInfoRef.current = { markId, handle };
        resizeBoundsRef.current = getMarkBounds(targetMark);
        isDraggingRef.current = false;
        setSelectedMarkId(markId);
    };

    const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
        const point = getNormalizedPoint(e);
        if (!point) {
            setSelectedMarkId(null);
            return;
        }

        if (interactionMode === 'drawing') {
            setDrawingStart(point);
            return;
        }

        const clickedMark = marks.find(mark => {
            const halfWidth = (mark.width || 0) / 2;
            const halfHeight = (mark.height || 0) / 2;
            return (
                point.x >= mark.x - halfWidth &&
                point.x <= mark.x + halfWidth &&
                point.y >= mark.y - halfHeight &&
                point.y <= mark.y + halfHeight
            );
        });
        
        setSelectedMarkId(clickedMark?.id || null);

        if (clickedMark) {
            isDraggingRef.current = true;
            dragStartPosRef.current = { x: point.x - clickedMark.x, y: point.y - clickedMark.y };
        }
    };
    
    const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
        if (!imageElementRef.current) return;
        const rect = imageElementRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const rawX = (e.clientX - rect.left) / rect.width;
        const rawY = (e.clientY - rect.top) / rect.height;
        const clampedX = clamp(rawX, 0, 1);
        const clampedY = clamp(rawY, 0, 1);

        const activeResize = resizeInfoRef.current;
        if (activeResize && resizeBoundsRef.current) {
            const { markId, handle } = activeResize;
            const startBounds = resizeBoundsRef.current;
            setMarks(prev => prev.map(mark => {
                if (mark.id !== markId) return mark;
                let { left, top, right, bottom } = startBounds;

                if (handle.includes('left')) {
                    left = clamp(clampedX, 0, right - MIN_MARK_DIMENSION);
                }
                if (handle.includes('right')) {
                    right = clamp(clampedX, left + MIN_MARK_DIMENSION, 1);
                }
                if (handle.includes('top')) {
                    top = clamp(clampedY, 0, bottom - MIN_MARK_DIMENSION);
                }
                if (handle.includes('bottom')) {
                    bottom = clamp(clampedY, top + MIN_MARK_DIMENSION, 1);
                }

                const width = clamp(right - left, MIN_MARK_DIMENSION, 1);
                const height = clamp(bottom - top, MIN_MARK_DIMENSION, 1);
                const x = clamp(left + width / 2, 0, 1);
                const y = clamp(top + height / 2, 0, 1);

                resizeBoundsRef.current = { left, top, right, bottom };

                return { ...mark, x, y, width, height };
            }));
            return;
        }

        if (drawingStart) {
            const startX = Math.min(drawingStart.x, clampedX);
            const startY = Math.min(drawingStart.y, clampedY);
            const width = Math.abs(clampedX - drawingStart.x);
            const height = Math.abs(clampedY - drawingStart.y);
            setCurrentDrawing({ x: startX, y: startY, width, height });
            return;
        }
        
        if (isDraggingRef.current && selectedMarkId) {
            const newX = rawX - dragStartPosRef.current.x;
            const newY = rawY - dragStartPosRef.current.y;
            setMarks(prev => prev.map(m => m.id === selectedMarkId ? { ...m, x: newX, y: newY } : m));
        }
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
        resizeInfoRef.current = null;
        resizeBoundsRef.current = null;

        if (drawingStart && currentDrawing) {
            const newMark: Mark = {
                id: `${drawingType}-${Date.now()}`,
                type: drawingType,
                label: `New ${drawingType}`,
                x: currentDrawing.x + currentDrawing.width / 2,
                y: currentDrawing.y + currentDrawing.height / 2,
                width: currentDrawing.width,
                height: currentDrawing.height,
                category: 'content'
            };
            setMarks(prev => [...prev, newMark]);
        }
        setDrawingStart(null);
        setCurrentDrawing(null);
        setInteractionMode('select');
    };

    const startDrawing = (type: DrawingType) => {
        setInteractionMode('drawing');
        setDrawingType(type);
        setSelectedMarkId(null);
    };
    
    const removeMark = (markId: string) => {
        setMarks(prev => prev.filter(m => m.id !== markId));
        if (selectedMarkId === markId) {
            setSelectedMarkId(null);
        }
    };
    
    const updateMarkLabel = (markId: string, newLabel: string) => {
        setMarks(prev => prev.map(m => m.id === markId ? { ...m, label: newLabel } : m));
    }

    const handleUseCaseChange = (index: number, value: string) => {
        setUseCases(prev => prev.map((entry, i) => (i === index ? value : entry)));
    };

    const handleAddUseCase = () => {
        setUseCases(prev => [...prev, '']);
    };

    const handleRemoveUseCase = (index: number) => {
        setUseCases(prev => prev.filter((_, i) => i !== index));
    };

    const handleAutoAnalyze = async () => {
        if (!isApiConfigured()) {
            alert("AI features are not configured. Please set up the API key.");
            return;
        }

        if (!window.confirm("This will overwrite any existing metadata and regions with AI-generated suggestions. Do you want to continue?")) {
            return;
        }

        setIsAnalyzing(true);
        try {
            const { base64, mimeType } = await imageUrlToBase64(template.imageUrl);
            
            const [detectedMarks, metadata] = await Promise.all([
                detectEditableRegions(base64, mimeType),
                generateTemplateMetadata(base64, mimeType)
            ]);
            
            setMarks(detectedMarks);
            setTitle(metadata.title);
            setPrompt(metadata.prompt);
            setTags(metadata.tags);
            setUseCases(metadata.useCases ?? []);
            
            alert("AI analysis complete! The fields have been updated with suggestions.");

        } catch (error) {
            console.error("Failed to auto-analyze template:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            alert(`Analysis failed: ${errorMessage}`);
        } finally {
            setIsAnalyzing(false);
        }
    };


    return (
        <div className="fixed inset-0 bg-slate-100 z-30 flex flex-col">
            <header className="flex-shrink-0 bg-white border-b border-slate-200 flex items-center justify-between p-3">
                 <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back to Studio
                </button>
                <div className="flex-grow text-center">
                    <h1 className="text-lg font-bold text-gray-800 truncate px-4" title={title}>{title}</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => handleSaveChanges(false)} disabled={isSaving || isAnalyzing} className="px-4 py-2 text-sm font-medium text-gray-700 bg-slate-200 rounded-lg hover:bg-slate-300 disabled:opacity-50">Save Draft</button>
                    <button onClick={() => handleSaveChanges(true)} disabled={isSaving || isAnalyzing} className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50">Submit for Review</button>
                </div>
            </header>

            <main className="flex-grow flex overflow-hidden relative">
                {isAnalyzing && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                        <SparklesIcon className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                        <h2 className="text-xl font-bold text-gray-800">Analyzing Template...</h2>
                        <p className="text-gray-600">Our AI is identifying editable regions and metadata.</p>
                    </div>
                )}
                <div 
                    ref={imageContainerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp} // End drag/draw if mouse leaves
                    className="flex-1 bg-slate-200 p-8 flex items-center justify-center relative select-none"
                >
                    <img 
                        ref={imageElementRef}
                        src={template.imageUrl} 
                        alt="Template Preview"
                        className="max-w-full max-h-full object-contain shadow-lg"
                        draggable="false"
                        onLoad={updateImageBounds}
                    />
                    {imageBounds.width > 0 && imageBounds.height > 0 && (
                        <div
                            className="absolute pointer-events-none"
                            style={{
                                left: imageBounds.left,
                                top: imageBounds.top,
                                width: imageBounds.width,
                                height: imageBounds.height,
                            }}
                        >
                            {/* Render Marks */}
                            {marks.map(mark => {
                                const style = {
                                    left: `${(mark.x - (mark.width || 0) / 2) * 100}%`,
                                    top: `${(mark.y - (mark.height || 0) / 2) * 100}%`,
                                    width: `${(mark.width || 0) * 100}%`,
                                    height: `${(mark.height || 0) * 100}%`,
                                };
                                const isSelected = selectedMarkId === mark.id;
                                return (
                                    <div
                                        key={mark.id}
                                        style={style}
                                        className={`absolute border-2 transition-colors pointer-events-auto ${isSelected ? 'border-emerald-500 bg-emerald-500/20' : 'border-dashed border-white/80 hover:bg-white/20'}`}
                                    >
                                        <span className="absolute -top-5 left-0 text-xs bg-white/80 text-black px-1.5 py-0.5 rounded-full">{mark.label}</span>
                                        {isSelected && <button onClick={() => removeMark(mark.id)} className="absolute -top-2 -right-2 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"><TrashIcon className="w-3 h-3"/></button>}
                                        {isSelected && RESIZE_HANDLES.map(handle => (
                                            <div
                                                key={`${mark.id}-${handle}`}
                                                onMouseDown={event => handleResizeMouseDown(event, mark.id, handle)}
                                                className={`${HANDLE_POSITION_CLASSES[handle]} bg-white border border-emerald-500 rounded-full shadow pointer-events-auto`}
                                                style={{ width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE }}
                                            />
                                        ))}
                                    </div>
                                );
                            })}
                            {/* Render Current Drawing */}
                            {currentDrawing && (
                                <div
                                    style={{
                                        left: `${currentDrawing.x * 100}%`,
                                        top: `${currentDrawing.y * 100}%`,
                                        width: `${currentDrawing.width * 100}%`,
                                        height: `${currentDrawing.height * 100}%`,
                                    }}
                                    className="absolute border-2 border-emerald-500 bg-emerald-500/20 pointer-events-none"
                                />
                            )}
                        </div>
                    )}

                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-sm rounded-lg shadow-md p-2 flex gap-2">
                        <button onClick={() => startDrawing('text')} className={`px-3 py-1 text-sm rounded-md ${interactionMode === 'drawing' && drawingType === 'text' ? 'bg-emerald-500 text-white' : 'hover:bg-slate-200'}`}>Add Text Region</button>
                        <button onClick={() => startDrawing('image')} className={`px-3 py-1 text-sm rounded-md ${interactionMode === 'drawing' && drawingType === 'image' ? 'bg-emerald-500 text-white' : 'hover:bg-slate-200'}`}>Add Image Region</button>
                    </div>
                </div>

                <aside className="w-96 bg-white border-l border-slate-200 flex flex-col">
                    <div className="flex-grow overflow-y-auto p-6 space-y-6">
                        <div className="pb-4 border-b border-slate-200">
                             <button 
                                onClick={handleAutoAnalyze}
                                disabled={!isApiConfigured() || isAnalyzing}
                                className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:bg-emerald-300 disabled:cursor-not-allowed"
                            >
                                <SparklesIcon className="w-4 h-4" />
                                Auto-Analyze Template
                            </button>
                            {!isApiConfigured() && <p className="text-xs text-center text-red-600 mt-2">AI analysis is disabled. Set API_KEY to enable.</p>}
                        </div>
                        <div>
                            <label className="font-semibold text-gray-800">Title</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full mt-1 border border-slate-300 rounded-md p-2 focus:ring-emerald-500 focus:border-emerald-500" />
                        </div>
                        <div>
                            <label className="font-semibold text-gray-800">AI Prompt</label>
                            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6} className="w-full mt-1 border border-slate-300 rounded-md p-2 focus:ring-emerald-500 focus:border-emerald-500" />
                        </div>
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="font-semibold text-gray-800">Suggested Use Cases</label>
                                <button
                                    type="button"
                                    onClick={handleAddUseCase}
                                    className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                                >
                                    Add
                                </button>
                            </div>
                            {useCases.length === 0 && (
                                <p className="text-xs text-gray-500 mt-1">Run auto-analysis to generate suggestions, or add your own ideas manually.</p>
                            )}
                            <div className="space-y-3 mt-2">
                                {useCases.map((idea, index) => (
                                    <div key={`use-case-${index}`} className="relative">
                                        <textarea
                                            value={idea}
                                            onChange={e => handleUseCaseChange(index, e.target.value)}
                                            rows={3}
                                            className="w-full border border-slate-300 rounded-md p-2 pr-12 text-sm focus:ring-emerald-500 focus:border-emerald-500"
                                            placeholder="e.g., Send as a WhatsApp festival greeting to loyal customers"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveUseCase(index)}
                                            className="absolute top-2 right-2 text-xs text-gray-500 hover:text-red-600"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="font-semibold text-gray-800">Category</label>
                            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full mt-1 border border-slate-300 rounded-md p-2 focus:ring-emerald-500 focus:border-emerald-500">
                                <option value="">Select a category</option>
                                {TEMPLATE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="font-semibold text-gray-800">Tags</label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {ALL_TAGS.map(tag => (
                                    <button key={tag} onClick={() => handleTagToggle(tag)} className={`px-3 py-1 text-sm rounded-full transition-colors ${tags.includes(tag) ? 'bg-emerald-500 text-white' : 'bg-slate-200 hover:bg-slate-300'}`}>{tag}</button>
                                ))}
                            </div>
                        </div>
                         <div>
                            <h3 className="font-semibold text-gray-800 mb-2">Editable Regions ({marks.length})</h3>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                {marks.map(mark => (
                                    <div 
                                        key={mark.id} 
                                        onClick={() => setSelectedMarkId(mark.id)}
                                        className={`p-2 rounded-md cursor-pointer border-2 ${selectedMarkId === mark.id ? 'border-emerald-500 bg-emerald-50' : 'border-transparent bg-slate-100 hover:bg-slate-200'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <input 
                                                type="text" 
                                                value={mark.label} 
                                                onChange={e => updateMarkLabel(mark.id, e.target.value)} 
                                                className="font-medium bg-transparent flex-grow focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded-sm px-1 -ml-1"
                                            />
                                            <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-full">{mark.type}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
};
