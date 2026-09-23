import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  LayoutDashboard,
  Library,
  Layers,
  Network,
  Columns3,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  FileText,
  Download,
  Check,
  Clipboard,
  PanelLeft,
  GitBranch,
  Filter,
  X,
  ExternalLink,
  Database,
  Clock,
  ChevronRight,
  Settings,
  ZoomIn,
  ZoomOut,
  LocateFixed,
} from 'lucide-react';
import seedData from './generated/public.json';
import { normalizePaper, readingContext } from './lib/knowledge.mjs';
import {
  AssociationEditor,
  PaperEditor,
  WorkspaceManager,
  DocumentPanel,
  DocumentReader,
  ResearchSearch,
  TopicResearch,
  workspaceRequest,
  dimensions,
} from './workspace.jsx';
import './workspace.css';
import { entityKinds } from './lib/entities.mjs';
const EntitiesPage = lazy(() =>
  import('./entities.jsx').then((module) => ({ default: module.EntitiesPage })),
);
const DatabasePage = lazy(() =>
  import('./database.jsx').then((module) => ({ default: module.DatabasePage })),
);
let data = seedData;
import config from '../site.config.json';
import {
  filterPapers,
  retrieve,
  graphNeighborhood,
  comparisonMarkdown,
  awesomeMarkdown,
  statistics,
} from './lib/knowledge.mjs';
import 'katex/dist/katex.min.css';
import './styles.css';
import { AppShell, WorkbenchHome } from './ui.jsx';
import { DraftInbox } from './drafts.jsx';
import './ui.css';
import { ParallelReader, ReaderNotes, NoteOutline } from './reading.jsx';
const statusLabels = { unread: '待阅读', reading: '阅读中', reviewed: '已整理' };
const kinds = { paper: '论文', topic: '主题', ...entityKinds };
const originLabels = {
  source: '原文支持',
  curator: '人工归纳',
  model: '模型候选',
  similarity: '相似度关联',
};
const reviewLabels = { approved: '已审核', pending: '待审核', rejected: '已拒绝' };
const relationLabels = {
  cites: '引用（不代表采用）',
  studies: '研究问题',
  uses: '采用 / 使用',
  extends: '明确扩展',
  related: '相关',
};
const evidenceKinds = {
  source: '原文归纳',
  note: '整理者归纳',
  model: '模型辅助',
  unverified: '待核实',
};
let allEntities = [...data.papers, ...data.topics, ...data.concepts];
const entity = (id) => allEntities.find((x) => x.id === id);
const paper = (id) => data.papers.find((x) => x.id === id);
const title = (id) => entity(id)?.acronym || entity(id)?.title || id;
const link = (path, params = {}) =>
  '#' +
  path +
  (Object.entries(params).some(([, v]) => v !== '' && v !== undefined)
    ? '?' +
      new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined))
    : '');
const entityLink = (id) =>
  link(
    paper(id)
      ? '/paper/' + id
      : data.topics.some((t) => t.id === id)
        ? '/topic/' + id
        : '/concept/' + id,
  );
const go = (path, params) => {
  const next = link(path, params);
  if (location.hash === next) return;
  history.pushState(null, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};
function readRoute() {
  const raw = location.hash.slice(1) || '/';
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}
function download(name, text, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const unknown = (v) => v || '未知 / 未整理';
function NoteImage({ src, alt }) {
  const [show, setShow] = useState(false);
  return (
    <span className="note-image">
      {show ? (
        <>
          <img src={src} alt={alt || '笔记插图'} loading="lazy" />
          <small>{alt}</small>
        </>
      ) : (
        <button onClick={() => setShow(true)}>加载插图：{alt || '原文图片'} ↗</button>
      )}
    </span>
  );
}
function Md({ children }) {
  return (
    <div className="markdown">
      <Markdown
        components={{
          img: ({ alt, src }) => <NoteImage alt={alt} src={src} />,
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer">
              {children}
            </a>
          ),
        }}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children || '尚未整理正文。'}
      </Markdown>
    </div>
  );
}
function Badge({ children, tone = '' }) {
  return <span className={'badge ' + tone}>{children}</span>;
}
function Empty({ title = '没有找到结果', children }) {
  return (
    <div className="empty">
      <Search size={30} />
      <h3>{title}</h3>
      <p>{children || '试试更短的关键词，或清空筛选条件。'}</p>
    </div>
  );
}
function Heading({ eyebrow, title, children, actions }) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      <div className="heading-actions">{actions}</div>
    </header>
  );
}
function PaperTitle({ p }) {
  return (
    <>
      <span className="paper-short">{p.acronym || p.id}</span>
      <span className="paper-title">{p.title}</span>
    </>
  );
}
function Topics({ ids = [] }) {
  return (
    <div className="tags">
      {ids.map((id) => (
        <a className="tag" href={link('/topic/' + id)} key={id}>
          {title(id)}
        </a>
      ))}
    </div>
  );
}
function Evidence({ e }) {
  return (
    <article id={'evidence-' + e.id} className="evidence">
      <div className="row between">
        <Badge tone={e.status === 'verified' ? 'green' : 'amber'}>
          {evidenceKinds[e.kind]} · {e.status === 'verified' ? '已核验' : '待核验'}
        </Badge>
        <span className="evidence-label">来源</span>
      </div>
      <p>{e.text}</p>
      <div className="meta">
        {e.locator || '未提供精确页码 / 章节定位'}
        {data.scope === 'local' && e.documentId && e.pageIndex && (
          <a href={link('/document/' + e.documentId, { page: e.pageIndex })}>
            核对 PDF 文件第 {e.pageIndex} 页
          </a>
        )}
        {e.url && (
          <a href={e.url} target="_blank" rel="noreferrer">
            查看来源 <ExternalLink size={13} />
          </a>
        )}
      </div>
    </article>
  );
}
function App() {
  const [workspace, setWorkspace] = useState(null),
    [workspaceError, setWorkspaceError] = useState('');
  const refresh = async () => {
    try {
      const next = await workspaceRequest('/api/workspace');
      setWorkspace(next);
      setWorkspaceError('');
      return next;
    } catch (e) {
      setWorkspaceError(e.message);
      throw e;
    }
  };
  useEffect(() => {
    if (window.__PKH_LOCAL__) refresh().catch(() => {});
  }, []);
  const raw = workspace?.dataset || seedData;
  data = {
    ...raw,
    papers: raw.papers.map(normalizePaper).filter((p) => p.lifecycle !== 'archived'),
    concepts: raw.concepts.filter((c) => c.lifecycle !== 'archived'),
    topics: raw.topics.map((t) => ({ dimensions: [], branches: [], questions: [], ...t })),
  };
  const liveIds = new Set([...data.papers, ...data.topics, ...data.concepts].map((x) => x.id));
  data.evidence = raw.evidence.filter((e) => liveIds.has(e.paperId));
  data.relations = raw.relations.filter((r) => liveIds.has(r.source) && liveIds.has(r.target));
  allEntities = [...data.papers, ...data.topics, ...data.concepts];
  const [route, setRoute] = useState(readRoute),
    [toast, setToast] = useState('');
  const [selected, setSelected] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem(window.__PKH_LOCAL__ ? 'pkh-local-compare' : 'pkh-compare') || '[]',
      )
        .filter((id) => typeof id === 'string')
        .slice(0, config.display.maxCompare);
    } catch {
      return [];
    }
  });
  useEffect(() => {
    let previous = location.hash || '#/';
    const positions = new Map();
    const remember = () => positions.set(previous, window.scrollY);
    const change = () => {
      const navigation = new Event('pkh-before-navigate', { cancelable: true });
      if (!window.dispatchEvent(navigation)) {
        history.replaceState(null, '', previous);
        return;
      }
      remember();
      previous = location.hash || '#/';
      setRoute(readRoute());
      requestAnimationFrame(() => window.scrollTo(0, positions.get(previous) || 0));
    };
    addEventListener('hashchange', change);
    return () => removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.title = config.name;
    try {
      localStorage.setItem(
        window.__PKH_LOCAL__ ? 'pkh-local-compare' : 'pkh-compare',
        JSON.stringify(selected),
      );
    } catch {}
  }, [selected]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const toggle = (id) => {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id));
    else if (selected.length < config.display.maxCompare) setSelected([...selected, id]);
    else setToast(`最多比较 ${config.display.maxCompare} 篇论文。`);
  };
  const props = {
    route,
    selected,
    toggle,
    setSelected,
    notify: setToast,
    workspace,
    refresh,
    Md,
    config,
  };
  if (route.path === '/library' || route.path === '/database')
    sessionStorage.setItem('pkh-library-route', location.hash);
  if (window.__PKH_LOCAL__ && !workspace)
    return (
      <main className="panel padded">
        <h1>{workspaceError ? '无法读取本地主库' : '正在读取本地主库…'}</h1>
        <p role="alert">{workspaceError}</p>
        <p>
          请先运行 npm run workspace -- init --write，再启动本地服务。读取失败不会回退到示例数据。
        </p>
        <button onClick={() => refresh().catch(() => {})}>重试</button>
      </main>
    );
  let page =
    workspace && route.path === '/drafts' ? (
      <DraftInbox {...props} />
    ) : workspace && route.path === '/associations' ? (
      <>
        <Heading title="整理研究关联" eyebrow="CONNECTIONS" />
        <AssociationEditor
          {...props}
          key={route.params.toString()}
          collection={route.params.get('collection') || 'relations'}
          initialId={route.params.get('id') || ''}
          paperId={route.params.get('paper') || ''}
        />
      </>
    ) : workspace && route.path.startsWith('/edit/') ? (
      <PaperEditor
        {...props}
        key={route.path}
        id={route.path.slice(6) === 'new' ? undefined : route.path.slice(6)}
      />
    ) : workspace && route.path.startsWith('/document/') ? (
      <DocumentReader {...props} id={route.path.slice(10)} page={route.params.get('page')} />
    ) : workspace && route.path === '/research' ? (
      <ResearchSearch {...props} />
    ) : route.path === '/entities' ||
      route.path.startsWith('/entities/') ||
      route.path.startsWith('/concept/') ? (
      <Suspense fallback={<p role="status">正在打开研究对象…</p>}>
        <EntitiesPage
          {...props}
          workspace={workspace || { dataset: data, readOnly: true }}
          key={route.path + (route.params.get('edit') || '')}
          route={{ ...route, path: route.path.replace('/concept/', '/entities/') }}
        />
      </Suspense>
    ) : workspace && route.path === '/database' ? (
      <Suspense fallback={<p role="status">正在打开数据库…</p>}>
        <DatabasePage {...props} key={route.params.get('view') || 'default'} />
      </Suspense>
    ) : route.path === '/library' ? (
      <LibraryPage {...props} />
    ) : route.path.startsWith('/paper/') ? (
      <PaperPage {...props} />
    ) : route.path === '/topics' || route.path.startsWith('/topic/') ? (
      <TopicPage {...props} />
    ) : route.path === '/graph' ? (
      <GraphPage {...props} />
    ) : route.path === '/compare' ? (
      <ComparePage {...props} />
    ) : route.path === '/query' ? (
      <QueryPage {...props} />
    ) : route.path === '/manage' ? (
      workspace ? (
        <WorkspaceManager {...props} />
      ) : (
        <ManagePage {...props} />
      )
    ) : route.path === '/' ? (
      <WorkbenchHome dataset={data} workspace={workspace} />
    ) : (
      <Empty title="页面不存在">
        <a href="#/">返回研究概览</a>
      </Empty>
    );
  return (
    <AppShell
      {...{ route, workspace, selected, refresh }}
      dataset={data}
      toast={toast}
      clearSelection={() => setSelected([])}
    >
      {workspaceError && <p role="alert">{workspaceError}</p>}
      {page}
    </AppShell>
  );
}

function Filters({ route, queryLabel = '搜索标题、简称、作者、标签或笔记' }) {
  const p = route.params;
  const update = (key, value) => {
    const n = new URLSearchParams(p);
    value ? n.set(key, value) : n.delete(key);
    n.delete('page');
    go(route.path, Object.fromEntries(n));
  };
  return (
    <div className="filters">
      <label className="search-input">
        <Search size={18} />
        <input
          aria-label={queryLabel}
          placeholder={queryLabel}
          value={p.get('q') || ''}
          onChange={(e) => update('q', e.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">主题</span>
        <select
          aria-label="主题"
          value={p.get('topic') || ''}
          onChange={(e) => update('topic', e.target.value)}
        >
          <option value="">所有主题</option>
          {data.topics.map((t) => (
            <option value={t.id} key={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      <select
        aria-label="年份"
        value={p.get('year') || ''}
        onChange={(e) => update('year', e.target.value)}
      >
        <option value="">所有年份</option>
        {[...new Set(data.papers.map((p) => p.year))]
          .sort((a, b) => b - a)
          .map((y) => (
            <option key={y}>{y}</option>
          ))}
      </select>
      <select
        aria-label="阅读状态"
        value={p.get('status') || ''}
        onChange={(e) => update('status', e.target.value)}
      >
        <option value="">所有状态</option>
        {Object.entries(statusLabels).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <button className="text-button" onClick={() => go(route.path)}>
        清空筛选
      </button>
    </div>
  );
}
function LibraryPage({ route, selected, toggle, workspace }) {
  const [focus, setFocus] = useState(route.params.get('focus') || '');
  const facets = Object.fromEntries(
    [...route.params].filter(([k]) => k.startsWith('facet.')).map(([k, v]) => [k.slice(6), v]),
  );
  let papers = filterPapers(data, { ...Object.fromEntries(route.params), facets });
  if (route.params.get('missing')) papers = papers.filter((p) => !p.evaluation || !p.limitations);
  const page = Math.max(
      1,
      Math.min(
        Math.ceil(papers.length / config.display.pageSize) || 1,
        Number(route.params.get('page')) || 1,
      ),
    ),
    slice = papers.slice((page - 1) * config.display.pageSize, page * config.display.pageSize);
  useEffect(() => {
    if (!focus || !papers.some((p) => p.id === focus)) setFocus(slice[0]?.id || '');
  }, [route.params.toString(), papers.length, focus, slice]);
  const active = papers.find((p) => p.id === focus) || slice[0];
  const setCollection = (params) => go('/library', { ...params, page: '', focus: '' });
  const citation = active
    ? `${active.authors.join(', ')} (${active.year}). ${active.title}. ${active.url}`
    : '';
  return (
    <>
      <Heading
        eyebrow="PAPER LIBRARY"
        title="阅读桌"
        actions={
          <a className="button primary" href={workspace ? '#/edit/new' : '#/manage'}>
            <Plus size={16} /> 新增论文
          </a>
        }
      >
        从收藏、状态和全文线索开始，选中条目后在同一页面查看摘要、笔记和下一步操作。
      </Heading>
      <section className="panel">
        <Filters route={route} />
        {workspace && (
          <div className="local-filter">
            <label>
              记录阶段
              <select
                aria-label="记录阶段"
                value={route.params.get('lifecycle') || ''}
                onChange={(e) =>
                  go('/library', { ...Object.fromEntries(route.params), lifecycle: e.target.value })
                }
              >
                <option value="">草稿与已入库</option>
                <option value="draft">草稿</option>
                <option value="active">已入库</option>
              </select>
            </label>
            {Object.entries(dimensions).map(([dimension, label]) => (
              <label key={dimension}>
                {label}
                <select
                  aria-label={label + '筛选'}
                  value={route.params.get('facet.' + dimension) || ''}
                  onChange={(e) =>
                    go('/library', {
                      ...Object.fromEntries(route.params),
                      ['facet.' + dimension]: e.target.value,
                      page: '',
                      dimension: '',
                      entity: '',
                    })
                  }
                >
                  <option value="">全部</option>
                  {data.concepts
                    .filter((c) => c.dimension === dimension)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <div className="library-collections" aria-label="论文收藏视图">
          <span className="library-collections-label">快速视图</span>
          {[
            ['', '全部论文'],
            ['status=reading', '正在阅读'],
            ['status=unread', '待阅读'],
            ['missing=1', '待补内容'],
            ['status=reviewed', '已整理'],
          ].map(([query, label]) => {
            const href = query ? '/library?' + query : '/library';
            const activeQuery = query
              ? query.split('&').every(([k, v]) => route.params.get(k) === v)
              : !route.params.get('status') && !route.params.get('missing');
            return (
              <a className={activeQuery ? 'active' : ''} href={'#' + href} key={query || 'all'}>
                {label}
              </a>
            );
          })}
        </div>
        <div className="results-toolbar">
          <span>
            <b>{papers.length}</b> 篇论文 {route.params.get('missing') && <Badge>待补字段</Badge>}
          </span>
          <label>
            排序{' '}
            <select
              aria-label="排序"
              value={route.params.get('sort') || 'newest'}
              onChange={(e) =>
                go('/library', { ...Object.fromEntries(route.params), sort: e.target.value })
              }
            >
              <option value="newest">年份：最新优先</option>
              <option value="oldest">年份：最早优先</option>
              <option value="title">标题 A–Z</option>
              <option value="updated">最近更新</option>
            </select>
          </label>
        </div>
        {papers.length ? (
          <div className="reading-desk">
            <div className="reading-desk-list">
              <div className="reading-desk-list-head">
                <b>{papers.length} 篇文献</b>
                <span>{workspace ? '本地完整库' : '公开示例'}</span>
              </div>
              {slice.map((p) => (
                <article
                  className={'paper-row desk-paper ' + (active?.id === p.id ? 'selected' : '')}
                  key={p.id}
                >
                  <label className="select-paper">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={'选择比较 ' + (p.acronym || p.title)}
                    />
                  </label>
                  <button className="desk-paper-button" onClick={() => setFocus(p.id)}>
                    <span className="desk-paper-title">
                      <PaperTitle p={p} />
                    </span>
                    <span className="desk-paper-meta">
                      {p.year} · {statusLabels[p.status] || '未标记'}
                    </span>
                    <span className="desk-paper-summary">
                      {p.problem || p.abstract || '尚未整理摘要'}
                    </span>
                  </button>
                </article>
              ))}
            </div>
            <section className="reading-desk-detail" aria-label="选中文献速览">
              {active ? (
                <>
                  <div className="desk-detail-kicker">选中文献 · {active.year}</div>
                  <h2>{active.title}</h2>
                  <p className="authors">
                    {active.authors.slice(0, 5).join(', ')}
                    {active.authors.length > 5 ? ' et al.' : ''}
                  </p>
                  <div className="row wrap desk-detail-badges">
                    <Badge
                      tone={
                        active.status === 'reading'
                          ? 'blue'
                          : active.status === 'reviewed'
                            ? 'green'
                            : ''
                      }
                    >
                      {statusLabels[active.status]}
                    </Badge>
                    <Topics ids={active.topics} />
                  </div>
                  <div className="desk-detail-summary">
                    <h3>研究问题</h3>
                    <p>{active.problem || '尚未整理研究问题。'}</p>
                    <h3>方法概括</h3>
                    <p>{active.method || active.abstract || '打开详情补充方法。'}</p>
                  </div>
                  <div className="desk-detail-actions">
                    <a className="button primary" href={link('/paper/' + active.id)}>
                      打开阅读页 <ArrowUpRight size={15} />
                    </a>
                    <a className="button" href={link('/paper/' + active.id, { mode: 'source' })}>
                      PDF 与笔记
                    </a>
                    {workspace && (
                      <a className="button" href={link('/edit/' + active.id)}>
                        编辑记录
                      </a>
                    )}
                    <button
                      className="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(citation);
                      }}
                    >
                      复制引用
                    </button>
                  </div>
                  <div className="desk-detail-stats">
                    <span>
                      <b>{active.note ? active.note.length.toLocaleString() : 0}</b> 笔记字符
                    </span>
                    <span>
                      <b>
                        {(active.claimEvidence &&
                          Object.values(active.claimEvidence).flat().length) ||
                          0}
                      </b>{' '}
                      条主张证据
                    </span>
                    <span>
                      <b>
                        {
                          data.relations.filter(
                            (r) => r.source === active.id || r.target === active.id,
                          ).length
                        }
                      </b>{' '}
                      条关联
                    </span>
                  </div>
                </>
              ) : (
                <Empty title="选择一篇文献" />
              )}
            </section>
          </div>
        ) : (
          <Empty title="没有符合条件的文献" />
        )}
        {papers.length > config.display.pageSize && (
          <div className="pagination">
            <button
              disabled={page === 1}
              onClick={() =>
                go('/library', { ...Object.fromEntries(route.params), page: page - 1 })
              }
            >
              上一页
            </button>
            <span>
              {page} / {Math.ceil(papers.length / config.display.pageSize)}
            </span>
            <button
              disabled={page * config.display.pageSize >= papers.length}
              onClick={() =>
                go('/library', { ...Object.fromEntries(route.params), page: page + 1 })
              }
            >
              下一页
            </button>
          </div>
        )}
      </section>
    </>
  );
}
function PaperPage({ route, selected, toggle, notify, workspace, refresh }) {
  const requestedMode = route.params.get('mode');
  const readingMode = route.params.get('evidence')
    ? 'sources'
    : ['overview', 'note', 'source', 'config', 'sources'].includes(requestedMode)
      ? requestedMode
      : 'overview';
  const p =
    paper(route.path.slice(7)) ||
    (workspace?.dataset.papers.find((p) => p.id === route.path.slice(7)) &&
      normalizePaper(workspace.dataset.papers.find((p) => p.id === route.path.slice(7))));
  useEffect(() => {
    const ev = route.params.get('evidence');
    if (ev)
      setTimeout(
        () => document.getElementById('evidence-' + ev)?.scrollIntoView({ block: 'center' }),
        80,
      );
  }, [route.path, route.params.toString()]);
  if (!p) return <Empty title="论文不存在" />;
  const evidence = data.evidence.filter((e) => e.paperId === p.id),
    relations = data.relations.filter((r) => r.source === p.id || r.target === p.id);
  const reading = readingContext(p, {
    documents: workspace?.documents || [],
    topics: data.topics,
  });
  const cite = `${p.authors.join(', ')} (${p.year}). ${p.title}. ${p.url}`;
  return (
    <>
      <div className="backline">
        <a
          href={
            sessionStorage.getItem('pkh-library-route') || (workspace ? '#/database' : '#/library')
          }
        >
          论文库
        </a>
        <ChevronRight size={14} />
        <span>{p.acronym || p.id}</span>
      </div>
      <Heading
        eyebrow={`${p.year} / ${p.arxiv ? 'arXiv ' + p.arxiv : 'RESEARCH PAPER'}`}
        title={p.title}
        actions={
          <button onClick={() => toggle(p.id)} className="button">
            <Columns3 size={16} />
            {selected.includes(p.id) ? '移出比较' : '加入比较'}
          </button>
        }
      />
      <p className="detail-authors">{p.authors.join(', ')}</p>
      <div className="detail-toolbar">
        {workspace && (
          <>
            <a className="button primary" href={link('/edit/' + p.id)}>
              编辑论文
            </a>
            <Badge>
              {p.lifecycle === 'draft' ? '草稿' : p.lifecycle === 'archived' ? '已归档' : '已入库'}{' '}
              / {p.visibility === 'public' ? '允许公开' : '仅本地'}
            </Badge>
          </>
        )}
        <Badge tone="green">{statusLabels[p.status]}</Badge>
        <Topics ids={p.topics} />
        <a className="button small" href={p.url} target="_blank" rel="noreferrer">
          论文原文 <ExternalLink size={14} />
        </a>
        <button
          className="button small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(cite);
              notify('引用信息已复制');
            } catch {
              download(p.id + '-citation.txt', cite, 'text/plain');
              notify('无法访问剪贴板，已导出引用文件');
            }
          }}
        >
          <Clipboard size={14} />
          复制引用
        </button>
        <button
          className="button small"
          onClick={() =>
            download(
              p.id + '.md',
              `# ${p.title}\n\n${cite}\n\n## 研究速览\n\n${[
                ['研究问题', p.problem],
                ['方法概括', p.method],
                ['关键结论', p.conclusions],
                ['局限与边界', p.limitations],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => `**${label}**：${value}`)
                .join(
                  '\n\n',
                )}\n\n${p.note || ''}${workspace && p.personalAnalysis ? '\n\n## 个人分析（本地导出，未经验证）\n\n' + p.personalAnalysis : ''}\n\n## 证据\n\n${evidence.map((e) => `- [${e.id}] ${evidenceKinds[e.kind]} / ${e.status === 'verified' ? '已核验' : '待核验'}：${e.text}\n  来源：${e.url || '未提供来源（不可视为原文支持）'}；${e.locator || '定位未提供'}`).join('\n\n')}`,
            )
          }
        >
          <Download size={14} />
          导出笔记
        </button>
      </div>
      <nav className="reading-toolbar" aria-label="阅读模式">
        {[
          ['overview', '研究速览'],
          ['note', '阅读笔记'],
          ['source', '原文与笔记'],
          ['config', '研究配置'],
          ['sources', '来源与附件'],
        ].map(([mode, label]) => (
          <a
            key={mode}
            aria-current={readingMode === mode ? 'page' : undefined}
            href={link('/paper/' + p.id, { mode })}
          >
            {label}
          </a>
        ))}
      </nav>
      {readingMode === 'source' && (
        <>
          <ParallelReader
            key={p.id}
            paper={p}
            documents={workspace?.documents}
            Md={Md}
            local={Boolean(workspace)}
          />
          <ReaderNotes paper={p} local={Boolean(workspace)} />
        </>
      )}
      <div className="detail-grid">
        <div>
          <section
            id="research-summary"
            className="panel detail-summary"
            hidden={readingMode !== 'overview'}
          >
            <div className="section-heading">
              <h2>研究速览</h2>
              <span className="muted">整理者归纳 · 请结合原文</span>
            </div>
            {[
              { k: 'problem', l: '研究问题' },
              { k: 'method', l: '方法概括' },
              { k: 'conclusions', l: '关键结论' },
              { k: 'limitations', l: '局限与边界' },
            ].map((f) => (
              <div className="summary-field" key={f.k}>
                <h3>{f.l}</h3>
                <p>{unknown(p[f.k])}</p>
                {(p.claimEvidence?.[f.k] || []).slice(0, 1).map((id) => (
                  <a
                    className="claim-link"
                    key={id}
                    href={link('/paper/' + p.id, { evidence: id })}
                  >
                    来源 · {p.claimEvidence[f.k].length}
                  </a>
                ))}
              </div>
            ))}
            <details>
              <summary>任务、数据与评测条件</summary>
              {[
                'inputs',
                'outputs',
                'data',
                'tasks',
                'evaluation',
                'assumptions',
                'deployment',
                'memory',
                'worldModel',
                'platform',
              ].map((k) => (
                <div className="summary-field" key={k}>
                  <h3>{config.comparisonFields.find((f) => f.key === k)?.label || k}</h3>
                  <p>{unknown(p[k])}</p>
                  {(p.claimEvidence?.[k] || []).slice(0, 1).map((id) => (
                    <a
                      className="claim-link"
                      key={id}
                      href={link('/paper/' + p.id, { evidence: id })}
                    >
                      来源 · {p.claimEvidence[k].length}
                    </a>
                  ))}
                </div>
              ))}
            </details>
          </section>
          <section
            id="paper-config"
            className="panel paper-facets"
            hidden={readingMode !== 'config'}
          >
            <div className="section-heading">
              <div>
                <h2>研究配置</h2>
                <p className="muted">论文直接关联的对象；点击可回到方法、数据、任务或问题档案。</p>
              </div>
              {workspace && (
                <a className="button small" href={link('/edit/' + p.id)}>
                  整理配置
                </a>
              )}
            </div>
            <div className="paper-facet-grid">
              {Object.entries(dimensions).map(([dimension, label]) => {
                const ids = p.facets?.[dimension] || [];

                return (
                  <div className="paper-facet" key={dimension}>
                    <h3>{label}</h3>
                    <div className="tags">
                      {!ids.length && <span className="muted">未整理</span>}
                      {ids.map((id) => (
                        <a className="tag" href={entityLink(id)} key={id}>
                          {title(id)}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          {workspace && p.personalAnalysis && readingMode === 'note' && (
            <section className="panel padded">
              <details>
                <summary>我的判断 / 待验证 idea</summary>
                <Badge>个人分析 · 始终不进入公开构建</Badge>
                <Md>{p.personalAnalysis}</Md>
              </details>
            </section>
          )}
          <section id="paper-note" className="panel note-panel" hidden={readingMode !== 'note'}>
            <div className="section-heading">
              <h2>阅读笔记</h2>
              <span className="muted">方法、实验与深入讨论</span>
            </div>
            {readingMode === 'note' &&
              (p.note?.trim() ? (
                <Md>{p.note}</Md>
              ) : (
                <Empty title="尚未整理阅读笔记">
                  {workspace ? (
                    <a href={link('/edit/' + p.id)}>打开编辑器开始整理</a>
                  ) : (
                    '此论文尚未提供深入笔记。'
                  )}
                </Empty>
              ))}
          </section>
          <section id="paper-evidence" className="panel" hidden={readingMode !== 'sources'}>
            <div className="section-heading">
              <h2>
                证据与来源 <small>{evidence.length}</small>
              </h2>
            </div>
            {evidence.length ? (
              evidence.map((e) => <Evidence e={e} key={e.id} />)
            ) : (
              <Empty title="尚无证据记录">当前内容不能视为已核验结论。</Empty>
            )}
          </section>
        </div>
        <aside className="detail-aside">
          {(readingMode === 'note' || readingMode === 'source') && (
            <NoteOutline paper={p} mode={readingMode} />
          )}
          {workspace && readingMode === 'sources' && (
            <DocumentPanel paperId={p.id} workspace={workspace} refresh={refresh} notify={notify} />
          )}
          <section className="panel">
            <div className="section-heading">
              <h2>继续研究</h2>
            </div>
            <a
              className="button full"
              href={
                reading.topics.length === 1 ? link('/topic/' + reading.topics[0].id) : '#/topics'
              }
            >
              专题比较 <Columns3 size={16} />
            </a>
            <a className="button full" href={link('/graph', { node: p.id, hops: '1' })}>
              局部关系图 <ArrowUpRight size={16} />
            </a>
          </section>
          <section className="panel" hidden={readingMode !== 'config'}>
            <div className="section-heading">
              <h2>关联材料</h2>
              <Network size={18} />
            </div>
            {workspace && (
              <a className="button full" href={'#/associations?collection=relations&paper=' + p.id}>
                新增或编辑关联
              </a>
            )}
            {relations.length ? (
              relations.map((r) => (
                <div className="relation-mini" key={r.id}>
                  <span>
                    {relationLabels[r.type]} · {reviewLabels[r.status]}
                  </span>
                  <a href={entityLink(r.source === p.id ? r.target : r.source)}>
                    {title(r.source === p.id ? r.target : r.source)} <ChevronRight size={14} />
                  </a>
                </div>
              ))
            ) : (
              <p className="muted">尚无关联记录。</p>
            )}
          </section>
          <section className="panel info-panel" hidden={readingMode !== 'sources'}>
            <b>记录信息</b>
            <p>
              稳定 ID：{p.id}
              <br />
              版本：{p.version || '未记录'}
              <br />
              更新：{p.updated || '未记录'}
            </p>
            <p>阅读状态来自主数据。比较选择仅保存在当前浏览器。</p>
          </section>
        </aside>
      </div>
    </>
  );
}
function TopicPage({ route, workspace }) {
  const t = data.topics.find((t) => t.id === route.path.slice(7));
  if (route.path !== '/topics' && !t) return <Empty title="主题不存在" />;
  return (
    <>
      <Heading
        eyebrow="TOPICS & TAXONOMY"
        title={t ? t.title : '研究专题'}
        actions={
          workspace && (
            <a
              className="button primary"
              href={'#/associations?collection=topics' + (t ? '&id=' + t.id : '')}
            >
              {t ? '编辑专题' : '新建专题'}
            </a>
          )
        }
      >
        {t ? t.description : '以研究问题组织材料；支持多主题归属，不要求唯一分类树。'}
      </Heading>
      {!t ? (
        <div className="topic-grid">
          {data.topics.map((t, i) => (
            <a href={link('/topic/' + t.id)} className="panel topic-card" key={t.id}>
              <span className="eyebrow">TOPIC 0{i + 1}</span>
              <Layers size={24} />
              <h2>{t.title}</h2>
              <p>{t.description}</p>
              <div className="tags">
                {t.dimensions.map((d) => (
                  <span className="tag" key={d}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="row between">
                <b>{data.papers.filter((p) => p.topics.includes(t.id)).length} 篇论文</b>
                <ArrowUpRight size={19} />
              </div>
            </a>
          ))}
        </div>
      ) : (
        <>
          <TopicResearch
            topic={t}
            workspace={workspace || { dataset: data }}
            Md={Md}
            local={Boolean(workspace)}
          />
          <div className="overview-grid">
            <section className="panel padded">
              <h2>范围与分类维度</h2>
              <p>{t.description}</p>
              <div className="tags">
                {t.dimensions.map((d) => (
                  <Badge key={d}>{d}</Badge>
                ))}
              </div>
              <h3>方法分支</h3>
              <ul>
                {t.branches.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
            <section className="panel padded">
              <h2>关键比较问题</h2>
              <ul>
                {t.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <div className="callout">
                <b>分类边界 · 待核验</b>
                <p>{t.boundaries}</p>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>主题内论文</h2>
              <a href={link('/library', { topic: t.id })}>
                筛选与比较 <ArrowRight size={15} />
              </a>
            </div>
            {data.papers
              .filter((p) => p.topics.includes(t.id))
              .map((p) => (
                <a key={p.id} className="recent-row" href={entityLink(p.id)}>
                  <span className="year">{p.year}</span>
                  <div>
                    <PaperTitle p={p} />
                  </div>
                  <Badge>{statusLabels[p.status]}</Badge>
                  <ArrowUpRight size={16} />
                </a>
              ))}
          </section>
        </>
      )}

      <p className="footnote">专题连接已有资料；阶段性分析与来源证据可分别更新和回查。</p>
    </>
  );
}
function positionsForGraph(count) {
  return count > 7 ? 560 : 420;
}

function GraphPage({ route }) {
  const p = route.params,
    [edge, setEdge] = useState(null),
    [focus, setFocus] = useState(null),
    [hoverNode, setHoverNode] = useState(null),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    dragRef = useRef(null);
  const start = p.get('scope') === 'all' ? '*' : p.get('node') || data.papers[0]?.id || '',
    hops = Number(p.get('hops') || 1);
  const update = (k, v) =>
    go('/graph', {
      ...Object.fromEntries(p),
      [k]: v,
      ...(k === 'node' ? { scope: v === '*' ? 'all' : '', node: v === '*' ? '' : v } : {}),
    });
  const graph = graphNeighborhood(
    data,
    start === '*' ? allEntities.map((n) => n.id) : start,
    hops,
    {
      type: p.get('type'),
      nodeType: p.get('nodeType'),
    },
  );
  const pending = p.get('review') === 'pending';
  const edges = pending ? data.relations.filter((r) => r.status === 'pending') : graph.edges;
  useEffect(() => {
    setEdge(null);
    setFocus(null);
    setHoverNode(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [route.params.toString()]);
  const width = 860,
    height = Math.max(420, positionsForGraph(graph.nodes.length)),
    anchor = start === '*' ? null : start,
    positions = graph.nodes.map((n, i) => {
      if (n.id === anchor) return { ...n, x: width / 2, y: height / 2 - 12 };
      const rest = graph.nodes.filter((candidate) => candidate.id !== anchor),
        index = rest.findIndex((candidate) => candidate.id === n.id),
        radius = Math.min(285, 150 + rest.length * 10),
        angle = -Math.PI / 2 + (index / Math.max(rest.length, 1)) * Math.PI * 2;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * Math.min(radius * 0.62, 175) - 12,
      };
    }),
    chosen = edges.find((r) => r.id === edge),
    activeNode = focus || hoverNode;
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const dragStart = (event) => {
    if (event.target.closest('[role="button"]')) return;
    dragRef.current = { x: event.clientX, y: event.clientY, pan };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const dragMove = (event) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.pan.x + (event.clientX - dragRef.current.x) / zoom,
      y: dragRef.current.pan.y + (event.clientY - dragRef.current.y) / zoom,
    });
  };
  const dragEnd = () => {
    dragRef.current = null;
  };
  return (
    <>
      <Heading eyebrow="RELATION EXPLORER" title="关系探索">
        从一篇论文出发，查看有来源的联系。路径仅表示库内连接，不代表因果或技术演进。
      </Heading>
      <section className="panel graph-controls">
        <label>
          起点
          <select
            aria-label="关系起点"
            value={start}
            onChange={(e) => update('node', e.target.value)}
          >
            <option value="*">全库已审核关系</option>
            {allEntities.map((n) => (
              <option key={n.id} value={n.id}>
                {n.acronym || n.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          邻域
          <select
            aria-label="关联跳数"
            value={hops}
            onChange={(e) => update('hops', e.target.value)}
          >
            <option value="1">一跳关联</option>
            <option value="2">两跳关联</option>
          </select>
        </label>
        <label>
          关系类型
          <select
            aria-label="关系类型"
            value={p.get('type') || ''}
            onChange={(e) => update('type', e.target.value)}
          >
            <option value="">全部关系</option>
            {Object.entries(relationLabels).map(([id, t]) => (
              <option key={id} value={id}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          节点类型
          <select
            aria-label="节点类型"
            value={p.get('nodeType') || ''}
            onChange={(e) => update('nodeType', e.target.value)}
          >
            <option value="">全部节点</option>
            {Object.entries(kinds).map(([id, t]) => (
              <option key={id} value={id}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          审核状态
          <select
            aria-label="审核状态"
            value={pending ? 'pending' : 'approved'}
            onChange={(e) => update('review', e.target.value)}
          >
            <option value="approved">已审核邻域</option>
            <option value="pending">全部待审候选</option>
          </select>
        </label>
      </section>
      <div className="graph-layout">
        <section className="panel graph-panel">
          <div className="section-heading">
            <h2>{pending ? '待审核关系' : '已审核邻域'}</h2>
            <span className="muted">
              {pending
                ? `${edges.length} 条候选`
                : graph.nodes.length + ' 个节点 · ' + graph.edges.length + ' 条关系'}
            </span>
          </div>
          {pending ? (
            <div className="callout">
              <b>候选关系不进入图扩展</b>
              <p>下面展示全库待审核记录，请核对来源后在主数据中更新审核状态。</p>
            </div>
          ) : graph.nodes.length ? (
            <>
              <div className="graph-stage-toolbar" aria-label="图谱视图控制">
                <span className="muted">拖动画布 · 滚轮缩放 · 点击节点或连线查看上下文</span>
                <div className="graph-stage-actions">
                  <button
                    className="icon-button"
                    aria-label="缩小图谱"
                    onClick={() => setZoom((value) => Math.max(0.65, value - 0.15))}
                  >
                    <ZoomOut size={16} />
                  </button>
                  <output aria-label="图谱缩放比例">{Math.round(zoom * 100)}%</output>
                  <button
                    className="icon-button"
                    aria-label="放大图谱"
                    onClick={() => setZoom((value) => Math.min(1.8, value + 0.15))}
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button className="button small" onClick={resetView}>
                    <LocateFixed size={14} />
                    重置视图
                  </button>
                </div>
              </div>
              <div className="graph-scroll">
                <svg
                  ref={(node) => {
                    if (node) node.style.cursor = dragRef.current ? 'grabbing' : 'grab';
                  }}
                  viewBox={`0 0 ${width} ${height}`}
                  role="img"
                  aria-label="已审核关系图"
                  onPointerDown={dragStart}
                  onPointerMove={dragMove}
                  onPointerUp={dragEnd}
                  onPointerCancel={dragEnd}
                  onWheel={(event) => {
                    event.preventDefault();
                    setZoom((value) =>
                      Math.max(0.65, Math.min(1.8, value + (event.deltaY < 0 ? 0.08 : -0.08))),
                    );
                  }}
                >
                  <title>点击节点查看详情；拖动画布、滚轮缩放；边与关系列表均可键盘操作</title>
                  <defs>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="10"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#829ab1" />
                    </marker>
                  </defs>
                  <g
                    transform={`translate(${width / 2 + pan.x} ${height / 2 + pan.y}) scale(${zoom}) translate(${-width / 2} ${-height / 2})`}
                  >
                    {graph.edges.map((r) => {
                      const a = positions.find((n) => n.id === r.source),
                        b = positions.find((n) => n.id === r.target);
                      const dx = b.x - a.x,
                        dy = b.y - a.y;
                      const trim = Math.min(
                        90 / Math.max(Math.abs(dx), 0.001),
                        35 / Math.max(Math.abs(dy), 0.001),
                      );
                      const edgePath =
                        r.source === r.target
                          ? `M ${a.x + 160} ${a.y + 23} C ${a.x + 210} ${a.y - 55}, ${a.x + 70} ${a.y - 75}, ${a.x + 72.5} ${a.y - 13}`
                          : `M ${a.x + 72.5 + dx * trim} ${a.y + 23 + dy * trim} L ${b.x + 72.5 - dx * trim} ${b.y + 23 - dy * trim}`;
                      const connected = activeNode && [r.source, r.target].includes(activeNode);
                      return (
                        <g
                          key={r.id}
                          role="button"
                          tabIndex="0"
                          aria-label={
                            '查看关系 ' +
                            title(r.source) +
                            ' ' +
                            relationLabels[r.type] +
                            ' ' +
                            title(r.target)
                          }
                          onMouseEnter={() => setHoverNode(r.source)}
                          onMouseLeave={() => setHoverNode(null)}
                          onClick={() => setEdge(r.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setEdge(r.id);
                            }
                          }}
                        >
                          <path
                            d={edgePath}
                            className={'graph-edge ' + (edge === r.id ? 'selected' : '')}
                            markerEnd="url(#arrow)"
                            style={{ opacity: connected || !activeNode ? 1 : 0.18 }}
                          />
                          <path d={edgePath} stroke="transparent" strokeWidth="18" />
                          {(edge === r.id || hoverNode === r.source) && (
                            <circle className="graph-flow-dot" r="4">
                              <animateMotion dur="2.8s" repeatCount="indefinite" path={edgePath} />
                            </circle>
                          )}
                        </g>
                      );
                    })}
                    {positions.map((n) => {
                      const connected = activeNode
                        ? n.id === activeNode ||
                          graph.edges.some(
                            (r) =>
                              [r.source, r.target].includes(activeNode) &&
                              [r.source, r.target].includes(n.id),
                          )
                        : true;
                      return (
                        <g
                          key={n.id}
                          role="button"
                          tabIndex="0"
                          aria-label={'查看节点 ' + (n.acronym || n.title)}
                          onMouseEnter={() => setHoverNode(n.id)}
                          onMouseLeave={() => setHoverNode(null)}
                          onClick={() => {
                            setEdge(null);
                            setFocus(n.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setEdge(null);
                              setFocus(n.id);
                            }
                          }}
                          transform={`translate(${n.x},${n.y})`}
                          className={
                            'graph-node ' +
                            (n.id === start ? 'root' : '') +
                            ' ' +
                            (focus === n.id ? 'focused' : '')
                          }
                          style={{ opacity: connected ? 1 : 0.3 }}
                        >
                          <title>{n.acronym || n.title}</title>
                          <rect x="-15" y="-9" width="175" height="64" rx="10" />
                          <text x="0" y="12" className="graph-kind">
                            {kinds[n.nodeType]}
                          </text>
                          <text x="0" y="36">
                            {(n.acronym || n.title).length > 19
                              ? (n.acronym || n.title).slice(0, 18) + '…'
                              : n.acronym || n.title}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>
            </>
          ) : (
            <Empty title="当前筛选下没有节点" />
          )}
          <div className="graph-legend">
            <span className="legend-dot" /> 起点 <span className="legend-line" /> 有向关系 ·
            仅已审核关系用于检索
          </div>
        </section>
        <aside className="panel evidence-inspector">
          <div className="section-heading">
            <h2>{chosen ? '关系依据' : focus ? '节点详情' : '检查器'}</h2>
            <GitBranch size={18} />
          </div>
          {chosen ? (
            <div className="padded">
              <Badge tone={chosen.status === 'approved' ? 'green' : 'amber'}>
                {reviewLabels[chosen.status]}
              </Badge>
              <h3>{relationLabels[chosen.type]}</h3>
              <p>
                <a href={entityLink(chosen.source)}>{title(chosen.source)}</a> →{' '}
                <a href={entityLink(chosen.target)}>{title(chosen.target)}</a>
              </p>
              <p className="muted">生成方式：{originLabels[chosen.origin]}</p>
              {chosen.evidenceIds.length ? (
                chosen.evidenceIds.map((id) => {
                  const e = data.evidence.find((e) => e.id === id);
                  return (
                    e && (
                      <div className="inspector-evidence" key={id}>
                        <p>{e.text}</p>
                        <a href={link('/paper/' + e.paperId, { evidence: id })}>
                          打开证据 {id} <ArrowUpRight size={13} />
                        </a>
                      </div>
                    )
                  );
                })
              ) : (
                <p>尚无可靠证据；不得用于扩展检索。</p>
              )}
            </div>
          ) : focus ? (
            <div className="padded">
              <h3>{title(focus)}</h3>
              <p>
                {entity(focus)?.description || entity(focus)?.problem || '详细信息见记录正文。'}
              </p>
              <a className="button" href={entityLink(focus)}>
                打开详情 <ArrowUpRight size={15} />
              </a>
              <button className="button" onClick={() => update('node', focus)}>
                以此为起点
              </button>
            </div>
          ) : (
            <div className="padded muted">
              <Network size={32} />
              <p>点击节点查看实体。点击图中的连线，或下方关系条目，检查依据与审核状态。</p>
            </div>
          )}
        </aside>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>关系明细</h2>
          <span className="muted">可用键盘逐条检查</span>
        </div>
        {edges.length ? (
          edges.map((r) => (
            <button
              key={r.id}
              className={'edge-row ' + (edge === r.id ? 'chosen' : '')}
              onClick={() => setEdge(r.id)}
            >
              <span>{title(r.source)}</span>
              <Badge>{relationLabels[r.type]}</Badge>
              <span>{title(r.target)}</span>
              <small>
                {originLabels[r.origin]} · {reviewLabels[r.status]}
              </small>
              <ChevronRight size={15} />
            </button>
          ))
        ) : (
          <Empty title="当前论文没有匹配关系">
            可以调整跳数与类型，或在主数据中补充有证据的关系。
          </Empty>
        )}
      </section>
    </>
  );
}
function ComparePage({ route, selected, toggle, setSelected, workspace, refresh, notify }) {
  const [saveTopic, setSaveTopic] = useState(''),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState('');
  const saveComparison = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const topic = workspace.dataset.topics.find((t) => t.id === saveTopic);
      await workspaceRequest(
        '/api/records',
        {
          collection: 'topics',
          record: { ...topic, compareIds: ids },
          expectedRevision: workspace.revision,
        },
        workspace.csrfToken,
      );
      await refresh();
      notify('比较论文已保存到专题');
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const ids = route.params.has('ids')
    ? route.params
        .get('ids')
        .split(',')
        .filter((id) => paper(id))
        .slice(0, config.display.maxCompare)
    : selected;
  const papers = ids.map(paper);
  const change = (id) => {
    const next = ids.includes(id)
      ? ids.filter((x) => x !== id)
      : [...ids, id].slice(0, config.display.maxCompare);
    setSelected(next);
    go('/compare', { ids: next.join(',') });
  };
  return (
    <>
      <Heading
        eyebrow="CROSS-PAPER COMPARISON"
        title="跨论文比较"
        actions={
          <button
            className="button primary"
            disabled={!papers.length}
            onClick={() =>
              download(
                'paper-comparison.md',
                comparisonMarkdown(papers, config.comparisonFields) +
                  '\n## 依据与支持范围\n\n以下字段是整理者归纳；未绑定证据的字段仍需核查。相同数据集不代表评测可比。\n\n' +
                  papers
                    .map(
                      (p) =>
                        `### ${p.title}\n\n${Object.entries(p.claimEvidence || {})
                          .map(([key, ids]) => `${key}: ${ids.join(', ')}`)
                          .join('\n')}\n\n${data.evidence
                          .filter((e) => e.paperId === p.id)
                          .map(
                            (e) =>
                              `- [${e.id}] ${evidenceKinds[e.kind]} / ${e.status}: ${e.text}\n  ${e.url || '来源未知'}；${e.locator || '定位未知'}${e.documentId ? '；本地文档 ' + e.documentId + ' 文件页序 ' + e.pageIndex : ''}`,
                          )
                          .join('\n\n')}`,
                    )
                    .join('\n\n'),
              )
            }
          >
            <Download size={16} /> 导出 Markdown
          </button>
        }
      >
        保留任务和评测条件；不同实验协议不生成统一排名。空白信息显示为未知。
      </Heading>
      {workspace && (
        <section className="comparison-save">
          <label>
            保存到专题{' '}
            <select
              aria-label="保存比较的专题"
              value={saveTopic}
              onChange={(e) => setSaveTopic(e.target.value)}
            >
              <option value="">选择研究专题</option>
              {workspace.dataset.topics
                .filter((t) => t.visibility === 'private')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </label>
          <button disabled={!saveTopic || !papers.length || saving} onClick={saveComparison}>
            保存比较组合
          </button>
          {saveError && <p role="alert">{saveError}</p>}
        </section>
      )}
      <section className="panel padded">
        {data.scope === 'local' && papers.length > 0 && (
          <button
            className="button"
            onClick={() =>
              download(
                'awesome-review.md',
                '# 待人工审核的候选条目\n\n仅本地生成；未修改目标仓库 taxonomy，未推送。私有资料导出后请自行审查披露范围。\n\n' +
                  awesomeMarkdown(papers),
              )
            }
          >
            导出 Awesome 待审条目
          </button>
        )}
        <div className="compare-picker">
          {data.papers.map((p) => (
            <label key={p.id} className={ids.includes(p.id) ? 'selected' : ''}>
              <input
                type="checkbox"
                checked={ids.includes(p.id)}
                disabled={!ids.includes(p.id) && ids.length >= config.display.maxCompare}
                onChange={() => change(p.id)}
              />
              {p.acronym || p.id}
            </label>
          ))}
        </div>
        <p className="muted">
          已选 {papers.length} / {config.display.maxCompare} 篇；URL
          可分享，浏览器也会保存比较选择。
        </p>
      </section>
      {papers.length ? (
        <section className="panel table-scroll">
          <table className="comparison-table">
            <caption className="sr-only">论文方法比较</caption>
            <thead>
              <tr>
                <th>比较维度</th>
                {papers.map((p) => (
                  <th key={p.id}>
                    <a href={entityLink(p.id)}>{p.acronym || p.title}</a>
                    <small>
                      {p.year} · {statusLabels[p.status]}
                    </small>
                    <button
                      className="text-button"
                      aria-label={'移除 ' + (p.acronym || p.id)}
                      onClick={() => change(p.id)}
                    >
                      移除
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.comparisonFields.map((f) => (
                <tr key={f.key}>
                  <th scope="row">{f.label}</th>
                  {papers.map((p) => (
                    <td key={p.id} className={!p[f.key] ? 'unknown' : ''}>
                      {unknown(p[f.key])}
                      {(p.claimEvidence?.[f.key] || []).map((id) => (
                        <div key={id}>
                          <a href={link('/paper/' + p.id, { evidence: id })}>查看来源</a>
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">证据与原文</th>
                {papers.map((p) => (
                  <td key={p.id}>
                    <a href={entityLink(p.id)}>
                      查看笔记及证据 <ArrowUpRight size={13} />
                    </a>
                    <br />
                    <a href={p.url} target="_blank" rel="noreferrer">
                      原文来源
                    </a>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      ) : (
        <Empty title="选择论文开始比较">在上方或论文库中选择 2—4 篇论文。</Empty>
      )}
    </>
  );
}
function QueryPage({ route, workspace }) {
  const q = route.params.get('q') || '',
    expanded = route.params.get('expand') === '1',
    result = retrieve(
      workspace
        ? {
            ...data,
            scope: 'public',
            papers: data.papers.filter(
              (p) => p.visibility === 'public' && (p.lifecycle || 'active') === 'active',
            ),
            evidence: data.evidence.filter(
              (e) =>
                e.visibility === 'public' &&
                data.papers.some(
                  (p) =>
                    p.id === e.paperId &&
                    p.visibility === 'public' &&
                    (p.lifecycle || 'active') === 'active',
                ),
            ),
            relations: data.relations.filter((r) => r.visibility === 'public'),
          }
        : data,
      q,
      {
        ...Object.fromEntries(route.params),
        expand: expanded,
        relationType: route.params.get('type') || undefined,
      },
    );
  const [model, setModel] = useState(null),
    [consent, setConsent] = useState(false),
    [answer, setAnswer] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const activeRequest = useRef(null);
  useEffect(() => {
    fetch(new URL('api/status', location.href.split('#')[0]))
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => setModel(x?.configured === true))
      .catch(() => setModel(false));
  }, []);
  useEffect(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(false);
    setAnswer(null);
    setError('');
    return () => activeRequest.current?.abort();
  }, [route.params.toString()]);
  const ask = async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError('');
    setAnswer(null);
    try {
      const res = await fetch(new URL('api/ask', location.href.split('#')[0]), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workspace ? { 'X-Workspace-Token': workspace.csrfToken } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          question: q,
          expand: expanded,
          consent,
          filters: {
            topic: route.params.get('topic') || '',
            year: route.params.get('year') || '',
            status: route.params.get('status') || '',
            relationType: route.params.get('type') || '',
          },
        }),
      });
      const value = await res.json();
      if (!res.ok) throw Error(value.error || '服务错误');
      if (activeRequest.current === controller) setAnswer(value);
    } catch (e) {
      if (e.name !== 'AbortError' && activeRequest.current === controller) setError(e.message);
    } finally {
      if (activeRequest.current === controller) setBusy(false);
    }
  };
  const Result = ({ r, isExpanded }) => (
    <article className="search-result">
      <div className="row between">
        <a
          className="result-title"
          href={link('/paper/' + r.paperId, r.evidenceId ? { evidence: r.evidenceId } : {})}
        >
          {title(r.paperId)} <ArrowUpRight size={15} />
        </a>
        <Badge tone={isExpanded ? 'blue' : 'green'}>{isExpanded ? '关系扩展' : '直接命中'}</Badge>
      </div>
      <p>{r.text}</p>
      {r.evidenceId &&
        (() => {
          const e = data.evidence.find((e) => e.id === r.evidenceId);
          return e ? (
            <Badge tone={e.status === 'verified' ? 'green' : 'amber'}>
              {evidenceKinds[e.kind]} · {e.status === 'verified' ? '已核验' : '待核验'}
            </Badge>
          ) : null;
        })()}
      <div className="meta">
        {r.evidenceId ? (
          <a href={link('/paper/' + r.paperId, { evidence: r.evidenceId })}>打开来源</a>
        ) : (
          <span>来自入库笔记 / 元数据；暂无独立来源</span>
        )}
        {isExpanded && (
          <a href={link('/graph', { node: r.via, hops: 2 })}>
            从 {title(r.via)} 扩展 · {r.relationId}
          </a>
        )}
        <a href={link('/graph', { node: r.paperId })}>相关关系</a>
      </div>
    </article>
  );
  return (
    <>
      <Heading eyebrow="EVIDENCE SEARCH" title="查询与证据">
        确定性关键词检索，不生成假定答案。支持中文词组和英文缩写；多个词按 AND 匹配。
        {workspace && '此页只检索允许公开的记录；私有材料请使用“研究查询”。'}
      </Heading>
      <section className="panel">
        <Filters route={route} queryLabel="输入关键词，如 VLA、记忆、latent dynamics" />
        <div className="query-options">
          <label>
            <input
              type="checkbox"
              checked={expanded}
              onChange={(e) =>
                go('/query', {
                  ...Object.fromEntries(route.params),
                  expand: e.target.checked ? '1' : '',
                })
              }
            />
            沿已审核关系扩展（最多两跳）
          </label>
          <select
            aria-label="扩展关系类型"
            value={route.params.get('type') || ''}
            onChange={(e) =>
              go('/query', { ...Object.fromEntries(route.params), type: e.target.value })
            }
          >
            <option value="">全部已审核关系</option>
            {Object.entries(relationLabels).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </section>
      <div className="query-layout">
        <section>
          {q ? (
            <>
              <div className="query-count">
                <b>{new Set(result.direct.map((r) => r.paperId)).size}</b> 篇直接命中 ·{' '}
                <b>{result.expanded.length}</b> 篇关系扩展{' '}
                <span>{result.evidence.length} 条返回证据</span>
              </div>
              {result.direct.length ? (
                result.direct.map((r, i) => <Result r={r} key={'d' + i} />)
              ) : (
                <Empty title="没有找到证据">没有生成回答。缩短关键词或调整结构化条件后重试。</Empty>
              )}
              {result.expanded.length > 0 && (
                <>
                  <h2 className="subsection">关系扩展结果</h2>
                  <p className="muted">这些论文不一定包含查询词；连接不表示它们支持同一结论。</p>
                  {result.expanded.map((r, i) => (
                    <Result r={r} isExpanded key={'e' + i} />
                  ))}
                </>
              )}
            </>
          ) : (
            <section className="panel padded">
              <h2>从一个研究线索开始</h2>
              <div className="example-queries">
                {['VLA', '记忆', 'latent dynamics', 'OpenVLA'].map((s) => (
                  <a key={s} href={link('/query', { q: s })}>
                    <Search size={16} />
                    {s}
                    <ArrowRight size={16} />
                  </a>
                ))}
              </div>
              <p className="muted">检索覆盖已入库字段和笔记，未抓取的 PDF 正文不在索引中。</p>
            </section>
          )}
        </section>
        <aside className="panel model-panel">
          <div className="section-heading">
            <h2>可选 · 证据问答</h2>
            <Badge>{model ? '已配置' : '未配置'}</Badge>
          </div>
          <div className="padded">
            <p>检索器先返回证据，本地网关再调用你配置的模型。关键词检索不等于语义搜索。</p>
            {model ? (
              <>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  同意把当前查询及最多 8 条公开、已核验证据发送至本地网关配置的模型提供方。
                </label>
                <button
                  className="button primary full"
                  disabled={!consent || busy || !result.evidence.length}
                  onClick={ask}
                >
                  {busy ? '请求中…' : '基于证据生成回答'}
                </button>
              </>
            ) : (
              <div className="callout">
                <b>基础检索可直接使用</b>
                <p>
                  可选增强：配置服务端 .env，构建后运行 <code>npm run serve:ai</code>{' '}
                  并打开网关网址。
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {answer && (
              <div className="model-answer">
                <Md>{answer.answer}</Md>
                <h3>本次实际发送的证据</h3>
                {answer.evidence.map((e) => (
                  <div key={e.id}>
                    <a href={link('/paper/' + e.paperId, { evidence: e.id })}>[{e.id}]</a>
                    <p>{e.text}</p>
                  </div>
                ))}
                <p className="footnote">引用 ID 已检查；这不等于自动验证每个结论受到证据支持。</p>
              </div>
            )}
            <p className="footnote">
              密钥仅留在服务端。静态版无模型 API、无自动问答；本项目未实现完整 GraphRAG 流水线。
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
const blank = {
  id: '',
  title: '',
  authors: '',
  year: new Date().getFullYear(),
  url: '',
  status: 'unread',
  topics: [],
  note: '',
};
function ManagePage() {
  return (
    <>
      <Heading title="打开本地工作空间" eyebrow="LOCAL WORKSPACE">
        公开阅读模式不保存个人资料。运行本地服务后，可以编辑、审阅草稿与管理附件。
      </Heading>
      <section className="panel padded">
        <h2>本地启动</h2>
        <pre>
          npm run workspace -- init --write{`\n`}npm run build{`\n`}npm run local
        </pre>
        <a className="button primary" href="http://127.0.0.1:4176/">
          打开本地工作台
        </a>
      </section>
    </>
  );
}
createRoot(document.getElementById('root')).render(<App />);
