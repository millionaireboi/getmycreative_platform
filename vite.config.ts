import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import genieHandler from './api/genie.ts';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables from .env files or the process environment.
  // The third parameter '' ensures all variables are loaded, not just those prefixed with VITE_.
  // FIX: Use '.' instead of `process.cwd()` to avoid TypeScript type errors.
  const env = loadEnv(mode, '.', '');
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      {
        name: 'genie-dev-middleware',
        configureServer(server) {
          server.middlewares.use('/api/genie', async (req, res) => {
            if (!req.method || req.method.toUpperCase() !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Allow', 'POST');
              res.end('Method Not Allowed');
              return;
            }

            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });

            req.on('end', async () => {
              try {
                const request = new Request(`http://localhost${req.url ?? '/api/genie'}`, {
                  method: 'POST',
                  headers: req.headers as Record<string, string>,
                  body,
                });

                const response = await genieHandler(request);
                res.statusCode = response.status;
                response.headers.forEach((value, key) => res.setHeader(key, value));
                const responseBody = await response.text();
                res.end(responseBody);
              } catch (error) {
                console.error('Genie middleware error:', error);
                res.statusCode = 500;
                res.end('Internal Server Error');
              }
            });

            req.on('error', error => {
              console.error('Genie middleware stream error:', error);
              res.statusCode = 500;
              res.end('Internal Server Error');
            });
          });
        },
      },
    ],
    define: {
      // This makes the `process.env.GEMINI_API_KEY` variable available in the client-side code.
      // Vite will replace this with the value of the GEMINI_API_KEY from your environment.
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
  };
});
