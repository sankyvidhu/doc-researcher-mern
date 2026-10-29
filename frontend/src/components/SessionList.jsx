import React from 'react';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SessionList({ sessions, activeSessionId, isOpen, disabled, onSelect, onNew, onDelete, onClose }) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-slate-800 bg-slate-900 transition-transform md:static md:z-auto md:w-64 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-3">
          <button
            onClick={onNew}
            disabled={disabled}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New research chat
          </button>
        </div>

        <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">History</div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {sessions.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-slate-500">No chats yet. Ask a question to start one.</p>
          )}
          {sessions.map(session => {
            const id = String(session._id);
            const active = id === activeSessionId;
            return (
              <div
                key={id}
                className={`group mb-0.5 flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                  active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={() => onSelect(id)}
              >
                <MessageSquare className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-400' : ''}`} />
                <span className="min-w-0 flex-1 truncate">{session.title}</span>
                <span className="text-[10px] text-slate-500 group-hover:hidden">{formatTime(session.updatedAt)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete "${session.title}"?`)) onDelete(id);
                  }}
                  disabled={disabled}
                  className="hidden rounded p-0.5 text-slate-500 hover:text-red-400 group-hover:block"
                  aria-label="Delete chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
