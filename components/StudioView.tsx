import React, { useState, useEffect, useCallback, ChangeEvent, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { User, UserRole, Template, TemplateStatus, SubscriptionTier, Project } from '../core/types/index.ts';
import { UITemplate, Mark } from '../types.ts';
import { getAllUsers, updateUserRole } from '../core/systems/identity.ts';
import { getTemplatesByDesigner, getPendingTemplates, createTemplate, updateTemplate, createTemplateVersion, getPublishedTemplates, seedInitialTemplates, deleteTemplate } from '../core/systems/templateStore.ts';
import { getAllProjects } from '../core/systems/projectStore.ts';
import { isApiConfigured } from '../services/geminiService.ts';
import { firebaseConfig, uploadFileToStorage } from '../firebase/config.ts';
import { ProfileDropdown } from './Header.tsx';
import { EditIcon, SparklesIcon, UploadCloudIcon, XIcon, SearchIcon, TrendingUpIcon, EyeIcon, DollarSignIcon, UsersIcon, FileTextIcon, ClockIcon, CheckCircleIcon, AlertTriangleIcon, TrashIcon } from './icons.tsx';
import { fileToBase64, fileToDataUrl } from '../utils/fileUtils.ts';
import { detectEditableRegions, generateTemplateMetadata } from '../services/geminiService.ts';

type StudioTab = 'dashboard' | 'myTemplates' | 'analytics' | 'reviewQueue' | 'userManagement';

const getStatusPill = (status: TemplateStatus) => {
    switch(status) {
        case TemplateStatus.DRAFT: return <span className="px-2 py-0.5 text-xs font-medium text-gray-800 bg-gray-200 rounded-full">Draft</span>;
        case TemplateStatus.PENDING_REVIEW: return <span className="px-2 py-0.5 text-xs font-medium text-amber-800 bg-amber-200 rounded-full">Pending</span>;
        case TemplateStatus.PUBLISHED: return <span className="px-2 py-0.5 text-xs font-medium text-emerald-800 bg-emerald-200 rounded-full">Published</span>;
        case TemplateStatus.REJECTED: return <span className="px-2 py-0.5 text-xs font-medium text-red-800 bg-red-200 rounded-full">Rejected</span>;
    }
}

// -- START: Dashboard-specific components --
const StatCard = ({ icon, value, title, color }: { icon: React.ReactNode, value: string | number, title: string, color: string }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
            <p className="text-sm font-medium text-gray-500">{title}</p>
        </div>
    </div>
);

const BarChart = ({ data, title }: { data: { label: string, value: number }[], title: string }) => {
    const maxValue = Math.max(...data.map(d => d.value), 1); // Avoid division by zero
    return (
        <div className="bg-white p-4 rounded-xl border border-slate-200">
            <h3 className="font-semibold text-gray-700 mb-4">{title}</h3>
            <div className="flex justify-between items-end gap-2 h-40">
                {data.map(item => (
                    <div key={item.label} className="flex-1 flex flex-col items-center gap-1">
                        <div 
                            className="w-full bg-emerald-200 rounded-t-md hover:bg-emerald-400 transition-colors"
                            style={{ height: `${(item.value / maxValue) * 100}%` }}
                            title={`${item.value} users`}
                        ></div>
                        <span className="text-xs font-medium text-gray-500">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const CategoryBreakdown = ({ data }: { data: { name: string, value: number, percentage: number }[] }) => {
    const colors = ['bg-emerald-500', 'bg-sky-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500'];
    return (
        <div className="bg-white p-4 rounded-xl border border-slate-200">
            <h3 className="font-semibold text-gray-700 mb-4">Top Template Categories</h3>
            <div className="space-y-3">
                {data.slice(0, 5).map((item, index) => (
                    <div key={item.name}>
                        <div className="flex justify-between text-sm font-medium text-gray-600 mb-1">
                            <span>{item.name}</span>
                            <span>{item.value}</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <div 
                                className={`${colors[index % colors.length]} h-2 rounded-full`}
                                style={{ width: `${item.percentage}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
// -- END: Dashboard-specific components --

// A new component for rendering each item in the "My Templates" list
const TemplateListItem = ({ template, onEdit, onRetry, onDismiss, onDelete }: { 
    template: UITemplate, 
    onEdit: (template: UITemplate) => void,
    onRetry: (template: UITemplate) => void,
    onDismiss: (templateId: string) => void,
    onDelete: (template: UITemplate) => void,
}) => {
    if (template.isUploading) {
        return (
            <div className="flex items-center p-3 border-b last:border-b-0">
                <img src={template.imageUrl} alt={template.title} className="w-16 h-16 rounded-md object-cover flex-shrink-0" />
                <div className="ml-4 flex-grow min-w-0">
                    <p className="font-semibold truncate">{template.title}</p>
                    <div className="mt-2">
                         <p className="text-xs text-gray-500 mb-1">Processing upload... {Math.round(template.uploadProgress || 0)}%</p>
                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${template.uploadProgress || 0}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (template.isError) {
        return (
             <div className="flex items-center p-3 border-b last:border-b-0 bg-red-50 border-l-4 border-red-400">
                <img src={template.imageUrl} alt={template.title} className="w-16 h-16 rounded-md object-cover flex-shrink-0 filter grayscale opacity-50" />
                <div className="ml-4 flex-grow min-w-0">
                    <p className="font-semibold truncate text-red-800">Upload Failed</p>
                    <p className="text-xs text-red-700 truncate" title={template.errorMessage}>{template.errorMessage}</p>
                    <div className="mt-2 flex gap-2">
                        <button onClick={() => onRetry(template)} className="px-2 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-md hover:bg-slate-100">Retry</button>
                        <button onClick={() => onDismiss(template.id)} className="px-2 py-1 text-xs text-gray-600 hover:underline">Dismiss</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center p-3 border-b last:border-b-0">
            <img src={template.imageUrl} alt={template.title} className="w-16 h-16 rounded-md object-cover flex-shrink-0" />
            <div className="ml-4 flex-grow min-w-0">
                <p className="font-semibold truncate">{template.title} {template.version > 1 && <span className="text-xs text-gray-500 font-normal">V{template.version}</span>}</p>
                <p className="text-xs text-gray-500">Updated: {template.updatedAt.toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2 mx-4 flex-shrink-0">
                {template.status === TemplateStatus.PUBLISHED && (
                    <div className="flex items-center gap-1 text-sm text-gray-500" title="Total uses">
                        <EyeIcon className="w-4 h-4" />
                        <span>{template.analytics?.uses || 0}</span>
                    </div>
                )}
                {getStatusPill(template.status)}
            </div>
            <div className="flex items-center gap-1">
                <button onClick={() => onEdit(template)} className="p-2 rounded-lg hover:bg-slate-100 flex-shrink-0" title="Edit template"><EditIcon className="w-5 h-5"/></button>
                <button onClick={() => onDelete(template)} className="p-2 rounded-lg hover:bg-red-50 text-red-600 flex-shrink-0" title="Delete template"><TrashIcon className="w-5 h-5"/></button>
            </div>
        </div>
    );
};


interface StudioViewProps {
    onNavigateToEditor: (template: UITemplate) => void;
}

export const StudioView = ({ onNavigateToEditor }: StudioViewProps) => {
    const { appUser, loading } = useAuth();
    const [activeTab, setActiveTab] = useState<StudioTab>('myTemplates');

    const [myTemplates, setMyTemplates] = useState<UITemplate[]>([]);
    const [reviewQueue, setReviewQueue] = useState<Template[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [publishedTemplates, setPublishedTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [analysisPrompt, setAnalysisPrompt] = useState<string | null>(null);
    const analysisResolverRef = useRef<(decision: boolean) => void>();
    
    const isDesigner = appUser?.role === UserRole.DESIGNER;
    const isAdmin = appUser?.role === UserRole.ADMIN;

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        if (!appUser) {
            setIsLoading(false);
            return;
        }

        try {
            if (appUser.role === UserRole.DESIGNER) {
                const designerTemplates = await getTemplatesByDesigner(appUser.id);
                setMyTemplates(designerTemplates);
            }
            if (appUser.role === UserRole.ADMIN) {
                const pending = await getPendingTemplates();
                setReviewQueue(pending);
                const allUsers = await getAllUsers();
                setUsers(allUsers);
                const allProjects = await getAllProjects();
                setProjects(allProjects);
                const published = await getPublishedTemplates();
                setPublishedTemplates(published);
            }
        } catch (error) {
            console.error("Failed to fetch studio data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [appUser]);

    useEffect(() => {
        if (isAdmin) setActiveTab('dashboard');
        else if (isDesigner) setActiveTab('myTemplates');
        fetchData();
    }, [appUser, fetchData, isAdmin, isDesigner]);

    const confirmAnalysis = useCallback((message: string) => {
        setAnalysisPrompt(message);
        return new Promise<boolean>((resolve) => {
            analysisResolverRef.current = resolve;
        });
    }, []);

    const handleAnalysisDecision = useCallback((decision: boolean) => {
        const resolver = analysisResolverRef.current;
        if (resolver) {
            resolver(decision);
            analysisResolverRef.current = undefined;
        }
        setAnalysisPrompt(null);
    }, []);

    useEffect(() => {
        if (!analysisPrompt) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                handleAnalysisDecision(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [analysisPrompt, handleAnalysisDecision]);

    const uploadAndCreateTemplate = async (file: File) => {
        if (!appUser) return;

        const tempId = `uploading-${Date.now()}`;
        // Use a data: URL for preview to avoid cross-origin blob: console noise.
        const previewUrl = await fileToDataUrl(file);
        const now = new Date();

        const tempTemplate: UITemplate = {
            id: tempId,
            title: file.name,
            imageUrl: previewUrl,
            isUploading: true,
            uploadProgress: 0,
            status: TemplateStatus.DRAFT,
            designerId: appUser.id,
            tags: [], prompt: '',
            placeholders: { logo: false, productImage: false, headline: false, body: false },
            version: 1, isArchived: false, analytics: { uses: 0 },
            createdAt: now, updatedAt: now, file: file,
        };
        setMyTemplates(prev => [tempTemplate, ...prev]);

        const processUpload = async () => {
            const onProgress = (progress: number) => {
                setMyTemplates(prev => prev.map(t => 
                    t.id === tempId ? { ...t, uploadProgress: progress } : t
                ));
            };
            
            try {
                const [imageUrl, base64] = await Promise.all([
                    uploadFileToStorage(file, `templates/${appUser.id}`, onProgress),
                    fileToBase64(file),
                ]);

                let initialData: { marks: Mark[]; prompt: string; tags: string[]; useCases: string[] } | undefined;
                let finalTitle = file.name.split('.').slice(0, -1).join('.') || "Untitled Template";

                if (isApiConfigured()) {
                    const shouldAnalyze = await confirmAnalysis('Is this template final and ready for AI analysis? This will detect editable regions and generate metadata.');
                    if (shouldAnalyze) {
                        try {
                            // Also analyze the template for metadata and regions
                            const [marks, metadata] = await Promise.all([
                                detectEditableRegions(base64, file.type),
                                generateTemplateMetadata(base64, file.type),
                            ]);
                            initialData = {
                                marks,
                                prompt: metadata.prompt,
                                tags: metadata.tags,
                                useCases: metadata.useCases ?? []
                            };
                            finalTitle = metadata.title;
                        } catch (analysisError) {
                            console.warn("Could not auto-analyze the template during upload:", analysisError);
                            let message = "AI analysis failed. You can still manually define the template's properties and editable regions in the editor.";
                            // Only warn if any required Firebase env is missing.
                            if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.storageBucket || !firebaseConfig.appId) {
                                message = "AI analysis failed due to a Firebase configuration issue. Please replace the placeholder credentials in 'firebase/config.ts' with your actual Firebase project configuration.";
                            }
                            alert(message);
                        }
                    }
                }

                const newTemplate = await createTemplate(appUser.id, imageUrl, finalTitle, initialData);
                setMyTemplates(prev => prev.map(t => (t.id === tempId ? newTemplate : t)));

            } catch (error) {
                console.error("Failed to create template:", error);
                const errorMessage = error instanceof Error ? error.message : "Could not upload your file. Please check your network and try again.";
                setMyTemplates(prev => prev.map(t =>
                    t.id === tempId
                        ? { ...t, isUploading: false, isError: true, errorMessage }
                        : t
                ));
            }
        };
        
        processUpload();
    };

    const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files?.[0]) return;
        const file = event.target.files[0];
        uploadAndCreateTemplate(file);
        if (event.target) event.target.value = ''; // Reset input
    };

    const handleRetryUpload = (templateToRetry: UITemplate) => {
        if (!templateToRetry.file) return;
        setMyTemplates(prev => prev.filter(t => t.id !== templateToRetry.id));
        uploadAndCreateTemplate(templateToRetry.file);
    };

    const handleDismissError = (templateId: string) => {
        setMyTemplates(prev => prev.filter(t => t.id !== templateId));
    };

    const handleDeleteTemplate = async (templateToDelete: UITemplate) => {
        if (templateToDelete.isUploading) {
            return;
        }

        const confirmationMessage = templateToDelete.status === TemplateStatus.PUBLISHED
            ? 'This template is currently published. Deleting it will remove it from the template library. Continue?'
            : 'Are you sure you want to delete this template? This action cannot be undone.';

        if (!window.confirm(confirmationMessage)) {
            return;
        }

        try {
            await deleteTemplate(templateToDelete.id);
            setMyTemplates(prev => prev.filter(t => t.id !== templateToDelete.id));
        } catch (error) {
            console.error('Failed to delete template:', error);
            alert('Unable to delete this template right now. Please try again or refresh the page.');
        } finally {
            // Refresh data to keep analytics and review queues in sync if applicable
            fetchData();
        }
    };

    const handleRoleChange = async (userId: string, role: UserRole) => {
        await updateUserRole(userId, role);
        fetchData();
    };
    
    const handleApproval = async (templateId: string, approve: boolean) => {
        const status = approve ? TemplateStatus.PUBLISHED : TemplateStatus.REJECTED;
        await updateTemplate(templateId, { status });
        fetchData();
    };

    const handleEditClick = async (template: UITemplate) => {
        if (template.status === TemplateStatus.PUBLISHED) {
            if (window.confirm("This template is published. Do you want to create a new version to edit? The current version will remain live.")) {
                const newVersion = await createTemplateVersion(template.id);
                if (newVersion) {
                    onNavigateToEditor(newVersion as UITemplate);
                }
            }
        } else {
            onNavigateToEditor(template);
        }
    };

    const renderMyTemplates = () => {
        const isUploading = myTemplates.some(t => t.isUploading);

        return (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">My Templates</h2>
                    <label className={`cursor-pointer flex items-center gap-2 py-2 px-4 text-sm font-medium text-white bg-emerald-500 rounded-lg transition-colors ${loading || isUploading || !appUser ? 'bg-emerald-300 cursor-not-allowed' : 'hover:bg-emerald-600'}`}>
                        <UploadCloudIcon className="w-4 h-4" />
                        Create New Template
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileInputChange} disabled={loading || isUploading || !appUser || !isApiConfigured()} />
                    </label>
                </div>
                <div className="bg-white rounded-lg border">
                    {myTemplates.length === 0 && !isLoading && (
                        <p className="p-4 text-center text-gray-500">You haven't created any templates yet. Click 'Create New Template' to get started!</p>
                    )}
                    {myTemplates.map(t => (
                        <TemplateListItem 
                            key={t.id} 
                            template={t} 
                            onEdit={handleEditClick}
                            onRetry={handleRetryUpload}
                            onDismiss={handleDismissError}
                            onDelete={handleDeleteTemplate}
                        />
                    ))}
                </div>
            </div>
        );
    }
    
    const renderReviewQueue = () => (
        <div>
             <h2 className="text-2xl font-bold mb-4">Review Queue ({reviewQueue.length})</h2>
             <div className="bg-white rounded-lg border">
                {reviewQueue.map(t => (
                    <div key={t.id} className="flex items-center p-3 border-b last:border-b-0">
                        <img src={t.imageUrl} alt={t.title} className="w-16 h-16 rounded-md object-cover" />
                        <div className="ml-4 flex-grow">
                            <p className="font-semibold">{t.title} {t.version > 1 && <span className="text-xs text-gray-500 font-normal">V{t.version}</span>}</p>
                            <p className="text-xs text-gray-500">Submitted: {t.updatedAt.toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => handleApproval(t.id, false)} className="px-3 py-1 text-sm rounded-lg bg-red-100 text-red-700 hover:bg-red-200">Reject</button>
                             <button onClick={() => handleApproval(t.id, true)} className="px-3 py-1 text-sm rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Approve</button>
                        </div>
                    </div>
                ))}
             </div>
        </div>
    );
    
    const renderUserManagement = () => (
        <div>
            <h2 className="text-2xl font-bold mb-4">User Management ({users.length})</h2>
             <div className="bg-white rounded-lg border">
                {users.map(u => (
                    <div key={u.id} className="flex items-center p-3 border-b last:border-b-0">
                        <img src={u.photoURL} alt={u.displayName} className="w-10 h-10 rounded-full" />
                        <div className="ml-4 flex-grow">
                            <p className="font-semibold">{u.displayName}</p>
                            <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                        <div>
                            <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value as UserRole)} className="border-slate-300 rounded-md text-sm p-1.5" disabled={u.email === 'admin@getmycreative.com'}>
                                <option value={UserRole.CUSTOMER}>Customer</option>
                                <option value={UserRole.DESIGNER}>Designer</option>
                                <option value={UserRole.ADMIN}>Admin</option>
                            </select>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderAnalytics = () => {
        const publishedTemplates = myTemplates
            .filter(t => t.status === TemplateStatus.PUBLISHED)
            .sort((a, b) => (b.analytics?.uses || 0) - (a.analytics?.uses || 0));
        return (
            <div>
                <h2 className="text-2xl font-bold mb-4">Performance Analytics</h2>
                <div className="bg-white rounded-lg border">
                    {publishedTemplates.length === 0 ? (
                        <p className="p-4 text-gray-500">No published templates to analyze yet.</p>
                    ) : (
                        publishedTemplates.map(t => (
                            <div key={t.id} className="flex items-center p-3 border-b last:border-b-0">
                                <img src={t.imageUrl} alt={t.title} className="w-16 h-16 rounded-md object-cover" />
                                <div className="ml-4 flex-grow">
                                    <p className="font-semibold">{t.title} {t.version > 1 && <span className="text-xs text-gray-500 font-normal">V{t.version}</span>}</p>
                                    <p className="text-xs text-gray-500">Published: {t.updatedAt.toLocaleDateString()}</p>
                                </div>
                                <div className="flex items-center gap-2 text-lg font-semibold text-emerald-600">
                                    <TrendingUpIcon className="w-5 h-5" />
                                    <span>{t.analytics?.uses || 0}</span>
                                    <span className="text-sm font-normal text-gray-500">uses</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const renderDashboard = () => {
        const proUsers = users.filter(u => u.tier === SubscriptionTier.PRO).length;
        const estimatedMRR = proUsers * 29;

        const getUserGrowthData = (users: User[]) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const data = Array(7).fill(0).map((_, i) => {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), value: 0 };
            }).reverse();

            users.forEach(user => {
                const userDate = new Date(user.createdAt);
                userDate.setHours(0, 0, 0, 0);
                const diffDays = Math.floor((today.getTime() - userDate.getTime()) / (1000 * 3600 * 24));
                if (diffDays >= 0 && diffDays < 7) {
                    data[6 - diffDays].value++;
                }
            });
            return data;
        };
        
        const getCategoryData = (templates: Template[]) => {
            const tagCounts = templates.flatMap(t => t.tags || []).reduce((acc, tag) => {
                acc[tag] = (acc[tag] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            const totalTags = Object.values(tagCounts).reduce((sum, count) => sum + count, 0);
            if (totalTags === 0) return [];
            return Object.entries(tagCounts)
                .map(([name, value]) => ({ name, value, percentage: (value / totalTags) * 100 }))
                .sort((a, b) => b.value - a.value);
        };

        const handleSeedDatabase = async () => {
            if (window.confirm("This will seed the database with initial templates. This should only be done once on a new project. Continue?")) {
                setIsLoading(true);
                const result = await seedInitialTemplates();
                alert(result);
                await fetchData();
                setIsLoading(false);
            }
        }
    
        return (
            <div>
                <div className="flex justify-between items-center mb-6">
                     <h2 className="text-2xl font-bold">Welcome back, {appUser?.displayName?.split(' ')[0]}!</h2>
                     {isAdmin && (
                        <button onClick={handleSeedDatabase} className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600">
                            Seed Initial Templates
                        </button>
                    )}
                </div>
    
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard icon={<UsersIcon className="w-6 h-6 text-sky-600" />} value={users.length} title="Total Users" color="bg-sky-100" />
                            <StatCard icon={<SparklesIcon className="w-6 h-6 text-emerald-600" />} value={proUsers} title="Pro Users" color="bg-emerald-100" />
                            <StatCard icon={<DollarSignIcon className="w-6 h-6 text-green-600" />} value={`$${estimatedMRR}`} title="Est. MRR" color="bg-green-100" />
                            <StatCard icon={<FileTextIcon className="w-6 h-6 text-purple-600" />} value={publishedTemplates.length} title="Live Templates" color="bg-purple-100" />
                        </div>
                        <BarChart data={getUserGrowthData(users)} title="New Users (Last 7 Days)" />
                    </div>
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <h3 className="font-semibold text-gray-700 mb-2">System Status</h3>
                            <div className={`flex items-center gap-2 p-2 rounded-md ${isApiConfigured() ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                {isApiConfigured() ? <CheckCircleIcon className="w-5 h-5" /> : <AlertTriangleIcon className="w-5 h-5" />}
                                <span className="font-medium text-sm">Gemini API: {isApiConfigured() ? 'Operational' : 'Not Configured'}</span>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <h3 className="font-semibold text-gray-700 mb-2">Review Queue ({reviewQueue.length})</h3>
                            <div className="space-y-2">
                                {reviewQueue.slice(0,3).map(t => (
                                    <div key={t.id} className="flex items-center gap-2 text-sm">
                                        <img src={t.imageUrl} alt={t.title} className="w-8 h-8 rounded-md object-cover" />
                                        <p className="flex-grow truncate">{t.title}</p>
                                        <button onClick={() => handleApproval(t.id, true)} className="p-1.5 rounded-md bg-emerald-100 text-emerald-600 hover:bg-emerald-200"><CheckCircleIcon className="w-4 h-4" /></button>
                                        <button onClick={() => handleApproval(t.id, false)} className="p-1.5 rounded-md bg-red-100 text-red-600 hover:bg-red-200"><XIcon className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                {reviewQueue.length > 3 && <button onClick={() => setActiveTab('reviewQueue')} className="text-sm font-semibold text-emerald-600 hover:underline mt-2">View all {reviewQueue.length} items...</button>}
                                {reviewQueue.length === 0 && <p className="text-sm text-gray-500">The queue is empty!</p>}
                            </div>
                        </div>
                        <CategoryBreakdown data={getCategoryData(publishedTemplates)} />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <div className="container mx-auto px-4 py-8">
                <header className="mb-8 flex justify-between items-start">
                    <div>
                        <h1 className="text-5xl font-extrabold text-gray-800 tracking-tight font-display">Studio</h1>
                        <p className="mt-2 text-lg text-gray-600">Create, manage, and review creative templates.</p>
                    </div>
                    <ProfileDropdown />
                </header>

                <div className="flex border-b mb-6">
                    {isAdmin && <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 font-medium ${activeTab === 'dashboard' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-gray-500'}`}>Dashboard</button>}
                    {isDesigner && <button onClick={() => setActiveTab('myTemplates')} className={`px-4 py-2 font-medium ${activeTab === 'myTemplates' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-gray-500'}`}>My Templates</button>}
                    {isDesigner && <button onClick={() => setActiveTab('analytics')} className={`px-4 py-2 font-medium ${activeTab === 'analytics' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-gray-500'}`}>Analytics</button>}
                    {isAdmin && <button onClick={() => setActiveTab('reviewQueue')} className={`px-4 py-2 font-medium ${activeTab === 'reviewQueue' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-gray-500'}`}>Review Queue</button>}
                    {isAdmin && <button onClick={() => setActiveTab('userManagement')} className={`px-4 py-2 font-medium ${activeTab === 'userManagement' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-gray-500'}`}>User Management</button>}
                </div>

                {isLoading ? <p>Loading...</p> : (
                    <div>
                        {activeTab === 'dashboard' && isAdmin && renderDashboard()}
                        {activeTab === 'myTemplates' && isDesigner && renderMyTemplates()}
                        {activeTab === 'analytics' && isDesigner && renderAnalytics()}
                        {activeTab === 'reviewQueue' && isAdmin && renderReviewQueue()}
                        {activeTab === 'userManagement' && isAdmin && renderUserManagement()}
                    </div>
                )}
            </div>

            {analysisPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/40" onClick={() => handleAnalysisDecision(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <h2 className="text-xl font-semibold text-gray-800 mb-2">Run AI Analysis?</h2>
                        <p className="text-sm text-gray-600 mb-6">{analysisPrompt}</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => handleAnalysisDecision(false)}
                                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                Skip for now
                            </button>
                            <button
                                onClick={() => handleAnalysisDecision(true)}
                                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600"
                            >
                                Analyze
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
