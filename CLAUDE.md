# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

"DocIntel": a local, offline-first RAG document research app. Users index PDF/Word files (by uploading them or scanning a folder), then chat with the indexed content. Answers come from a local LLM via Ollama and cite their sources. Stack: Express 5 + Mongoose (backend), React 18 + Vite + Tailwind (frontend), with optional MongoDB and Ollama.

Every external dependency is optional and has a fallback:
- **No MongoDB** → a JSON file store (`backend/src/data/local_store.json`)
- **No Ollama** → a canned "local synthesis" answer built from the retrieved chunks
- **No embedding model** → a local hashed 256-dim vectorizer (the only one ingestion actually uses, see below)

## Caveats

- `backend/src/data/local_store.json` and `backend/uploads/` are runtime data. They are gitignored, and the store is also excluded from the Docker image.
- There are no tests, no linter and no TypeScript. Check backend syntax with `node --check <file>`, and check the frontend with `npm run build`.
- WSL on `/mnt/*` drives: if `vite build` fails with `Cannot read directory "../../../..": input/output error`, use `npx vite build --configLoader runner`. Chokidar gets no inotify events on `/mnt/*` either, so the folder watcher only reacts to changes on the Linux filesystem (or inside Docker).

## Commands

```bash
# Backend: run from backend/ (paths are resolved against process.cwd(), see below)
cd backend && npm install
npm run dev        # node --watch server.js, port 5001
npm start

# Frontend
cd frontend && npm install
npm run dev        # Vite on :3000, proxies /api -> http://localhost:5001
npm run build      # -> frontend/dist, which the backend serves automatically if present

# Full stack (MongoDB 7 + Ollama + backend) via Docker
docker compose up --build
docker exec -it doc-researcher-ollama ollama pull llama3.2   # pull a model once
```

Health check: `GET http://localhost:5001/api/health`. It reports which DB mode is active.

Environment variables (there is no `.env` file; `dotenv` is loaded): `PORT` (5001), `MONGODB_URI` (`mongodb://127.0.0.1:27017/doc_researcher`), `OLLAMA_HOST` (`http://localhost:11434`).

The VS Code launch config opens http://localhost:3000.

## Backend architecture

```
server.js               Express setup, /api mount, /api/health, serves ../frontend/dist + SPA fallback,
                        on boot: connectDB() then auto-scan + watch ../sample_documents
src/config/db.js        connectDB() (3s timeout) / getDbStatus() / LocalFallbackStore (exported `fallbackStore`)
src/routes/api.js       All routes + multer upload config (uploads/, 50MB, .pdf/.docx/.doc only)
src/controllers/        Thin HTTP handlers: document, folder, models, chat
src/models/             Mongoose: Document, Chunk, ChatSession, Message
src/services/
  extractorService      pdf-parse (per page) / mammoth (.docx; pseudo-pages of ~250 words); .doc tries mammoth, then raw bytes
  chunkingService       Sliding window that prefers sentence boundaries (ingestion uses 750 chars / 120 overlap)
  embeddingService      tokenize, computeLocalEmbedding (1-/2-gram hashing, L2-normalized), cosineSimilarity, getEmbedding (Ollama)
  folderScannerService  scanLocalFolder, indexSingleFile (skips files unchanged by mtime unless force), chokidar watcher
  ragService            searchRelevantChunks (hybrid: 0.65 cosine + 0.35 keyword overlap, top-K), buildRagPrompt
  llmService            getLocalModels (/api/tags, falls back to a preset list), streamLLMResponse (Ollama /api/chat stream, or local synthesis)
```

### Dual storage

Every data access branches on `getDbStatus().isMongoConnected`: Mongoose models when true, `fallbackStore` methods when false. **New data code must implement both paths.** The mode is decided once, at startup.
- The fallback store keeps everything in memory and rewrites the whole JSON file on every mutation. Retrieval loads *all* chunks and scores them in JS. There is no vector index in either mode.
- Settings (`localFolderPath`, etc.) always live in `fallbackStore`, even in Mongo mode.
- IDs differ by mode: ObjectIds in Mongo, prefixed strings (`doc_…`, `sess_…`, `msg_…`) in the fallback store. `indexSingleFile` picks the right kind. Chunk `documentId` and message `sessionId` are always stored as strings. To look up a document, use `findDocumentById` / `findDocumentByPath` in `folderScannerService` rather than calling `findById` directly: a `doc_…` id would throw a CastError in Mongo mode.

### cwd-relative paths

`local_store.json` (`src/data/`), `uploads/`, and the default folder `../sample_documents` are all resolved from `process.cwd()`, so the backend must be started from `backend/`. In Docker, `WORKDIR /app` makes `../sample_documents` resolve to `/sample_documents`, which is where compose mounts it (read-only).

### Embeddings

Both ingestion and query use `computeLocalEmbedding` (256-dim). `getEmbedding` (Ollama `nomic-embed-text`) exists but is not called anywhere. If you switch to Ollama embeddings, re-embed every stored chunk and the query with the same model: `cosineSimilarity` returns 0 when vector lengths differ.

### Chat streaming (`POST /api/chat/stream`)

The body takes `{ sessionId, message, model, endpoint, topK, temperature, documentIds }`. The response is SSE, written manually with `res.write`, and sends these events in order: `status` → `sources` (the retrieved chunks) → `status` → `token`… → `done` (`{ fullText, sources, model }`), or `error`. The user message is saved before retrieval and the assistant message (with its `sources`) in the awaited `onComplete`. Session titles are set automatically from the first user message. When `endpoint` is omitted, the server uses `OLLAMA_HOST`. The frontend leaves it empty by default, because the backend makes the call, not the browser.

`streamLLMResponse` falls back to local synthesis only if Ollama produced no tokens. If the stream breaks mid-answer, the partial answer is kept. `res.end()` always runs (in `finally`), and once the client disconnects, events stop being written.

### API routes (all under `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/documents`, `/documents/:id` | List documents; one document plus its chunks |
| POST | `/documents/upload` | multipart field `file` → indexed with `source: 'upload'` |
| DELETE | `/documents/:id` | Delete a document and its chunks; for `source: 'upload'`, also deletes the file from `uploads/` |
| GET | `/stats` | Document and chunk counts, DB status |
| POST | `/folder/scan` | `{ folderPath?, force?, watch? }`, defaults to `../sample_documents` |
| GET | `/folder/config` | Saved folder path and scanner status |
| GET | `/models?endpoint=` | List Ollama models (preset list when offline) |
| POST | `/models/test` | `{ endpoint }` connection test |
| GET/POST | `/chat/sessions` | List / create sessions |
| DELETE | `/chat/sessions/:sessionId` | Delete a session and its messages |
| GET | `/chat/sessions/:sessionId/messages` | Session history |
| POST | `/chat/stream` | SSE RAG chat (see above) |

Response convention: `{ success: true, ... }` on success, `{ success: false, error }` with status 4xx/5xx on failure.

The folder watcher re-indexes on `add`/`change` and removes documents from the index on `unlink`.

## Frontend architecture

`App.jsx` owns all state: sessions, messages, documents, the selected-document filter, and settings (persisted to `localStorage` under `docintel.settings`). The other components are presentational.
- `api/client.js` wraps every route. `streamChat` parses SSE frames from `fetch` + `getReader()`, because the chat endpoint is a POST and `EventSource` can't be used.
- `ChatWindow` rewrites `[Source N…]` in answers into `#source-N` links. Its markdown `a` renderer turns those into buttons that open `CitationModal`.
- Markdown styling comes from the `components` map in `ChatWindow`; there is no typography plugin.
- `DocumentDrawer` handles upload, folder scan, the document list and the selection checkboxes. `ModelSettingsModal` handles the endpoint, model, top-K and temperature.

## Conventions

- ES modules everywhere (`"type": "module"`), with explicit `.js` extensions in imports.
- Log lines are prefixed with a tag such as `[FolderScanner]`, `[Database]` or `[LLMService]`.
- Services swallow Ollama/network failures and fall back silently; keep that "works with zero setup" behavior.
- Frontend: Tailwind with a dark slate/emerald theme (`brand` colors in `tailwind.config.js`), `lucide-react` icons, `react-markdown` + `remark-gfm` to render answers.
