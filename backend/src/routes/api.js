import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getDocuments,
  getDocumentById,
  uploadDocument,
  deleteDocumentHandler,
  getStats
} from '../controllers/documentController.js';
import { scanFolder, getFolderConfig } from '../controllers/folderController.js';
import { listModels, testConnection } from '../controllers/modelsController.js';
import {
  getSessions,
  createSession,
  deleteSession,
  getSessionMessages,
  streamChat
} from '../controllers/chatController.js';

const router = express.Router();

// Configure multer file upload
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeName}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.docx', '.doc'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word (.docx, .doc) files are supported'));
    }
  }
});

// Document routes
router.get('/documents', getDocuments);
router.get('/documents/:id', getDocumentById);
router.post('/documents/upload', upload.single('file'), uploadDocument);
router.delete('/documents/:id', deleteDocumentHandler);
router.get('/stats', getStats);

// Local Folder scanner routes
router.post('/folder/scan', scanFolder);
router.get('/folder/config', getFolderConfig);

// LLM Model routes
router.get('/models', listModels);
router.post('/models/test', testConnection);

// Chat & RAG routes
router.get('/chat/sessions', getSessions);
router.post('/chat/sessions', createSession);
router.delete('/chat/sessions/:sessionId', deleteSession);
router.get('/chat/sessions/:sessionId/messages', getSessionMessages);
router.post('/chat/stream', streamChat);

export default router;
