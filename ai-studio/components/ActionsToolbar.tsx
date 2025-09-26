

import React from 'react';
import { UploadIcon, VideoIcon, RemixIcon, BrandIcon, ProductIcon, DocumentTextIcon, ImageIcon, DocumentAddIcon, SimpleCutIcon as CutIcon } from './icons.tsx';
import type { Board } from '../types.ts';

interface ActionsToolbarProps {
    onUpload: () => void;
    onUploadText: () => void;
    onGenerateVideo: () => void;
    onCreateImageBoard: () => void;
    onCreateTextBoard: () => void;
    onCreateRemixBoard: () => void;
    onCreateBrandBoard: () => void;
    onCreateProductBoard: () => void;
    onRemoveBackgrounds: () => void;
    selectedBoard?: Board;
    className?: string;
    aiDisabled?: boolean;
}

const ActionsToolbar = React.forwardRef<HTMLDivElement, ActionsToolbarProps>(({ 
    onUpload, onUploadText, onGenerateVideo,
    onCreateImageBoard, onCreateTextBoard, onCreateRemixBoard, onCreateBrandBoard, onCreateProductBoard,
    onRemoveBackgrounds, selectedBoard, className, aiDisabled = false
}, ref) => {
    
    const creationActions = [
        { id: 'imageBoard', title: 'Create Image Board', icon: <ImageIcon />, onClick: onCreateImageBoard, disabled: aiDisabled },
        { id: 'textBoard', title: 'Create Text Board', icon: <DocumentTextIcon />, onClick: onCreateTextBoard, disabled: aiDisabled },
        { id: 'remix', title: 'Create Remix Board', icon: <RemixIcon />, onClick: onCreateRemixBoard, disabled: aiDisabled },
        { id: 'brand', title: 'Create Brand Board', icon: <BrandIcon />, onClick: onCreateBrandBoard, disabled: aiDisabled },
        { id: 'product', title: 'Create Product Board', icon: <ProductIcon />, onClick: onCreateProductBoard, disabled: aiDisabled },
    ];

    const hasImagesInSelectedProductBoard = selectedBoard?.type === 'product' && selectedBoard.elements.some(e => e.type === 'image');

    const assetActions = [
        { id: 'uploadImage', title: 'Upload image(s) to selected board', icon: <UploadIcon />, onClick: onUpload, disabled: !selectedBoard },
        { id: 'uploadText', title: 'Upload .txt to selected text board', icon: <DocumentAddIcon />, onClick: onUploadText, disabled: selectedBoard?.type !== 'text' },
        { id: 'removeBg', title: 'Remove background from product images', icon: <CutIcon />, onClick: onRemoveBackgrounds, disabled: !hasImagesInSelectedProductBoard || aiDisabled },
        { id: 'video', title: 'Generate video from prompt', icon: <VideoIcon />, onClick: onGenerateVideo, disabled: aiDisabled },
    ];
    
    const ActionButton: React.FC<{action: typeof creationActions[0]}> = ({ action }) => {
        const enabledClass = "bg-white/85 text-emerald-600 hover:bg-emerald-500 hover:text-white hover:shadow-lg";
        const disabledClass = "bg-slate-100/80 text-slate-300 cursor-not-allowed";
        const isDisabled = action.disabled;

        return (
            <div className="group relative flex items-center justify-center">
                <button
                    type="button"
                    aria-disabled={isDisabled}
                    onClick={() => {
                        if (!isDisabled) {
                            action.onClick();
                        }
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/70 transition-all duration-200 ${isDisabled ? disabledClass : enabledClass} ${isDisabled ? '' : 'hover:scale-110'}`}
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-current/15">
                        {action.icon}
                    </span>
                </button>
                <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-2 whitespace-nowrap rounded-full bg-slate-900/95 px-3 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                    {action.title}
                </span>
            </div>
        );
    };

    return (
        <div ref={ref} className={`flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-white/60 p-3 shadow-lg shadow-emerald-100/40 backdrop-blur-xl ${className || ''}`}>
            <div className="flex flex-col items-center gap-3">
                {creationActions.map(action => <ActionButton key={action.id} action={action} />)}
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex flex-col items-center gap-3">
                {assetActions.map(action => <ActionButton key={action.id} action={action} />)}
            </div>
        </div>
    );
});

ActionsToolbar.displayName = 'ActionsToolbar';

export default ActionsToolbar;
