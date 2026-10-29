import path from 'path';
import { DocumentModel } from '../models/Document.js';
import { ChunkModel } from '../models/Chunk.js';
import { fallbackStore, getDbStatus } from '../config/db.js';
import { indexSingleFile, removeDocument } from '../services/folderScannerService.js';

export async function getDocuments(req, res) {
  try {
    const dbStatus = getDbStatus();
    let docs = [];
    if (dbStatus.isMongoConnected) {
      docs = await DocumentModel.find().sort({ updatedAt: -1 }).lean();
    } else {
      docs = await fallbackStore.getDocuments();
    }
    res.json({ success: true, count: docs.length, documents: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getDocumentById(req, res) {
  try {
    const { id } = req.params;
    const dbStatus = getDbStatus();
    let doc = null;
    let chunks = [];

    if (dbStatus.isMongoConnected) {
      doc = await DocumentModel.findById(id).lean();
      chunks = await ChunkModel.find({ documentId: id }).sort({ chunkIndex: 1 }).lean();
    } else {
      doc = await fallbackStore.getDocumentById(id);
      chunks = await fallbackStore.getChunks({ documentId: id });
    }

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    res.json({ success: true, document: doc, chunks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function uploadDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const uploadedPath = path.resolve(req.file.path);
    const doc = await indexSingleFile(uploadedPath, { source: 'upload', force: true });

    res.json({
      success: true,
      message: 'Document uploaded and indexed successfully',
      document: doc
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteDocumentHandler(req, res) {
  try {
    const { id } = req.params;
    await removeDocument(id);
    res.json({ success: true, message: 'Document and its indexed chunks removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getStats(req, res) {
  try {
    const dbStatus = getDbStatus();
    let docCount = 0;
    let chunkCount = 0;

    if (dbStatus.isMongoConnected) {
      docCount = await DocumentModel.countDocuments();
      chunkCount = await ChunkModel.countDocuments();
    } else {
      const docs = await fallbackStore.getDocuments();
      const chunks = await fallbackStore.getChunks();
      docCount = docs.length;
      chunkCount = chunks.length;
    }

    res.json({
      success: true,
      stats: {
        docCount,
        chunkCount,
        database: dbStatus
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
