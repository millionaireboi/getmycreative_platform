// Use standard Firebase v9+ modular SDK imports
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../../firebase/config.ts';
import { createUserProfile } from './identity.ts';
import { isApiConfigured } from '../../services/geminiService.ts';
import { User, UserRole, SubscriptionTier } from '../types/index.ts';
import type { User as FirebaseUser } from 'firebase/auth';


export const handleSignUpWithEmail = async (email: string, password: string): Promise<void> => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await createUserProfile(userCredential.user);
};

export const handleSignInWithEmail = async (email: string, password: string): Promise<void> => {
  await signInWithEmailAndPassword(auth, email, password);
};

export const handleSignInWithGoogle = async (): Promise<void> => {
  const result = await signInWithPopup(auth, googleProvider);
  await createUserProfile(result.user);
};

export const handleLogout = async (): Promise<void> => {
  await signOut(auth);
};
