import mongoose from 'mongoose';

const ChunkSchema = new mongoose.Schema(
  {
    documentId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    pageNumber: { type: Number, default: 1 },
    section: { type: String, default: '' },
    tokenCount: { type: Number, default: 0 },
    embedding: { type: [Number], default: [] },
  },
  { timestamps: true }
);

ChunkSchema.index({ documentId: 1, chunkIndex: 1 });

export const ChunkModel = mongoose.models.Chunk || mongoose.model('Chunk', ChunkSchema);
