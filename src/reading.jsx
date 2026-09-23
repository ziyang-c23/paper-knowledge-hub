import React, { lazy, Suspense, useEffect, useState } from 'react';
const PdfViewer = lazy(() => import('./pdf-viewer.jsx'));
export function ParallelReader({ paper, documents, Md, local = Boolean(window.__PKH_LOCAL__) }) {
  const docs = (local ? documents || [] : []).filter((d) => d.paperId === paper.id),
    [documentId, setDocumentId] = useState(docs[0]?.id || ''),
    [page, setPage] = useState(1);
  const doc = docs.find((d) => d.id === documentId) || docs[0];
  const activePage = doc?.id === documentId ? Math.min(page, doc.pageCount) : 1;
  return (
    <div className="reading-split">
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
              <PdfViewer id={doc.id} page={activePage} />
            </Suspense>
            <a href={'/api/documents/' + doc.id + '/file'} target="_blank" rel="noreferrer">
              打开 PDF 原件 ↗
            </a>
          </>
        ) : (
          <div className="empty">
            <h3>{local ? '尚未附加本地原文' : '阅读论文原文'}</h3>
            <p>
              {local
                ? '添加 PDF 后可以逐页对照；也可以打开论文来源。'
                : '在来源网站打开原文，与右侧笔记对照阅读。'}
            </p>
            <a href={paper.url} target="_blank" rel="noreferrer">
              打开原文 ↗
            </a>
          </div>
        )}
      </section>
      <section aria-label="并排阅读笔记">
        <Md>{paper.note}</Md>
      </section>
    </div>
  );
}

export function NoteOutline({ paper, mode }) {
  const [headings, setHeadings] = useState([]);
  useEffect(() => {
    const reader = document.querySelector(
      mode === 'source' ? '[aria-label="并排阅读笔记"] .markdown' : '.note-panel .markdown',
    );
    setHeadings(Array.from(reader?.querySelectorAll('h1,h2,h3') || []));
  }, [paper.id, paper.note, mode]);
  if (!headings.length) return null;
  return (
    <nav className="note-toc" aria-label="笔记目录">
      <h2>笔记目录</h2>
      {headings.map((heading, index) => (
        <button
          key={index}
          onClick={() => heading.scrollIntoView({ block: 'start', behavior: 'smooth' })}
        >
          {heading.textContent}
        </button>
      ))}
    </nav>
  );
}

export function ReaderNotes({ paper, local = Boolean(window.__PKH_LOCAL__) }) {
  const key = (local ? 'pkh-reader-notes-' : 'pkh-public-reader-notes-') + paper.id;
  return <ReaderNotesForm key={key} storageKey={key} />;
}

function ReaderNotesForm({ storageKey }) {
  const [entries, setEntries] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
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
  });
  const [page, setPage] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const persist = (next) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setEntries(next);
      setError('');
      return true;
    } catch {
      setError('浏览器无法保存记录，请复制内容后再尝试。');
      return false;
    }
  };
  const save = () => {
    if (!text.trim()) return;
    const next = [
      ...entries,
      {
        id: crypto.randomUUID(),
        page: page.trim() || '未标页',
        text: text.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    if (persist(next)) {
      setPage('');
      setText('');
    }
  };
  const remove = (id) => {
    const next = entries.filter((item) => item.id !== id);
    persist(next);
  };
  return (
    <section className="reader-notes panel" aria-label="本地阅读记录">
      <div className="section-heading">
        <div>
          <h2>阅读记录</h2>
          <p className="muted">记录问题与想法，保存在当前浏览器。</p>
        </div>
        <span className="badge">仅此浏览器</span>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="reader-note-form">
        <input
          aria-label="PDF 页码"
          placeholder="PDF 页码"
          value={page}
          onChange={(e) => setPage(e.target.value)}
        />
        <textarea
          aria-label="阅读记录内容"
          placeholder="例如：这里的实验条件需要和我的任务对齐……"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="button primary" disabled={!text.trim()} onClick={save}>
          保存阅读记录
        </button>
      </div>
      {entries.length ? (
        <div className="reader-note-list">
          {[...entries].reverse().map((item) => (
            <article key={item.id}>
              <div>
                <b>{item.page === '未标页' ? '未标页码' : `文件第 ${item.page} 页`}</b>
                <button className="text-button" onClick={() => remove(item.id)}>
                  删除
                </button>
              </div>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted reader-note-empty">还没有阅读记录。</p>
      )}
    </section>
  );
}
