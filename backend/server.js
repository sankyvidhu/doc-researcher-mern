import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { connectDB, getDbStatus } from './src/config/db.js';
import apiRoutes from './src/routes/api.js';
import { scanLocalFolder, startFolderWatcher } from './src/services/folderScannerService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount API routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: getDbStatus()
  });
});

// Serve Frontend Static Assets if built
const frontendDist = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  console.log(`[Server] Serving production frontend build from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  // Universal SPA fallback for Express 4 & 5
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Start server
async function startServer() {
  try {
    // Connect to MongoDB or local fallback store
    await connectDB();

    // Check and auto-index sample documents folder if present
    const sampleDir = path.resolve(__dirname, '../sample_documents');
    if (fs.existsSync(sampleDir)) {
      console.log(`[Server] Scanning default sample documents directory: ${sampleDir}`);
      try {
        await scanLocalFolder(sampleDir);
        startFolderWatcher(sampleDir);
      } catch (err) {
        console.warn('[Server] Initial sample folder scan warning:', err.message);
      }
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n===============================================================`);
      console.log(` 🚀 DocIntel MERN AI Server running on http://localhost:${PORT}`);
      console.log(` 📁 API Endpoints: http://localhost:${PORT}/api`);
      console.log(` 💾 Database: ${getDbStatus().mode}`);
      console.log(`===============================================================\n`);
    });
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

startServer();
