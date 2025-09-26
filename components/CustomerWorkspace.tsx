import React, { useState, ChangeEvent, useRef, useEffect, useCallback } from 'react';
import { Project, TemplateStatus } from '../core/types/index.ts';
import { UITemplate, Mark } from '../types.ts';
import { DashboardView } from './DashboardView.tsx';
import { ExploreView } from './ExploreView.tsx';
import { BrandKitSetupModal } from './BrandKitSetupModal.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { fileToBase64 } from '../utils/fileUtils.ts';
import { detectEditableRegions, getTagsForSearchQuery, isApiConfigured } from '../services/geminiService.ts';
// FIX: Update import path for uploadFileToStorage to resolve module conflict.
import { uploadFileToStorage } from '../firebase/config.ts';
import { ProfileDropdown } from './Header.tsx';
import { LayoutGridIcon, FolderIcon, PaletteIcon, UploadCloudIcon, SearchIcon, UserIcon, SettingsIcon, LogOutIcon, ChevronLeftIcon, ChevronRightIcon, SparklesIcon } from './icons.tsx';
import { AIStudioView } from '../ai-studio/AIStudioView.tsx';

interface CustomerWorkspaceProps {
    onSelectTemplate: (template: UITemplate) => void;
    onSelectProject: (project: Project) => void;
}

const useDebouncedEffect = (effect: () => void, deps: React.DependencyList, delay: number) => {
    const callback = useCallback(effect, deps);

    useEffect(() => {
        const handler = setTimeout(() => {
            callback();
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [callback, delay]);
};


const Sidebar = ({ activeView, onNavClick, onBrandKitClick, isCollapsed, onToggle }: { 
    activeView: 'explore' | 'projects' | 'aiStudio';
    onNavClick: (view: 'explore' | 'projects' | 'aiStudio') => void;
    onBrandKitClick: () => void;
    isCollapsed: boolean;
    onToggle: () => void;
}) => (
    <aside className={`bg-white border-r border-slate-200 flex flex-col p-4 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <div className={`text-xl font-bold text-gray-800 tracking-tight font-display cursor-pointer mb-8 ${isCollapsed ? 'text-center' : ''}`}>
             {isCollapsed ? (
                <span className="text-emerald-600 font-black text-2xl">g</span>
            ) : (
                <>
                    <span className="text-emerald-600">get</span>mycreative
                </>
            )}
        </div>
        <nav className="flex flex-col gap-2 flex-grow">
            <button
                onClick={() => onNavClick('explore')}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-base font-semibold transition-colors ${isCollapsed ? 'justify-center' : ''} ${activeView === 'explore' ? 'bg-emerald-50 text-emerald-600' : 'text-gray-600 hover:bg-slate-100'}`}
                title="Explore"
            >
                <LayoutGridIcon className="w-5 h-5 flex-shrink-0" />
                <span className={isCollapsed ? 'sr-only' : ''}>Explore</span>
            </button>
            <button
                onClick={() => onNavClick('aiStudio')}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-base font-semibold transition-colors ${isCollapsed ? 'justify-center' : ''} ${activeView === 'aiStudio' ? 'bg-emerald-50 text-emerald-600' : 'text-gray-600 hover:bg-slate-100'}`}
                title="AI Studio"
            >
                <SparklesIcon className="w-5 h-5 flex-shrink-0" />
                <span className={isCollapsed ? 'sr-only' : ''}>AI Studio</span>
            </button>
            <button
                onClick={() => onNavClick('projects')}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-base font-semibold transition-colors ${isCollapsed ? 'justify-center' : ''} ${activeView === 'projects' ? 'bg-emerald-50 text-emerald-600' : 'text-gray-600 hover:bg-slate-100'}`}
                title="My Projects"
            >
                <FolderIcon className="w-5 h-5 flex-shrink-0" />
                <span className={isCollapsed ? 'sr-only' : ''}>My Projects</span>
            </button>
            <button
                onClick={onBrandKitClick}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-base font-semibold transition-colors ${isCollapsed ? 'justify-center' : ''} text-gray-600 hover:bg-slate-100`}
                title="Brand Kit"
            >
                <PaletteIcon className="w-5 h-5 flex-shrink-0" />
                <span className={isCollapsed ? 'sr-only' : ''}>Brand Kit</span>
            </button>
        </nav>
        <div className="pt-2 border-t border-slate-200">
             <button
                onClick={onToggle}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium w-full transition-colors ${isCollapsed ? 'justify-center' : ''} text-gray-600 hover:bg-slate-100`}
                title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
                {isCollapsed ? <ChevronRightIcon className="w-5 h-5" /> : <ChevronLeftIcon className="w-5 h-5" />}
                <span className="sr-only">{isCollapsed ? 'Expand' : 'Collapse'}</span>
            </button>
        </div>
    </aside>
);

export const CustomerWorkspace = ({ onSelectTemplate, onSelectProject }: CustomerWorkspaceProps) => {
    const [activeView, setActiveView] = useState<'explore' | 'projects' | 'aiStudio'>('explore');
    const [searchQuery, setSearchQuery] = useState('');
    const [aiTags, setAiTags] = useState<string[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isBrandKitModalOpen, setIsBrandKitModalOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const { appUser } = useAuth();
    const uploadInputRef = useRef<HTMLInputElement>(null);

    useDebouncedEffect(() => {
        const fetchAiTags = async () => {
            if (searchQuery.length > 2 && isApiConfigured()) {
                setIsSearching(true);
                try {
                    const tags = await getTagsForSearchQuery(searchQuery);
                    setAiTags(tags);
                } catch (error) {
                    console.error("AI search failed:", error);
                    setAiTags([]); // Clear tags on error
                } finally {
                    setIsSearching(false);
                }
            } else {
                setAiTags([]); // Clear tags if search is too short
            }
        };
        fetchAiTags();
    }, [searchQuery], 500); // 500ms debounce delay


    const handleUploadClick = () => {
        uploadInputRef.current?.click();
    };

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files?.[0] || !appUser) return;
        setIsUploading(true);
        const file = event.target.files[0];
        
        try {
            // Run storage upload and base64 conversion in parallel
            const [imageUrl, base64] = await Promise.all([
                uploadFileToStorage(file, `projects/${appUser.id}`),
                fileToBase64(file),
            ]);
            
            let detectedMarks: Mark[] = [];
            if (isApiConfigured()) {
                try {
                    // Analyze in the background for editable regions
                    detectedMarks = await detectEditableRegions(base64, file.type);
                } catch (analysisError) {
                    console.warn("Could not analyze the template, proceeding without editable regions:", analysisError);
                    alert("We couldn't automatically detect editable regions in your image, but you can still proceed and add them manually in the editor.");
                }
            }
            
            const now = new Date();
            const newTemplate: UITemplate = {
                id: `custom-${Date.now()}`,
                title: file.name.split('.')[0] || "Custom Upload",
                imageUrl: imageUrl, // Use the permanent URL from storage
                tags: ['Custom'],
                prompt: 'Generate a creative based on the uploaded image. Integrate the provided text, logo, and product images seamlessly into the style of the uploaded template image.',
                placeholders: { logo: true, productImage: true, headline: true, body: true },
                initialMarks: detectedMarks, // Add the detected marks to the template object
                status: TemplateStatus.DRAFT,
                designerId: appUser.id,
                version: 1,
                isArchived: false,
                analytics: { uses: 0 },
                createdAt: now,
                updatedAt: now,
            };

            onSelectTemplate(newTemplate); // Go to editor with the complete template data

        } catch (error) {
            console.error("Error handling file upload:", error);
            alert("Sorry, there was a problem uploading your template. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    if (activeView === 'aiStudio') {
        return (
            <div className="h-screen bg-slate-100">
                <AIStudioView onBack={() => setActiveView('explore')} />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar 
                activeView={activeView} 
                onNavClick={setActiveView} 
                onBrandKitClick={() => setIsBrandKitModalOpen(true)}
                isCollapsed={isSidebarCollapsed}
                onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            />
            <div className="relative flex-1">
                <main className="flex-1 flex flex-col overflow-hidden h-full">
                    {activeView !== 'aiStudio' && (
                        <header className="flex-shrink-0 bg-slate-100/80 backdrop-blur-sm z-10">
                           <div className="container mx-auto px-4 py-3 flex items-center justify-end">
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={handleUploadClick} 
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:bg-emerald-300"
                                    disabled={isUploading}
                                >
                                    {isUploading ? (
                                        <SparklesIcon className="w-4 h-4 animate-spin"/>
                                    ) : (
                                        <UploadCloudIcon className="w-4 h-4"/>
                                    )}
                                    {isUploading ? 'Processing...' : 'Upload Template'}
                                </button>
                                <input type="file" ref={uploadInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                                <ProfileDropdown/>
                            </div>
                           </div>
                        </header>
                    )}
                    <div className={`flex-1 ${activeView === 'aiStudio' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                        {activeView === 'explore' && <ExploreView onSelectTemplate={onSelectTemplate} searchQuery={searchQuery} aiTags={aiTags} />}
                        {activeView === 'projects' && <DashboardView onSelectProject={onSelectProject} />}
                        {activeView === 'aiStudio' && (
                            <div className="flex h-full w-full flex-col bg-slate-50">
                                <AIStudioView />
                            </div>
                        )}
                    </div>
                </main>

                {activeView !== 'aiStudio' && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4">
                        <div className="relative bg-white/60 backdrop-blur-lg border border-slate-200/50 rounded-full shadow-2xl shadow-black/20">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none">
                                {isSearching ? (
                                    <SparklesIcon className="w-6 h-6 text-emerald-500 animate-spin" />
                                ) : (
                                    <SearchIcon className="w-6 h-6 text-gray-500" />
                                )}
                            </div>
                            <input
                                type="text"
                                placeholder="what would you wish for"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-16 pr-6 py-4 bg-transparent rounded-full focus:ring-2 focus:ring-emerald-500 focus:outline-none text-lg text-gray-800 placeholder-gray-500 transition-all duration-300 focus:placeholder-gray-400"
                            />
                        </div>
                    </div>
                )}
            </div>
            {isBrandKitModalOpen && <BrandKitSetupModal onClose={() => setIsBrandKitModalOpen(false)} />}
        </div>
    );
};
