/**
 * Text Chunking Service for Document RAG
 */

/**
 * Creates sliding window overlapping chunks from document pages
 * @param {Array<{ pageNumber: number, text: string }>} pages 
 * @param {Object} options
 * @returns {Array<{ chunkIndex: number, text: string, pageNumber: number, tokenCount: number }>}
 */
export function chunkDocumentPages(pages, options = {}) {
  const chunkSize = options.chunkSize || 800; // ~150-200 words
  const chunkOverlap = options.chunkOverlap || 150;
  const chunks = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    const pageText = page.text || '';
    if (!pageText.trim()) continue;

    const pageChunks = splitTextIntoChunks(pageText, chunkSize, chunkOverlap);
    for (const chunk of pageChunks) {
      chunks.push({
        chunkIndex: globalChunkIndex++,
        text: chunk,
        pageNumber: page.pageNumber || 1,
        tokenCount: Math.ceil(chunk.split(/\s+/).length * 1.3)
      });
    }
  }

  return chunks;
}

/**
 * Splits a text string into overlapping chunks respecting sentence boundaries
 */
function splitTextIntoChunks(text, targetSize, overlap) {
  if (text.length <= targetSize) {
    return [text.trim()];
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + targetSize;

    if (endIndex >= text.length) {
      const remaining = text.substring(startIndex).trim();
      if (remaining.length > 30) {
        chunks.push(remaining);
      }
      break;
    }

    // Try to find natural breaking points near endIndex:
    // 1. Double newline (paragraph break)
    // 2. Sentence boundary (. ! ? followed by space or newline)
    // 3. Single newline
    // 4. Space
    const lookbackDistance = Math.min(150, targetSize / 3);
    const windowToInspect = text.substring(endIndex - lookbackDistance, endIndex + 50);

    let splitOffset = -1;

    // Look for sentence end in the boundary window
    const sentenceEndMatch = windowToInspect.search(/(\.|\!|\?)\s/);
    if (sentenceEndMatch !== -1) {
      splitOffset = (endIndex - lookbackDistance) + sentenceEndMatch + 2;
    } else {
      // Look for newline
      const newlineMatch = windowToInspect.search(/\n/);
      if (newlineMatch !== -1) {
        splitOffset = (endIndex - lookbackDistance) + newlineMatch + 1;
      } else {
        // Look for space
        const spaceMatch = windowToInspect.lastIndexOf(' ');
        if (spaceMatch !== -1) {
          splitOffset = (endIndex - lookbackDistance) + spaceMatch + 1;
        } else {
          splitOffset = endIndex;
        }
      }
    }

    const chunk = text.substring(startIndex, splitOffset).trim();
    if (chunk.length > 20) {
      chunks.push(chunk);
    }

    startIndex = Math.max(startIndex + 1, splitOffset - overlap);
  }

  return chunks;
}
