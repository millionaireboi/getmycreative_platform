

import React, { useState, useEffect } from 'react';
import { TemplateGrid } from './components/TemplateGrid.tsx';
import { EditorView } from './components/EditorView.tsx';
import { Header } from './components/Header.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { PricingPage } from './components/PricingPage.tsx';
import { BrandKitSetupModal } from './components/BrandKitSetupModal.tsx';
import { CustomerWorkspace } from './components/CustomerWorkspace.tsx';
import { StudioView } from './components/StudioView.tsx';
import { TemplateEditorView } from './components/TemplateEditorView.tsx';
import { UITemplate } from './types.ts';
import { isApiConfigured } from './services/geminiService.ts';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { Project, Template } from './core/types/index.ts';
import { can } from './core/systems/rbac.ts';


type View = 'feed' | 'editor' | 'pricing' | 'customerWorkspace' | 'studio' | 'templateEditor';

const AppContent: React.FC = () => {
  const { appUser } = useAuth();
  const [currentView, setCurrentView] = useState<View>('feed');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<UITemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<UITemplate | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isBrandKitModalOpen, setIsBrandKitModalOpen] = useState(false);

  useEffect(() => {
    setIsDemoMode(!isApiConfigured());
  }, []);

  useEffect(() => {
    if (appUser) {
        const canAccessStudio = can(appUser, 'create', 'template') || can(appUser, 'manage', 'systemSettings');
        if (canAccessStudio) {
            setCurrentView('studio');
        } else {
            setCurrentView('customerWorkspace');
        }
    } else {
      setCurrentView('feed');
    }
  }, [appUser]);


  const handleSelectTemplate = async (template: UITemplate) => {
    if (!appUser) {
        setIsAuthModalOpen(true);
        return;
    }
    setPendingTemplate(template);
    setSelectedProject(null);
    setCurrentView('editor');
  };

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setPendingTemplate(null);
    setCurrentView('editor');
  };
  
  const handleNavigateToEditor = (template: UITemplate) => {
    setEditingTemplate(template);
    setCurrentView('templateEditor');
  };

  const handleBackToStudio = () => {
    setEditingTemplate(null);
    setCurrentView('studio');
  };

  const handleBackFromEditor = () => {
    setSelectedProject(null);
    setPendingTemplate(null);
    if (appUser && (can(appUser, 'create', 'template') || can(appUser, 'manage', 'systemSettings'))) {
        setCurrentView('studio');
    } else if (appUser) {
        setCurrentView('customerWorkspace');
    }
     else {
        setCurrentView('feed');
    }
  };
  
  const handleUpgrade = () => {
    // After upgrading, we should see the new customer workspace if they are a customer
    if (appUser && !can(appUser, 'create', 'template')) {
      setCurrentView('customerWorkspace');
    } else {
      setCurrentView('feed');
    }
  };

  const handleHomeClick = () => {
    setSelectedProject(null);
    setEditingTemplate(null);
    setPendingTemplate(null);
    if (appUser) {
        const canAccessStudio = can(appUser, 'create', 'template') || can(appUser, 'manage', 'systemSettings');
        if (canAccessStudio) {
            setCurrentView('studio');
        } else {
            setCurrentView('customerWorkspace');
        }
    } else {
        setCurrentView('feed');
    }
  }

  const handleProjectPersisted = (project: Project) => {
    setSelectedProject(project);
    setPendingTemplate(null);
  };

  const renderContent = () => {
    switch (currentView) {
      case 'editor':
        return (selectedProject || pendingTemplate) && (
          <EditorView 
            project={selectedProject} 
            pendingTemplate={pendingTemplate}
            onProjectPersisted={handleProjectPersisted}
            onBack={handleBackFromEditor} 
            onUpgrade={() => setCurrentView('pricing')}
            isDemoMode={isDemoMode} 
          />
        );
      case 'templateEditor':
        return editingTemplate && (
            <TemplateEditorView
                template={editingTemplate}
                onBack={handleBackToStudio}
            />
        );
      case 'pricing':
        return <PricingPage onBack={handleHomeClick} onUpgrade={handleUpgrade} />;
      case 'customerWorkspace':
        return <CustomerWorkspace onSelectTemplate={handleSelectTemplate} onSelectProject={handleSelectProject} />;
      case 'studio':
        return <StudioView onNavigateToEditor={handleNavigateToEditor} />;
      case 'feed':
      default:
        return <TemplateGrid onSelectTemplate={handleSelectTemplate} isDemoMode={isDemoMode} />;
    }
  };
  
  const showHeader = !['editor', 'customerWorkspace', 'studio', 'templateEditor'].includes(currentView);

  return (
    <div className="min-h-screen bg-slate-100 text-gray-800">
      {showHeader && <Header 
        onLoginClick={() => setIsAuthModalOpen(true)}
        onUpgradeClick={() => setCurrentView('pricing')}
        onBrandKitClick={() => setIsBrandKitModalOpen(true)}
        onHomeClick={handleHomeClick}
        onStudioClick={() => setCurrentView('studio')}
      />}
      {isAuthModalOpen && <AuthModal onClose={() => setIsAuthModalOpen(false)} />}
      {isBrandKitModalOpen && <BrandKitSetupModal onClose={() => setIsBrandKitModalOpen(false)} />}


      {isDemoMode && currentView === 'feed' && (
        <div className="bg-amber-400 text-amber-900 text-center py-2 px-4 text-sm font-semibold">
          Demo Mode: API Key not configured. Generation will be disabled.
        </div>
      )}
      <main>
        {renderContent()}
      </main>
       {showHeader && <footer className="text-center py-6 text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} getmycreative. All rights reserved. Powered by Gemini.</p>
      </footer>}
    </div>
  );
};


const App: React.FC = () => {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    )
}

export default App;
