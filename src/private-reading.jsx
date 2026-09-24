import React, { useEffect, useState } from 'react';

export function PrivateReadingInfo({ workspace }) {
  return (
    <section className="panel padded">
      <h1>私人网页 · 只读</h1>
      <p>可查看完整笔记、原文、阅读记录与待审草稿。编辑与应用草稿请回到主库所在的本地工作台。</p>
      <dl className="experiment-protocol">
        <div>
          <dt>数据来源</dt>
          <dd>本地主库的只读快照；编辑仍在主库完成</dd>
        </div>
        <div>
          <dt>当前版本</dt>
          <dd>
            <code>{workspace.revision?.slice(0, 16)}</code>
          </dd>
        </div>
        <div>
          <dt>访问</dt>
          <dd>服务端身份认证；本服务不接受写入</dd>
        </div>
        <div>
          <dt>同步</dt>
          <dd>读取服务器当前数据；没有自动双向同步或离线资料缓存</dd>
        </div>
      </dl>
      <a href="#/library">打开完整文献库 →</a>
    </section>
  );
}
export function PrivateDrafts({ Md }) {
  const [drafts, setDrafts] = useState([]),
    [tasks, setTasks] = useState([]),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.all(
      ['/api/drafts', '/api/ai-tasks'].map(async (url) => {
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) throw Error(j.error || '读取失败');
        return j;
      }),
    )
      .then(([d, t]) => {
        if (alive) {
          setDrafts(d.drafts || []);
          setTasks(t.tasks || []);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section className="private-inbox">
      <h1>研究收件箱</h1>
      <p>只读查看已保存任务与待审内容；草稿尚未成为论文结论。</p>
      {error && <p role="alert">{error}</p>}
      <h2>AI 任务</h2>
      {tasks.map((t) => (
        <details key={t.id}>
          <summary>
            {t.type} · {t.status}
          </summary>
          <p>{t.paperIds?.join('、')}</p>
          <p>{t.error}</p>
        </details>
      ))}
      <h2>草稿</h2>
      {drafts.map((d) => (
        <details key={d.id}>
          <summary>
            {d.record?.title || d.record?.id || d.id} · {d.status}
          </summary>
          {d.record?.note && <Md>{d.record.note}</Md>}
          {d.record?.analysis && <Md>{d.record.analysis}</Md>}
          <details>
            <summary>结构化候选内容</summary>
            <pre>{JSON.stringify(d.record, null, 2)}</pre>
          </details>
        </details>
      ))}
      {!drafts.length && !error && <p>没有已保存草稿。</p>}
    </section>
  );
}
export function PrivateAttachments({ paper, documents }) {
  const docs = (documents || []).filter((d) => d.paperId === paper.id);
  return (
    <section className="panel padded">
      <h2>原文附件</h2>
      {docs.map((d) => (
        <p key={d.id}>
          <a href={`#/document/${d.id}?page=1`}>
            {d.filename} · {d.pageCount} 页
          </a>
        </p>
      ))}
      {!docs.length && (
        <a href={paper.url} target="_blank" rel="noreferrer">
          在来源网站阅读原文 ↗
        </a>
      )}
    </section>
  );
}
