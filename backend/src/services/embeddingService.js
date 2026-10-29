/**
 * Embedding & Vector Calculation Service
 * Supports Ollama embeddings API with automatic local vectorizer fallback
 */

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is',
  'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself'
]);

/**
 * Tokenize text into normalized stemmed-like terms
 */
export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

/**
 * Build term frequency map
 */
export function getTermFrequencies(tokens) {
  const tf = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  return tf;
}

/**
 * Compute local dense vector using hashed projection (TF-IDF style 256-dim embedding)
 * Produces normalized vectors suitable for cosine similarity
 */
export function computeLocalEmbedding(text, dimension = 256) {
  const tokens = tokenize(text);
  const vector = new Float64Array(dimension);
  
  if (tokens.length === 0) {
    return Array.from(vector);
  }

  // 1-gram & 2-gram hashing
  for (let i = 0; i < tokens.length; i++) {
    const t1 = tokens[i];
    const h1 = Math.abs(hashString(t1)) % dimension;
    vector[h1] += 1.0;

    if (i < tokens.length - 1) {
      const t2 = tokens[i] + '_' + tokens[i + 1];
      const h2 = Math.abs(hashString(t2)) % dimension;
      vector[h2] += 1.5;
    }
  }

  // L2 Normalization
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dimension; i++) {
      vector[i] /= norm;
    }
  }

  return Array.from(vector);
}

/**
 * Simple hash function for string to integer
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dotProduct / denominator : 0;
}

/**
 * Request embedding from Ollama if available, fallback to local vectorizer
 */
export async function getEmbedding(text, { ollamaEndpoint = 'http://localhost:11434', model = 'nomic-embed-text' } = {}) {
  try {
    const response = await fetch(`${ollamaEndpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(2500)
    });

    if (response.ok) {
      const data = await response.json();
      if (data.embedding && Array.isArray(data.embedding)) {
        return data.embedding;
      }
    }
  } catch (err) {
    // Ollama not responding or embedding model not found; proceed with local vectorizer
  }

  return computeLocalEmbedding(text);
}
