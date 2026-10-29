import React, { useEffect } from 'react';
import { FileText, X } from 'lucide-react';

const pct = (value) => (typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '—');

export default function CitationModal({ source, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-800 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-emerald-400">Source {source.index}</div>
            <h2 className="truncate text-sm font-semibold" title={source.fileName}>{source.fileName}</h2>
            <div className="mt-0.5 text-xs text-slate-500">
              Page {source.pageNumber ?? '—'}
              {typeof source.chunkIndex === 'number' && ` · Chunk ${source.chunkIndex}`}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-slate-800 p-4 text-center">
          {[
            ['Relevance', source.similarityScore],
            ['Vector', source.vectorScore],
            ['Keyword', source.keywordScore],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-950/60 py-2">
              <div className="text-sm font-semibold text-slate-100">{pct(value)}</div>
              <div className="text-[11px] text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="overflow-y-auto p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{source.text}</p>
        </div>
      </div>
    </div>
  );
}
