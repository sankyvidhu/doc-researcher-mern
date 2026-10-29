import React from 'react';
import { BookOpen, GitCompare, ListChecks, Search } from 'lucide-react';

const SUGGESTIONS = [
  { icon: BookOpen, text: 'Summarize the key ideas across all indexed documents' },
  { icon: Search, text: 'What is hybrid retrieval and how does it combine vector and keyword search?' },
  { icon: GitCompare, text: 'Compare the security and privacy recommendations in my documents' },
  { icon: ListChecks, text: 'List the main architecture components for running a local LLM' },
];

export default function PromptSuggestions({ onSelect, disabled }) {
  return (
    <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
      {SUGGESTIONS.map(({ icon: Icon, text }) => (
        <button
          key={text}
          disabled={disabled}
          onClick={() => onSelect(text)}
          className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left text-sm text-slate-300 transition hover:border-emerald-500/40 hover:bg-slate-900 disabled:opacity-50"
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
