/**
 * API client for the DocIntel backend.
 * Uses a relative /api base so it works behind the Vite dev proxy and when served by Express.
 */

const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: options.body instanceof FormData
      ? options.headers
      : { 'Content-Type': 'application/json', ...options.headers },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok || (data && data.success === false)) {
    throw new Error(data?.error || `Request failed: HTTP ${res.status}`);
  }
  return data;
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) });
const del = (path) => request(path, { method: 'DELETE' });

// Health & stats
export const getHealth = () => request('/health');
export const getStats = () => request('/stats');

// Documents
export const getDocuments = () => request('/documents');
export const getDocument = (id) => request(`/documents/${encodeURIComponent(id)}`);
export const deleteDocument = (id) => del(`/documents/${encodeURIComponent(id)}`);

export function uploadDocument(file) {
  const form = new FormData();
  form.append('file', file);
  return request('/documents/upload', { method: 'POST', body: form });
}

// Local folder scanner
export const getFolderConfig = () => request('/folder/config');
export const scanFolder = ({ folderPath, force = false, watch = true }) =>
  post('/folder/scan', { folderPath, force, watch });

// Models
export const listModels = (endpoint) =>
  request(`/models${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''}`);
export const testConnection = (endpoint) => post('/models/test', { endpoint });

// Chat sessions
export const getSessions = () => request('/chat/sessions');
export const createSession = (title, model) => post('/chat/sessions', { title, model });
export const deleteSession = (sessionId) => del(`/chat/sessions/${encodeURIComponent(sessionId)}`);
export const getSessionMessages = (sessionId) =>
  request(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`);

/**
 * Stream a RAG chat answer over Server-Sent Events.
 * The endpoint is a POST, so EventSource can't be used; frames are parsed from the response body.
 */
export async function streamChat(body, { onStatus, onSources, onToken, onDone, onError, signal } = {}) {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let message = `Chat request failed: HTTP ${res.status}`;
    try {
      message = (await res.json()).error || message;
    } catch {
      // Ignore
    }
    throw new Error(message);
  }

  const handlers = {
    status: (d) => onStatus?.(d.message),
    sources: (d) => onSources?.(d.sources || []),
    token: (d) => onToken?.(d.token),
    done: (d) => onDone?.(d),
    error: (d) => onError?.(new Error(d.error || 'Stream error')),
  };

  const dispatchFrame = (frame) => {
    let event = 'message';
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0 || !handlers[event]) return;
    try {
      handlers[event](JSON.parse(dataLines.join('\n')));
    } catch {
      // Malformed frame
    }
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line; keep the trailing partial frame
    const frames = buffer.split('\n\n');
    buffer = frames.pop();
    frames.forEach(dispatchFrame);
  }

  buffer += decoder.decode();
  if (buffer.trim()) dispatchFrame(buffer);
}
