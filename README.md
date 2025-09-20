<div align="center">
<img width="1200" height="475" alt="GetMyCreative banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# GetMyCreative · AI Brand Studio

GetMyCreative is an AI-assisted studio for marketers, founders, and creative teams to spin up branded campaign assets in minutes. Designers can launch from curated templates, customize with brand kits, and iterate through conversational edits powered by Gemini.

This project is the full Vite + React codebase that runs the web experience, complete with Gemini orchestration, Firebase-backed storage, and a template-driven editing workflow.

## Why Build On GetMyCreative?
- **Template-first creation** – Start with polished layouts and customize text, imagery, and hotspots.
- **Conversational editing** – Gemini-powered chat can tweak layouts, regenerate assets, or apply brand guidance without manual pixel pushing.
- **Brand kit intelligence** – Persist palettes, typography, and assets to keep every render on-brand.
- **Project history** – Version tracking lets teams compare iterations and revert quickly.
- **Firebase persistence** – Auth, storage, and history sync so collaborators stay aligned.

## Tech Stack
- **Frontend:** React 18 + TypeScript, Vite, TailwindCSS for styling.
- **AI Services:** Google Gemini via the `@google/genai` SDK.
- **State & Systems:** Context-based auth, modular stores under `core/systems`, template definitions in `core/templates`.
- **Data & Storage:** Firebase for auth, asset uploads, and project history.

## Getting Started
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment** – Copy `.env.local` and replace the example values with your own Gemini and Firebase credentials (see [Environment Variables](#environment-variables)).
3. **Run the dev server**
   ```bash
   npm run dev
   ```
4. **Open the studio** – Visit the printed local URL (typically `http://localhost:5173`) to start building creatives.

## Environment Variables
| Key | Description |
| --- | --- |
| `GEMINI_API_KEY` / `VITE_GEMINI_API_KEY` | Server/client access keys for Google Gemini generations. |
| `VITE_FIREBASE_API_KEY` | Firebase Web API key. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain. |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project identifier. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket for asset uploads. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID (kept for completeness). |
| `VITE_FIREBASE_APP_ID` | Firebase web app ID. |
| `VITE_FIREBASE_MEASUREMENT_ID` | Optional analytics ID. |

All variables live in `.env.local` so they are available both to Vite (`import.meta.env`) and server-side utilities.

## Project Structure
```
├── components/            # UI building blocks (Editor, Studio, modals, icons)
├── core/
│   ├── systems/           # Business logic (template store, project store)
│   └── types/             # Shared domain models
├── services/
│   └── geminiService.ts   # Gemini prompts, creative generation, chat edits
├── contexts/              # React providers (auth, UI state)
├── firebase/              # Firebase client config
├── utils/                 # File helpers, formatting utilities
└── public/                # Static assets and favicons
```

## Development Workflow
- **Templates → Project:** Select a template via `TemplateGrid`, load into `EditorView`, and initialize marks/hotspots from the template definition.
- **Editing loop:** Users change text/image marks manually or through the Gemini chat assistant (`CreativeAssistantChat`).
- **Version history:** Each generation is stored in the project history (`projectStore`) and displayed via the version carousel.
- **Brand kits:** Persisted palettes and assets inform future generations and can be edited through the Brand Kit modals.

## Helpful Scripts
| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the Vite dev server with hot module reload. |
| `npm run build` | Generate a production build into `dist/`. |
| `npm run preview` | Serve the production build locally for smoke testing. |

## Contributing & Next Steps
- Use feature branches and conventional commits when possible.
- Linting/testing hooks are not yet wired—add them as needed for your workflow.
- PRs should include screenshots or loom videos when UI/UX changes are introduced.

Whether you are shipping new template packs, refining Gemini prompts, or wiring analytics, this repo is the foundation. Happy building!
