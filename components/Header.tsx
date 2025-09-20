import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { UserIcon, SparklesIcon, PaletteIcon, HomeIcon, EditIcon, LogOutIcon } from './icons.tsx';
import { handleLogout } from '../core/systems/auth.ts';
import { can } from '../core/systems/rbac.ts';
import { SubscriptionTier, UserRole } from '../core/types/index.ts';

export const ProfileDropdown = () => {
    const { appUser } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    if (!appUser) return null;

    return (
        <div className="relative">
            <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2">
                {appUser.photoURL ? (
                    <img src={appUser.photoURL} alt="User" className="w-8 h-8 rounded-full" />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-slate-500" />
                    </div>
                )}
            </button>
            {isOpen && (
                 <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-10">
                    <div className="px-3 py-2 border-b">
                        <p className="font-semibold text-sm truncate">{appUser.displayName}</p>
                        <p className="text-xs text-gray-500 truncate">{appUser.email}</p>
                    </div>
                    <div className="py-1">
                        <button onClick={handleLogout} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-slate-100">
                            <LogOutIcon className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                 </div>
            )}
        </div>
    )
}


interface HeaderProps {
  onLoginClick: () => void;
  onUpgradeClick: () => void;
  onBrandKitClick: () => void;
  onHomeClick: () => void;
  onStudioClick: () => void;
}

export const Header = ({ onLoginClick, onUpgradeClick, onBrandKitClick, onHomeClick, onStudioClick }: HeaderProps) => {
  const { appUser } = useAuth();
  
  const canAccessStudio = can(appUser, 'create', 'template') || can(appUser, 'manage', 'systemSettings');

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-20">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <button onClick={onHomeClick} className="text-xl font-bold text-gray-800 tracking-tight font-display cursor-pointer">
            <span className="text-emerald-600">get</span>mycreative
          </button>
          <div className="flex items-center gap-4">
            {appUser ? (
              <>
                 <button onClick={onHomeClick} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                    <HomeIcon className="w-4 h-4 text-gray-600" />
                    Dashboard
                </button>
                
                {canAccessStudio && (
                    <button onClick={onStudioClick} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                        <EditIcon className="w-4 h-4 text-gray-600" />
                        Studio
                    </button>
                )}

                {appUser.tier === SubscriptionTier.FREE && (
                    <button onClick={onUpgradeClick} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-sm">
                        <SparklesIcon className="w-4 h-4" />
                        Upgrade
                    </button>
                )}
                
                <button onClick={onBrandKitClick} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                    <PaletteIcon className="w-4 h-4 text-gray-600" />
                    Brand Kit
                </button>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-800">{appUser.displayName || appUser.email}</p>
                    <div className="flex items-center justify-end gap-2">
                      {appUser.role === UserRole.DESIGNER && (
                        <span className="px-2 py-0.5 text-xs font-semibold text-purple-800 bg-purple-100 rounded-full">
                            Designer
                        </span>
                      )}
                       {appUser.tier === SubscriptionTier.PRO && (
                        <span className="px-2 py-0.5 text-xs font-semibold text-emerald-800 bg-emerald-100 rounded-full">
                            Pro Plan
                        </span>
                      )}
                      {can(appUser, 'manage', 'systemSettings') && (
                          <span className="px-2 py-0.5 text-xs font-semibold text-amber-800 bg-amber-200 rounded-full">
                              Admin
                          </span>
                      )}
                    </div>
                  </div>
                  {appUser.photoURL ? (
                    <img src={appUser.photoURL} alt="User" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                </div>

                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={onLoginClick}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
              >
                Login / Sign Up
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};