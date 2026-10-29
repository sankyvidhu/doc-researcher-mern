import { ChunkModel } from '../models/Chunk.js';
import { fallbackStore, getDbStatus } from '../config/db.js';
import { computeLocalEmbedding, cosineSimilarity, tokenize } from './embeddingService.js';

/**
 * Perform Hybrid RAG Search across indexed document chunks
 * @param {string} query
 * @param {Object} options
 * @returns {Promise<{ retrievedChunks: Array<Object>, contextText: string }>}
 */
export async function searchRelevantChunks(query, options = {}) {
  const topK = options.topK || 5;
  const documentIds = options.documentIds || null;
  const dbStatus = getDbStatus();

  // 1. Fetch chunks from MongoDB or Fallback Store
  let allChunks = [];
  if (dbStatus.isMongoConnected) {
    const filter = documentIds && documentIds.length > 0 ? { documentId: { $in: documentIds } } : {};
    allChunks = await ChunkModel.find(filter).lean();
  } else {
    allChunks = await fallbackStore.getChunks();
    if (documentIds && documentIds.length > 0) {
      allChunks = allChunks.filter(c => documentIds.includes(c.documentId));
    }
  }

  if (allChunks.length === 0) {
    return {
      retrievedChunks: [],
      contextText: 'No documents have been indexed yet in the database. Please scan a folder or upload documents.'
    };
  }

  // 2. Compute query vector & tokens
  const queryTokens = tokenize(query);
  const queryVector = computeLocalEmbedding(query);

  // 3. Score each chunk
  const scoredChunks = allChunks.map(chunk => {
    // Vector similarity
    const chunkVector = (chunk.embedding && chunk.embedding.length > 0)
      ? chunk.embedding
      : computeLocalEmbedding(chunk.text);
    
    const vectorScore = cosineSimilarity(queryVector, chunkVector);

    // Keyword match boost (lexical BM25 approximation)
    const chunkTokens = tokenize(chunk.text);
    const tokenSet = new Set(chunkTokens);
    let matchedKeywords = 0;
    for (const token of queryTokens) {
      if (tokenSet.has(token)) {
        matchedKeywords++;
      }
    }
    const keywordScore = queryTokens.length > 0 ? (matchedKeywords / queryTokens.length) : 0;

    // Hybrid weighted score
    const finalScore = (vectorScore * 0.65) + (keywordScore * 0.35);

    return {
      chunkId: chunk._id || chunk.id,
      documentId: chunk.documentId,
      fileName: chunk.fileName,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      pageNumber: chunk.pageNumber || 1,
      similarityScore: parseFloat(finalScore.toFixed(4)),
      vectorScore: parseFloat(vectorScore.toFixed(4)),
      keywordScore: parseFloat(keywordScore.toFixed(4)),
    };
  });

  // 4. Sort descending by score
  scoredChunks.sort((a, b) => b.similarityScore - a.similarityScore);

  // 5. Select top-K
  const retrievedChunks = scoredChunks.slice(0, topK);

  // 6. Build structured context text
  const contextParts = retrievedChunks.map((c, index) => {
    return `[SOURCE ${index + 1}] File: "${c.fileName}", Page: ${c.pageNumber} (Relevance: ${(c.similarityScore * 100).toFixed(1)}%)\n"""\n${c.text}\n"""`;
  });

  const contextText = contextParts.join('\n\n');

  return {
    retrievedChunks,
    contextText
  };
}

/**
 * Formats full system + user prompt for Local LLMs
 */
export function buildRagPrompt(query, contextText, conversationHistory = []) {
  const systemPrompt = `You are an expert AI research assistant analyzing local PDF and Word documents.
Your goal is to provide comprehensive, factual, and accurate answers based EXCLUSIVELY on the provided document excerpts.

CRITICAL INSTRUCTIONS:
1. Always cite your sources using bracketed references like [Source 1], [Source 2], mentioning the file name and page number when relevant.
2. If the excerpts do not contain enough information to answer the question, state clearly what is known from the documents and what is missing, rather than fabricating information.
3. Organize complex answers with clear markdown headings, bullet points, and key takeaways.
4. When comparing documents, contrast their findings explicitly.

DOCUMENT EXCERPTS:
${contextText}
`;

  return {
    systemPrompt,
    userPrompt: query
  };
}
