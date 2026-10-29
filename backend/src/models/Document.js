import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    filePath: { type: String, required: true, unique: true },
    fileType: { type: String, enum: ['pdf', 'docx', 'doc'], required: true },
    fileSize: { type: Number, default: 0 },
    source: { type: String, enum: ['local_folder', 'upload'], default: 'local_folder' },
    status: { type: String, enum: ['indexed', 'indexing', 'error'], default: 'indexed' },
    chunkCount: { type: Number, default: 0 },
    metadata: {
      title: String,
      pageCount: Number,
      wordCount: Number,
      lastModified: Date,
    },
  },
  { timestamps: true }
);

export const DocumentModel = mongoose.models.Document || mongoose.model('Document', DocumentSchema);
