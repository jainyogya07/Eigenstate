import React from 'react';
import { FunctionSquare, ChevronRight, ChevronDown, FileCode, Folder, Search, X, Loader2, Play, GitPullRequest } from 'lucide-react';
import {
  apiFetch,
  confidenceToPercent,
  DEFAULT_REPO,
  parseGitHubOwnerRepo,
  parseRepoFromSearchQuery,
  primaryRepo,
} from '../api/client';
import { queueAnalyserSessionForRepo } from '../lib/analyserSessionBridge';

/** Only when true: empty API / errors show the built-in fastify demo tree. Default = real empty index after DB wipe. */
const USE_SEED_CODE_MAP = import.meta.env.VITE_USE_SEED_CODE_MAP === 'true';

const getConfidenceColor = (score) => {
  if (score >= 90) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (score >= 75) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  if (score >= 60) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
};

const INDENT = 16;
const BASE_PAD = 8;

const TreeNode = ({ item, onSelect, expanded, onToggle, selectedName, depth = 0 }) => {
  const isExpanded = expanded[item.id];
  const hasChildren = item.children && item.children.length > 0;
  const hasFunctions = item.functions && item.functions.length > 0;

  return (
    <div className="select-none">
      <div
        onClick={() => onToggle(item.id)}
        className={`flex cursor-pointer items-center rounded-md px-2 py-2 transition-colors duration-150 hover:bg-github-bg-tertiary ${depth === 0 ? 'mt-1' : ''}`}
        style={{ paddingLeft: `${depth * INDENT + BASE_PAD}px` }}
      >
        <span className="w-4 flex items-center justify-center mr-1">
          {(hasChildren || hasFunctions) ? (
            isExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />
          ) : null}
        </span>

        {item.type === 'folder' ? (
          <Folder size={14} className="mr-2 text-blue-400/80 fill-blue-400/10" />
        ) : (
          <FileCode size={14} className="mr-2 text-slate-400" />
        )}

        <span
          className={`truncate text-[13px] ${item.type === 'folder' ? 'font-medium text-github-text-primary' : 'text-github-text-secondary'}`}
        >
          {item.name}
        </span>
      </div>

      {isExpanded && (
        <div className="mt-0.5 border-l border-github-border/60" style={{ marginLeft: `${depth * INDENT + BASE_PAD + 10}px` }}>
          {item.children?.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
              selectedName={selectedName}
              depth={depth + 1}
            />
          ))}
          {item.functions?.map((fn) => {
            const active = selectedName === fn.name;
            return (
              <div
                key={`${item.id}-${fn.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect({ name: fn.name, path: item.path });
                }}
                className={`group flex cursor-pointer items-center rounded-md border-l-2 py-2 pr-2 transition-colors duration-150 ${
                  active
                    ? 'border-github-blue bg-github-blue/10'
                    : 'border-transparent hover:border-github-border hover:bg-github-bg-tertiary/80'
                }`}
                style={{ paddingLeft: `${(depth + 1) * INDENT + BASE_PAD}px` }}
              >
                <FunctionSquare
                  size={12}
                  className={`mr-2 shrink-0 ${active ? 'text-github-blue' : 'text-github-text-secondary group-hover:text-github-blue'}`}
                />
                <span
                  className={`flex-1 truncate font-mono text-xs ${active ? 'font-medium text-white' : 'text-github-text-secondary group-hover:text-github-text-primary'}`}
                >
                  {fn.name}
                </span>
                <div
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${getConfidenceColor(confidenceToPercent(fn.confidence))}`}
                >
                  {confidenceToPercent(fn.confidence)}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SEED_DATA = [
  {
    file_path: "lib/request.js",
    functions: [
      { name: "Request", confidence: 97 },
      { name: "getRequestHeader", confidence: 92 },
      { name: "parseBody", confidence: 88 },
    ]
  },
  {
    file_path: "lib/reply.js",
    functions: [
      { name: "Reply", confidence: 95 },
      { name: "send", confidence: 90 },
      { name: "code", confidence: 93 },
      { name: "serialize", confidence: 85 },
    ]
  },
  {
    file_path: "lib/route.js",
    functions: [
      { name: "buildRouting", confidence: 91 },
      { name: "findRoute", confidence: 89 },
      { name: "handleRequest", confidence: 94 },
    ]
  },
  {
    file_path: "lib/hooks.js",
    functions: [
      { name: "hookRunner", confidence: 96 },
      { name: "onRequestHook", confidence: 87 },
      { name: "preHandlerHook", confidence: 82 },
      { name: "onSendHook", confidence: 79 },
    ]
  },
  {
    file_path: "lib/validation.js",
    functions: [
      { name: "validateSchema", confidence: 93 },
      { name: "compileSchema", confidence: 88 },
    ]
  },
  {
    file_path: "lib/plugins/avvio.js",
    functions: [
      { name: "loadPlugin", confidence: 91 },
      { name: "registerPlugin", confidence: 86 },
    ]
  },
  {
    file_path: "lib/errors.js",
    functions: [
      { name: "createError", confidence: 98 },
      { name: "FST_ERR_NOT_FOUND", confidence: 95 },
      { name: "FST_ERR_BAD_STATUS", confidence: 90 },
    ]
  },
  {
    file_path: "lib/server.js",
    functions: [
      { name: "createServer", confidence: 97 },
      { name: "listen", confidence: 94 },
      { name: "close", confidence: 92 },
    ]
  },
];

export default function FileTree({ onSelect, selectedName }) {
  const [rawData, setRawData] = React.useState([]);
  const [expanded, setExpanded] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isIngesting, setIsIngesting] = React.useState(false);
  const [ingestionStatus, setIngestionStatus] = React.useState('');
  const [workspace, setWorkspace] = React.useState(DEFAULT_REPO);

  const applyData = (data) => {
    setRawData(data);
    const initialExpanded = {};
    data.forEach(file => {
      const parts = file.file_path.split('/');
      let currentPath = '';
      parts.forEach((part, index) => {
        if (index < parts.length - 1) {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          initialExpanded[currentPath] = true;
        }
      });
    });
    setExpanded(initialExpanded);
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let ws = { ...DEFAULT_REPO };
      try {
        const repos = await apiFetch('/repos');
        if (!cancelled && Array.isArray(repos) && repos.length > 0) {
          ws = primaryRepo(repos);
          setWorkspace(ws);
        }
      } catch {
        if (!cancelled) setWorkspace(ws);
      }
      try {
        const data = await apiFetch(
          `/api/v1/functions?owner=${encodeURIComponent(ws.owner)}&repo=${encodeURIComponent(ws.repo)}`
        );
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          applyData(data);
        } else {
          applyData(USE_SEED_CODE_MAP ? SEED_DATA : []);
        }
      } catch (err) {
        console.error('Failed to fetch functions:', err);
        if (!cancelled) applyData(USE_SEED_CODE_MAP ? SEED_DATA : []);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const repoInfo = parseRepoFromSearchQuery(searchQuery);
  const isRepoPattern = !!repoInfo;
  const trimmedQuery = searchQuery.trim();
  const hasIndexedData = rawData.length > 0;

  const handleIngest = async () => {
    if (!repoInfo) return;
    const { owner, repo } = parseGitHubOwnerRepo(repoInfo.owner, repoInfo.repo);
    if (!owner || !repo) return;

    setIsIngesting(true);
    setIngestionStatus('Seeding Ingestion Queue...');

    try {
      await apiFetch('/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo }),
      }).catch(() => {
        /* register is best-effort if duplicate */
      });

      await apiFetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, replace: true }),
      });
      queueAnalyserSessionForRepo(owner, repo, { replace: true });

      setIngestionStatus('Queued PR jobs — analyzing (may take 1–3 min with LLM)…');
      let attempts = 0;
      const maxAttempts = 90;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const data = await apiFetch(
            `/api/v1/functions?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
          );
          if (Array.isArray(data) && data.length > 0) {
            clearInterval(interval);
            applyData(data);
            setWorkspace({ owner, repo });
            setSearchQuery('');
            setIsIngesting(false);
            setIngestionStatus('');
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            setIsIngesting(false);
            setIngestionStatus('Timeout — ensure Postgres, GITHUB_TOKEN, and Python API on :8000 are running');
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            setIsIngesting(false);
            setIngestionStatus('Polling failed');
          }
        }
      }, 3000);
    } catch (error) {
      console.error('Ingest error:', error);
      setIsIngesting(false);
      const msg = error?.message || 'Network error';
      setIngestionStatus(msg.length > 120 ? `${msg.slice(0, 120)}…` : msg);
    }
  };


  const tree = React.useMemo(() => {
    const root = { id: 'root', name: 'Root', type: 'folder', children: [] };
    const folderMap = { 'root': root };

    const filteredData = rawData.filter(file => {
      if (!trimmedQuery) return true;
      const lowerQuery = trimmedQuery.toLowerCase();
      return (
        file.file_path.toLowerCase().includes(lowerQuery) ||
        (file.functions && file.functions.some(fn => fn.name.toLowerCase().includes(lowerQuery)))
      );
    });

    filteredData.forEach(file => {
      const parts = file.file_path.split('/');
      let currentPath = '';
      let parent = root;

      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!folderMap[currentPath]) {
          const newNode = {
            id: currentPath,
            name: part,
            type: isFile ? 'file' : 'folder',
            path: isFile ? file.file_path : null,
            children: [],
            functions: isFile ? file.functions : []
          };
          
          folderMap[currentPath] = newNode;
          parent.children.push(newNode);
        }
        parent = folderMap[currentPath];
      });
    });

    // If there's only one top-level folder that is redundant (e.g. 'lib'), 
    // we could flatten it, but for now we just return root's children to remove 'Root' text.
    return root.children;
  }, [rawData, trimmedQuery]);

  // Handle expansion during search in a pure way (useEffect)
  React.useEffect(() => {
    if (trimmedQuery && rawData.length > 0) {
      const newExpanded = {};
      rawData.forEach(file => {
        const parts = file.file_path.split('/');
        let currentPath = '';
        parts.forEach(part => {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          newExpanded[currentPath] = true;
        });
      });
      setExpanded(prev => ({ ...prev, ...newExpanded }));
    }
  }, [trimmedQuery, rawData]);

  const toggle = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse px-2">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-9 bg-slate-800/40 rounded-lg w-full"></div>
        ))}
      </div>
    );
  }

  const handleSelect = (fnInfo) => {
    let owner = workspace.owner;
    let repo = workspace.repo;
    if (repoInfo) {
      const n = parseGitHubOwnerRepo(repoInfo.owner, repoInfo.repo);
      owner = n.owner;
      repo = n.repo;
    }
    onSelect({ ...fnInfo, owner, repo });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar (Phase 3) */}
      <div className="mb-6 flex h-10 items-center gap-2 rounded-lg border border-github-border bg-github-bg-secondary px-3 transition-colors duration-150 focus-within:border-github-blue focus-within:shadow-[0_0_0_3px_rgba(56,139,253,0.12)]">
        <span className="flex shrink-0 items-center text-github-text-secondary" aria-hidden>
          {isIngesting ? (
            <Loader2 size={14} className="animate-spin text-github-blue" />
          ) : (
            <Search size={14} className="transition-colors duration-150 group-focus-within:text-github-blue" />
          )}
        </span>
        <input
          type="text"
          placeholder={
            isIngesting ? ingestionStatus : 'Filter path or symbol — or paste owner/repo to index…'
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={isIngesting}
          className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-github-text-primary outline-none ring-0 placeholder:text-github-text-secondary/80 disabled:opacity-50"
        />
        {searchQuery && !isIngesting && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="flex shrink-0 items-center justify-center rounded-md p-1 text-github-text-secondary transition-colors hover:bg-github-bg-tertiary hover:text-white"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {tree.length === 0 && !loading && !isIngesting ? (
          <div className="rounded-xl border border-dashed border-github-border bg-github-bg-tertiary px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-github-border bg-github-bg-secondary">
              <GitPullRequest size={22} className="text-github-blue/70" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-white">
              {!hasIndexedData && !trimmedQuery
                ? 'Nothing indexed yet'
                : hasIndexedData && trimmedQuery
                  ? 'No matches for this filter'
                  : 'No matches'}
            </h3>
            <p className="mb-6 text-xs leading-relaxed text-github-text-secondary">
              {!hasIndexedData && !trimmedQuery
                ? `No symbols in the database for ${workspace.owner}/${workspace.repo}. Register a repo in Settings and ingest, or paste owner/repo in the field above.`
                : hasIndexedData && trimmedQuery
                  ? `Your workspace ${workspace.owner}/${workspace.repo} is already indexed. The box above is a filter — it does not switch repos. Nothing matches “${trimmedQuery.length > 42 ? `${trimmedQuery.slice(0, 42)}…` : trimmedQuery}”. Clear the search (✕) to see the full code map, or type a file path or symbol name.`
                  : isRepoPattern
                    ? `${repoInfo.owner}/${repoInfo.repo} is not in your index yet.`
                    : 'Try a file path or symbol name, or paste a full GitHub URL (owner/repo only after github.com/).'}
            </p>

            {isRepoPattern && (
              <button
                type="button"
                onClick={handleIngest}
                className="es-btn es-btn-primary w-full justify-center gap-2"
              >
                <Play size={14} className="shrink-0" />
                Index {repoInfo.owner}/{repoInfo.repo}
              </button>
            )}
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              item={node}
              onSelect={handleSelect}
              expanded={expanded}
              onToggle={toggle}
              selectedName={selectedName}
            />
          ))
        )}
      </div>
    </div>
  );
}