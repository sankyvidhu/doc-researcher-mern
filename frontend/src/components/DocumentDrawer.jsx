import React, { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, FileText, FolderSearch, LoaderCircle, Trash2, Upload, X } from 'lucide-react';
import * as api from '../api/client.js';

const ACCEPTED = '.pdf,.docx,.doc';

function formatSize(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function Notice({ notice }) {
  if (!notice) return null;
  const isError = notice.type === 'error';
  const Icon = isError ? CircleAlert : CircleCheck;
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
      isError ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'
    }`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="break-words">{notice.text}</span>
    </div>
  );
}

export default function DocumentDrawer({ isOpen, documents, selectedDocIds, onToggleSelect, onClearSelection, onChanged, onClose }) {
  const [folderPath, setFolderPath] = useState('');
  const [force, setForce] = useState(false);
  const [watch, setWatch] = useState(true);
  const [busy, setBusy] = useState(null); // 'upload' | 'scan' | null
  const [notice, setNotice] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    onChanged();
    api.getFolderConfig()
      .then(data => setFolderPath(prev => prev || data.folderPath || ''))
      .catch(() => {});
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setBusy('upload');
    setNotice(null);
    const failures = [];
    for (const [i, file] of files.entries()) {
      setNotice({ type: 'info', text: `Indexing ${file.name} (${i + 1}/${files.length})...` });
      try {
        await api.uploadDocument(file);
      } catch (err) {
        failures.push(`${file.name}: ${err.message}`);
      }
    }
    setBusy(null);
    setNotice(failures.length > 0
      ? { type: 'error', text: failures.join(' · ') }
      : { type: 'info', text: `Indexed ${files.length} file${files.length === 1 ? '' : 's'}.` });
    onChanged();
  };

  const runScan = async (e) => {
    e.preventDefault();
    setBusy('scan');
    setNotice(null);
    try {
      const data = await api.scanFolder({ folderPath: folderPath.trim() || undefined, force, watch });
      const errors = data.results?.errors || [];
      setNotice({
        type: errors.length > 0 ? 'error' : 'info',
        text: data.message + (errors.length > 0 ? ` Errors: ${errors.map(x => `${x.file} (${x.error})`).join(', ')}` : ''),
      });
      if (data.folderPath) setFolderPath(data.folderPath);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
    setBusy(null);
    onChanged();
  };

  const remove = async (doc) => {
    const note = doc.source === 'upload' ? ' The uploaded file will also be deleted.' : '';
    if (!window.confirm(`Remove "${doc.fileName}" from the index?${note}`)) return;
    try {
      await api.deleteDocument(doc._id);
      onChanged();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-800 bg-slate-900 shadow-2xl transition-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Documents</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 border-b border-slate-800 p-4">
          {/* Upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!busy) uploadFiles(e.dataTransfer.files);
            }}
            onClick={() => !busy && fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition ${
              dragOver ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800/40'
            }`}
          >
            {busy === 'upload'
              ? <LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" />
              : <Upload className="h-5 w-5 text-emerald-400" />}
            <span className="text-sm text-slate-200">Drop files or click to upload</span>
            <span className="text-xs text-slate-500">PDF, DOCX or DOC · up to 50 MB each</span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              className="hidden"
              onChange={(e) => {
                uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* Folder scan */}
          <form onSubmit={runScan} className="space-y-2">
            <label className="block text-xs font-medium text-slate-400">Scan a folder on the server</label>
            <div className="flex gap-2">
              <input
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/path/to/documents"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-200 focus:border-emerald-500/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={Boolean(busy)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === 'scan' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                Scan
              </button>
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} className="accent-emerald-500" />
                Watch for changes
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="accent-emerald-500" />
                Re-index unchanged files
              </label>
            </div>
          </form>

          <Notice notice={notice} />
        </div>

        {/* Document list */}
        <div className="flex items-center justify-between px-4 pb-1 pt-3 text-xs text-slate-500">
          <span>{documents.length} indexed · tick to limit chat to selected</span>
          {selectedDocIds.length > 0 && (
            <button onClick={onClearSelection} className="text-emerald-400 hover:text-emerald-300">
              Clear ({selectedDocIds.length})
            </button>
          )}
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {documents.length === 0 && (
            <li className="px-2 py-8 text-center text-xs text-slate-500">No documents indexed yet.</li>
          )}
          {documents.map(doc => {
            const id = String(doc._id);
            const selected = selectedDocIds.includes(id);
            return (
              <li
                key={id}
                className={`group flex items-start gap-3 rounded-lg px-2 py-2 ${selected ? 'bg-emerald-500/10' : 'hover:bg-slate-800/60'}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(id)}
                  className="mt-1 accent-emerald-500"
                  aria-label={`Limit chat to ${doc.fileName}`}
                />
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200" title={doc.filePath}>{doc.fileName}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                    <span className="uppercase">{doc.fileType}</span>
                    <span>{formatSize(doc.fileSize)}</span>
                    <span>{doc.metadata?.pageCount ?? '—'} pages</span>
                    <span>{doc.chunkCount} chunks</span>
                    <span>{doc.source === 'upload' ? 'uploaded' : 'folder'}</span>
                    {doc.status !== 'indexed' && <span className="text-amber-400">{doc.status}</span>}
                  </div>
                </div>
                <button
                  onClick={() => remove(doc)}
                  className="rounded p-1 text-slate-500 opacity-0 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Remove ${doc.fileName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}
