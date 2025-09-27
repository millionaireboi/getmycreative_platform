import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Project } from '../core/types/index.ts';
import { getUserProjects, deleteProject } from '../core/systems/projectStore.ts';
import { SparklesIcon, TrashIcon } from './icons.tsx';
import { UsageDashboard } from './UsageDashboard.tsx';

const DUMMY_PROJECTS: Project[] = [
    { id: 'dummy-1', name: 'Summer Sale Campaign', userId: 'dummy', templateId: '1', templateImageUrl: 'https://picsum.photos/seed/dummy1/500/600', basePrompt: '', initialMarks: [], history: [{ id: 'h1', imageUrl: 'https://picsum.photos/seed/dummy1/500/600', prompt: '' }], createdAt: new Date(Date.now() - 86400000 * 3), updatedAt: new Date(Date.now() - 86400000 * 1) },
    { id: 'dummy-2', name: 'New Product Launch', userId: 'dummy', templateId: '2', templateImageUrl: 'https://picsum.photos/seed/dummy2/500/500', basePrompt: '', initialMarks: [], history: [{ id: 'h2', imageUrl: 'https://picsum.photos/seed/dummy2/500/500', prompt: '' }], createdAt: new Date(Date.now() - 86400000 * 5), updatedAt: new Date(Date.now() - 86400000 * 2) },
    { id: 'dummy-3', name: 'Q4 Social Media Ads', userId: 'dummy', templateId: '3', templateImageUrl: 'https://picsum.photos/seed/dummy3/500/700', basePrompt: '', initialMarks: [], history: [{ id: 'h3', imageUrl: 'https://picsum.photos/seed/dummy3/500/700', prompt: '' }], createdAt: new Date(Date.now() - 86400000 * 10), updatedAt: new Date(Date.now() - 86400000 * 4) },
];


interface DashboardViewProps {
  onSelectProject: (project: Project) => void;
}

const ProjectCard = ({ project, onSelect, onDelete, isSample }: { project: Project, onSelect: () => void, onDelete: () => void, isSample: boolean }) => {
    const latestImage = project.history[project.history.length - 1];
    
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete "${project.name}"?`)) {
            onDelete();
        }
    };
    
    const handleSelect = () => {
        if (isSample) {
            alert("This is a sample project. To edit, please create a new project from the 'Explore' tab.");
            return;
        }
        onSelect();
    }

    return (
        <div className="group relative break-inside-avoid mb-4 cursor-pointer" onClick={handleSelect}>
             <img
                src={latestImage.imageUrl}
                alt={project.name}
                className="w-full rounded-xl shadow-md transition-all duration-300 group-hover:shadow-xl"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-xl flex flex-col justify-end p-4">
                 <h3 className="text-white text-lg font-bold">{project.name}</h3>
                 <p className="text-white/80 text-xs">Updated {project.updatedAt.toLocaleDateString()}</p>
            </div>
             {!isSample && (
                <button 
                    onClick={handleDelete}
                    className="absolute top-2 right-2 p-2 bg-black/40 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                    aria-label="Delete project"
                >
                    <TrashIcon className="w-4 h-4" />
                </button>
             )}
        </div>
    );
};


export const DashboardView = ({ onSelectProject }: DashboardViewProps) => {
    const { appUser } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isShowingSamples, setIsShowingSamples] = useState(false);
    const [activeTab, setActiveTab] = useState<'projects' | 'usage'>('projects');

    const fetchProjects = async () => {
        if (appUser) {
            setIsLoading(true);
            const userProjects = await getUserProjects(appUser.id);
            if (userProjects.length === 0) {
                setProjects(DUMMY_PROJECTS);
                setIsShowingSamples(true);
            } else {
                setProjects(userProjects);
                setIsShowingSamples(false);
            }
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, [appUser]);
    
    const handleDeleteProject = async (projectId: string) => {
        await deleteProject(projectId);
        fetchProjects(); // Refresh the list
    };

    if (isLoading) {
        return <div className="text-center py-16">Loading projects...</div>;
    }

    const renderProjectsTab = () => (
        <div>
            {isShowingSamples && (
                <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg mb-6 text-center text-sm border border-emerald-200">
                    <p>Welcome! Here are some sample projects to show you what's possible. <br/>Create your first masterpiece from the <b>Explore</b> page!</p>
                </div>
            )}
            {projects.length > 0 ? (
                <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
                    {projects.map(project => (
                        <ProjectCard 
                            key={project.id} 
                            project={project} 
                            onSelect={() => onSelectProject(project)}
                            onDelete={() => handleDeleteProject(project.id)}
                            isSample={isShowingSamples}
                        />
                    ))}
                </div>
            ) : (
                 <div className="text-center py-20 border-2 border-dashed border-slate-300 rounded-2xl">
                    <h3 className="text-xl font-semibold text-gray-700">No projects yet!</h3>
                    <p className="text-gray-500 mt-2">You can create a new project from the Explore page.</p>
                </div>
            )}
        </div>
    );

    const renderUsageTab = () => (
        <UsageDashboard />
    );

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex items-center gap-2 mb-6 border-b border-slate-200">
                <button
                    className={`px-4 py-2 text-sm font-medium transition-colors rounded-t ${activeTab === 'projects' ? 'bg-white text-slate-900 border border-b-white border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                    onClick={() => setActiveTab('projects')}
                >
                    Projects
                </button>
                {appUser?.role === 'ADMIN' && (
                    <button
                        className={`px-4 py-2 text-sm font-medium transition-colors rounded-t ${activeTab === 'usage' ? 'bg-white text-slate-900 border border-b-white border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                        onClick={() => setActiveTab('usage')}
                    >
                        Usage & Costing
                    </button>
                )}
            </div>

            <div className="bg-white border border-slate-200 rounded-b-lg shadow-sm p-4 md:p-6">
                {activeTab === 'projects' ? renderProjectsTab() : renderUsageTab()}
            </div>
        </div>
    );
};
