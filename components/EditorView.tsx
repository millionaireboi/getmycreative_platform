import { useState, useCallback, useEffect, ChangeEvent, FormEvent, useRef, MouseEvent, useMemo } from 'react';
import { UITemplate, BrandAsset, GeneratedImage, Mark, ChatMessage } from '../types.ts';
import { generateCreative, editCreativeWithChat, ChatEditOptions } from '../services/geminiService.ts';
import { fileToBase64, downloadImage, imageUrlToBase64, base64ToBlob } from '../utils/fileUtils.ts';
import { SparklesIcon, ArrowLeftIcon, DownloadIcon, PaperclipIcon, SendIcon, SettingsIcon, PaletteIcon, XIcon, UploadCloudIcon, TrashIcon, EditIcon } from './icons.tsx';
import { BRAND_PALETTES } from '../constants.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { SubscriptionTier, Project } from '../core/types/index.ts';
import { createProject, updateProjectHistory, updateProjectName } from '../core/systems/projectStore.ts';
import { uploadFileToStorage } from '../firebase/config.ts';


const buildChatMessagesForState = (isProUser: boolean, includeForm: boolean): ChatMessage[] => {
    const messages: ChatMessage[] = [];
    if (includeForm) {
        messages.push({ id: 'msg-form', role: 'assistant', type: 'form' });
    }
    messages.push({
        id: 'msg-tip',
        role: 'assistant',
        type: 'text',
        text: isProUser
            ? "Tip: use @ to reference any enabled hotspot (e.g. @Headline) when you ask for changes."
            : "Upgrade to Pro to chat with the designer bot and request targeted tweaks using @mentions."
    });
    return messages;
};

const VersionHistory = ({ history, activeIndex, onSelect }: { history: GeneratedImage[], activeIndex: number, onSelect: (index: number) => void }) => (
    <div>
        <h3 className="text-lg font-bold text-gray-800 font-display mb-3">Version History</h3>
        <div className="flex gap-3 overflow-x-auto pb-2">
            {history.map((version, index) => (
                <div key={version.id} className="flex-shrink-0 text-center">
                    <button 
                        onClick={() => onSelect(index)}
                        className={`block w-24 h-24 rounded-lg overflow-hidden border-2 transition-colors ${activeIndex === index ? 'border-emerald-500' : 'border-transparent hover:border-slate-300'}`}
                    >
                        <img src={version.imageUrl} alt={`Version ${index + 1}`} className="w-full h-full object-cover" />
                    </button>
                    <p className="text-xs mt-1 font-medium text-gray-600">{index === 0 ? 'Template' : `V${index}`}</p>
                </div>
            ))}
        </div>
    </div>
);

const ColorPaletteSelector = ({ selectedPalette, onPaletteChange, userBrandColors }: { selectedPalette: string[], onPaletteChange: (colors: string[]) => void, userBrandColors?: string[] }) => {

    const allPalettes: Record<string, string[]> = { ...BRAND_PALETTES };
    if (userBrandColors && userBrandColors.length > 0) {
        allPalettes["My Brand"] = userBrandColors;
    }

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><PaletteIcon className="w-5 h-5" /> Brand Colors</label>
            <div className="flex flex-wrap gap-2">
                {Object.entries(allPalettes).map(([name, colors]) => (
                    <button key={name} onClick={() => onPaletteChange(colors)} className={`p-1 border-2 rounded-md ${JSON.stringify(colors) === JSON.stringify(selectedPalette) ? 'border-emerald-500' : 'border-transparent'}`}>
                        <div className="flex gap-1">
                        {colors.map(color => <div key={color} className="w-5 h-5 rounded" style={{ backgroundColor: color }}/>)}
                        </div>
                         <span className="text-xs text-gray-500">{name}</span>
                    </button>
                ))}
                 <button onClick={() => onPaletteChange([])} className={`p-1 border-2 rounded-md ${selectedPalette.length === 0 ? 'border-emerald-500' : 'border-transparent'}`}>
                        <div className="flex items-center justify-center w-full h-5 text-gray-400">
                           <XIcon className="w-4 h-4" />
                        </div>
                         <span className="text-xs text-gray-500">None</span>
                </button>
            </div>
        </div>
    );
};

interface EditorViewProps {
  project: Project | null;
  pendingTemplate: UITemplate | null;
  onBack: () => void;
  onUpgrade: () => void;
  isDemoMode: boolean;
  onProjectPersisted?: (project: Project) => void;
}

export const EditorView = ({ project, pendingTemplate, onBack, onUpgrade, isDemoMode, onProjectPersisted }: EditorViewProps) => {
  const { appUser } = useAuth();
  const isProUser = appUser?.tier === SubscriptionTier.PRO;

  const initialHistory: GeneratedImage[] = project
    ? project.history
    : pendingTemplate
      ? [{ id: pendingTemplate.id, imageUrl: pendingTemplate.imageUrl, prompt: 'Original Template' }]
      : [];
  const initialMarksSource = project?.initialMarks ?? pendingTemplate?.initialMarks ?? [];
  const initialName = project?.name ?? pendingTemplate?.title ?? 'Untitled Project';
  const initialPrompt = project?.basePrompt ?? pendingTemplate?.prompt ?? '';
  const initialTemplateImageUrl = project?.templateImageUrl ?? pendingTemplate?.imageUrl ?? '';
  const initialTemplateId = project?.templateId ?? pendingTemplate?.id ?? '';

  const [history, setHistory] = useState<GeneratedImage[]>(initialHistory);
  const [activeIndex, setActiveIndex] = useState(Math.max(initialHistory.length - 1, 0));
  const [projectName, setProjectName] = useState(initialName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [marks, setMarks] = useState<Mark[]>(initialMarksSource);
  const [enabledMarks, setEnabledMarks] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    initialMarksSource.forEach(mark => {
        map[mark.id] = true;
    });
    return map;
  });
  const [textFields, setTextFields] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    initialMarksSource.forEach(mark => {
        if (mark.type === 'text') {
            map[mark.id] = mark.text || `Your ${mark.label} Here`;
        }
    });
    return map;
  });
  const [imageAssets, setImageAssets] = useState<Record<string, BrandAsset | null>>({});
  const [imagePrompts, setImagePrompts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    initialMarksSource.forEach(mark => {
        if (mark.type === 'image') {
            map[mark.id] = '';
        }
    });
    return map;
  });
  const [imageModes, setImageModes] = useState<Record<string, 'upload' | 'describe'>>(() => {
    const map: Record<string, 'upload' | 'describe'> = {};
    initialMarksSource.forEach(mark => {
        if (mark.type === 'image') {
            map[mark.id] = 'upload';
        }
    });
    return map;
  });
  const isNewProject = !project || initialHistory.length === 1;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => buildChatMessagesForState(!!isProUser, isNewProject));
  const [isGenerating, setIsGenerating] = useState(false);

  const [chatPrompt, setChatPrompt] = useState('');
  const [chatAttachment, setChatAttachment] = useState<BrandAsset | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [brandColors, setBrandColors] = useState<string[]>(appUser?.brandColors ?? []);
  const [aspectRatio, setAspectRatio] = useState('original');

  const [isPlacingMark, setIsPlacingMark] = useState<'text' | 'image' | null>(null);
  const [hoveredMarkId, setHoveredMarkId] = useState<string | null>(null);

  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);

  const [basePrompt, setBasePrompt] = useState(initialPrompt);
  const [templateImageUrl, setTemplateImageUrl] = useState(initialTemplateImageUrl);
  const [, setTemplateId] = useState(initialTemplateId);
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(project?.id ?? null);
  const [initialProjectName, setInitialProjectName] = useState(initialName);
  const templateRef = useRef<UITemplate | null>(pendingTemplate);
  const lastHydratedRef = useRef<{ projectId: string | null; templateId: string | null }>({
    projectId: project?.id ?? null,
    templateId: project ? null : (pendingTemplate?.id ?? null)
  });

  const originalMarks = useMemo(() => project?.initialMarks ?? pendingTemplate?.initialMarks ?? [], [project, pendingTemplate]);
  const originalMarksMap = useMemo(() => {
    const map: Record<string, Mark> = {};
    originalMarks.forEach(mark => {
        map[mark.id] = mark;
    });
    return map;
  }, [originalMarks]);

  const applyMarksFromSource = useCallback((sourceMarks: Mark[]) => {
    setMarks(sourceMarks);
    setEnabledMarks(() => {
        const map: Record<string, boolean> = {};
        sourceMarks.forEach(mark => {
            map[mark.id] = true;
        });
        return map;
    });
    setTextFields(() => {
        const map: Record<string, string> = {};
        sourceMarks.forEach(mark => {
            if (mark.type === 'text') {
                map[mark.id] = mark.text || `Your ${mark.label} Here`;
            }
        });
        return map;
    });
    setImagePrompts(() => {
        const map: Record<string, string> = {};
        sourceMarks.forEach(mark => {
            if (mark.type === 'image') {
                map[mark.id] = '';
            }
        });
        return map;
    });
    setImageModes(() => {
        const map: Record<string, 'upload' | 'describe'> = {};
        sourceMarks.forEach(mark => {
            if (mark.type === 'image') {
                map[mark.id] = 'upload';
            }
        });
        return map;
    });
    setImageAssets({});
  }, []);

  const mentionTokens = useMemo(() => {
    return marks.map(mark => ({
        id: mark.id,
        label: mark.label,
        type: mark.type,
        isIncluded: !!enabledMarks[mark.id]
    }));
  }, [marks, enabledMarks]);

  const [mentionSuggestions, setMentionSuggestions] = useState<{ id: string; label: string; type: string; isIncluded: boolean }[]>([]);
  const [, setMentionQuery] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState<{ x: number; y: number } | null>(null);
  const mentionTrackingRef = useRef<{ start: number; end: number } | null>(null);

  const closeMentionSuggestions = useCallback(() => {
    setMentionSuggestions([]);
    setMentionQuery('');
    mentionTrackingRef.current = null;
    setMentionAnchor(null);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const formFieldsRef = useRef<Record<string, HTMLDivElement>>({});
  const imagePreviewRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const chatTextAreaRef = useRef<HTMLTextAreaElement>(null);

  const activeImageUrl = history[activeIndex]?.imageUrl || templateImageUrl;
  const activeMark = useMemo(() => {
    if (!activeHotspotId) return null;
    return marks.find(m => m.id === activeHotspotId) || null;
  }, [activeHotspotId, marks]);

  const hydrateFromTemplate = useCallback((template: UITemplate) => {
    const templateHistory: GeneratedImage[] = [{ id: template.id, imageUrl: template.imageUrl, prompt: 'Original Template' }];
    setHistory(templateHistory);
    setActiveIndex(templateHistory.length - 1);
    const name = template.title ?? 'Untitled Project';
    setProjectName(name);
    setInitialProjectName(name);
    setIsEditingName(false);
    applyMarksFromSource(template.initialMarks ?? []);
    setBasePrompt(template.prompt ?? '');
    setTemplateImageUrl(template.imageUrl);
    setTemplateId(template.id);
    setPersistedProjectId(null);
    templateRef.current = template;
    setIsChatDrawerOpen(false);
    hasMountedRef.current = false;
    setChatPrompt('');
    setChatAttachment(null);
    setInvalidMentions([]);
    closeMentionSuggestions();
    setActiveHotspotId(null);
    setHoveredMarkId(null);
    setIsPlacingMark(null);
    setChatMessages(buildChatMessagesForState(!!isProUser, true));
    lastHydratedRef.current = { projectId: null, templateId: template.id };
  }, [applyMarksFromSource, closeMentionSuggestions, isProUser]);

  const hydrateFromProject = useCallback((source: Project) => {
    const projectHistory: GeneratedImage[] = source.history && source.history.length > 0
        ? source.history
        : [{ id: source.templateId, imageUrl: source.templateImageUrl, prompt: 'Original Template' }];
    setHistory(projectHistory);
    setActiveIndex(Math.max(projectHistory.length - 1, 0));
    const name = source.name ?? 'Untitled Project';
    setProjectName(name);
    setInitialProjectName(name);
    setIsEditingName(false);
    applyMarksFromSource(source.initialMarks ?? []);
    setBasePrompt(source.basePrompt ?? '');
    setTemplateImageUrl(source.templateImageUrl ?? '');
    setTemplateId(source.templateId ?? '');
    setPersistedProjectId(source.id);
    templateRef.current = null;
    setIsChatDrawerOpen(false);
    hasMountedRef.current = false;
    setChatPrompt('');
    setChatAttachment(null);
    setInvalidMentions([]);
    closeMentionSuggestions();
    setActiveHotspotId(null);
    setHoveredMarkId(null);
    setIsPlacingMark(null);
    setChatMessages(buildChatMessagesForState(!!isProUser, false));
    lastHydratedRef.current = { projectId: source.id, templateId: null };
  }, [applyMarksFromSource, closeMentionSuggestions, isProUser]);

  useEffect(() => {
    if (appUser?.brandColors && appUser.brandColors.length > 0) {
        setBrandColors(appUser.brandColors);
    }
  }, [appUser?.brandColors?.join(',')]);

  useEffect(() => {
    if (pendingTemplate) {
        templateRef.current = pendingTemplate;
    }
  }, [pendingTemplate]);

  useEffect(() => {
    const currentProjectId = project?.id ?? null;
    const currentTemplateId = project ? null : (pendingTemplate?.id ?? null);

    if (currentProjectId && currentProjectId !== lastHydratedRef.current.projectId && project) {
        hydrateFromProject(project);
    } else if (!currentProjectId && currentTemplateId && currentTemplateId !== lastHydratedRef.current.templateId && pendingTemplate) {
        hydrateFromTemplate(pendingTemplate);
    }
  }, [project, pendingTemplate, hydrateFromProject, hydrateFromTemplate]);

  useEffect(() => {
    const lastMessage = chatMessages[chatMessages.length - 1];
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (isGenerating || (lastMessage && lastMessage.type !== 'form')) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isGenerating]);

  useEffect(() => {
    if (hoveredMarkId) {
      formFieldsRef.current[hoveredMarkId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [hoveredMarkId]);
  
  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (activeHotspotId) {
        setHoveredMarkId(activeHotspotId);
    }
  }, [activeHotspotId]);

  useEffect(() => {
    if (!activeMark) return;
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setActiveHotspotId(null);
        }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMark]);

  const ensureProjectPersisted = useCallback(async (updatedHistory: GeneratedImage[]) => {
    if (!appUser) return null;
    if (persistedProjectId) {
        await updateProjectHistory(persistedProjectId, updatedHistory);
        return persistedProjectId;
    }
    const templateForProject = templateRef.current;
    if (!templateForProject) return null;
    try {
        const createdProject = await createProject(appUser.id, templateForProject);
        const effectiveProject: Project = { ...createdProject, name: projectName, history: updatedHistory };
        setPersistedProjectId(createdProject.id);
        setTemplateId(createdProject.templateId);
        setTemplateImageUrl(createdProject.templateImageUrl);
        setBasePrompt(createdProject.basePrompt);
        setInitialProjectName(projectName);
        templateRef.current = null;
        lastHydratedRef.current = { projectId: createdProject.id, templateId: null };
        onProjectPersisted?.(effectiveProject);
        await updateProjectHistory(createdProject.id, updatedHistory);
        if (projectName && projectName !== createdProject.name) {
            await updateProjectName(createdProject.id, projectName);
        }
        return createdProject.id;
    } catch (error) {
        console.error('Failed to persist project:', error);
        return null;
    }
  }, [appUser, persistedProjectId, onProjectPersisted, projectName]);

  const handleGenerateFromForm = useCallback(async () => {
    if (!appUser) return;
    setIsGenerating(true);
    setIsChatDrawerOpen(true);
    setChatMessages(prev => prev.filter(m => m.type !== 'error'));

    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', type: 'text', text: 'Generate the creative with the details I provided in the form.' };
    setChatMessages(prev => {
        const withoutForm = prev.filter(m => m.type !== 'form');
        const withoutTip = withoutForm.filter(m => m.id !== 'msg-tip');
        return [...withoutTip, userMessage];
    });

    try {
      const { base64: templateBase64, mimeType: templateMimeType } = await imageUrlToBase64(templateImageUrl);
      
      const resultBase64 = await generateCreative(
        templateBase64,
        templateMimeType,
        basePrompt,
        textFields,
        imageAssets,
        imagePrompts,
        imageModes,
        enabledMarks,
        aspectRatio,
        marks,
        originalMarks
      );

      const imageBlob = base64ToBlob(resultBase64, 'image/png');
      const newImageUrl = await uploadFileToStorage(imageBlob, `projects/${appUser.id}/generated`);

      const newCreative: GeneratedImage = {
        id: `gen-${Date.now()}`,
        imageUrl: newImageUrl,
        prompt: basePrompt,
      };

      const updatedHistory = [...history, newCreative];
      setHistory(updatedHistory);
      setActiveIndex(updatedHistory.length - 1);
      await ensureProjectPersisted(updatedHistory);
      
      const assistantMessage: ChatMessage = {
          id: `msg-ai-${Date.now()}`, role: 'assistant', type: 'text',
          text: "Here's your first version! How does it look? You can ask for changes below."
      }
      setChatMessages(prev => [...prev, assistantMessage]);

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during generation.';
      const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'assistant', type: 'error', text: errorMessage };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  }, [appUser, ensureProjectPersisted, templateImageUrl, basePrompt, textFields, imageAssets, imagePrompts, imageModes, enabledMarks, aspectRatio, marks, originalMarks, history]);

  const handleChatEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatPrompt.trim() || isGenerating || !isProUser || !appUser) return;

    const { valid, invalid } = validateMentions(chatPrompt);
    if (invalid.length > 0) {
        setInvalidMentions(invalid);
        return;
    }

    setIsGenerating(true);
    setIsChatDrawerOpen(true);
    const isFirstGeneration = history.length === 1;
    if (isFirstGeneration) {
        setChatMessages(prev => prev.filter(m => m.type !== 'form' && m.id !== 'msg-tip'));
    }

    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', type: 'text', text: chatPrompt, referenceImagePreviewUrl: chatAttachment?.previewUrl };
    setChatMessages(prev => {
        const withoutTip = prev.filter(m => m.id !== 'msg-tip');
        return [...withoutTip, userMessage];
    });
    
    setChatPrompt('');
    closeMentionSuggestions();
    setChatAttachment(null);
    if(fileInputRef.current) fileInputRef.current.value = '';

    const activeImage = history[activeIndex];
    if (!activeImage) {
        setIsGenerating(false);
        return;
    }

    try {
        const { base64: baseImageBase64, mimeType: baseImageMimeType } = await imageUrlToBase64(activeImage.imageUrl);
        const referenceImage = chatAttachment ? { base64: chatAttachment.base64, mimeType: chatAttachment.file.type } : undefined;
        
        const editOptions: ChatEditOptions = { brandColors, newAspectRatio: aspectRatio, mentions: valid };

        const editedImageBase64 = await editCreativeWithChat(
            baseImageBase64, baseImageMimeType, userMessage.text!, referenceImage, editOptions
        );
        
        const imageBlob = base64ToBlob(editedImageBase64, 'image/png');
        const newImageUrl = await uploadFileToStorage(imageBlob, `projects/${appUser.id}/generated`);

        const newCreative: GeneratedImage = { id: `gen-${Date.now()}`, imageUrl: newImageUrl, prompt: userMessage.text! };

        const baseHistory = history.slice(0, activeIndex + 1);
        const updatedHistory = [...baseHistory, newCreative];
        setHistory(updatedHistory);
        setActiveIndex(updatedHistory.length - 1);
        await ensureProjectPersisted(updatedHistory);

        const assistantMessage: ChatMessage = { id: `msg-ai-${Date.now()}`, role: 'assistant', type: 'image', text: "Here's the updated version:", generatedImageUrl: newImageUrl };
        setChatMessages(prev => [...prev, assistantMessage]);

    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during editing.';
        const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'assistant', type: 'error', text: `Sorry, I couldn't make that change. ${errorMessage}` };
        setChatMessages(prev => [...prev, errorMsg]);
    } finally {
        setIsGenerating(false);
    }
  };
  
  const handleProjectNameBlur = () => {
    setIsEditingName(false);
    if (projectName.trim() === '') {
        setProjectName(initialProjectName);
        return;
    }
    if (!persistedProjectId) {
        setInitialProjectName(projectName);
        return;
    }
    if (projectName !== initialProjectName) {
        updateProjectName(persistedProjectId, projectName);
        setInitialProjectName(projectName);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
        const file = event.target.files[0];
        const base64 = await fileToBase64(file);
        setChatAttachment({ file, previewUrl: `data:${file.type};base64,${base64}`, base64 });
    }
  };
  
  const handleImageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!isPlacingMark || !imagePreviewRef.current) return;

    const rect = imagePreviewRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    const newMarkId = `${isPlacingMark}-${Date.now()}`;
    const newMark: Mark = {
      id: newMarkId,
      x, y,
      scale: isPlacingMark === 'image' ? 0.2 : undefined,
      label: `New ${isPlacingMark.charAt(0).toUpperCase() + isPlacingMark.slice(1)}`,
      type: isPlacingMark,
      isNew: true,
    };

    setMarks(prev => [...prev, newMark]);
    setEnabledMarks(prev => ({ ...prev, [newMarkId]: true }));
    if (newMark.type === 'text') {
      setTextFields(prev => ({ ...prev, [newMarkId]: 'Your new text here' }));
      setImageModes(prev => ({ ...prev }));
      setImagePrompts(prev => ({ ...prev }));
    }
    if (newMark.type === 'image') {
      setImageModes(prev => ({ ...prev, [newMarkId]: 'upload' }));
      setImagePrompts(prev => ({ ...prev, [newMarkId]: '' }));
    }
    setIsPlacingMark(null);
  };

  const removeMark = (markId: string) => {
    setMarks(prev => prev.filter(m => m.id !== markId));
    setEnabledMarks(prev => { const next = {...prev}; delete next[markId]; return next; });
    setTextFields(prev => { const next = {...prev}; delete next[markId]; return next; });
    setImageAssets(prev => { const next = {...prev}; delete next[markId]; return next; });
    setImageModes(prev => { const next = {...prev}; delete next[markId]; return next; });
    setImagePrompts(prev => { const next = {...prev}; delete next[markId]; return next; });
    if (activeHotspotId === markId) {
      setActiveHotspotId(null);
    }
  };
  
  const handleDownload = () => {
    const activeImage = history[activeIndex];
    const watermark = isProUser ? undefined : 'Made with getmycreative';
    downloadImage(activeImage.imageUrl, `creative-${activeImage.id}.png`, watermark);
  };
  
  const renderInitialEditForm = () => {
    const hasMarks = marks.length > 0;
    const includedMarks = marks.filter(mark => enabledMarks[mark.id]);
    const readyMarks = includedMarks.filter(mark => {
        if (mark.type === 'text') {
            const text = textFields[mark.id];
            return !!(text && text.trim().length > 0);
        }
        if (mark.type === 'image') {
            const asset = imageAssets[mark.id];
            const prompt = imagePrompts[mark.id];
            const mode = imageModes[mark.id] || 'upload';
            if (mode === 'upload') {
                return !!asset;
            }
            return !!(prompt && prompt.trim().length > 0);
        }
        return false;
    });
    const missingMarks = includedMarks.length - readyMarks.length;

    const renderMarkCard = (mark: Mark) => {
        const isEnabled = !!enabledMarks[mark.id];
        const toggleMark = () => setEnabledMarks(prev => ({ ...prev, [mark.id]: !isEnabled }));
        const hasValue = mark.type === 'text'
            ? !!(textFields[mark.id] && textFields[mark.id].trim().length > 0)
            : !!imageAssets[mark.id] || !!(imagePrompts[mark.id] && imagePrompts[mark.id].trim().length > 0);
        const statusCopy = !isEnabled
            ? 'Ignored for the next render.'
            : mark.type === 'text'
                ? (hasValue ? 'Custom copy ready.' : 'Using template copy.')
                : (hasValue ? (imageAssets[mark.id] ? 'Upload ready.' : 'Description ready.') : 'Needs an upload or description.');
        const modeLabel = mark.type === 'image' ? (imageModes[mark.id] === 'describe' ? 'Describe' : 'Upload') : null;

        return (
            <div
                key={mark.id}
                ref={el => {
                    if (el) {
                        formFieldsRef.current[mark.id] = el;
                    } else {
                        delete formFieldsRef.current[mark.id];
                    }
                }}
                onMouseEnter={() => setHoveredMarkId(mark.id)}
                onMouseLeave={() => setHoveredMarkId(null)}
                className={`rounded-2xl border transition-all bg-white/95 backdrop-blur-sm shadow-sm p-4 flex flex-col gap-3 ${hoveredMarkId === mark.id ? 'border-emerald-500 shadow-emerald-100' : 'border-slate-200'}`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{mark.label}</p>
                            <span className="text-[11px] uppercase tracking-wide bg-slate-100 text-gray-600 px-2 py-0.5 rounded-full">{mark.type}</span>
                            {modeLabel && <span className="text-[11px] uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{modeLabel}</span>}
                            {mark.isNew && <span className="text-[11px] uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">New</span>}
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{statusCopy}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {mark.isNew && (
                            <button type="button" onClick={() => removeMark(mark.id)} className="text-gray-400 hover:text-red-500" title="Remove hotspot">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={toggleMark}
                            aria-pressed={isEnabled}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 ${isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-gray-600'}`}
                        >
                            {isEnabled ? 'Include' : 'Ignore'}
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                    <button
                        type="button"
                        onClick={() => setActiveHotspotId(mark.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100"
                    >
                        Open editor
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-gray-800">Hotspot summary</p>
                        <p className="text-xs text-gray-500">{includedMarks.length} included · {marks.length - includedMarks.length} ignored</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                            {readyMarks.length} ready
                        </span>
                        <span className="flex items-center gap-1 text-amber-600 font-semibold">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400"></span>
                            {missingMarks} need input
                        </span>
                    </div>
                </div>
                <p className="mt-3 text-sm text-gray-600">Click a hotspot to update it. Only “Included” hotspots contribute to the next render.</p>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
                <div className="mt-0.5 rounded-full bg-white/70 p-2 shadow-sm">
                    <SparklesIcon className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                    <p className="font-semibold text-emerald-800">Quick start</p>
                    <p className="text-sm text-emerald-700 leading-relaxed">Tap a hotspot on the canvas (or in this list) to enter the exact text or upload the image you want. Everything you mark as “Include” feeds the next render.</p>
                </div>
            </div>

            <div className="space-y-3">
                {hasMarks ? marks.map(renderMarkCard) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-gray-500">
                        <p>No editable regions yet. Use the “Add text hotspot” or “Add image hotspot” buttons beside the preview to mark a spot.</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="font-medium text-gray-800">Aspect ratio</p>
                    <p className="text-xs text-gray-500 mt-1">Pick the format for your next render.</p>
                    <select
                        id="aspect-ratio-select"
                        value={aspectRatio}
                        onChange={e => setAspectRatio(e.target.value)}
                        className="mt-3 block w-full pl-3 pr-10 py-2 text-sm border-slate-300 rounded-md focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                    >
                        <option value="original">Original</option>
                        <option value="1:1">1:1 (Square)</option>
                        <option value="16:9">16:9 (Widescreen)</option>
                        <option value="9:16">9:16 (Story)</option>
                    </select>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-800">Brand palette</p>
                        <button type="button" onClick={() => setIsSettingsOpen(true)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                            Adjust
                        </button>
                    </div>
                    {brandColors.length > 0 ? (
                        <div className="flex items-center gap-2">
                            {brandColors.map(color => (
                                <span key={color} className="h-6 w-6 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} title={color} />
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500 leading-relaxed">Stick with the template colors or pop open the gear icon above to choose your brand palette.</p>
                    )}
                </div>
            </div>

            <div className="rounded-2xl bg-slate-900 text-white shadow-sm p-5 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="mt-1">
                        <SparklesIcon className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                        <p className="font-semibold tracking-tight">Generate with AI</p>
                        <p className="text-sm text-slate-200/90 mt-1 leading-relaxed">We’ll blend the enabled fields, uploads, and palette into your next version.</p>
                    </div>
                </div>
                <button
                    onClick={handleGenerateFromForm}
                    disabled={isGenerating || isDemoMode}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-300 disabled:bg-emerald-400/60 disabled:text-slate-600 transition-colors"
                >
                    {isGenerating ? 'Generating…' : <><SparklesIcon className="w-5 h-5" />Generate creative</>}
                </button>
                {isDemoMode && <p className="text-xs text-center text-slate-200/80">Generation is disabled. Set API_KEY to enable.</p>}
            </div>
        </div>
    );
  };

  const renderHotspotModal = () => {
    if (!activeMark) return null;

    const markId = activeMark.id;
    const isText = activeMark.type === 'text';
    const isImage = activeMark.type === 'image';
    const isEnabled = !!enabledMarks[markId];
    const mode = imageModes[markId] || 'upload';
    const currentAsset = imageAssets[markId] || null;
    const currentPrompt = imagePrompts[markId] || '';
    const originalMark = originalMarksMap[markId];
    const originalText = originalMark?.text || '';

    const handleClose = () => setActiveHotspotId(null);
    const toggleInclude = () => setEnabledMarks(prev => ({ ...prev, [markId]: !prev[markId] }));
    const handleReset = () => {
        if (isText) {
            setTextFields(prev => ({ ...prev, [markId]: originalText || '' }));
        } else if (isImage) {
            setImageAssets(prev => {
                const next = { ...prev };
                delete next[markId];
                return next;
            });
            setImagePrompts(prev => ({ ...prev, [markId]: '' }));
        }
    };

    const handleModeChange = (nextMode: 'upload' | 'describe') => {
        setImageModes(prev => ({ ...prev, [markId]: nextMode }));
        if (nextMode === 'describe') {
            setImageAssets(prev => {
                const next = { ...prev };
                delete next[markId];
                return next;
            });
        }
    };

    const handleAssetUpload = (asset: BrandAsset) => {
        setImageAssets(prev => ({ ...prev, [markId]: asset }));
        setImageModes(prev => ({ ...prev, [markId]: 'upload' }));
    };

    const handleAssetClear = () => {
        setImageAssets(prev => {
            const next = { ...prev };
            delete next[markId];
            return next;
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 py-6">
            <div className="absolute inset-0 bg-black/40" onClick={handleClose} aria-hidden="true"></div>
            <div className="relative w-full max-w-lg sm:rounded-3xl rounded-t-3xl bg-white shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{isText ? 'Text hotspot' : 'Image hotspot'}</p>
                        <h3 className="text-2xl font-bold text-gray-900 font-display">{activeMark.label}</h3>
                    </div>
                    <button onClick={handleClose} className="p-2 rounded-full hover:bg-slate-100 text-gray-500" aria-label="Close hotspot editor">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase">Include in next render</p>
                        <p className="text-xs text-gray-500">{isEnabled ? 'This hotspot will be considered when you generate.' : 'Temporarily ignore this hotspot.'}</p>
                    </div>
                    <button
                        type="button"
                        onClick={toggleInclude}
                        aria-pressed={isEnabled}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 ${isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-gray-600'}`}
                    >
                        {isEnabled ? 'Included' : 'Ignored'}
                    </button>
                </div>

                {isText && (
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-gray-800">Replacement copy</label>
                        <textarea
                            value={textFields[markId] || ''}
                            onChange={e => setTextFields(prev => ({ ...prev, [markId]: e.target.value }))}
                            rows={activeMark.label.toLowerCase().includes('body') ? 4 : 2}
                            placeholder="Enter the text you want to appear in this spot"
                            className="w-full border border-slate-300 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                        {originalText && (
                            <p className="text-xs text-gray-500">Template copy: “{originalText}”</p>
                        )}
                        <div className="flex justify-between items-center">
                            <button type="button" onClick={handleReset} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                                Reset to template copy
                            </button>
                            <button type="button" onClick={handleClose} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">
                                Done
                            </button>
                        </div>
                    </div>
                )}

                {isImage && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
                            <button
                                type="button"
                                onClick={() => handleModeChange('upload')}
                                className={`px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'upload' ? 'bg-white shadow text-emerald-700' : 'text-gray-600 hover:bg-white/80'}`}
                            >
                                Upload image
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeChange('describe')}
                                className={`px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'describe' ? 'bg-white shadow text-emerald-700' : 'text-gray-600 hover:bg-white/80'}`}
                            >
                                Describe image
                            </button>
                        </div>

                        {mode === 'upload' ? (
                            <FileUploader
                                title={activeMark.label}
                                onFileUpload={handleAssetUpload}
                                asset={currentAsset}
                                onClear={handleAssetClear}
                            />
                        ) : (
                            <div className="space-y-2">
                                <textarea
                                    value={currentPrompt}
                                    onChange={e => setImagePrompts(prev => ({ ...prev, [markId]: e.target.value }))}
                                    rows={4}
                                    placeholder="Describe the image you want here (colors, subject, style, lighting, etc.)"
                                    className="w-full border border-slate-300 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                />
                                <p className="text-xs text-gray-500">We’ll generate (or swap in) an image that matches this description.</p>
                            </div>
                        )}

                        <div className="flex justify-between items-center">
                            <button type="button" onClick={handleReset} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                                Reset to template artwork
                            </button>
                            <button type="button" onClick={handleClose} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
  };

  const renderChatDrawer = () => {
    if (!appUser || isDemoMode) return null;

    if (!isProUser) {
        return (
            <div className="fixed bottom-4 right-4 z-40">
                <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3">
                    <SparklesIcon className="w-5 h-5 text-emerald-500" />
                    <div>
                        <p className="text-sm font-semibold text-gray-800">Upgrade to unlock chat edits</p>
                        <p className="text-xs text-gray-500">Pro lets you tweak designs with quick @hotspot prompts.</p>
                    </div>
                    <button onClick={onUpgrade} className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-500 rounded-full hover:bg-emerald-600">
                        Upgrade
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
            {isChatDrawerOpen ? (
                <div className="w-[min(360px,calc(100vw-2rem))] bg-white/98 backdrop-blur border border-slate-200 rounded-3xl shadow-2xl flex flex-col max-h-[70vh]">
                    <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200">
                        <div>
                            <p className="text-sm font-semibold text-emerald-700">Chat edits</p>
                            <p className="text-xs text-gray-500">Mention hotspots like <span className="font-mono text-emerald-600">@Headline</span> for targeted tweaks.</p>
                        </div>
                        <button onClick={() => setIsChatDrawerOpen(false)} className="p-1.5 rounded-full hover:bg-slate-100 text-gray-500" aria-label="Close chat drawer">
                            <XIcon className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {chatMessages.map(msg => (
                            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                {msg.role === 'assistant' && <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><SparklesIcon className="w-4 h-4 text-emerald-500"/></div>}
                                <div className={`p-3 rounded-2xl max-w-[260px] break-words text-sm ${msg.role === 'user' ? 'bg-emerald-500 text-white rounded-br-xl' : msg.type === 'error' ? 'bg-red-100 text-red-800 rounded-bl-xl' : 'bg-slate-100 text-gray-800 rounded-bl-xl'}`}>
                                    {msg.text && <p>{msg.text}</p>}
                                    {msg.referenceImagePreviewUrl && <img src={msg.referenceImagePreviewUrl} alt="Reference" className="mt-2 rounded-lg max-h-32" />}
                                    {msg.generatedImageUrl && <img src={msg.generatedImageUrl} alt="Generated" className="mt-2 rounded-lg" />}
                                </div>
                            </div>
                        ))}
                        {isGenerating && (
                            <div className="flex gap-3 text-sm text-gray-500">
                                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><SparklesIcon className="w-4 h-4 text-emerald-500 animate-spin"/></div>
                                <div className="flex items-center gap-1">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }}></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                        <div className="border-t border-slate-200 p-4">
                            <form onSubmit={handleChatEdit} className="space-y-2">
                                {chatAttachment && (
                                    <div className="relative p-2 bg-slate-100 rounded-md flex items-center gap-2 text-xs">
                                        <img src={chatAttachment.previewUrl} alt="Attachment preview" className="w-8 h-8 rounded object-cover" />
                                    <p className="truncate flex-1 text-gray-600">{chatAttachment.file.name}</p>
                                    <button type="button" onClick={() => setChatAttachment(null)} className="p-1 rounded-full hover:bg-slate-200 text-gray-500" aria-label="Remove attachment">
                                        <XIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                )}
                                <div className="relative">
                                <textarea
                                    ref={chatTextAreaRef}
                                    value={chatPrompt}
                                    onChange={(e) => handleChatPromptChange(e.target.value, e.target)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape' && mentionSuggestions.length > 0) {
                                            e.preventDefault();
                                            closeMentionSuggestions();
                                            return;
                                        }
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleChatEdit(e);
                                        }
                                    }}
                                        placeholder={isGenerating ? 'Processing…' : 'Describe your tweak. Try @Headline to target a region.'}
                                        className="w-full border border-slate-300 rounded-xl py-3 pl-10 pr-12 resize-none focus:ring-emerald-500 focus:border-emerald-500"
                                        rows={2}
                                        disabled={isGenerating}
                                        onBlur={() => closeMentionSuggestions()}
                                    />
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300" disabled={isGenerating}>
                                    <PaperclipIcon className="w-5 h-5" />
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                                <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-700 disabled:text-gray-400" disabled={!chatPrompt.trim() || isGenerating}>
                                    <SendIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : (
                <button onClick={() => setIsChatDrawerOpen(true)} className="px-4 py-2.5 rounded-full bg-emerald-500 text-white text-sm font-semibold shadow-lg hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4" />
                    Open chat edits
                </button>
            )}
        </div>
    );
  };

  const handleChatPromptChange = (value: string, target: HTMLTextAreaElement) => {
    setChatPrompt(value);

    const cursor = target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt >= 0 && (lastAt === 0 || /[^\w]/.test(textBeforeCursor.charAt(lastAt - 1)))) {
        const query = textBeforeCursor.slice(lastAt + 1);
        if (!/\s/.test(query)) {
            const filtered = mentionTokens.filter(token => token.isIncluded && token.id.toLowerCase().startsWith(query.toLowerCase()));
            setMentionSuggestions(filtered);
            setMentionQuery(query);
            mentionTrackingRef.current = { start: lastAt, end: cursor };

            const rect = target.getBoundingClientRect();
            const top = rect.top + window.scrollY + Math.min(rect.height, target.offsetHeight) + 8;
            const left = rect.left + window.scrollX + 16;
            setMentionAnchor({ x: left, y: top });
            return;
        }
    }

    closeMentionSuggestions();
  };

  const insertMention = (token: { id: string; label: string }) => {
    const selection = mentionTrackingRef.current;
    if (!selection) return;
    const textarea = chatTextAreaRef.current;
    const mentionText = `@${token.id}`;
    setChatPrompt(prev => prev.slice(0, selection.start) + mentionText + prev.slice(selection.end));
    closeMentionSuggestions();
    if (textarea) {
        const nextCursor = selection.start + mentionText.length;
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(nextCursor, nextCursor);
        });
    }
  };

  const validateMentions = (message: string): { valid: string[]; invalid: string[] } => {
    const mentionRegex = /@([A-Za-z0-9_-]+)/g;
    const valid: string[] = [];
    const invalid: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(message)) !== null) {
        const token = mentionTokens.find(t => t.id === match![1]);
        if (token && token.isIncluded) {
            valid.push(token.id);
        } else {
            invalid.push(match![1]);
        }
    }
    return { valid, invalid };
  };

  const [invalidMentions, setInvalidMentions] = useState<string[]>([]);

  useEffect(() => {
    if (!isChatDrawerOpen) {
        closeMentionSuggestions();
    }
  }, [isChatDrawerOpen]);

  useEffect(() => {
    if (invalidMentions.length > 0) {
        const timeout = setTimeout(() => setInvalidMentions([]), 3000);
        return () => clearTimeout(timeout);
    }
  }, [invalidMentions]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="container mx-auto px-4 lg:px-8 py-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium mb-6">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="grid grid-cols-1 gap-8 lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:h-[calc(100vh-140px)]">
          
          <div className="flex flex-col gap-6 min-h-0">
            <div 
                ref={imagePreviewRef}
                onClick={handleImageClick}
                className={`flex-grow bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-center p-4 sm:p-6 relative group ${isPlacingMark ? 'cursor-crosshair' : ''}`}
            >
                <img 
                    src={activeImageUrl} 
                    alt="Creative Preview" 
                    className="max-w-full max-h-[70vh] w-auto h-auto object-contain rounded-lg shadow-md" 
                />
                 <div className="absolute top-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded-full">{activeIndex === 0 ? 'Template' : `Version ${activeIndex}`}</div>
                 {history.length > 1 && (
                     <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center pointer-events-none">
                        <button onClick={handleDownload} className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full text-sm font-semibold pointer-events-auto">
                            <DownloadIcon className="w-4 h-4" /> Download
                        </button>
                    </div>
                 )}
                 {activeIndex === 0 && marks.map(mark => {
                    const left = ((mark.x - (mark.width ?? 0) / 2)) * 100;
                    const top = ((mark.y - (mark.height ?? 0) / 2)) * 100;
                    const width = (mark.width ?? 0) * 100;
                    const height = (mark.height ?? 0) * 100;
                    return (
                        <button 
                            key={mark.id}
                            type="button"
                            onClick={() => setActiveHotspotId(mark.id)}
                            onMouseEnter={() => setHoveredMarkId(mark.id)}
                            onMouseLeave={() => setHoveredMarkId(null)}
                            aria-label={`Edit hotspot ${mark.label}`}
                            className={`absolute rounded-sm transition-all ${hoveredMarkId === mark.id ? 'ring-2 ring-emerald-500/80 bg-emerald-400/20' : 'ring-1 ring-white/70 bg-black/0'} focus:outline-none focus:ring-2 focus:ring-emerald-400/80`} 
                            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                        >
                           <span className="absolute -top-5 left-0 text-xs bg-black/80 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm shadow-md">{mark.label}</span>
                           <span className={`absolute inset-0 pointer-events-none border-2 border-dashed mix-blend-difference ${hoveredMarkId === mark.id ? 'border-emerald-600/80' : 'border-white/80'}`} />
                        </button>
                    )
                 })}
                 {isPlacingMark && (
                    <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center text-white font-semibold p-4 text-center">
                        Click on the template to place the new {isPlacingMark}.
                    </div>
                 )}
            </div>
            {activeIndex === 0 && (
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={() => setIsPlacingMark('text')}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors border ${isPlacingMark === 'text' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' : 'bg-white border-slate-200 text-gray-700 hover:bg-slate-100'}`}
                    >
                        Add text hotspot
                    </button>
                    <button
                        onClick={() => setIsPlacingMark('image')}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors border ${isPlacingMark === 'image' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' : 'bg-white border-slate-200 text-gray-700 hover:bg-slate-100'}`}
                    >
                        Add image hotspot
                    </button>
                    {isPlacingMark && (
                        <button onClick={() => setIsPlacingMark(null)} className="text-sm font-medium text-gray-500 hover:text-gray-700">
                            Cancel
                        </button>
                    )}
                </div>
            )}
            {history.length > 1 && <VersionHistory history={history} activeIndex={activeIndex} onSelect={setActiveIndex} />}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden lg:h-full lg:max-h-[calc(100vh-140px)]">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <div className="flex items-center gap-3 group/editor" onDoubleClick={() => setIsEditingName(true)}>
                    <SparklesIcon className="w-6 h-6 text-emerald-600" />
                    {isEditingName ? (
                        <input
                            ref={nameInputRef}
                            type="text"
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                            onBlur={handleProjectNameBlur}
                            onKeyDown={e => e.key === 'Enter' && handleProjectNameBlur()}
                            className="text-xl font-bold text-gray-800 font-display bg-slate-100 rounded-md -ml-1 px-1"
                        />
                    ) : (
                        <h2 className="text-xl font-bold text-gray-800 font-display">{projectName}</h2>
                    )}
                    <button onClick={() => setIsEditingName(true)} className="opacity-0 group-hover/editor:opacity-100 transition-opacity">
                        <EditIcon className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
                 <div className="relative">
                    <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={`p-2 rounded-full transition-colors ${isSettingsOpen ? 'bg-emerald-100 text-emerald-600' : 'hover:bg-slate-100'}`}>
                        <SettingsIcon className="w-5 h-5" />
                    </button>
                    {isSettingsOpen && (
                        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200 p-4 z-10 space-y-4">
                            <ColorPaletteSelector 
                                selectedPalette={brandColors} 
                                onPaletteChange={setBrandColors}
                                userBrandColors={appUser?.brandColors} 
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-6">
                {chatMessages.map(msg => {
                    if (msg.type === 'form') return <div key={msg.id}>{renderInitialEditForm()}</div>
                    
                    return (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                            {msg.role === 'assistant' && <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><SparklesIcon className="w-5 h-5 text-emerald-500"/></div>}
                            <div className={`p-3 rounded-2xl max-w-xs md:max-w-sm break-words ${msg.role === 'user' ? 'bg-emerald-500 text-white rounded-br-xl' : msg.type === 'error' ? 'bg-red-100 text-red-800 rounded-bl-xl' : 'bg-slate-100 text-gray-800 rounded-bl-xl'}`}>
                                {msg.text && <p>{msg.text}</p>}
                                {msg.referenceImagePreviewUrl && <img src={msg.referenceImagePreviewUrl} alt="Reference" className="mt-2 rounded-lg max-h-40" />}
                                {msg.generatedImageUrl && <img src={msg.generatedImageUrl} alt="Generated" className="mt-2 rounded-lg" />}
                            </div>
                        </div>
                    )
                })}
                {isGenerating && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><SparklesIcon className="w-5 h-5 text-emerald-500 animate-spin"/></div>
                        <div className="p-3 rounded-2xl bg-slate-100 rounded-bl-xl">
                            <div className="flex items-center gap-2 text-gray-500">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{animationDelay: '0s'}}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-slate-200 bg-white">
                {!isProUser && appUser ? (
                    <div className="text-center p-4 bg-slate-100 rounded-lg">
                        <SparklesIcon className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                        <h4 className="font-bold text-gray-800">Unlock Conversational Editing</h4>
                        <p className="text-sm text-gray-600 mb-3">Upgrade to Pro to nudge the AI with quick chat tweaks and @-mentions on hotspots.</p>
                        <button onClick={onUpgrade} className="w-full bg-emerald-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-emerald-600 transition-colors">
                            Upgrade to Pro
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleChatEdit}>
                        {chatAttachment && (
                            <div className="relative p-2 mb-2 bg-slate-100 rounded-md flex items-center gap-2">
                                <img src={chatAttachment.previewUrl} alt="Attachment preview" className="w-10 h-10 rounded object-cover" />
                                <p className="text-xs text-gray-600 truncate flex-1">{chatAttachment.file.name}</p>
                                <button type="button" onClick={() => setChatAttachment(null)} className="p-1 rounded-full hover:bg-slate-200 absolute top-1 right-1">
                                    <XIcon className="w-4 h-4 text-gray-500" />
                                </button>
                            </div>
                        )}
                        <div className="relative">
                            <textarea
                                value={chatPrompt}
                                onChange={(e) => setChatPrompt(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatEdit(e); }}}
                                placeholder={isGenerating ? "Processing..." : isProUser ? "Use @Headline, @Logo… to target edits or describe your tweak." : "Upgrade to Pro to chat through edits."}
                                className="w-full border border-slate-300 rounded-lg py-3 pl-10 pr-12 resize-none focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-gray-400"
                                rows={2}
                                disabled={isGenerating || !isProUser}
                            />
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300" disabled={isGenerating}>
                                <PaperclipIcon className="w-5 h-5" />
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                            <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-700 disabled:text-gray-400" disabled={!chatPrompt.trim() || isGenerating || !isProUser}>
                                <SendIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
        </div>
      </div>
      {renderChatDrawer()}
      {mentionSuggestions.length > 0 && mentionAnchor && (
        <div className="fixed z-50" style={{ top: mentionAnchor.y, left: mentionAnchor.x }}>
            <div className="bg-white border border-slate-200 rounded-lg shadow-lg w-48">
                {mentionSuggestions.map(token => (
                    <button
                        key={token.id}
                        onClick={() => insertMention(token)}
                        className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex flex-col"
                    >
                        <span className="text-sm font-semibold text-gray-800">@{token.id}</span>
                        <span className="text-xs text-gray-500">{token.label}</span>
                    </button>
                ))}
            </div>
        </div>
      )}
      {invalidMentions.length > 0 && (
        <div className="fixed bottom-24 right-4 z-50 bg-red-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">
            Unknown hotspots: {invalidMentions.join(', ')}
        </div>
      )}
      {renderHotspotModal()}
    </div>
  );
};


const FileUploader = ({ onFileUpload, title, asset, onClear }: { onFileUpload: (asset: BrandAsset) => void; title: string; asset: BrandAsset | null; onClear?: () => void; }) => {
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const base64 = await fileToBase64(file);
      onFileUpload({
        file,
        previewUrl: `data:${file.type};base64,${base64}`,
        base64,
      });
    }
  };

  return (
    <div className="w-full mt-2">
      <div className={`flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md ${asset ? 'bg-slate-50' : ''}`}>
        {asset ? (
          <div className="text-center space-y-3">
            <img src={asset.previewUrl} alt="preview" className="mx-auto h-16 w-auto object-contain" />
            <p className="text-xs text-gray-500 mt-2 truncate max-w-[150px]">{asset.file.name}</p>
            <div className="flex justify-center items-center gap-4">
                <label htmlFor={`${title}-file-upload`} className="cursor-pointer text-emerald-600 hover:text-emerald-500 font-medium text-sm">
                  Replace
                </label>
                {onClear && (
                    <button type="button" onClick={onClear} className="text-sm font-medium text-gray-500 hover:text-red-500">
                        Remove
                    </button>
                )}
                <input id={`${title}-file-upload`} type="file" className="sr-only" onChange={handleFileChange} />
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-center">
            <UploadCloudIcon className="mx-auto h-10 w-10 text-gray-400" />
            <div className="flex text-sm text-gray-600">
              <label htmlFor={`${title}-file-upload`} className="relative cursor-pointer bg-white rounded-md font-medium text-emerald-600 hover:text-emerald-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-emerald-500">
                <span>Upload a file</span>
                <input id={`${title}-file-upload`} type="file" className="sr-only" onChange={handleFileChange} />
              </label>
            </div>
            <p className="text-xs text-gray-500">PNG, JPG</p>
          </div>
        )}
      </div>
    </div>
  );
};
