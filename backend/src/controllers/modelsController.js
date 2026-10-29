import { getLocalModels } from '../services/llmService.js';
import { fallbackStore } from '../config/db.js';

export async function listModels(req, res) {
  try {
    const endpoint = req.query.endpoint || process.env.OLLAMA_HOST || 'http://localhost:11434';
    const info = await getLocalModels(endpoint);
    res.json({ success: true, ...info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function testConnection(req, res) {
  try {
    const { endpoint = 'http://localhost:11434' } = req.body;
    const info = await getLocalModels(endpoint);
    res.json({
      success: true,
      connected: info.connected,
      endpoint,
      models: info.models,
      message: info.connected 
        ? `Connected to Ollama! Found ${info.models.length} local model(s).`
        : `Ollama is not responding at ${endpoint}. Run 'ollama serve' or check endpoint.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
