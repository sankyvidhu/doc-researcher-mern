import React, { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, PlugZap, X } from 'lucide-react';
import * as api from '../api/client.js';

const cleanModelName = (name = '') => name.replace(/\s*\(Offline Mode\)$/, '');

export default function ModelSettingsModal({ settings, modelInfo, activeModel, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...settings, model: settings.model || activeModel });
  const [models, setModels] = useState(modelInfo?.models || []);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await api.testConnection(draft.endpoint.trim() || undefined);
      setTestResult({ ok: data.connected, text: data.message });
      if (data.models) setModels(data.models);
    } catch (err) {
      setTestResult({ ok: false, text: err.message });
    }
    setTesting(false);
  };

  const modelNames = models.map(m => cleanModelName(m.name));
  if (draft.model && !modelNames.includes(draft.model)) modelNames.unshift(draft.model);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...draft, endpoint: draft.endpoint.trim() });
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Model settings</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-400">Ollama endpoint</label>
            <div className="flex gap-2">
              <input
                value={draft.endpoint}
                onChange={(e) => set('endpoint', e.target.value)}
                placeholder={modelInfo?.endpoint ? `Server default (${modelInfo.endpoint})` : 'Server default'}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-200 focus:border-emerald-500/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={test}
                disabled={testing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                {testing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Test
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              The backend calls this URL, not your browser. Leave it empty to use the server's OLLAMA_HOST.
            </p>
            {testResult && (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                testResult.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
              }`}>
                {testResult.ok ? <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                {testResult.text}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-400">Model</label>
            <select
              value={draft.model}
              onChange={(e) => set('model', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-emerald-500/60 focus:outline-none"
            >
              {modelNames.map(name => {
                const info = models.find(m => cleanModelName(m.name) === name);
                return (
                  <option key={name} value={name}>
                    {name}{info?.size ? ` · ${info.size}` : ''}
                  </option>
                );
              })}
            </select>
            {!modelInfo?.connected && (
              <p className="text-[11px] text-amber-400/80">
                Ollama isn't connected, so these are suggested models. Answers use local synthesis until it's reachable.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <label className="font-medium text-slate-400">Sources per answer (top-K)</label>
              <span className="text-slate-300">{draft.topK}</span>
            </div>
            <input
              type="range" min="1" max="15" step="1"
              value={draft.topK}
              onChange={(e) => set('topK', Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <label className="font-medium text-slate-400">Temperature</label>
              <span className="text-slate-300">{draft.temperature.toFixed(2)}</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.05"
              value={draft.temperature}
              onChange={(e) => set('temperature', Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <p className="text-[11px] text-slate-500">Lower values stay closer to the source text.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
