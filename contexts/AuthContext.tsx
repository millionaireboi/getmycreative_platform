import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
// Use the standard 'firebase/auth' import for the modern v9+ modular SDK
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config.ts';
import { User } from '../core/types/index.ts';
import { getUserProfile, upgradeUserToPro, updateUserBrandColors } from '../core/systems/identity.ts';
import { setCachedUser } from '../core/systems/identityCache.ts';
import { isApiConfigured } from '../services/geminiService.ts';


interface AuthContextType {
  appUser: User | null; // The application-specific user profile
  loading: boolean;
  upgradeToPro: () => Promise<void>;
  setBrandColors: (colors: string[]) => Promise<void>;
}

const defaultContextValue: AuthContextType = {
    appUser: null,
    loading: true,
    upgradeToPro: async () => {},
    setBrandColors: async () => {},
};

export const AuthContext = createContext<AuthContextType>(defaultContextValue);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [appUser, setAppUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Await the profile and set the user
          const profile = await getUserProfile(firebaseUser);
          setAppUser(profile);
          setCachedUser(profile);
        } else {
          // No user, so set to null
          setAppUser(null);
          setCachedUser(null);
        }
      } catch (error) {
        // If there's an error fetching the profile, log it and treat the user as logged out
        console.error("Authentication Error: Failed to retrieve user profile.", error);
        setAppUser(null);
        setCachedUser(null);
      } finally {
        // Always set loading to false after attempting to get the user state
        setLoading(false);
      }
    });

    // Cleanup the subscription on unmount
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const upgradeToPro = async () => {
    if (appUser) {
        const updatedProfile = await upgradeUserToPro(appUser.id);
        if (updatedProfile) setAppUser(updatedProfile);
    } else {
        throw new Error("User must be logged in to upgrade.");
    }
  };

  const setBrandColors = async (colors: string[]) => {
    if (appUser) {
        const updatedProfile = await updateUserBrandColors(appUser.id, colors);
        if (updatedProfile) setAppUser(updatedProfile);
    } else {
        throw new Error("User must be logged in to set brand colors.");
    }
  };


  const value = {
    appUser,
    loading,
    upgradeToPro,
    setBrandColors,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
