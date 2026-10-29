import path from 'path';
import fs from 'fs';
import { scanLocalFolder, startFolderWatcher, getScannerStatus } from '../services/folderScannerService.js';
import { fallbackStore } from '../config/db.js';

export async function scanFolder(req, res) {
  try {
    let { folderPath, force = false, watch = true } = req.body;

    if (!folderPath) {
      // Default to sample_documents if not provided
      folderPath = path.resolve(process.cwd(), '../sample_documents');
    }

    const resolvedPath = path.resolve(folderPath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(400).json({
        success: false,
        error: `Folder path does not exist on server: ${resolvedPath}`
      });
    }

    const results = await scanLocalFolder(resolvedPath, { force });

    if (watch) {
      startFolderWatcher(resolvedPath);
    }

    res.json({
      success: true,
      message: `Scanned ${results.totalFiles} documents (${results.indexedFiles} newly indexed).`,
      folderPath: resolvedPath,
      results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export function getFolderConfig(req, res) {
  try {
    const settings = fallbackStore.getSettings();
    const status = getScannerStatus();
    const defaultSamplePath = path.resolve(process.cwd(), '../sample_documents');

    res.json({
      success: true,
      folderPath: settings.localFolderPath || defaultSamplePath,
      defaultSamplePath,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
