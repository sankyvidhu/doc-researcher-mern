import React from 'react';
import { Cpu, Database, FileText, FolderOpen, Menu, Settings } from 'lucide-react';

function StatusPill({ icon: Icon, label, ok, title }) {
  return (
    <span
      title={title}
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs sm:inline-flex ${
        ok
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse-subtle'}`} />
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export default function Navbar({ health, modelInfo, stats, activeModel, onToggleSidebar, onOpenDocuments, onOpenSettings }) {
  const isMongo = Boolean(health?.database?.isMongoConnected);
  const dbLabel = health ? (isMongo ? 'MongoDB' : 'Local store') : 'Offline';
  const ollamaOk = Boolean(modelInfo?.connected);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-4 backdrop-blur">
      <button
        onClick={onToggleSidebar}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 md:hidden"
        aria-label="Toggle chat history"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
          <FileText className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">DocIntel AI</div>
          <div className="hidden text-[11px] text-slate-500 sm:block">Local document research</div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <StatusPill
          icon={Database}
          label={dbLabel}
          ok={isMongo}
          title={health?.database?.mode || 'Backend not reachable'}
        />
        <StatusPill
          icon={Cpu}
          label={ollamaOk ? activeModel : 'Ollama offline'}
          ok={ollamaOk}
          title={ollamaOk ? `Ollama at ${modelInfo.endpoint}` : (modelInfo?.notice || 'Answers use local synthesis')}
        />

        <button
          onClick={onOpenDocuments}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-emerald-500/50 hover:bg-slate-800"
        >
          <FolderOpen className="h-4 w-4" />
          <span className="hidden sm:inline">Documents</span>
          {stats && (
            <span className="rounded-md bg-slate-800 px-1.5 text-xs text-slate-400">{stats.docCount}</span>
          )}
        </button>
        <button
          onClick={onOpenSettings}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="Model settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
