import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  Save,
  Plus,
  Download,
  ArrowUpRight,
  Upload,
  Shield,
  FileText,
  Search,
  Archive,
  RotateCcw,
  BookOpen,
} from 'lucide-react';
import { entityKinds } from './lib/entities.mjs';
import { enhancedSearch } from './lib/search-v2.mjs';
import { normalizeText, comparisonMarkdown } from './lib/knowledge.mjs';
import { TopicMatrix } from './topic-matrix.jsx';
import { createNoteTemplate } from './lib/note-template.mjs';
const PdfViewer = lazy(() => import('./pdf-viewer.jsx'));
export const dimensions = {
  problem: '研究问题',
  architecture: '模型架构',
  learning: '学习方式',
  memory: '记忆机制',
  deployment: '部署行为',
  task: '任务',
  dataset: '数据集',
  environment: '评测环境',
};
export const lifecycleNames = { draft: '草稿', active: '已入库', archived: '已归档' };
const reviewNames = { approved: '已审核', pending: '待审核', rejected: '已拒绝' };
const kindNames = {
  source: '作者原文/释义',
  note: '整理者归纳',
  model: '模型候选',
  unverified: '待核验',
};
const valueLabel = (v) => v || '未知 / 未整理';
const href = (path, params = {}) =>
  '#' + path + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
function fileDownload(name, value, type = 'text/markdown') {
  const u = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export async function workspaceRequest(path, body, token) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', 'X-Workspace-Token': token } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let result;
  try {
    result = await res.json();
  } catch {
    throw Error('服务没有返回有效数据；请确认本地服务仍在运行。');
  }
  if (!res.ok)
    throw Object.assign(Error(result.error || result.message || JSON.stringify(result)), {
      status: res.status,
    });
  return result;
}
const newPaper = () => ({
  schemaVersion: 1,
  id: '',
  title: '',
  year: new Date().getFullYear(),
  authors: [],
  url: '',
  visibility: 'private',
  lifecycle: 'draft',
  status: 'unread',
  note: '',
  topics: [],
  tags: [],
  aliases: [],
  facets: {},
});
function useUnsavedGuard(dirty) {
  useEffect(() => {
    const before = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const click = (e) => {
      if (!dirty) return;
      const target = e.target.closest('a[href^="#"],button[role="tab"]');
      if (target && !window.confirm('尚有未保存修改，离开将丢失。仍要离开？')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    addEventListener('beforeunload', before);
    document.addEventListener('click', click, true);
    return () => {
      removeEventListener('beforeunload', before);
      document.removeEventListener('click', click, true);
    };
  }, [dirty]);
}
export function PaperEditor({ id, workspace, refresh, notify, Md, config }) {
  const existing = workspace.dataset.papers.find((p) => p.id === id);
  const [record, setRecord] = useState(() => (existing ? structuredClone(existing) : newPaper())),
    [revision, setRevision] = useState(workspace.revision),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reviewPublic, setReviewPublic] = useState(false),
    [preview, setPreview] = useState(false),
    [importText, setImportText] = useState(''),
    [saveInfo, setSaveInfo] = useState(
      existing ? '当前记录已从本机主数据读取；修改后请保存。' : '',
    );
  const update = (key, value) => {
    setRecord((r) => ({ ...r, [key]: value }));
    setDirty(true);
    setSaveInfo('');
    setReviewPublic(false);
  };
  useUnsavedGuard(dirty);
  useEffect(() => {
    if (!dirty && !busy && existing && revision !== workspace.revision) {
      setRecord(structuredClone(existing));
      setRevision(workspace.revision);
      setReviewPublic(false);
    }
  }, [workspace.revision, dirty, busy]);
  const reloadEditor = async () => {
    if (dirty && !window.confirm('重新读取会放弃本页未保存修改。已导出需要保留的内容？')) return;
    try {
      const next = await refresh();
      setRecord(structuredClone(next.dataset.papers.find((p) => p.id === id) || newPaper()));
      setRevision(next.revision);
      setDirty(false);
      setReviewPublic(false);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  const save = async (lifecycle = record.lifecycle || 'draft') => {
    setError('');
    setBusy(true);
    try {
      const target = {
        ...record,
        lifecycle,
        visibility: reviewPublic ? 'public' : 'private',
        updated: new Date().toISOString().slice(0, 10),
      };
      delete target.demo;
      const result = await workspaceRequest(
        '/api/records',
        {
          collection: 'papers',
          record: target,
          expectedRevision: revision,
          publishConsent: reviewPublic,
        },
        workspace.csrfToken,
      );
      await refresh().catch(() =>
        notify('已写入主数据，但视图刷新失败；请重新读取，不要重复保存。'),
      );
      setRevision(result.revision);
      setRecord(target);
      setDirty(false);
      setReviewPublic(false);
      setSaveInfo(
        `已写入主数据 · ${lifecycleNames[lifecycle]} · ${target.visibility === 'public' ? '允许公开（仍需构建）' : '仅本地私有'} · 本地索引已更新`,
      );
      notify('已写入主数据，刷新后仍可读取');
      if (!id) {
        history.replaceState(null, '', href('/edit/' + target.id));
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    } catch (e) {
      setError(
        e.status === 409
          ? '发生版本或身份冲突，未覆盖文件。请先导出当前修改，重新读取并合并。' + e.message
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  };
  const loadImport = () => {
    try {
      const parsed = JSON.parse(importText);
      const p = parsed.papers?.length === 1 ? parsed.papers[0] : parsed;
      if (!p.title || p.schemaVersion !== 1)
        throw Error(
          '需要 schema v1 单论文 JSON，或恰好含一篇论文的 bundle。其他对象请在关联维护中分别审查。',
        );
      for (const key of ['authors', 'topics', 'tags', 'aliases'])
        if (
          p[key] !== undefined &&
          (!Array.isArray(p[key]) || p[key].some((x) => typeof x !== 'string'))
        )
          throw Error(key + ' 必须是字符串数组；未修改原记录。');
      for (const key of ['id', 'title', 'arxiv', 'doi', 'note', 'personalAnalysis', 'url'])
        if (p[key] !== undefined && typeof p[key] !== 'string') throw Error(key + ' 必须是文本。');
      if (
        p.facets !== undefined &&
        (typeof p.facets !== 'object' ||
          p.facets === null ||
          Array.isArray(p.facets) ||
          Object.values(p.facets).some(
            (v) => !Array.isArray(v) || v.some((x) => typeof x !== 'string'),
          ))
      )
        throw Error('facets 必须是维度到 ID 数组的映射');
      const matches = workspace.dataset.papers.filter(
        (x) =>
          x.id === p.id ||
          (p.arxiv && x.arxiv?.replace(/v\d+$/, '') === p.arxiv.replace(/v\d+$/, '')) ||
          (p.doi && x.doi?.toLowerCase() === p.doi.toLowerCase()) ||
          normalizeText(x.title) === normalizeText(p.title),
      );
      if (matches.length && matches[0].id !== id) {
        setError(
          '已有相同身份论文：' + matches[0].id + '。请打开该论文编辑，将导入内容合并到原 ID。',
        );
        return;
      }
      setRecord({
        ...newPaper(),
        ...record,
        ...p,
        ...(existing ? { id: existing.id } : {}),
        visibility: 'private',
      });
      setDirty(true);
      setError('');
      setReviewPublic(false);
    } catch (e) {
      setError(e.message);
    }
  };
  const synonyms = workspace.dataset.concepts.filter((c) =>
    [c.title, ...(c.aliases || [])].some((a) =>
      record.tags?.some((t) => normalizeText(a) === normalizeText(t)),
    ),
  );
  const evidence = workspace.dataset.evidence.filter((e) => e.paperId === record.id);
  return (
    <>
      <header className="page-heading">
        <div>
          <div className="eyebrow">READ · WRITE · REVIEW</div>
          <h1>{existing ? '阅读与编辑' : '快速纳入论文'}</h1>
          <p>只需基本书目即可保存；结构化字段和证据可以逐步补充。默认保存为私有。</p>
        </div>
        <a className="button" href={existing ? href('/paper/' + id) : href('/library')}>
          返回{existing ? '论文' : '论文库'}
        </a>
      </header>
      <div className="editor-status">
        <span>{dirty ? '尚未保存的修改' : '无未保存修改'}</span>
        <span>基于版本 {revision.slice(0, 8)}</span>
        <button className="text-button" onClick={reloadEditor}>
          重新读取编辑内容
        </button>
        <span>
          {lifecycleNames[record.lifecycle || 'active']} /{' '}
          {record.visibility === 'public' ? '当前记录允许公开' : '当前记录私有'}
        </span>
      </div>
      <div className="writing-layout">
        <section className="panel">
          <form
            className="draft-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <details className="import-details">
              <summary>导入已有 JSON / Markdown（仅填入编辑器，不自动覆盖）</summary>
              <label>
                标准 JSON 文件
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const f = e.target.files[0];
                    if (f) setImportText(await f.text());
                  }}
                />
              </label>
              <textarea
                aria-label="导入 JSON 内容"
                rows="5"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <button type="button" className="button" onClick={loadImport}>
                检查身份并填入
              </button>
              <label>
                Markdown 正文文件
                <input
                  type="file"
                  accept=".md,.markdown,text/markdown"
                  onChange={async (e) => {
                    const f = e.target.files[0];
                    if (f) update('note', await f.text());
                  }}
                />
              </label>
              <p className="footnote">
                Markdown 只替换尚未保存的正文，不猜测元数据。已有同 ID、DOI/arXiv
                或标题时，先打开原记录再合并。
              </p>
            </details>
            <label>
              论文名称
              <input
                aria-label="论文名称"
                required
                value={record.title}
                onChange={(e) => update('title', e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label>
                稳定 ID
                <input
                  aria-label="稳定 ID"
                  required
                  disabled={Boolean(existing)}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={record.id}
                  onChange={(e) => update('id', e.target.value)}
                />
              </label>
              <label>
                年份
                <input
                  aria-label="年份"
                  required
                  type="number"
                  min="1900"
                  max="2200"
                  value={record.year}
                  onChange={(e) => update('year', Number(e.target.value))}
                />
              </label>
            </div>
            <label>
              作者（英文逗号分隔，未知可暂空）
              <input
                aria-label="作者"
                value={record.authors.join(', ')}
                onChange={(e) =>
                  update(
                    'authors',
                    e.target.value
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  )
                }
              />
            </label>
            <label>
              原文 HTTPS 链接
              <input
                aria-label="原文链接"
                required
                type="url"
                value={record.url}
                onChange={(e) => update('url', e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label>
                arXiv ID / 版本
                <input
                  value={record.arxiv || ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      const n = { ...record };
                      delete n.arxiv;
                      setRecord(n);
                      setDirty(true);
                      setReviewPublic(false);
                    } else update('arxiv', e.target.value);
                  }}
                  placeholder="2406.09246v3"
                />
              </label>
              <label>
                DOI
                <input
                  value={record.doi || ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      const n = { ...record };
                      delete n.doi;
                      setRecord(n);
                      setDirty(true);
                      setReviewPublic(false);
                    } else update('doi', e.target.value);
                  }}
                  placeholder="10.…"
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                阅读状态
                <select
                  aria-label="编辑阅读状态"
                  value={record.status || 'unread'}
                  onChange={(e) => update('status', e.target.value)}
                >
                  <option value="unread">待阅读</option>
                  <option value="reading">阅读中</option>
                  <option value="reviewed">已整理</option>
                </select>
              </label>
              <label>
                简称 / 别名
                <input
                  value={(record.aliases || []).join(', ')}
                  onChange={(e) =>
                    update(
                      'aliases',
                      e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>专题归属（可多选）</legend>
              {workspace.dataset.topics.map((t) => (
                <label className="check-label" key={t.id}>
                  <input
                    type="checkbox"
                    checked={(record.topics || []).includes(t.id)}
                    onChange={() =>
                      update(
                        'topics',
                        (record.topics || []).includes(t.id)
                          ? record.topics.filter((x) => x !== t.id)
                          : [...(record.topics || []), t.id],
                      )
                    }
                  />
                  {t.title}
                </label>
              ))}
            </fieldset>
            <details>
              <summary>多维分类与同义项</summary>
              {Object.entries(dimensions).map(([key, label]) => (
                <fieldset key={key}>
                  <legend>{label}</legend>
                  {workspace.dataset.concepts
                    .filter((c) => c.dimension === key)
                    .map((c) => (
                      <label className="check-label" key={c.id}>
                        <input
                          type="checkbox"
                          checked={(record.facets?.[key] || []).includes(c.id)}
                          onChange={() =>
                            update('facets', {
                              ...record.facets,
                              [key]: (record.facets?.[key] || []).includes(c.id)
                                ? record.facets[key].filter((x) => x !== c.id)
                                : [...(record.facets?.[key] || []), c.id],
                            })
                          }
                        />
                        {c.title}
                      </label>
                    ))}
                  {!workspace.dataset.concepts.some((c) => c.dimension === key) && (
                    <p className="muted">尚无该维度实体，可在关联维护中添加。</p>
                  )}
                </fieldset>
              ))}
              <label>
                自由标签
                <input
                  value={(record.tags || []).join(', ')}
                  onChange={(e) =>
                    update(
                      'tags',
                      e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </label>
              {synonyms.length > 0 && (
                <p className="callout">
                  可能已有同义实体：{synonyms.map((c) => c.title + ' (' + c.id + ')').join('、')}
                  。优先引用实体而非重复创建标签。
                </p>
              )}
            </details>
            <div className="row between">
              <h2>连续阅读笔记</h2>
              <button type="button" className="text-button" onClick={() => setPreview(!preview)}>
                {preview ? '回到正文编辑' : '预览 Markdown'}
              </button>
            </div>
            <div className="row wrap">
              <button
                type="button"
                className="button small"
                disabled={Boolean(record.note?.trim())}
                onClick={() => {
                  if (record.note?.trim()) return;
                  update('note', createNoteTemplate());
                  setPreview(false);
                }}
              >
                使用精读模板
              </button>
              <small className="muted">
                {record.note?.trim()
                  ? '已有正文，模板不会覆盖内容。'
                  : '从研究背景、机制、实验、讨论与资源开始。'}
              </small>
            </div>
            {preview ? (
              <Md>{record.note}</Md>
            ) : (
              <textarea
                className="note-editor"
                aria-label="笔记正文"
                rows="18"
                value={record.note || ''}
                onChange={(e) => update('note', e.target.value)}
              />
            )}
            <details>
              <summary>渐进补全：研究问题、方法、评测与局限</summary>
              {config.comparisonFields.map((f) => (
                <div className="field-stack" key={f.key}>
                  <label>
                    {f.label}
                    <textarea
                      aria-label={'编辑' + f.label}
                      rows="3"
                      value={record[f.key] || ''}
                      onChange={(e) => update(f.key, e.target.value)}
                    />
                  </label>
                  <label>
                    支撑此字段的证据（可多选，须核对完整支持范围）
                    <select
                      multiple
                      aria-label={'依据 ' + f.label}
                      value={record.claimEvidence?.[f.key] || []}
                      onChange={(e) =>
                        update('claimEvidence', {
                          ...record.claimEvidence,
                          [f.key]: [...e.target.selectedOptions].map((o) => o.value),
                        })
                      }
                    >
                      {evidence.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.id} · {e.status === 'verified' ? '出处已核验' : '待核验'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </details>
            <label className="field-stack">
              我的判断 / 未公开 idea（始终排除于公开投影）
              <textarea
                aria-label="个人分析"
                rows="6"
                value={record.personalAnalysis || ''}
                onChange={(e) => update('personalAnalysis', e.target.value)}
              />
            </label>
            <label className="consent">
              <input
                type="checkbox"
                checked={reviewPublic}
                onChange={(e) => setReviewPublic(e.target.checked)}
              />
              我已审查当前书目、笔记和结构化字段，允许它们进入下一次公开构建。个人分析、PDF
              与全文索引仍不公开。
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {saveInfo && (
              <p className="success-box" role="status">
                {saveInfo}
              </p>
            )}
            <div className="save-bar">
              <button disabled={busy} className="button" type="submit">
                <Save size={16} />
                {busy ? '写入中…' : '保存草稿 / 修改'}
              </button>
              <button
                disabled={busy}
                type="button"
                className="button primary"
                onClick={() => save('active')}
              >
                审阅后正式入库
              </button>
              <button
                disabled={busy || !existing}
                type="button"
                className="button"
                onClick={() => save(record.lifecycle === 'archived' ? 'active' : 'archived')}
              >
                {record.lifecycle === 'archived' ? <RotateCcw size={15} /> : <Archive size={15} />}{' '}
                {record.lifecycle === 'archived' ? '恢复入库' : '归档'}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  fileDownload(
                    record.id + '.json',
                    JSON.stringify(record, null, 2),
                    'application/json',
                  )
                }
              >
                导出当前修改
              </button>
            </div>
          </form>
        </section>
        <aside className="editor-sources">
          <section className="panel padded">
            <h2>对照来源</h2>
            {record.url && (
              <a href={record.url} target="_blank" rel="noreferrer">
                原文链接 <ArrowUpRight size={14} />
              </a>
            )}
            <p className="footnote">来源保持独立窗口；个人判断不会自动升级为原文事实。</p>
            {evidence.map((e) => (
              <div className="source-note" key={e.id}>
                <small>
                  {kindNames[e.kind]} · {e.status === 'verified' ? '已核验' : '待核验'}
                </small>
                <p>{e.text}</p>
                <a href={href('/paper/' + record.id, { evidence: e.id })}>{e.id}</a>
                {e.url && (
                  <a href={e.url} target="_blank" rel="noreferrer">
                    核对来源
                  </a>
                )}
              </div>
            ))}
            {!evidence.length && <p>尚无证据。先保存书目，再在“关联维护”中补充。</p>}
          </section>
          <section className="panel padded">
            <h2>保存与发布</h2>
            <p>
              成功提示表示 JSON
              已写入本机主库，本地视图无需重建。公开网站是单独生成版本，保存不等于发布。
            </p>
            <p>编辑既有公开内容默认取消公开，重新审查勾选后才继续允许公开。</p>
            <p className="muted">冲突不会自动覆盖：保留当前草稿，重新读取主库，再核对不同修改。</p>
          </section>
        </aside>
      </div>
    </>
  );
}
const entityDefault = (collection, paperId) => {
  const base = { schemaVersion: 1, id: '', visibility: 'private' };
  if (collection === 'topics')
    return {
      ...base,
      title: '',
      description: '',
      dimensions: [],
      branches: [],
      questions: [],
      boundaries: '',
      analysis: '',
      gaps: [],
      evidenceIds: [],
      compareIds: [],
    };
  if (collection === 'concepts')
    return {
      ...base,
      title: '',
      kind: 'concept',
      description: '',
      dimension: 'problem',
      aliases: [],
    };
  if (collection === 'evidence')
    return { ...base, paperId: paperId || '', kind: 'source', text: '', status: 'unverified' };
  return {
    ...base,
    source: paperId || '',
    target: '',
    type: 'related',
    evidenceIds: [],
    origin: 'curator',
    status: 'pending',
  };
};
export function AssociationEditor({
  workspace,
  refresh,
  notify,
  collection = 'relations',
  initialId = '',
  paperId = '',
}) {
  const [group, setGroup] = useState(collection),
    [id, setId] = useState(initialId),
    [record, setRecord] = useState(
      () =>
        workspace.dataset[collection].find((r) => r.id === initialId) ||
        entityDefault(collection, paperId),
    ),
    [revision, setRevision] = useState(workspace.revision),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [publicOK, setPublicOK] = useState(false),
    [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty);
  const set = (k, v) => {
    setDirty(true);
    setRecord({ ...record, [k]: v });
    setPublicOK(false);
  };
  const switchRecord = (g, i) => {
    if (dirty && !window.confirm('切换对象会放弃未保存修改。继续？')) return;
    setDirty(false);
    setGroup(g);
    setId(i);
    setRecord(
      structuredClone(workspace.dataset[g].find((r) => r.id === i) || entityDefault(g, paperId)),
    );
    setRevision(workspace.revision);
    setPublicOK(false);
    setError('');
  };
  const arrayField = (k, label) => (
    <label className="field-stack" key={k}>
      {label}（每行一个）
      <textarea
        rows="3"
        aria-label={label}
        value={(record[k] || []).join('\n')}
        onChange={(e) =>
          set(
            k,
            e.target.value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </label>
  );
  const textField = (k, label, large = false) => (
    <label className="field-stack" key={k}>
      {label}
      {large ? (
        <textarea
          aria-label={label}
          rows="6"
          value={record[k] || ''}
          onChange={(e) => set(k, e.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          value={record[k] || ''}
          onChange={(e) => set(k, e.target.value)}
        />
      )}
    </label>
  );
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = { ...record, visibility: publicOK ? 'public' : 'private' };
      delete r.demo;
      if (r.url === '') delete r.url;
      if (r.documentId === '') {
        delete r.documentId;
        delete r.pageIndex;
      }
      const result = await workspaceRequest(
        '/api/records',
        { collection: group, record: r, expectedRevision: revision, publishConsent: publicOK },
        workspace.csrfToken,
      );
      await refresh().catch(() =>
        notify('已写入主数据，但视图刷新失败；请重新读取，不要重复保存。'),
      );
      setRevision(result.revision);
      setId(r.id);
      setRecord(r);
      setDirty(false);
      setPublicOK(false);
      notify('关联记录已落盘；专题、图谱与检索已更新');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const synonyms =
    group === 'concepts'
      ? workspace.dataset.concepts.filter(
          (c) =>
            c.id !== record.id &&
            [c.title, ...(c.aliases || [])].some((a) =>
              [record.title, ...(record.aliases || [])].some(
                (b) => b && normalizeText(a) === normalizeText(b),
              ),
            ),
        )
      : [];
  return (
    <section className="panel padded">
      <div className="section-heading">
        <h2>专题、实体与证据维护</h2>
        <small>稳定 ID 引用 · 单一主库 · {dirty ? '未保存修改' : '无未保存修改'}</small>
      </div>
      <div className="form-grid">
        <label>
          对象类型
          <select
            aria-label="对象类型"
            value={group}
            onChange={(e) => switchRecord(e.target.value, '')}
          >
            {Object.entries({
              topics: '研究专题',
              concepts: '问题 / 方法 / 概念 / 数据集',
              evidence: '主张与证据',
              relations: '可审核关系',
            }).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          编辑对象
          <select
            aria-label="编辑对象"
            value={id}
            onChange={(e) => switchRecord(group, e.target.value)}
          >
            <option value="">新建对象</option>
            {workspace.dataset[group].map((r) => (
              <option value={r.id} key={r.id}>
                {r.title || r.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="text-button"
        onClick={async () => {
          if (dirty && !window.confirm('重新读取会放弃未保存修改。继续？')) return;
          const next = await refresh();
          setRecord(
            structuredClone(
              next.dataset[group].find((r) => r.id === id) || entityDefault(group, paperId),
            ),
          );
          setRevision(next.revision);
          setDirty(false);
          setPublicOK(false);
          setError('');
        }}
      >
        重新读取此对象
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field-stack">
          对象 ID
          <input
            aria-label="对象 ID"
            required
            disabled={Boolean(id)}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={record.id}
            onChange={(e) => set('id', e.target.value)}
          />
        </label>
        {['topics', 'concepts'].includes(group) && (
          <>
            {textField('title', '名称')}
            {textField('description', '范围与定义', true)}
          </>
        )}
        {group === 'concepts' && (
          <>
            <label className="field-stack">
              实体类型
              <select
                aria-label="实体类型"
                value={record.kind}
                onChange={(e) => set('kind', e.target.value)}
              >
                {Object.entries(entityKinds).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              分类维度
              <select
                aria-label="分类维度"
                value={record.dimension || 'problem'}
                onChange={(e) => set('dimension', e.target.value)}
              >
                {Object.entries(dimensions).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {arrayField('aliases', '别名与中英文名称')}
            {synonyms.length > 0 && (
              <p className="callout">
                可能重复：{synonyms.map((x) => x.title + ' / ' + x.id).join('；')}
                。优先编辑已有实体。
              </p>
            )}
          </>
        )}
        {group === 'topics' && (
          <>
            {arrayField('questions', '研究问题')}
            {arrayField('dimensions', '比较维度')}
            {arrayField('branches', '方法分支')}
            {textField('boundaries', '分类边界', true)}
            {textField('analysis', '人工阶段性理解', true)}
            {arrayField('gaps', '分歧与库内未覆盖项')}
            {arrayField('evidenceIds', '代表性证据 ID')}
            {arrayField('compareIds', '对比论文 ID')}
          </>
        )}
        {group === 'evidence' && (
          <>
            <label className="field-stack">
              对应论文
              <select
                aria-label="证据对应论文"
                value={record.paperId || ''}
                onChange={(e) => set('paperId', e.target.value)}
              >
                <option value="">选择论文</option>
                {workspace.dataset.papers.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.acronym || p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              内容性质
              <select
                aria-label="证据性质"
                value={record.kind}
                onChange={(e) => set('kind', e.target.value)}
              >
                {Object.entries(kindNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {textField('text', '主张 / 证据文字', true)}
            {textField('quote', '原文摘录（可选）', true)}
            <label className="field-stack">
              本地原文文档（可选）
              <select
                aria-label="证据原文文档"
                value={record.documentId || ''}
                onChange={(e) => {
                  setRecord({
                    ...record,
                    documentId: e.target.value,
                    ...(e.target.value ? { pageIndex: 1 } : {}),
                  });
                  setDirty(true);
                  setPublicOK(false);
                }}
              >
                <option value="">不绑定本地 PDF</option>
                {(workspace.documents || [])
                  .filter((d) => d.paperId === record.paperId)
                  .map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.filename}
                    </option>
                  ))}
              </select>
            </label>
            {record.documentId && (
              <label className="field-stack">
                PDF 文件页序（从 1 开始，不是印刷页码）
                <input
                  aria-label="证据文件页序"
                  type="number"
                  min="1"
                  max={
                    workspace.documents?.find((d) => d.id === record.documentId)?.pageCount || 800
                  }
                  value={record.pageIndex || 1}
                  onChange={(e) => set('pageIndex', Number(e.target.value))}
                />
                <a
                  href={href('/document/' + record.documentId, { page: record.pageIndex || 1 })}
                  target="_blank"
                  rel="noreferrer"
                >
                  对照此页原文
                </a>
              </label>
            )}
            {textField('locator', '实际核验的位置')}
            {textField('url', '来源 HTTPS 链接')}
            <label className="field-stack">
              核验状态
              <select
                aria-label="证据核验状态"
                value={record.status}
                onChange={(e) => set('status', e.target.value)}
              >
                <option value="unverified">待核验</option>
                <option value="verified">已核验出处与支持范围</option>
              </select>
            </label>
            <p className="footnote">没有依据时不要升级；模型和未核实类型不能标为 verified。</p>
          </>
        )}
        {group === 'relations' && (
          <>
            {['source', 'target'].map((k, i) => (
              <label className="field-stack" key={k}>
                {i ? '目标实体' : '来源实体'}
                <select
                  aria-label={i ? '目标实体' : '来源实体'}
                  value={record[k]}
                  onChange={(e) => set(k, e.target.value)}
                >
                  <option value="">选择实体</option>
                  {[
                    ...workspace.dataset.papers,
                    ...workspace.dataset.topics,
                    ...workspace.dataset.concepts,
                  ].map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.acronym || x.title}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="field-stack">
              关系含义
              <select
                aria-label="关系含义"
                value={record.type}
                onChange={(e) => set('type', e.target.value)}
              >
                {Object.entries({
                  studies: '研究问题',
                  uses: '采用 / 使用',
                  extends: '作者明确扩展',
                  related: '相关',
                  cites: '仅引用',
                }).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              依据生成方式
              <select
                aria-label="依据生成方式"
                value={record.origin}
                onChange={(e) => set('origin', e.target.value)}
              >
                {Object.entries({
                  source: '原文明示',
                  curator: '人工归纳',
                  model: '模型候选',
                  similarity: '语义相似候选',
                }).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {arrayField('evidenceIds', '支撑证据 ID')}
            <label className="field-stack">
              关系审核状态
              <select
                aria-label="关系审核状态"
                value={record.status}
                onChange={(e) => set('status', e.target.value)}
              >
                {Object.entries(reviewNames).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <p className="footnote">
              引用不等于采用，共用数据集不保证评测协议可比。模型/相似度候选不进入结论扩展。
            </p>
          </>
        )}
        <label className="consent">
          <input
            type="checkbox"
            checked={publicOK}
            onChange={(e) => setPublicOK(e.target.checked)}
          />
          允许这条已审查记录进入公开候选集（依赖私有对象时仍不会发布）。
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="button primary" type="submit">
          <Save size={16} />
          {busy ? '写入中…' : '保存关联记录'}
        </button>
      </form>
    </section>
  );
}
export function WorkspaceManager({ workspace, refresh, notify, Md, config, route }) {
  const [tab, setTab] = useState(route?.params.get('tab') || 'backup'),
    [modelStatus, setModelStatus] = useState(null),
    [error, setError] = useState(''),
    [backups, setBackups] = useState([]),
    [history, setHistory] = useState([]),
    [backupId, setBackupId] = useState(''),
    [confirmRestore, setConfirmRestore] = useState(false);
  useEffect(() => {
    workspaceRequest('/api/status')
      .then(setModelStatus)
      .catch((e) => setError(e.message));
  }, []);
  const backup = async () => {
    try {
      const r = await workspaceRequest('/api/backup', {}, workspace.csrfToken);
      notify('完整本地备份已保存：' + (r.path || r.backupId));
      const bs = await workspaceRequest('/api/backups');
      setBackups(bs.backups || bs);
    } catch (e) {
      setError(e.message);
    }
  };
  const list = async () => {
    try {
      const bs = await workspaceRequest('/api/backups');
      setBackups(bs.backups || bs);
    } catch (e) {
      setError(e.message);
    }
  };
  const listHistory = async () => {
    try {
      const result = await workspaceRequest('/api/history');
      setHistory(result.history || []);
    } catch (e) {
      setError(e.message);
    }
  };
  const downloadHistory = async (revision) => {
    try {
      const result = await workspaceRequest('/api/history/' + revision);
      fileDownload(
        `workspace-${revision.slice(0, 12)}.json`,
        JSON.stringify(result.store, null, 2),
        'application/json',
      );
    } catch (e) {
      setError(e.message);
    }
  };
  const restore = async () => {
    try {
      await workspaceRequest(
        '/api/restore',
        { backupId, expectedRevision: workspace.revision },
        workspace.csrfToken,
      );
      await refresh();
      setConfirmRestore(false);
      notify('已恢复主数据；恢复前版本已单独备份');
    } catch (e) {
      setError(e.message);
    }
  };
  const archived = workspace.dataset.papers.filter((p) => p.lifecycle === 'archived');
  return (
    <>
      <header className="page-heading">
        <div>
          <div className="eyebrow">LOCAL RESEARCH WORKSPACE</div>
          <h1>设置与维护</h1>
          <p>资料直接写入本机开放格式主库。已保存、待审核和已发布是不同状态。</p>
        </div>
        <a href={href('/edit/new')} className="button primary">
          <Plus size={16} />
          快速新增
        </a>
      </header>
      <div className="mode-tabs" role="tablist" aria-label="维护工作区">
        {[
          ['papers', '入库与归档'],
          ['links', '专题 / 实体 / 证据'],
          ['backup', '备份与公开边界'],
          ['ai', 'AI 与属性'],
        ].map(([k, v]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {v}
          </button>
        ))}
      </div>
      {tab === 'papers' ? (
        <>
          <section className="panel padded">
            <h2>继续整理</h2>
            <div className="record-table">
              {workspace.dataset.papers
                .filter((p) => p.lifecycle !== 'archived')
                .map((p) => (
                  <div className="record-line" key={p.id}>
                    <a href={href('/paper/' + p.id)}>{p.acronym || p.title}</a>
                    <span>
                      {lifecycleNames[p.lifecycle || 'active']} ·{' '}
                      {p.visibility === 'public' ? '公开候选' : '私有'}
                    </span>
                    <a className="button small" href={href('/edit/' + p.id)}>
                      编辑
                    </a>
                  </div>
                ))}
            </div>
          </section>
          <section className="panel padded">
            <h2>归档记录 · {archived.length}</h2>
            <p className="muted">
              归档不删除原数据，但从默认检索、统计、图谱及公开构建排除。打开编辑后可恢复。
            </p>
            {archived.map((p) => (
              <div className="record-line" key={p.id}>
                <span>{p.title}</span>
                <a href={href('/edit/' + p.id)}>查看并恢复</a>
              </div>
            ))}
          </section>
        </>
      ) : tab === 'ai' ? (
        <section className="panel padded">
          <h2>AI 与整理工具</h2>
          <p>
            网页模型：
            {modelStatus
              ? modelStatus.configured
                ? '已配置，尚未验证连接'
                : '未配置'
              : '正在读取…'}
            。本地整理、搜索和 Agent 草稿独立可用。
          </p>
          <div className="row wrap">
            <a className="button" href="#/drafts">
              草稿箱与 Skills
            </a>
            <a className="button" href="#/query">
              公开证据问答
            </a>
            <a className="button" href="#/database?properties=1">
              配置自定义属性、公式与汇总
            </a>
            <a className="button" href="#/edit/new">
              导入论文 JSON / Markdown
            </a>
          </div>
          <details>
            <summary>配置可选网页模型</summary>
            <p>
              在本机 .env 中按 .env.example 设置 MODEL_BASE_URL、MODEL_API_KEY 与 MODEL_NAME
              后重启服务。密钥仅保存在服务端。配置不表示已完成连接测试。
            </p>
          </details>
        </section>
      ) : tab === 'links' ? (
        <AssociationEditor workspace={workspace} refresh={refresh} notify={notify} />
      ) : (
        <>
          <section className="panel padded">
            <h2>完整备份与回退</h2>
            <p>
              备份包含主库、配置和本地文档，不是网页快照；默认保存在 ignored private/backups/。源码
              ZIP 不包含它。
            </p>
            <div className="row wrap">
              <button className="button primary" onClick={backup}>
                创建本地完整备份
              </button>
              <button className="button" onClick={list}>
                读取可恢复备份
              </button>
              <button className="button" onClick={listHistory}>
                读取版本历史
              </button>
            </div>
            <label className="field-stack">
              恢复点
              <select
                aria-label="恢复点"
                value={backupId}
                onChange={(e) => setBackupId(e.target.value)}
              >
                <option value="">选择备份</option>
                {backups.map((b) => {
                  const id = typeof b === 'string' ? b : b.backupId || b.id || b.name;
                  return (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="consent">
              <input
                type="checkbox"
                checked={confirmRestore}
                onChange={(e) => setConfirmRestore(e.target.checked)}
              />
              我已核对恢复点；恢复会替换当前本地库，并先备份当前状态。
            </label>
            <button className="button" disabled={!confirmRestore || !backupId} onClick={restore}>
              恢复所选备份
            </button>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
          <section className="panel padded">
            <h2>自动版本历史 · {history.length}</h2>
            <p>
              每次普通保存会保留上一个主库快照，最多 100 个。它用于核对和导出；PDF
              原件与站点配置仍以完整备份为准。
            </p>
            {history.length ? (
              <div className="record-table">
                {history.map((item) => (
                  <div className="record-line" key={item.revision}>
                    <span>
                      {item.capturedAt || item.revision.slice(0, 12)} · {item.papers} 篇论文 ·{' '}
                      {item.entities} 个实体
                    </span>
                    <button
                      className="button small"
                      onClick={() => downloadHistory(item.revision)}
                      aria-label={'下载历史 ' + item.revision.slice(0, 12)}
                    >
                      下载快照
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">尚无历史快照；下一次保存后会出现。</p>
            )}
          </section>
          <section className="panel padded">
            <h2>公开候选集</h2>
            <p>
              目前{' '}
              {
                workspace.dataset.papers.filter(
                  (p) => p.visibility === 'public' && p.lifecycle === 'active',
                ).length
              }{' '}
              篇允许进入公开构建。draft / archived、个人分析、PDF 及全文索引始终排除。
            </p>
            <pre>
              npm run build{`\n`}npm run preview{`\n`}npm run package
            </pre>
            <p>构建不会自动推送或部署。取消公开后请重新构建，旧 dist 只代表上次发布版本。</p>
          </section>
        </>
      )}
    </>
  );
}
export function DocumentPanel({ paperId, workspace, refresh, notify }) {
  const [file, setFile] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const docs = (workspace.documents || []).filter((d) => d.paperId === paperId);
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 25 * 1024 * 1024) throw Error('单文件限 25 MB');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      await workspaceRequest(
        '/api/documents/import',
        {
          paperId,
          pdfBase64: btoa(binary),
          filename: file.name,
          expectedRevision: workspace.revision,
        },
        workspace.csrfToken,
      );
      await refresh();
      setFile(null);
      notify('PDF 原件与逐页文本已保存，仅本机检索');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel padded">
      <h2>
        原文与全文索引 <small>仅本机</small>
      </h2>
      {docs.map((d) => (
        <div key={d.id} className="document-record">
          <b>{d.filename}</b>
          <p>
            {d.pageCount} 个 PDF 文件页 · {d.parser} · SHA-256 {d.sha256?.slice(0, 12)}
          </p>
          <a className="button small" href={href('/document/' + d.id, { page: 1 })}>
            原文与提取文本对照
          </a>
          <a className="button small" href={href('/research', { q: '', scope: 'pdf', paperId })}>
            在此论文全文中检索
          </a>
        </div>
      ))}
      {!docs.length && <p className="muted">尚未解析原文；当前搜索仅覆盖已入库笔记与证据。</p>}
      <label className="field-stack">
        选择有权使用的 PDF
        <input
          aria-label="上传 PDF"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files[0])}
        />
      </label>
      <button className="button" disabled={!file || busy} onClick={upload}>
        <Upload size={15} />
        {busy ? '解析并保存中…' : '保存 PDF 并建立逐页索引'}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="footnote">
        文件页序不等于印刷页码。表格、图片与公式不能仅凭提取文本确认；所有自动文本在人工复核前都不是
        verified evidence。
      </p>
    </section>
  );
}
export function DocumentReader({ id, page = 1, workspace }) {
  const doc = workspace.documents?.find((d) => d.id === id),
    [index, setIndex] = useState(Number(page) || 1);
  useEffect(() => setIndex(Number(page) || 1), [id, page]);
  if (!doc)
    return (
      <div className="empty">
        <h1>本地文档不存在</h1>
        <p>请先为论文导入 PDF，或检查它是否已归档。</p>
      </div>
    );
  const pg = doc.pages.find((p) => p.pageIndex === index);
  return (
    <>
      <header className="page-heading">
        <div>
          <div className="eyebrow">SOURCE READER · LOCAL ONLY</div>
          <h1>{doc.filename}</h1>
          <p>逐页原文对照，稳定文档 ID {doc.id}</p>
        </div>
        <a href={href('/paper/' + doc.paperId)} className="button">
          返回论文
        </a>
      </header>
      <div className="reader-toolbar">
        <label>
          PDF 文件页序
          <select
            aria-label="PDF 文件页序"
            value={index}
            onChange={(e) => {
              setIndex(Number(e.target.value));
              history.replaceState(null, '', href('/document/' + id, { page: e.target.value }));
            }}
          >
            {doc.pages.map((p) => (
              <option key={p.pageIndex} value={p.pageIndex}>
                文件第 {p.pageIndex} 页{p.pageLabel ? ' / 标签 ' + p.pageLabel : ''}
              </option>
            ))}
          </select>
        </label>
        <a href={'/api/documents/' + id + '/file#page=' + index} target="_blank" rel="noreferrer">
          在浏览器 PDF 阅读器打开
        </a>
      </div>
      <div className="source-reader">
        <Suspense fallback={<p>加载 PDF 阅读器…</p>}>
          <PdfViewer id={id} page={index} />
        </Suspense>
        <section className="panel padded">
          <h2>提取文本 · 文件第 {index} 页</h2>
          <p className="callout">
            自动提取，未经逐行校对。PDF
            标签不是已核验的印刷页码。请对照左侧版面，尤其是双栏、公式和表格。
          </p>
          {pg?.warnings?.length > 0 && <p className="error">{pg.warnings.join('；')}</p>}
          <pre className="pdf-text">{pg?.text || '无可提取文字；可能需要 OCR（未实现）。'}</pre>
        </section>
      </div>
    </>
  );
}
export function ResearchSearch({ workspace, route, Md, notify }) {
  const p = route.params,
    q = p.get('q') || '',
    strategy = p.get('strategy') || 'ranked',
    scope = p.get('scope') || 'all';
  const update = (k, v) => {
    const params = new URLSearchParams(p);
    v ? params.set(k, v) : params.delete(k);
    history.pushState(null, '', href('/research', Object.fromEntries(params)));
    dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const result = enhancedSearch({ ...workspace.dataset, scope: 'local' }, q, {
    ...Object.fromEntries(p),
    strategy,
    scope,
    documents: workspace.documents || [],
  });
  const find = (id) => workspace.dataset.papers.find((x) => x.id === id);
  const ev = (id) => workspace.dataset.evidence.find((x) => x.id === id);
  return (
    <>
      <header className="page-heading">
        <div>
          <div className="eyebrow">RESEARCH RETRIEVAL</div>
          <h1>研究查询与原文定位</h1>
          <p>检索私有与公开本地资料；没有模型也可用。结果是证据候选，不能代替支持关系核查。</p>
        </div>
        <a className="button" href="#/query">
          可选模型问答（仅公开证据）
        </a>
      </header>
      <section className="panel padded">
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="研究查询"
            placeholder="术语、中文线索、方法名或原文词组"
            value={q}
            onChange={(e) => update('q', e.target.value)}
          />
        </label>
        <div className="retrieval-controls">
          <label>
            策略
            <select
              aria-label="检索策略"
              value={strategy}
              onChange={(e) => update('strategy', e.target.value)}
            >
              <option value="baseline">基线：当前语料词法 AND</option>
              <option value="graph">基线 + 已审核关系</option>
              <option value="ranked">增强：分字段词法排序 + 全文</option>
            </select>
          </label>
          <label>
            检索对象
            <select
              aria-label="检索对象"
              value={scope}
              onChange={(e) => update('scope', e.target.value)}
            >
              {Object.entries({
                all: '全部本地索引',
                metadata: '元数据 / 摘要',
                notes: '笔记 / 个人分析',
                evidence: '主张与证据',
                pdf: 'PDF 逐页原文',
              }).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            专题
            <select
              aria-label="研究查询专题"
              value={p.get('topic') || ''}
              onChange={(e) => update('topic', e.target.value)}
            >
              <option value="">全部专题</option>
              {workspace.dataset.topics.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            论文
            <select
              aria-label="研究查询论文"
              value={p.get('paperId') || ''}
              onChange={(e) => update('paperId', e.target.value)}
            >
              <option value="">全部论文</option>
              {workspace.dataset.papers
                .filter((x) => x.lifecycle !== 'archived')
                .map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.acronym || x.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="coverage">
          当前本地库 {workspace.dataset.papers.filter((x) => x.lifecycle !== 'archived').length}{' '}
          篇；{new Set((workspace.documents || []).map((d) => d.paperId)).size}{' '}
          篇有逐页全文。未解析原文不计入 PDF 检索；表格 / 图片无结构化索引。 三种 V2
          策略使用相同语料范围；增强为词法排序和实体别名，不含向量或语义模型。
        </p>
        <details>
          <summary>本次范围内尚未解析的论文（{result.coverage.unparsedPaperIds.length}）</summary>
          <p>
            {result.coverage.unparsedPaperIds.map((id) => find(id)?.acronym || id).join('、') ||
              '无'}
          </p>
        </details>
      </section>
      {!q ? (
        <section className="panel padded">
          <h2>围绕一个可核验的问题</h2>
          <p>
            例如：action token、diffusion、low-rank
            adaptation、记忆。先看命中范围，再检查原文是否支持你的判断。
          </p>
        </section>
      ) : (
        <>
          <p className="query-count">
            {result.direct.length} 个直接片段 · {result.expanded.length} 个关系扩展结果
          </p>
          {[...result.direct.map((r) => ({ ...r, direct: true })), ...result.expanded].map(
            (r, i) => {
              const e = r.evidenceId && ev(r.evidenceId);
              return (
                <article className="search-result" key={i}>
                  <div className="row between">
                    <a
                      className="result-title"
                      href={href(
                        '/paper/' + r.paperId,
                        r.evidenceId ? { evidence: r.evidenceId } : {},
                      )}
                    >
                      {find(r.paperId)?.acronym || find(r.paperId)?.title || r.paperId}
                    </a>
                    <span className="badge">
                      {r.direct ? '直接命中' : '审核关系扩展'} · {r.sourceType || '笔记 / 证据'}
                    </span>
                  </div>
                  <p>{r.text}</p>
                  <p className="muted">
                    命中依据：{r.reason || '查询词匹配已入库内容'}
                    {r.via ? '；从 ' + r.via + ' 扩展' : ''}
                  </p>
                  {e && (
                    <p className="badge">
                      {kindNames[e.kind]} ·{' '}
                      {e.status === 'verified' ? '已核验出处' : '未核验，不作为确认结论'}
                    </p>
                  )}
                  <div className="meta">
                    {r.documentId && r.pageIndex && (
                      <a href={href('/document/' + r.documentId, { page: r.pageIndex })}>
                        核对 PDF 文件第 {r.pageIndex} 页
                      </a>
                    )}
                    {e?.documentId && e.pageIndex && (
                      <a href={href('/document/' + e.documentId, { page: e.pageIndex })}>
                        原文文件第 {e.pageIndex} 页
                      </a>
                    )}
                    {e?.url && (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        证据来源
                      </a>
                    )}
                    <a href={href('/graph', { node: r.paperId, hops: 2 })}>检查关系依据</a>
                  </div>
                </article>
              );
            },
          )}
          {!result.direct.length && !result.expanded.length && (
            <div className="empty">
              <h2>当前范围内证据不足</h2>
              <p>
                没有生成答案。检查未解析论文、改用原文术语或补充来源；这不意味着整个领域没有相关研究。
              </p>
            </div>
          )}
        </>
      )}
      <details className="panel padded">
        <summary>同一问题的三策略对照（仅库内结果，不作质量排名）</summary>
        <table className="benchmark-table">
          <thead>
            <tr>
              <th>策略</th>
              <th>直接片段</th>
              <th>扩展结果</th>
              <th>直接命中论文</th>
            </tr>
          </thead>
          <tbody>
            {['baseline', 'graph', 'ranked'].map((s) => {
              const r = enhancedSearch({ ...workspace.dataset, scope: 'local' }, q, {
                strategy: s,
                scope,
                documents: workspace.documents || [],
                topic: p.get('topic'),
                paperId: p.get('paperId'),
              });
              return (
                <tr key={s}>
                  <td>{s}</td>
                  <td>{r.direct.length}</td>
                  <td>{r.expanded.length}</td>
                  <td>
                    {[...new Set(r.direct.map((x) => find(x.paperId)?.acronym || x.paperId))].join(
                      '、',
                    ) || '无'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="footnote">
          返回更多结果不代表更相关。三种策略使用同一语料范围；数量差异不能解释为准确率。V1
          原始笔记基线保留在“可选模型问答”页。
        </p>
      </details>
    </>
  );
}
export function TopicResearch({ topic, workspace, Md, local = false }) {
  const visibleIds = new Set(
    workspace.dataset.papers.filter((p) => p.lifecycle !== 'archived').map((p) => p.id),
  );
  workspace = {
    ...workspace,
    dataset: {
      ...workspace.dataset,
      evidence: workspace.dataset.evidence.filter((e) => visibleIds.has(e.paperId)),
    },
  };
  const sources = [...new Set(topic.evidenceIds || [])]
    .map((id) => workspace.dataset.evidence.find((item) => item.id === id))
    .filter(Boolean);
  return (
    <section className="panel padded">
      {topic.analysis && (
        <>
          <h2>专题分析</h2>
          <Md>{topic.analysis}</Md>
        </>
      )}
      {topic.gaps?.length > 0 && (
        <>
          <h3>待深入的问题</h3>
          <ul>
            {topic.gaps.map((gap, index) => (
              <li key={index}>{gap}</li>
            ))}
          </ul>
        </>
      )}
      <TopicMatrix
        topic={topic}
        dataset={workspace.dataset}
        dimensions={dimensions}
        local={local}
      />
      {sources.length > 0 && (
        <details className="topic-source-details">
          <summary>代表性来源 ({sources.length})</summary>
          {sources.map((e) => {
            const sourcePaper = workspace.dataset.papers.find((paper) => paper.id === e.paperId);
            return (
              <div className="source-note" key={e.id}>
                <p>{e.text}</p>
                <a href={href('/paper/' + e.paperId, { evidence: e.id })}>
                  {sourcePaper?.acronym || sourcePaper?.title || '打开论文'} ·{' '}
                  {e.status === 'verified' ? '已核验来源' : '待核查来源'}
                </a>
              </div>
            );
          })}
        </details>
      )}
      <div className="row wrap">
        <button
          className="button"
          onClick={() =>
            fileDownload(
              topic.id + '-research.md',
              `# ${topic.title}\n\n人工综合；不是领域穷尽结论。\n\n${topic.analysis || ''}\n\n## 分歧与库内空白\n${(topic.gaps || []).map((g) => '- ' + g).join('\n')}\n\n## 来源与支持范围\n${sources
                .map(
                  (e) =>
                    `- [${e.id}] ${kindNames[e.kind]} / ${e.status}: ${e.text}\n  ${e.url || '来源未提供'}；${e.locator || '位置未提供'}`,
                )
                .join('\n\n')}`,
            )
          }
        >
          导出研究材料
        </button>
      </div>
    </section>
  );
}
