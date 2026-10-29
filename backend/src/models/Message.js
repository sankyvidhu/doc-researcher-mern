import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    sources: [
      {
        chunkId: String,
        documentId: String,
        fileName: String,
        text: String,
        pageNumber: Number,
        similarityScore: Number,
      },
    ],
    model: { type: String, default: '' },
  },
  { timestamps: true }
);

export const MessageModel = mongoose.models.Message || mongoose.model('Message', MessageSchema);
