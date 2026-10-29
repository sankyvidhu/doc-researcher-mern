import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, CircleAlert, FileText, Filter, LoaderCircle, SendHorizontal, Sparkles, Square, User } from 'lucide-react';
import PromptSuggestions from './PromptSuggestions.jsx';

// Turn "[Source 2]" / "[Source 2: file.pdf, Page 4]" into links the markdown renderer can intercept
function linkifyCitations(content = '') {
  return content.replace(/\[Source (\d+)([^\]]*)\](?!\()/g, (_, n, rest) => `[Source ${n}${rest}](#source-${n})`);
}

function markdownComponents(sources, onCitation) {
  return {
    a: ({ node, href = '', children, ...props }) => {
      const match = href.match(/^#source-(\d+)$/);
      if (match) {
        const index = Number(match[1]);
        const source = sources?.[index - 1];
        return (
          <button
            type="button"
            disabled={!source}
            onClick={() => source && onCitation({ ...source, index })}
            className="rounded bg-emerald-500/15 px-1 font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:cursor-default disabled:bg-slate-800 disabled:text-slate-400"
          >
            {children}
          </button>
        );
      }
      return <a href={href} target="_blank" rel="noreferrer" className="text-emerald-400 underline" {...props}>{children}</a>;
    },
    p: ({ node, ...props }) => <p className="my-2 leading-relaxed" {...props} />,
    ul: ({ node, ...props }) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
    ol: ({ node, ...props }) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
    h1: ({ node, ...props }) => <h1 className="mb-2 mt-4 text-lg font-semibold" {...props} />,
    h2: ({ node, ...props }) => <h2 className="mb-2 mt-4 text-base font-semibold" {...props} />,
    h3: ({ node, ...props }) => <h3 className="mb-1.5 mt-3 text-base font-semibold text-slate-100" {...props} />,
    h4: ({ node, ...props }) => <h4 className="mb-1 mt-3 text-sm font-semibold text-slate-200" {...props} />,
    blockquote: ({ node, ...props }) => <blockquote className="my-2 border-l-2 border-emerald-500/50 pl-3 text-slate-400" {...props} />,
    code: ({ node, className, children, ...props }) => (
      <code className={`rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.85em] text-emerald-200 ${className || ''}`} {...props}>{children}</code>
    ),
    pre: ({ node, ...props }) => <pre className="my-2 overflow-x-auto rounded-lg bg-slate-950 p-3 [&>code]:bg-transparent [&>code]:p-0" {...props} />,
    table: ({ node, ...props }) => (
      <div className="my-2 overflow-x-auto"><table className="w-full border-collapse text-left text-xs" {...props} /></div>
    ),
    th: ({ node, ...props }) => <th className="border border-slate-700 bg-slate-800 px-2 py-1 font-semibold" {...props} />,
    td: ({ node, ...props }) => <td className="border border-slate-800 px-2 py-1" {...props} />,
  };
}

function SourceChips({ sources, onCitation }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
      {sources.map((source, i) => (
        <button
          key={`${source.chunkId || source.documentId}-${i}`}
          onClick={() => onCitation({ ...source, index: i + 1 })}
          title={source.text?.slice(0, 200)}
          className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-xs text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300"
        >
          <span className="font-semibold text-emerald-400">{i + 1}</span>
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">{source.fileName}</span>
          <span className="shrink-0 text-slate-500">p.{source.pageNumber}</span>
        </button>
      ))}
    </div>
  );
}

function MessageBubble({ message, onCitation, streaming = false }) {
  const isUser = message.role === 'user';
  const components = useMemo(() => markdownComponents(message.sources, onCitation), [message.sources, onCitation]);

  if (isUser) {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-emerald-600/90 px-4 py-2.5 text-sm text-white">
          {message.content}
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        message.isError ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
      }`}>
        {message.isError ? <CircleAlert className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="min-w-0 max-w-[85%] flex-1 rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
        {message.content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {linkifyCitations(message.content)}
          </ReactMarkdown>
        ) : streaming ? null : (
          <p className="italic text-slate-500">(no response)</p>
        )}
        {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-emerald-400 align-middle" />}
        {message.stopped && <p className="mt-2 text-xs italic text-slate-500">Stopped.</p>}
        <SourceChips sources={message.sources} onCitation={onCitation} />
      </div>
    </div>
  );
}

export default function ChatWindow({
  messages,
  streamingMessage,
  statusText,
  isStreaming,
  selectedDocCount,
  documentCount,
  onSend,
  onStop,
  onCitation,
  onOpenDocuments,
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingMessage]);

  // Auto-grow textarea up to a limit
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const submit = (text = input) => {
    if (!text.trim() || isStreaming) return;
    onSend(text);
    setInput('');
  };

  const isEmpty = messages.length === 0 && !streamingMessage;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <Sparkles className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Research your documents</h1>
              <p className="mt-1 text-sm text-slate-400">
                {documentCount > 0
                  ? `Ask questions across ${documentCount} indexed document${documentCount === 1 ? '' : 's'}. Answers cite their sources.`
                  : 'No documents indexed yet. Upload files or scan a folder to get started.'}
              </p>
              {documentCount === 0 && (
                <button onClick={onOpenDocuments} className="mt-3 text-sm font-medium text-emerald-400 hover:text-emerald-300">
                  Open documents →
                </button>
              )}
            </div>
            <PromptSuggestions onSelect={submit} disabled={isStreaming || documentCount === 0} />
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
            {messages.map(message => (
              <MessageBubble key={message._id} message={message} onCitation={onCitation} />
            ))}
            {streamingMessage && (
              <>
                <MessageBubble
                  message={{ role: 'assistant', ...streamingMessage }}
                  onCitation={onCitation}
                  streaming
                />
                {statusText && !streamingMessage.content && (
                  <div className="flex items-center gap-2 pl-11 text-xs text-slate-500">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    {statusText}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 bg-slate-950 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {selectedDocCount > 0 && (
            <button
              onClick={onOpenDocuments}
              className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20"
            >
              <Filter className="h-3 w-3" />
              Searching {selectedDocCount} selected document{selectedDocCount === 1 ? '' : 's'}
            </button>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-900 p-2 focus-within:border-emerald-500/60">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Ask a question about your documents..."
              className="max-h-[200px] min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-700 text-slate-100 hover:bg-slate-600"
                aria-label="Stop generating"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => submit()}
                disabled={!input.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
                aria-label="Send"
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-slate-600">
            Enter to send · Shift+Enter for a new line · Answers are generated from your local documents
          </p>
        </div>
      </div>
    </main>
  );
}
