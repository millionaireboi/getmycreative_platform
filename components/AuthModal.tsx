import React, { useState, FormEvent } from 'react';
import { XIcon, UserIcon, EditIcon, SettingsIcon } from './icons.tsx';
import { handleSignUpWithEmail, handleSignInWithEmail, handleSignInWithGoogle } from '../core/systems/auth.ts';
import { UserRole, SubscriptionTier } from '../core/types/index.ts';

// A simple SVG for the Google icon
const GoogleIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path>
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"></path>
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.222 0-9.618-3.229-11.334-7.961l-6.571 4.819C9.656 39.663 16.318 44 24 44z"></path>
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C44.434 36.338 48 30.651 48 24c0-1.341-.138-2.65-.389-3.917z"></path>
    </svg>
);

interface AuthModalProps {
  onClose: () => void;
}

type AuthMode = 'login' | 'signup';

export const AuthModal = ({ onClose }: AuthModalProps) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleError = (err: any) => {
    let friendlyMessage = "An unexpected error occurred. Please try again.";
    const errorCode = err.code || ''; 
    
    // Log the important parts of the error, not the whole object, to avoid circular reference issues in some browser consoles.
    console.error(`Authentication Error:\n  Code: ${err.code}\n  Message: ${err.message}`);

    switch (errorCode) {
        case 'auth/api-key-not-valid':
            friendlyMessage = "Invalid Firebase API Key. Please add your project's credentials to the 'firebase/config.ts' file.";
            break;
        case 'auth/invalid-credential':
        case 'auth/invalid-email':
        case 'auth/wrong-password':
            friendlyMessage = "The email or password you entered is incorrect. Please check your credentials and try again.";
            break;
        case 'auth/email-already-in-use':
            friendlyMessage = "This email address is already registered. Please log in instead.";
            break;
        case 'auth/operation-not-allowed':
            friendlyMessage = "Email/Password sign-in is not enabled for this project. Please enable it in your Firebase console under Authentication > Sign-in method.";
            break;
        case 'auth/weak-password':
            friendlyMessage = "The password is too weak. Please use a stronger password (at least 6 characters).";
            break;
        case 'auth/unauthorized-domain':
             friendlyMessage = "This domain is not authorized for login. Please add it to the list of authorized domains in your Firebase console.";
             break;
        default:
            // This is a fallback for other generic errors.
            friendlyMessage = "An unexpected error occurred. Please check the console for more details.";
            break;
    }
    
    setError(friendlyMessage);
  };


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        if (!agreedToTerms) {
          setError("You must agree to the Terms & Conditions.");
          setIsLoading(false);
          return;
        }
        await handleSignUpWithEmail(email, password);
      } else {
        await handleSignInWithEmail(email, password);
      }
      onClose();
    } catch (err: any) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
        await handleSignInWithGoogle();
        onClose();
    } catch (err: any) {
        handleError(err);
    } finally {
        setIsLoading(false);
    }
  };
  
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setEmail('');
    setPassword('');
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
             <h2 className="text-2xl font-bold text-gray-800 font-display">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-slate-100">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="font-medium text-emerald-600 hover:text-emerald-500"
            >
              {mode === 'login' ? 'Sign Up' : 'Log In'}
            </button>
          </p>
        </div>

        <div className="p-6 space-y-4">
            <button onClick={handleGoogleSignIn} disabled={isLoading} className="w-full flex justify-center items-center gap-2 py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-slate-50 disabled:bg-slate-100">
                <GoogleIcon /> Continue with Google
            </button>

            <div className="my-4 flex items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-xs text-gray-400 uppercase">Or</span>
                <div className="flex-grow border-t border-slate-200"></div>
            </div>
          
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-emerald-500 focus:border-emerald-500" placeholder="you@example.com" />
                </div>
                <div>
                <label htmlFor="password"className="block text-sm font-medium text-gray-700">Password</label>
                <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-emerald-500 focus:border-emerald-500" placeholder="••••••••" />
                </div>
                
                {mode === 'signup' && (
                <div className="flex items-center">
                    <input id="terms" name="terms" type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded" />
                    <label htmlFor="terms" className="ml-2 block text-sm text-gray-900">
                    I agree to the <a href="#" className="text-emerald-600 hover:underline">Terms & Conditions</a>
                    </label>
                </div>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button type="submit" disabled={isLoading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:bg-emerald-300">
                {isLoading ? 'Loading...' : (mode === 'login' ? 'Log In' : 'Create Account')}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};