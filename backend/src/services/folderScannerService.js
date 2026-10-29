import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import mongoose from 'mongoose';
import { extractDocumentContent } from './extractorService.js';
import { chunkDocumentPages } from './chunkingService.js';
import { computeLocalEmbedding } from './embeddingService.js';
import { DocumentModel } from '../models/Document.js';
import { ChunkModel } from '../models/Chunk.js';
import { fallbackStore, getDbStatus } from '../config/db.js';

let activeWatcher = null;
let currentFolderPath = '';
let isScanning = false;

const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.doc']);

/**
 * Scan a local folder and index all supported documents
 * @param {string} folderPath 
 * @param {Object} options
 */
export async function scanLocalFolder(folderPath, options = { force: false }) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Directory does not exist: ${folderPath}`);
  }

  isScanning = true;
  currentFolderPath = path.resolve(folderPath);

  // Save folder path in settings
  fallbackStore.updateSettings({ localFolderPath: currentFolderPath });

  const filesToIndex = findDocumentFiles(currentFolderPath);
  console.log(`[FolderScanner] Found ${filesToIndex.length} document(s) in: ${currentFolderPath}`);

  const results = {
    totalFiles: filesToIndex.length,
    indexedFiles: 0,
    skippedFiles: 0,
    errors: [],
    documents: []
  };

  for (const filePath of filesToIndex) {
    try {
      const doc = await indexSingleFile(filePath, { source: 'local_folder', force: options.force });
      if (doc) {
        results.indexedFiles++;
        results.documents.push(doc);
      } else {
        results.skippedFiles++;
      }
    } catch (err) {
      console.error(`[FolderScanner] Error indexing ${filePath}:`, err.message);
      results.errors.push({ file: path.basename(filePath), error: err.message });
    }
  }

  isScanning = false;
  return results;
}

/**
 * Indexes a single document file into database and chunk collection
 */
export async function indexSingleFile(filePath, { source = 'local_folder', force = false } = {}) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const fileType = ext.replace('.', '');
  const stats = fs.statSync(filePath);
  const dbStatus = getDbStatus();

  // Check if already indexed and unmodified
  const existingDoc = await findDocumentByPath(filePath);

  if (existingDoc && !force) {
    const lastModified = existingDoc.metadata?.lastModified 
      ? new Date(existingDoc.metadata.lastModified).getTime() 
      : 0;
    // Stored dates have millisecond precision; mtimeMs can carry a fractional part
    if (Math.floor(stats.mtimeMs) <= lastModified && existingDoc.status === 'indexed') {
      return null; // Skip unchanged file
    }
  }

  console.log(`[FolderScanner] Ingesting document: ${fileName} (${fileType.toUpperCase()})...`);

  // 1. Extract content and pages
  const extracted = await extractDocumentContent(filePath);

  // 2. Split into chunks
  const rawChunks = chunkDocumentPages(extracted.pages, {
    chunkSize: 750,
    chunkOverlap: 120
  });

  // MongoDB requires ObjectId _ids; the fallback store uses prefixed string ids
  let docId;
  if (existingDoc) {
    docId = existingDoc._id || existingDoc.id;
  } else if (dbStatus.isMongoConnected) {
    docId = new mongoose.Types.ObjectId();
  } else {
    docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }

  // 3. Compute vector embeddings for each chunk
  const preparedChunks = rawChunks.map(chunk => ({
    documentId: String(docId),
    fileName,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    pageNumber: chunk.pageNumber,
    tokenCount: chunk.tokenCount,
    embedding: computeLocalEmbedding(chunk.text)
  }));

  const docData = {
    _id: docId,
    fileName,
    filePath,
    fileType,
    fileSize: stats.size,
    source,
    status: 'indexed',
    chunkCount: preparedChunks.length,
    metadata: {
      title: extracted.metadata.title || fileName,
      pageCount: extracted.metadata.pageCount || 1,
      wordCount: extracted.metadata.wordCount || 0,
      lastModified: stats.mtime
    }
  };

  // 4. Save document & chunks in MongoDB or Fallback Store
  if (dbStatus.isMongoConnected) {
    const { _id, ...docFields } = docData;
    await DocumentModel.findOneAndUpdate({ _id }, docFields, { upsert: true, new: true });
    await ChunkModel.deleteMany({ documentId: String(docId) });
    if (preparedChunks.length > 0) {
      await ChunkModel.insertMany(preparedChunks);
    }
  } else {
    await fallbackStore.upsertDocument(docData);
    await fallbackStore.deleteChunksForDocument(String(docId));
    await fallbackStore.saveChunks(preparedChunks);
  }

  console.log(`[FolderScanner] Ingestion complete: "${fileName}" -> ${preparedChunks.length} chunks indexed.`);
  return docData;
}

/**
 * Find an indexed document by its absolute file path
 */
export async function findDocumentByPath(filePath) {
  if (getDbStatus().isMongoConnected) {
    return await DocumentModel.findOne({ filePath }).lean();
  }
  const docs = await fallbackStore.getDocuments();
  return docs.find(d => d.filePath === filePath) || null;
}

/**
 * Find an indexed document by id
 */
export async function findDocumentById(docId) {
  if (getDbStatus().isMongoConnected) {
    return mongoose.isValidObjectId(docId) ? await DocumentModel.findById(docId).lean() : null;
  }
  return (await fallbackStore.getDocumentById(docId)) || null;
}

/**
 * Remove document and its chunks
 */
export async function removeDocument(docId) {
  const dbStatus = getDbStatus();
  if (dbStatus.isMongoConnected) {
    await DocumentModel.findByIdAndDelete(docId);
    await ChunkModel.deleteMany({ documentId: String(docId) });
  } else {
    await fallbackStore.deleteDocument(String(docId));
  }
}

/**
 * Start watching folder for live changes
 */
export function startFolderWatcher(folderPath) {
  if (activeWatcher) {
    activeWatcher.close();
  }

  if (!fs.existsSync(folderPath)) return;

  activeWatcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    depth: 3,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 200
    }
  });

  activeWatcher
    .on('add', filePath => {
      const ext = path.extname(filePath).toLowerCase();
      if (SUPPORTED_EXTS.has(ext)) {
        console.log(`[FolderWatcher] New document detected: ${filePath}`);
        indexSingleFile(filePath).catch(err => console.error('[FolderWatcher] Add error:', err.message));
      }
    })
    .on('change', filePath => {
      const ext = path.extname(filePath).toLowerCase();
      if (SUPPORTED_EXTS.has(ext)) {
        console.log(`[FolderWatcher] Document updated: ${filePath}`);
        indexSingleFile(filePath, { force: true }).catch(err => console.error('[FolderWatcher] Change error:', err.message));
      }
    })
    .on('unlink', async filePath => {
      console.log(`[FolderWatcher] File deleted: ${filePath}`);
      try {
        const doc = await findDocumentByPath(filePath);
        if (doc) {
          await removeDocument(doc._id || doc.id);
          console.log(`[FolderWatcher] Removed "${path.basename(filePath)}" from index.`);
        }
      } catch (err) {
        console.error('[FolderWatcher] Unlink error:', err.message);
      }
    });

  console.log(`[FolderWatcher] Watching local folder: ${folderPath}`);
}

/**
 * Recursively find all supported documents (.pdf, .docx, .doc)
 */
function findDocumentFiles(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findDocumentFiles(fullPath));
      } else {
        const ext = path.extname(file).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.warn(`[FolderScanner] Cannot read directory ${dir}:`, err.message);
  }
  return results;
}

export function getScannerStatus() {
  return {
    isScanning,
    currentFolderPath,
    isWatching: activeWatcher !== null
  };
}
