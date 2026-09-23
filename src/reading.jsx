import React, { lazy, Suspense, useState } from 'react';
const PdfViewer = lazy(() => import('./pdf-viewer.jsx'));
export function ParallelReader({ paper, documents, Md }) {
  const docs = (documents || []).filter((d) => d.paperId === paper.id),
    [documentId, setDocumentId] = useState(docs[0]?.id || ''),
    [page, setPage] = useState(1);
  const doc = docs.find((d) => d.id === documentId);
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
                  value={documentId}
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
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value))}
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
              <PdfViewer id={doc.id} page={page} />
            </Suspense>
            <a href={'/api/documents/' + doc.id + '/file'} target="_blank" rel="noreferrer">
              打开 PDF 原件 ↗
            </a>
          </>
        ) : (
          <div className="empty">
            <h3>尚未附加本地原文</h3>
            <p>在“原文与全文索引”中添加 PDF，或打开论文来源。</p>
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

export function ReaderNotes({ paper }) {
  const key = 'pkh-reader-notes-' + paper.id;
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState('');
  const [text, setText] = useState('');
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      setEntries(Array.isArray(stored) ? stored : []);
    } catch {
      setEntries([]);
    }
  }, [key]);
  const save = () => {
    if (!text.trim()) return;
    const next = [
      ...entries,
      {
        id: Date.now(),
        page: page.trim() || '未标页',
        text: text.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    setEntries(next);
    localStorage.setItem(key, JSON.stringify(next));
    setPage('');
    setText('');
  };
  const remove = (id) => {
    const next = entries.filter((item) => item.id !== id);
    setEntries(next);
    localStorage.setItem(key, JSON.stringify(next));
  };
  return (
    <section className="reader-notes panel" aria-label="本地阅读记录">
      <div className="section-heading">
        <div>
          <h2>阅读记录</h2>
          <p className="muted">先记下页码和问题，再决定是否升级为正式证据。</p>
        </div>
        <span className="badge">仅此浏览器</span>
      </div>
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
                <b>文件第 {item.page} 页</b>
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
