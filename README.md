# doc-researcher-mern

DocIntel is a local, offline-first app for researching your own documents. You index PDF and Word files, then ask questions about them. Answers come from a local LLM ([Ollama](https://ollama.com)) and cite the page each claim comes from.

MongoDB and Ollama are both optional:
- Without MongoDB, data is kept in a local JSON file.
- Without Ollama, answers are built directly from the best-matching passages.

## Run with Docker

```bash
docker compose up --build
docker exec -it doc-researcher-ollama ollama pull llama3.2
```

This starts MongoDB, Ollama and the API on port 5001. The backend image doesn't include the UI, so also run the frontend dev server (see below); it proxies `/api` to `localhost:5001`.

## Run locally

Requires Node.js 20+.

```bash
# Backend (http://localhost:5001)
cd backend
npm install
npm run dev

# Frontend (http://localhost:3000, proxies /api to the backend)
cd frontend
npm install
npm run dev
```

On startup the backend indexes `sample_documents/` and watches it for changes. In the UI, use **Documents** to upload files or scan another folder on the server. Use the settings button to pick the Ollama model and endpoint.

Configuration is through environment variables: `PORT` (default `5001`), `MONGODB_URI` (default `mongodb://127.0.0.1:27017/doc_researcher`) and `OLLAMA_HOST` (default `http://localhost:11434`).

See [CLAUDE.md](CLAUDE.md) for architecture notes.
