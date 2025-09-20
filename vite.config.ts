import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables from .env files or the process environment.
  // The third parameter '' ensures all variables are loaded, not just those prefixed with VITE_.
  // FIX: Use '.' instead of `process.cwd()` to avoid TypeScript type errors.
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    define: {
      // This makes the `process.env.GEMINI_API_KEY` variable available in the client-side code.
      // Vite will replace this with the value of the GEMINI_API_KEY from your environment.
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
  };
});
