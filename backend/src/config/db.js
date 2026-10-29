import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

let isMongoConnected = false;
let dbMode = 'uninitialized';

// In-memory / file fallback store
class LocalFallbackStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      documents: [],
      chunks: [],
      sessions: [],
      messages: [],
      settings: {
        localFolderPath: '',
        selectedModel: 'llama3.2',
        ollamaEndpoint: process.env.OLLAMA_HOST || 'http://localhost:11434',
        topK: 5,
        temperature: 0.2
      }
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[FallbackStore] Failed to load local store file:', err.message);
    }
  }

  save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[FallbackStore] Failed to save local store file:', err.message);
    }
  }

  // Documents
  async getDocuments() {
    return this.data.documents;
  }

  async getDocumentById(id) {
    return this.data.documents.find(d => d._id === id || d.id === id);
  }

  async upsertDocument(doc) {
    const existingIndex = this.data.documents.findIndex(d => d.filePath === doc.filePath || d._id === doc._id);
    if (existingIndex >= 0) {
      this.data.documents[existingIndex] = { ...this.data.documents[existingIndex], ...doc, updatedAt: new Date() };
      this.save();
      return this.data.documents[existingIndex];
    } else {
      const newDoc = {
        _id: doc._id || 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        ...doc,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.data.documents.push(newDoc);
      this.save();
      return newDoc;
    }
  }

  async deleteDocument(id) {
    this.data.documents = this.data.documents.filter(d => d._id !== id && d.id !== id);
    this.data.chunks = this.data.chunks.filter(c => c.documentId !== id);
    this.save();
  }

  // Chunks
  async getChunks(filter = {}) {
    if (filter.documentId) {
      return this.data.chunks.filter(c => c.documentId === filter.documentId);
    }
    return this.data.chunks;
  }

  async saveChunks(chunks) {
    this.data.chunks.push(...chunks);
    this.save();
  }

  async deleteChunksForDocument(docId) {
    this.data.chunks = this.data.chunks.filter(c => c.documentId !== docId);
    this.save();
  }

  async clearAllChunks() {
    this.data.chunks = [];
    this.save();
  }

  // Sessions & Messages
  async getSessions() {
    return this.data.sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async getSession(sessionId) {
    return this.data.sessions.find(s => s._id === sessionId || s.id === sessionId);
  }

  async createSession(title = 'New Research Chat', model = 'llama3.2') {
    const session = {
      _id: 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title,
      model,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.data.sessions.unshift(session);
    this.save();
    return session;
  }

  async deleteSession(sessionId) {
    this.data.sessions = this.data.sessions.filter(s => s._id !== sessionId && s.id !== sessionId);
    this.data.messages = this.data.messages.filter(m => m.sessionId !== sessionId);
    this.save();
  }

  async getMessages(sessionId) {
    return this.data.messages
      .filter(m => m.sessionId === sessionId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  async addMessage({ sessionId, role, content, sources = [], model = '' }) {
    const message = {
      _id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      sessionId,
      role,
      content,
      sources,
      model,
      createdAt: new Date()
    };
    this.data.messages.push(message);

    const session = this.data.sessions.find(s => s._id === sessionId || s.id === sessionId);
    if (session) {
      session.updatedAt = new Date();
      if (role === 'user' && session.title === 'New Research Chat') {
        session.title = content.substring(0, 35) + (content.length > 35 ? '...' : '');
      }
    }

    this.save();
    return message;
  }

  // Settings
  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }
}

const fallbackStorePath = path.resolve(process.cwd(), 'src/data/local_store.json');
export const fallbackStore = new LocalFallbackStore(fallbackStorePath);

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/doc_researcher';
  try {
    console.log(`[Database] Attempting connection to MongoDB at: ${mongoUri}...`);
    // Connect with short timeout so it doesn't hang if MongoDB is not started
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 3000,
    });
    isMongoConnected = true;
    dbMode = 'MongoDB (Connected)';
    console.log(`[Database] Successfully connected to MongoDB! Mode: ${dbMode}`);
  } catch (error) {
    isMongoConnected = false;
    dbMode = 'Local Storage Fallback (Zero Config Mode)';
    console.warn(`[Database] MongoDB not reachable (${error.message}).`);
    console.log(`[Database] Switched to high-performance Standalone Local JSON/Memory Store (${fallbackStorePath}). All operations will function seamlessly.`);
  }

  return { isMongoConnected, dbMode };
}

export function getDbStatus() {
  return {
    isMongoConnected,
    mode: dbMode,
    mongooseState: mongoose.connection.readyState, // 0 = disconnected, 1 = connected
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/doc_researcher'
  };
}
