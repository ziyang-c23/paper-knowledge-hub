import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import './reading.css';
const PdfViewer = lazy(() => import('./pdf-viewer.jsx'));

// Work on rendered Markdown nodes, so headings inside code blocks never split a note.
function foldAppendix() {
  return (tree) => {
    const text = (node) =>
      node.type === 'text' ? node.value : (node.children || []).map(text).join('');
    const children = tree.children || [];
    const start = children.findIndex(
      (node) =>
        node.type === 'element' &&
        /^h[12]$/.test(node.tagName) &&
        /^(?:附录(?:$|[\s：:—-])|appendix(?:$|[\s:]))/i.test(text(node).trim()),
    );
    if (start < 0) return;
    const level = Number(children[start].tagName.slice(1));
    let end = start + 1;
    while (
      end < children.length &&
      !(
        children[end].type === 'element' &&
        /^h[12]$/.test(children[end].tagName) &&
        Number(children[end].tagName.slice(1)) <= level
      )
    )
      end++;
    const section = children.splice(start, end - start);
    children.splice(start, 0, {
      type: 'element',
      tagName: 'details',
      properties: { className: ['paper-appendix'] },
      children: [
        { type: 'element', tagName: 'summary', properties: {}, children: [section[0]] },
        ...section.slice(1),
      ],
    });
  };
}
function DefaultNoteMarkdown({ children, rehypePlugins = [] }) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, ...rehypePlugins]}
      >
        {children}
      </Markdown>
    </div>
  );
}
export function PaperNote({ paper, Md = DefaultNoteMarkdown }) {
  if (!paper?.note?.trim()) return null;
  return (
    <div className="paper-note">
      <Md rehypePlugins={[foldAppendix]}>{paper.note}</Md>
    </div>
  );
}

export function ParallelReader({ paper, documents, Md, local = Boolean(window.__PKH_LOCAL__) }) {
  const docs = (local ? documents || [] : []).filter((d) => d.paperId === paper.id),
    [documentId, setDocumentId] = useState(docs[0]?.id || ''),
    [page, setPage] = useState(1);
  const doc = docs.find((d) => d.id === documentId) || docs[0];
  const activePage = doc?.id === documentId ? Math.min(page, doc.pageCount) : 1;
  return (
    <div className={doc ? 'reading-split' : 'reading-single'}>
      <section>
        {doc ? (
          <>
            <div className="reader-toolbar">
              <label>
                原文
                <select
                  aria-label="并排阅读文档"
                  value={doc.id}
                  onChange={(e) => {
                    setDocumentId(e.target.value);
                    setPage(1);
                  }}
                >
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.filename}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                文件页
                <select
                  aria-label="并排原文页序"
                  value={activePage}
                  onChange={(e) => {
                    setDocumentId(doc.id);
                    setPage(Number(e.target.value));
                  }}
                >
                  {Array.from({ length: doc.pageCount }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} / {doc.pageCount}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Suspense fallback={<p role="status">正在打开原文…</p>}>
              <PdfViewer
                id={doc.id}
                page={activePage}
                onSelection={(selection) => {
                  window.dispatchEvent(
                    new CustomEvent('pkh-reader-selection', {
                      detail: { ...selection, paperId: paper.id },
                    }),
                  );
                }}
              />
            </Suspense>
            <a href={'/api/documents/' + doc.id + '/file'} target="_blank" rel="noreferrer">
              打开 PDF 原件 ↗
            </a>
          </>
        ) : (
          <div className="source-link-strip">
            <h3>{local ? '尚未附加本地原文' : '阅读论文原文'}</h3>
            <p>
              {local
                ? '添加 PDF 后可以逐页对照；也可以打开论文来源。'
                : '在来源网站打开原文，下方保留完整阅读笔记。'}
            </p>
            <a href={paper.url} target="_blank" rel="noreferrer">
              打开原文 ↗
            </a>
          </div>
        )}
      </section>
      <section aria-label="并排阅读笔记">
        <PaperNote paper={paper} Md={Md} />
      </section>
    </div>
  );
}

function sectionSlug(text) {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}
export function NoteOutline({ paper, mode }) {
  const [headings, setHeadings] = useState([]);
  const [active, setActive] = useState('');
  const mobileMenu = useRef(null);
  const storageKey = `pkh-reading-position-${window.__PKH_LOCAL__ ? 'local' : 'public'}-${paper.id}`;
  useEffect(() => {
    const reader = document.querySelector(
      mode === 'source' ? '[aria-label="并排阅读笔记"] .markdown' : '.note-panel .markdown',
    );
    const nodes = Array.from(reader?.querySelectorAll('h1,h2,h3') || []);
    const used = new Map();
    for (const node of nodes) {
      const base = sectionSlug(node.textContent),
        number = (used.get(base) || 0) + 1;
      used.set(base, number);
      node.id = 'note-' + base + (number > 1 ? '-' + number : '');
      node.dataset.section = node.id;
    }
    setHeadings(nodes);
    const jump = () => {
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      let saved;
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      } catch {}
      const id = params.get('section') || (saved?.mode === mode ? saved.section : null);
      const target = nodes.find((node) => node.id === id);
      if (target) {
        target.closest('details')?.setAttribute('open', '');
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
        setActive(target.id);
      }
    };
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(jump);
    });
    let timer;
    const track = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const boundary =
          mode === 'source'
            ? Math.max(100, reader?.parentElement?.getBoundingClientRect().top || 0) + 24
            : 120;
        const candidate =
          [...nodes].reverse().find((node) => node.getBoundingClientRect().top <= boundary) ||
          nodes[0];
        if (!candidate) return;
        setActive(candidate.id);
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              section: candidate.id,
              mode,
              paperId: paper.id,
              updatedAt: new Date().toISOString(),
            }),
          );
        } catch {}
      }, 120);
    };
    window.addEventListener('scroll', track, true);
    window.addEventListener('hashchange', jump);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener('scroll', track, true);
      window.removeEventListener('hashchange', jump);
    };
  }, [paper.id, paper.note, mode, storageKey]);
  const navigate = (heading) => {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    params.set('mode', mode);
    params.set('section', heading.id);
    params.delete('evidence');
    history.replaceState(null, '', '#/paper/' + paper.id + '?' + params);
    heading.closest('details')?.setAttribute('open', '');
    heading.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    setActive(heading.id);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          section: heading.id,
          mode,
          paperId: paper.id,
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch {}
    if (mobileMenu.current) mobileMenu.current.open = false;
  };
  const links = () =>
    headings.map((heading) => (
      <button
        key={heading.id}
        aria-current={active === heading.id ? 'location' : undefined}
        onClick={() => navigate(heading)}
      >
        {heading.textContent}
      </button>
    ));
  if (!headings.length) return null;
  return (
    <>
      <nav className="note-toc reading-outline" aria-label="笔记目录">
        <h2>笔记目录</h2>
        {links()}
      </nav>
      <details
        className="mobile-note-outline"
        ref={mobileMenu}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}
      >
        <summary>章节目录</summary>
        <nav aria-label="手机笔记目录">{links()}</nav>
      </details>
    </>
  );
}

export function ReaderNotes({ paper, local = Boolean(window.__PKH_LOCAL__), csrfToken = '' }) {
  const key = (local ? 'pkh-reader-notes-' : 'pkh-public-reader-notes-') + paper.id;
  return (
    <ReaderNotesForm
      key={key}
      storageKey={key}
      paperId={paper.id}
      local={local}
      csrfToken={csrfToken}
    />
  );
}
function browserEntries(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(stored)
      ? stored.filter(
          (item) =>
            item &&
            ['string', 'number'].includes(typeof item.id) &&
            typeof item.text === 'string' &&
            typeof item.page === 'string',
        )
      : [];
  } catch {
    return [];
  }
}
function ReaderNotesForm({ storageKey, paperId, local, csrfToken }) {
  const [entries, setEntries] = useState(() => (local ? [] : browserEntries(storageKey)));
  const [legacy, setLegacy] = useState(() => (local ? browserEntries(storageKey) : []));
  const [page, setPage] = useState(''),
    [text, setText] = useState(''),
    [error, setError] = useState('');
  const [selection, setSelection] = useState(null),
    [revision, setRevision] = useState(null);
  const [loading, setLoading] = useState(local),
    [saving, setSaving] = useState(false),
    [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!local) return;
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/reading-records?paperId=' + encodeURIComponent(paperId))
      .then(async (response) => {
        const record = await response.json();
        if (!response.ok) throw Error(record.error || '无法读取阅读记录');
        return record;
      })
      .then((record) => {
        if (active) {
          setEntries(record.entries);
          setRevision(record.revision);
        }
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
          setRevision(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [local, paperId, reload]);
  useEffect(() => {
    const capture = (event) => {
      if (event.detail.paperId !== paperId) return;
      setSelection(event.detail);
      setPage(String(event.detail.pageIndex));
      document.querySelector('[aria-label="阅读记录内容"]')?.focus();
    };
    window.addEventListener('pkh-reader-selection', capture);
    return () => window.removeEventListener('pkh-reader-selection', capture);
  }, [paperId]);
  const persist = async (next) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSaving(true);
    try {
      if (local) {
        if (!csrfToken || !revision) throw Error('尚未读取本地记录，重新读取后再保存。');
        const response = await fetch('/api/reading-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': csrfToken },
          body: JSON.stringify({ paperId, entries: next, expectedRevision: revision }),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || '本地阅读记录未保存，请重试。');
        setRevision(result.revision);
        setEntries(result.entries);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(next));
        setEntries(next);
      }
      setError('');
      return true;
    } catch (error) {
      setError(local ? error.message : '浏览器无法保存记录，请复制内容后再尝试。');
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  const save = async () => {
    if (!text.trim()) return;
    const next = [
      ...entries,
      {
        ...(selection || {}),
        id: crypto.randomUUID(),
        page: page.trim() || '未标页',
        text: text.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    if (await persist(next)) {
      setPage('');
      setText('');
      setSelection(null);
    }
  };
  const importLegacy = async () => {
    const existing = new Set(entries.map((item) => String(item.id)));
    const imported = legacy
      .filter((item) => !existing.has(String(item.id)))
      .map((item) => ({ ...item, createdAt: item.createdAt || new Date().toISOString() }));
    if (await persist([...entries, ...imported])) {
      setLegacy([]);
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
  };
  return (
    <section className="reader-notes panel" aria-label="本地阅读记录">
      <div className="section-heading">
        <div>
          <h2>阅读记录</h2>
          <p className="muted">
            记录问题与想法，{local ? '保存到本地空间。' : '保存在当前浏览器。'}
          </p>
        </div>
        <span className="badge">{local ? '本地保存' : '仅此浏览器'}</span>
      </div>
      {loading && <p role="status">正在读取阅读记录…</p>}
      {error && (
        <div role="alert">
          {error}
          {local && (
            <button disabled={saving || loading} onClick={() => setReload((value) => value + 1)}>
              重新读取记录
            </button>
          )}
        </div>
      )}
      {local && legacy.length > 0 && (
        <button disabled={saving || loading || !revision} onClick={importLegacy}>
          导入此浏览器旧记录 ({legacy.length})
        </button>
      )}
      {selection && (
        <blockquote className="reader-selected-quote">
          {selection.quote}
          <button className="text-button" onClick={() => setSelection(null)}>
            移除选区
          </button>
        </blockquote>
      )}
      <div className="reader-note-form">
        <input
          aria-label="PDF 页码"
          placeholder="PDF 页码"
          value={page}
          readOnly={Boolean(selection)}
          onChange={(e) => setPage(e.target.value)}
        />
        <textarea
          aria-label="阅读记录内容"
          placeholder="记录需要进一步理解的问题…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="button primary"
          disabled={!text.trim() || saving || loading || (local && !revision)}
          onClick={save}
        >
          保存阅读记录
        </button>
      </div>
      {entries.length ? (
        <div className="reader-note-list">
          {[...entries].reverse().map((item) => (
            <article key={item.id}>
              <div>
                <b>{item.page === '未标页' ? '未标页码' : `文件第 ${item.page} 页`}</b>
                <button
                  className="text-button"
                  disabled={saving || loading}
                  onClick={() => persist(entries.filter((record) => record.id !== item.id))}
                >
                  删除
                </button>
              </div>
              {item.quote && <blockquote>{item.quote}</blockquote>}
              <p>{item.text}</p>
              {item.documentId && item.pageIndex && (
                <a href={'#/document/' + item.documentId + '?page=' + item.pageIndex}>返回原文页</a>
              )}
            </article>
          ))}
        </div>
      ) : (
        !loading && <p className="muted reader-note-empty">还没有阅读记录。</p>
      )}
    </section>
  );
}
