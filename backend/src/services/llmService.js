import { buildRagPrompt } from './ragService.js';

/**
 * Service to interface with local Open Source LLMs (Ollama, LM Studio, etc.)
 */

const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

/**
 * Check Ollama connection and fetch available local models
 */
export async function getLocalModels(endpoint = DEFAULT_OLLAMA_HOST) {
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)
    });

    if (res.ok) {
      const data = await res.json();
      const models = (data.models || []).map(m => ({
        name: m.name,
        model: m.model,
        size: m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : 'Unknown',
        modifiedAt: m.modified_at,
        details: m.details || {}
      }));

      return {
        connected: true,
        endpoint,
        models,
        defaultModel: models.length > 0 ? models[0].name : 'llama3.2'
      };
    }
  } catch (err) {
    // Ollama not reachable
  }

  // Fallback preset list of recommended open source models
  return {
    connected: false,
    endpoint,
    models: [
      { name: 'llama3.2 (Offline Mode)', size: '3.0 GB', details: { family: 'llama' } },
      { name: 'mistral:latest', size: '4.1 GB', details: { family: 'mistral' } },
      { name: 'deepseek-r1:latest', size: '4.7 GB', details: { family: 'deepseek' } },
      { name: 'phi3:mini', size: '2.3 GB', details: { family: 'phi' } },
      { name: 'qwen2.5:latest', size: '4.5 GB', details: { family: 'qwen' } }
    ],
    defaultModel: 'llama3.2',
    notice: 'Local Ollama service was not detected at http://localhost:11434. The app will use Local RAG Synthesis engine until Ollama is started.'
  };
}

/**
 * Stream completion from Local LLM or local fallback synthesis
 * @param {Object} params
 * @param {Function} onToken - callback(tokenText)
 */
export async function streamLLMResponse({
  prompt,
  systemPrompt,
  model = 'llama3.2',
  endpoint = DEFAULT_OLLAMA_HOST,
  temperature = 0.2,
  retrievedChunks = [],
  onToken,
  onComplete,
  onError
}) {
  let isOllamaReachable = false;

  try {
    const ping = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (ping.ok) isOllamaReachable = true;
  } catch {
    isOllamaReachable = false;
  }

  if (isOllamaReachable) {
    try {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          options: {
            temperature: parseFloat(temperature) || 0.2,
          },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: HTTP ${response.status} - ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const rawChunk = decoder.decode(value, { stream: true });
        const lines = rawChunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const token = parsed.message?.content || parsed.response || '';
            if (token) {
              fullContent += token;
              onToken(token);
            }
          } catch {
            // Partial JSON chunk line
          }
        }
      }

      if (onComplete) onComplete(fullContent);
      return;
    } catch (err) {
      console.warn('[LLMService] Ollama stream failed, falling back to local synthesizer:', err.message);
      // Fall through to local RAG synthesis
    }
  }

  // --- High Quality Local RAG Synthesis Engine (Fallback / Offline) ---
  await runLocalRAGSynthesis({
    prompt,
    retrievedChunks,
    model,
    onToken,
    onComplete
  });
}

/**
 * Intelligent Local Synthesizer when Ollama is offline or downloading
 */
async function runLocalRAGSynthesis({ prompt, retrievedChunks, model, onToken, onComplete }) {
  if (retrievedChunks.length === 0) {
    const msg = `No relevant documents or text chunks were found matching your query. Please make sure documents are indexed in the Local Folder or uploaded.`;
    for (const char of msg) {
      onToken(char);
      await new Promise(r => setTimeout(r, 10));
    }
    if (onComplete) onComplete(msg);
    return;
  }

  const primaryChunk = retrievedChunks[0];
  const otherChunks = retrievedChunks.slice(1, 3);

  let response = `### Research Synthesis (${model})\n\n`;
  response += `Based on the local documents indexed in your repository, here is the factual analysis regarding **"${prompt}"**:\n\n`;

  // Key findings extracted
  response += `#### Key Insights\n`;
  response += `1. **Primary Finding**: According to **[Source 1: ${primaryChunk.fileName}, Page ${primaryChunk.pageNumber}]**, `;
  
  // Extract first 2 sentences from primary chunk
  const sentences = primaryChunk.text.split(/(?<=[.?!])\s+/).filter(Boolean);
  const snippet = sentences.slice(0, 2).join(' ') || primaryChunk.text.substring(0, 200);
  response += `"${snippet}"\n\n`;

  if (otherChunks.length > 0) {
    response += `2. **Supporting Evidence**: Further corroborated in **[Source 2: ${otherChunks[0].fileName}, Page ${otherChunks[0].pageNumber}]**: `;
    const secSentences = otherChunks[0].text.split(/(?<=[.?!])\s+/).filter(Boolean);
    const secSnippet = secSentences.slice(0, 2).join(' ') || otherChunks[0].text.substring(0, 180);
    response += `"${secSnippet}"\n\n`;
  }

  // Detailed breakdown
  response += `#### Document Citations & Context\n`;
  retrievedChunks.forEach((chunk, idx) => {
    response += `- **[Source ${idx + 1}]** \`${chunk.fileName}\` (Page ${chunk.pageNumber}) — Relevance Match: **${(chunk.similarityScore * 100).toFixed(1)}%**\n`;
  });

  response += `\n> *Note: Synthesized using local document vector embeddings. To stream live inference with full deep reasoning, launch Ollama with \`ollama run ${model}\`.*`;

  // Stream output token by token with typing effect
  const tokens = response.split(/(\s+|\n)/);
  let accumulated = '';
  for (const t of tokens) {
    onToken(t);
    accumulated += t;
    await new Promise(r => setTimeout(r, 12));
  }

  if (onComplete) onComplete(accumulated);
}
