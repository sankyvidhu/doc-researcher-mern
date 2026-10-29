import { ChatSessionModel } from '../models/ChatSession.js';
import { MessageModel } from '../models/Message.js';
import { fallbackStore, getDbStatus } from '../config/db.js';
import { searchRelevantChunks, buildRagPrompt } from '../services/ragService.js';
import { streamLLMResponse } from '../services/llmService.js';

export async function getSessions(req, res) {
  try {
    const dbStatus = getDbStatus();
    let sessions = [];
    if (dbStatus.isMongoConnected) {
      sessions = await ChatSessionModel.find().sort({ updatedAt: -1 }).lean();
    } else {
      sessions = await fallbackStore.getSessions();
    }
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createSession(req, res) {
  try {
    const { title = 'New Research Chat', model = 'llama3.2' } = req.body;
    const dbStatus = getDbStatus();
    let session = null;

    if (dbStatus.isMongoConnected) {
      session = await ChatSessionModel.create({ title, model });
    } else {
      session = await fallbackStore.createSession(title, model);
    }

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteSession(req, res) {
  try {
    const { sessionId } = req.params;
    const dbStatus = getDbStatus();

    if (dbStatus.isMongoConnected) {
      await ChatSessionModel.findByIdAndDelete(sessionId);
      await MessageModel.deleteMany({ sessionId });
    } else {
      await fallbackStore.deleteSession(sessionId);
    }

    res.json({ success: true, message: 'Session deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getSessionMessages(req, res) {
  try {
    const { sessionId } = req.params;
    const dbStatus = getDbStatus();
    let messages = [];

    if (dbStatus.isMongoConnected) {
      messages = await MessageModel.find({ sessionId }).sort({ createdAt: 1 }).lean();
    } else {
      messages = await fallbackStore.getMessages(sessionId);
    }

    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Handle AI Research Chat with SSE streaming and document citation sources
 */
export async function streamChat(req, res) {
  const {
    sessionId,
    message,
    model = 'llama3.2',
    endpoint = 'http://localhost:11434',
    topK = 5,
    temperature = 0.2,
    documentIds = null
  } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Query message is required' });
  }

  // Setup Server-Sent Events headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable proxy buffering
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const dbStatus = getDbStatus();

    // 1. Save user message to database
    if (sessionId) {
      if (dbStatus.isMongoConnected) {
        await MessageModel.create({
          sessionId,
          role: 'user',
          content: message,
          model
        });
        // Update session timestamp & title if initial
        const existingMessages = await MessageModel.countDocuments({ sessionId });
        if (existingMessages <= 2) {
          const title = message.substring(0, 32) + (message.length > 32 ? '...' : '');
          await ChatSessionModel.findByIdAndUpdate(sessionId, { title, updatedAt: new Date() });
        }
      } else {
        await fallbackStore.addMessage({
          sessionId,
          role: 'user',
          content: message,
          model
        });
      }
    }

    // 2. Perform Hybrid RAG Retrieval across indexed document chunks
    sendEvent('status', { message: 'Searching local documents using vector similarity...' });
    const { retrievedChunks, contextText } = await searchRelevantChunks(message, {
      topK: parseInt(topK) || 5,
      documentIds
    });

    // 3. Immediately send retrieved source citations to UI
    sendEvent('sources', {
      sources: retrievedChunks,
      count: retrievedChunks.length
    });

    // 4. Construct RAG Prompt
    const { systemPrompt, userPrompt } = buildRagPrompt(message, contextText);

    sendEvent('status', { message: `Generating response with local model: ${model}...` });

    let fullGeneratedText = '';

    // 5. Stream tokens from Local LLM or local synthesis engine
    await streamLLMResponse({
      prompt: userPrompt,
      systemPrompt,
      model,
      endpoint,
      temperature,
      retrievedChunks,
      onToken: (token) => {
        fullGeneratedText += token;
        sendEvent('token', { token });
      },
      onComplete: async (finalText) => {
        // 6. Save assistant message with attached sources to database
        if (sessionId) {
          const assistantMsgData = {
            sessionId,
            role: 'assistant',
            content: finalText,
            sources: retrievedChunks,
            model
          };

          if (dbStatus.isMongoConnected) {
            await MessageModel.create(assistantMsgData);
          } else {
            await fallbackStore.addMessage(assistantMsgData);
          }
        }

        sendEvent('done', {
          fullText: finalText,
          sources: retrievedChunks,
          model
        });
        res.end();
      }
    });

  } catch (err) {
    console.error('[ChatController] Stream chat error:', err);
    sendEvent('error', { error: err.message });
    res.end();
  }
}
