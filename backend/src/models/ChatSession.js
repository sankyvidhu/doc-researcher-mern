import mongoose from 'mongoose';

const ChatSessionSchema = new mongoose.Schema(
  {
    title: { type: String, default: 'New Research Chat' },
    model: { type: String, default: 'llama3.2' },
  },
  { timestamps: true }
);

export const ChatSessionModel = mongoose.models.ChatSession || mongoose.model('ChatSession', ChatSessionSchema);
