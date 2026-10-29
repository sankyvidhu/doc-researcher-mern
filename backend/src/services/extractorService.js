import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * Extracts raw text and metadata from a PDF or Word (.docx, .doc) file
 * @param {string} filePath - Absolute path to document
 * @returns {Promise<{ text: string, pages: Array<{ pageNumber: number, text: string }>, metadata: Object }>}
 */
export async function extractDocumentContent(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileExt = path.extname(filePath).toLowerCase();
  const fileBuffer = fs.readFileSync(filePath);
  const stats = fs.statSync(filePath);

  if (fileExt === '.pdf') {
    return await extractPdfContent(fileBuffer, stats);
  } else if (fileExt === '.docx') {
    return await extractDocxContent(fileBuffer, stats);
  } else if (fileExt === '.doc') {
    return await extractDocContent(fileBuffer, stats);
  } else {
    throw new Error(`Unsupported document extension: ${fileExt}. Supported formats: .pdf, .docx, .doc`);
  }
}

/**
 * Extracts content from PDF with page breakdown
 */
async function extractPdfContent(buffer, stats) {
  try {
    const uint8Data = new Uint8Array(buffer);
    const parser = new PDFParse(uint8Data);
    const parsed = await parser.getText();

    const pages = (parsed.pages || []).map(p => ({
      pageNumber: p.num || 1,
      text: cleanText(p.text)
    })).filter(p => p.text.length > 0);

    const fullText = cleanText(parsed.text || pages.map(p => p.text).join('\n\n'));
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;

    return {
      text: fullText,
      pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: fullText }],
      metadata: {
        pageCount: parsed.total || pages.length || 1,
        wordCount,
        title: '',
        author: '',
        lastModified: stats.mtime
      }
    };
  } catch (err) {
    console.warn(`[Extractor] PDF parsing fallback: ${err.message}`);
    const raw = buffer.toString('utf-8').replace(/[^\x20-\x7E\t\n\r]/g, ' ');
    const text = cleanText(raw);
    return {
      text,
      pages: [{ pageNumber: 1, text }],
      metadata: {
        pageCount: 1,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        title: '',
        author: '',
        lastModified: stats.mtime
      }
    };
  }
}

/**
 * Extracts content from Word (.docx) file
 */
async function extractDocxContent(buffer, stats) {
  const result = await mammoth.extractRawText({ buffer });
  const rawText = cleanText(result.value);
  
  // Break into pseudo-pages / major sections by paragraphs
  const paragraphs = rawText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const pages = [];
  
  // Group every ~3-4 paragraphs as a logical "page / section"
  let currentGroup = [];
  let currentWordCount = 0;
  let pageIdx = 1;

  for (const para of paragraphs) {
    const pWords = para.split(/\s+/).length;
    currentGroup.push(para);
    currentWordCount += pWords;

    if (currentWordCount >= 250) {
      pages.push({
        pageNumber: pageIdx++,
        text: currentGroup.join('\n\n')
      });
      currentGroup = [];
      currentWordCount = 0;
    }
  }

  if (currentGroup.length > 0 || pages.length === 0) {
    pages.push({
      pageNumber: pageIdx,
      text: currentGroup.length > 0 ? currentGroup.join('\n\n') : rawText
    });
  }

  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  return {
    text: rawText,
    pages,
    metadata: {
      pageCount: pages.length,
      wordCount,
      title: '',
      author: '',
      lastModified: stats.mtime
    }
  };
}

/**
 * Fallback for legacy .doc files
 */
async function extractDocContent(buffer, stats) {
  try {
    return await extractDocxContent(buffer, stats);
  } catch {
    const str = buffer.toString('utf-8').replace(/[^\x20-\x7E\t\n\r]/g, ' ');
    const text = cleanText(str);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return {
      text,
      pages: [{ pageNumber: 1, text }],
      metadata: {
        pageCount: 1,
        wordCount,
        title: '',
        author: '',
        lastModified: stats.mtime
      }
    };
  }
}

/**
 * Normalizes and cleans text
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
