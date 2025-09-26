import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import genieHandler from './api/genie.ts';
import generativeFillHandler from './api/generative-fill.ts';

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
        name: 'api-dev-middleware',
        configureServer(server) {
          const attachHandler = (path: string, handler: (request: Request) => Promise<Response>) => {
            server.middlewares.use(path, async (req, res) => {
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
                  const request = new Request(`http://localhost${req.url ?? path}`, {
                    method: 'POST',
                    headers: req.headers as Record<string, string>,
                    body,
                  });

                  const response = await handler(request);
                  res.statusCode = response.status;
                  response.headers.forEach((value, key) => res.setHeader(key, value));
                  const responseBody = await response.text();
                  res.end(responseBody);
                } catch (error) {
                  console.error(`${path} middleware error:`, error);
                  res.statusCode = 500;
                  res.end('Internal Server Error');
                }
              });

              req.on('error', error => {
                console.error(`${path} middleware stream error:`, error);
                res.statusCode = 500;
                res.end('Internal Server Error');
              });
            });
          };

          attachHandler('/api/genie', genieHandler);
          attachHandler('/api/generative-fill', generativeFillHandler);
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
