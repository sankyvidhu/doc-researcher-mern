import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api/client.js';
import Navbar from './components/Navbar.jsx';
import SessionList from './components/SessionList.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import DocumentDrawer from './components/DocumentDrawer.jsx';
import ModelSettingsModal from './components/ModelSettingsModal.jsx';
import CitationModal from './components/CitationModal.jsx';

const SETTINGS_KEY = 'docintel.settings';

// An empty endpoint means "use the server's OLLAMA_HOST"
const DEFAULT_SETTINGS = {
  model: '',
  endpoint: '',
  topK: 5,
  temperature: 0.2,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable
  }
}

// The offline preset list labels its first entry "llama3.2 (Offline Mode)"
const cleanModelName = (name = '') => name.replace(/\s*\(Offline Mode\)$/, '');

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [health, setHealth] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [stats, setStats] = useState(null);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);

  const [documents, setDocuments] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState([]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [streamingMessage, setStreamingMessage] = useState(null);
  const abortRef = useRef(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [citation, setCitation] = useState(null);

  const activeModel = cleanModelName(settings.model || modelInfo?.defaultModel || 'llama3.2');

  const refreshSessions = useCallback(async () => {
    try {
      const data = await api.getSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  const refreshDocuments = useCallback(async () => {
    try {
      const [docs, statData] = await Promise.all([api.getDocuments(), api.getStats()]);
      const list = docs.documents || [];
      setDocuments(list);
      setStats(statData.stats || null);
      // Drop selections for documents that no longer exist
      const ids = new Set(list.map(d => String(d._id)));
      setSelectedDocIds(prev => prev.filter(id => ids.has(id)));
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, []);

  const refreshModels = useCallback(async (endpoint) => {
    try {
      setModelInfo(await api.listModels(endpoint || undefined));
    } catch (err) {
      setModelInfo({ connected: false, models: [], error: err.message });
    }
  }, []);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => setHealth(null));
    refreshSessions();
    refreshDocuments();
  }, [refreshSessions, refreshDocuments]);

  useEffect(() => {
    refreshModels(settings.endpoint);
  }, [settings.endpoint, refreshModels]);

  const updateSettings = (next) => {
    setSettings(next);
    saveSettings(next);
  };

  const selectSession = async (sessionId) => {
    if (isStreaming || sessionId === activeSessionId) return;
    setActiveSessionId(sessionId);
    setMessages([]);
    setSidebarOpen(false);
    try {
      const data = await api.getSessionMessages(sessionId);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const newChat = () => {
    if (isStreaming) return;
    setActiveSessionId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const removeSession = async (sessionId) => {
    try {
      await api.deleteSession(sessionId);
      if (sessionId === activeSessionId) newChat();
      refreshSessions();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const sendMessage = async (text) => {
    const message = text.trim();
    if (!message || isStreaming) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const data = await api.createSession('New Research Chat', activeModel);
        sessionId = String(data.session._id);
        setActiveSessionId(sessionId);
        setSessions(prev => [data.session, ...prev]);
      } catch (err) {
        console.error('Failed to create session:', err);
      }
    }

    setMessages(prev => [...prev, { _id: `local_${Date.now()}`, role: 'user', content: message }]);
    setIsStreaming(true);
    setStatusText('Starting...');
    setStreamingMessage({ content: '', sources: [] });

    const controller = new AbortController();
    abortRef.current = controller;

    let content = '';
    let sources = [];
    let finished = false;

    const finish = (extra = {}) => {
      if (finished) return;
      finished = true;
      setMessages(prev => [...prev, {
        _id: `local_${Date.now()}_a`,
        role: 'assistant',
        content,
        sources,
        model: activeModel,
        ...extra,
      }]);
    };

    try {
      const body = {
        sessionId,
        message,
        model: activeModel,
        topK: settings.topK,
        temperature: settings.temperature,
        documentIds: selectedDocIds.length > 0 ? selectedDocIds : null,
      };
      if (settings.endpoint) body.endpoint = settings.endpoint;

      await api.streamChat(body, {
        signal: controller.signal,
        onStatus: setStatusText,
        onSources: (s) => {
          sources = s;
          setStreamingMessage(prev => ({ ...prev, sources: s }));
        },
        onToken: (token) => {
          content += token;
          setStreamingMessage(prev => ({ ...prev, content }));
        },
        onDone: (data) => {
          content = data.fullText ?? content;
          sources = data.sources ?? sources;
          finish();
        },
        onError: (err) => {
          content = content || `**Error:** ${err.message}`;
          finish({ isError: true });
        },
      });
      // Stream closed without a done/error event
      finish();
    } catch (err) {
      if (err.name === 'AbortError') {
        finish({ stopped: true });
      } else {
        content = content || `**Error:** ${err.message}`;
        finish({ isError: true });
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      setStatusText('');
      setStreamingMessage(null);
      refreshSessions();
    }
  };

  const stopStreaming = () => abortRef.current?.abort();

  const toggleDocSelection = (docId) => {
    setSelectedDocIds(prev =>
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <Navbar
        health={health}
        modelInfo={modelInfo}
        stats={stats}
        activeModel={activeModel}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        onOpenDocuments={() => setDrawerOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="relative flex min-h-0 flex-1">
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          isOpen={sidebarOpen}
          disabled={isStreaming}
          onSelect={selectSession}
          onNew={newChat}
          onDelete={removeSession}
          onClose={() => setSidebarOpen(false)}
        />

        <ChatWindow
          messages={messages}
          streamingMessage={streamingMessage}
          statusText={statusText}
          isStreaming={isStreaming}
          selectedDocCount={selectedDocIds.length}
          documentCount={documents.length}
          onSend={sendMessage}
          onStop={stopStreaming}
          onCitation={setCitation}
          onOpenDocuments={() => setDrawerOpen(true)}
        />
      </div>

      <DocumentDrawer
        isOpen={drawerOpen}
        documents={documents}
        selectedDocIds={selectedDocIds}
        onToggleSelect={toggleDocSelection}
        onClearSelection={() => setSelectedDocIds([])}
        onChanged={refreshDocuments}
        onClose={() => setDrawerOpen(false)}
      />

      {settingsOpen && (
        <ModelSettingsModal
          settings={settings}
          modelInfo={modelInfo}
          activeModel={activeModel}
          onSave={(next) => {
            updateSettings(next);
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {citation && <CitationModal source={citation} onClose={() => setCitation(null)} />}
    </div>
  );
}
