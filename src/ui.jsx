import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Database,
  Layers,
  Compass,
  Settings,
  Plus,
  Search,
  PanelLeft,
  X,
  ArrowUpRight,
  FileText,
  Network,
  Inbox,
  ArrowRight,
} from 'lucide-react';
export const objectHref = (collection, id) =>
  collection === 'papers'
    ? '#/paper/' + id
    : collection === 'topics'
      ? '#/topic/' + id
      : collection === 'concepts'
        ? '#/entities/' + id
        : '#/associations?collection=' + collection + '&id=' + id;
export function PageHeader({ label, title, description, actions }) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{label}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{actions}</div>
    </header>
  );
}
export function SectionNav({ items, active, label }) {
  return (
    <nav className="section-nav" aria-label={label}>
      {items.map(([path, name]) => (
        <a key={path} href={path} aria-current={active === path ? 'page' : undefined}>
          {name}
        </a>
      ))}
    </nav>
  );
}
export function AppShell({
  route,
  workspace,
  dataset,
  children,
  selected,
  clearSelection,
  toast,
  refresh,
}) {
  const [menu, setMenu] = useState(false),
    [create, setCreate] = useState(false);
  const path = route.path;
  const area =
    path === '/' || path === '/drafts'
      ? 'home'
      : /^(\/database|\/library|\/paper\/|\/edit\/|\/entities|\/concept\/|\/document\/)/.test(path)
        ? 'library'
        : /^(\/topics|\/topic\/|\/compare)/.test(path)
          ? 'topics'
          : /^(\/explore|\/research|\/query|\/graph)/.test(path)
            ? 'explore'
            : 'settings';
  const nav = [
    ['home', '工作台', '/', BookOpen],
    ['library', '文献', '/library', Database],
    ['topics', '研究专题', '/topics', Layers],
    ['explore', '探索', workspace ? '/research' : '/query', Compass],
    ['settings', '设置与维护', '/manage', Settings],
  ];
  useEffect(() => {
    setMenu(false);
    setCreate(false);
  }, [path]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') {
        setCreate(false);
        setMenu(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('workspace-search')?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main').focus();
        }}
      >
        跳到主要内容
      </a>
      {menu && (
        <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMenu(false)} />
      )}
      <aside className={'sidebar ' + (menu ? 'open' : '')}>
        <a className="brand" href="#/">
          <span className="brand-symbol">
            <BookOpen size={22} />
          </span>
          <span>
            Research Space<small>个人研究知识工作台</small>
          </span>
        </a>
        <div className="workspace-label">我的工作空间</div>
        <nav aria-label="主导航">
          {nav.map(([key, label, url, Icon]) => (
            <a
              key={key}
              href={'#' + url}
              className={area === key ? 'active' : ''}
              aria-current={area === key ? 'page' : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-topics">
          <div className="workspace-label">关注的专题</div>
          {dataset.topics.slice(0, 4).map((t) => (
            <a href={'#/topic/' + t.id} key={t.id}>
              <span className="topic-dot" />
              {t.title}
            </a>
          ))}
        </div>
        <div className="sidebar-bottom">
          <span className="local-dot" />
          {workspace ? '本地空间' : '公开阅读空间'}
          <p>
            {dataset.papers.length} 篇论文 · {dataset.concepts.length} 个研究对象
          </p>
          {workspace && (
            <button className="text-button" onClick={() => refresh().catch(() => {})}>
              刷新资料
            </button>
          )}
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            aria-label="打开导航"
            onClick={() => setMenu(!menu)}
          >
            <PanelLeft size={20} />
          </button>
          <span className="breadcrumb">{nav.find((n) => n[0] === area)?.[1]}</span>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              location.hash =
                (workspace ? '/research' : '/query') +
                '?q=' +
                encodeURIComponent(new FormData(e.currentTarget).get('q'));
            }}
          >
            <Search size={17} />
            <input
              id="workspace-search"
              name="q"
              aria-label="全库搜索"
              placeholder="搜索论文、实体、笔记与原文…"
            />
            <kbd>⌘ K</kbd>
          </form>
          {workspace && (
            <>
              <a className="task-link" href="#/drafts">
                <Inbox size={18} />
                <span>草稿箱</span>
              </a>
              <button className="button primary" onClick={() => setCreate(true)}>
                <Plus size={17} />
                <span>新建</span>
              </button>
            </>
          )}
        </header>
        <main id="main" tabIndex={-1} className={'area-' + area}>
          {area === 'library' &&
            (path === '/database' || path === '/library' || path === '/entities') && (
              <SectionNav
                label="知识对象"
                active={
                  path === '/entities'
                    ? '#/entities'
                    : path === '/database'
                      ? '#/database'
                      : '#/library'
                }
                items={[
                  ['#/library', '阅读桌'],
                  ...(workspace ? [['#/database', '论文表格']] : []),
                  ['#/entities', '研究对象'],
                ]}
              />
            )}
          {area === 'explore' && (
            <SectionNav
              label="探索方式"
              active={path === '/graph' ? '#/graph' : workspace ? '#/research' : '#/query'}
              items={[
                [workspace ? '#/research' : '#/query', '检索与证据'],
                ['#/graph', '关系探索'],
              ]}
            />
          )}
          {workspace && <p className="workspace-state">本地完整研究库</p>}
          {children}
        </main>
        <footer>
          Research Space{' '}
          <span>{workspace ? '保存在此设备 · 资料由你掌握' : '公开资料 · 可追溯来源'}</span>
        </footer>
      </div>
      {selected.length > 0 && path != '/compare' && (
        <div className="compare-dock">
          <span>已选 {selected.length} 篇论文</span>
          <a href={'#/compare?ids=' + selected.join(',')}>
            开始比较 <ArrowRight size={16} />
          </a>
          <button className="icon-button" aria-label="清空比较" onClick={clearSelection}>
            <X size={16} />
          </button>
        </div>
      )}
      {create && (
        <div className="dialog-shade" onClick={() => setCreate(false)}>
          <section
            className="create-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="新建资料"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between">
              <h2>开始一项研究记录</h2>
              <button
                autoFocus
                className="icon-button"
                aria-label="关闭"
                onClick={() => setCreate(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="muted">先记录，再逐步补充来源、理解与联系。</p>
            {[
              ['/edit/new', '论文与阅读笔记', '记录一篇论文，或导入已有笔记', FileText],
              ['/entities?create=1', '研究对象', '人物、方法、数据、任务、概念与开放问题', Network],
              ['/associations?collection=topics', '研究专题', '围绕一个问题组织材料', Layers],
              ['/drafts', 'AI 整理草稿', '导入 Agent 产物，审阅后应用', Inbox],
            ].map(([url, name, desc, Icon]) => (
              <a
                className="create-choice"
                href={'#' + url}
                key={url}
                onClick={() => setCreate(false)}
              >
                <Icon size={22} />
                <span>
                  <b>{name}</b>
                  <small>{desc}</small>
                </span>
                <ArrowUpRight size={18} />
              </a>
            ))}
          </section>
        </div>
      )}
      <div role="status" aria-live="polite" className={toast ? 'toast' : 'sr-only'}>
        {toast}
      </div>
    </>
  );
}
export function WorkbenchHome({ dataset, workspace }) {
  const papers = dataset.papers.filter((p) => p.lifecycle !== 'archived'),
    reading = papers.filter((p) => p.status === 'reading'),
    pending = dataset.relations.filter((r) => r.status === 'pending');
  const recent = [...papers].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const positions = papers
    .map((paper) => {
      try {
        const position = JSON.parse(
          localStorage.getItem(
            `pkh-reading-position-${workspace ? 'local' : 'public'}-${paper.id}`,
          ) || 'null',
        );
        return position &&
          typeof position.updatedAt === 'string' &&
          typeof position.section === 'string' &&
          ['note', 'source'].includes(position.mode)
          ? { ...position, paper }
          : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const list = reading.length ? reading : recent;
  return (
    <>
      <PageHeader
        label="YOUR RESEARCH, CONNECTED"
        title={workspace ? '研究阅读与综合' : '从一个研究问题开始'}
        description="阅读、整理与发现，在一个工作空间里自然衔接。"
        actions={
          <a className="button primary" href={workspace ? '#/edit/new' : '#/library'}>
            <Plus size={16} />
            {workspace ? '收录论文' : '浏览论文'}
          </a>
        }
      />
      {positions[0] && (
        <section className="resume-reading">
          <h2>继续上次阅读</h2>
          <a
            className="button primary"
            href={
              '#/paper/' +
              positions[0].paper.id +
              '?' +
              new URLSearchParams({ mode: positions[0].mode, section: positions[0].section })
            }
          >
            {positions[0].paper.acronym || positions[0].paper.title} ·{' '}
            {positions[0].section.replace(/^note-/, '')} →
          </a>
        </section>
      )}
      <div className="home-metrics">
        {[
          [papers.length, '篇论文', workspace ? '#/database' : '#/library'],
          [reading.length, '正在阅读', '#/library?status=reading'],
          [pending.length, '待审关系', '#/graph?review=pending'],
          [dataset.topics.length, '研究专题', '#/topics'],
        ].map(([n, l, h]) => (
          <a href={h} key={l}>
            <strong>{n}</strong>
            <span>{l}</span>
            <ArrowUpRight size={16} />
          </a>
        ))}
      </div>
      <div className="workbench-layout">
        <section>
          <div className="section-heading">
            <h2>{workspace ? '阅读中的论文' : '开始阅读'}</h2>
            <a href={workspace ? '#/database' : '#/library'}>全部论文 →</a>
          </div>
          <div className="reading-list">
            {list.slice(0, 5).map((p, i) => (
              <a className="reading-row" href={'#/paper/' + p.id} key={p.id}>
                <span className="reading-number">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <small>
                    {p.year} · {p.acronym || '论文'}
                  </small>
                  <h3>{p.title}</h3>
                  <p>{p.problem || p.abstract || '打开论文，开始整理阅读笔记。'}</p>
                </span>
                <ArrowUpRight size={18} />
              </a>
            ))}
            {!papers.length && (
              <div className="empty">
                <h3>从第一篇论文开始</h3>
                <p>通过“新建”收录论文；已有资料可导入编辑器。</p>
              </div>
            )}
          </div>
          <div className="section-heading">
            <h2>最近整理</h2>
          </div>
          {recent.slice(0, 4).map((p) => (
            <a className="activity-row" href={'#/paper/' + p.id} key={p.id}>
              <FileText size={17} />
              <span>{p.acronym || p.title}</span>
              <small>{p.updated || '未记录日期'}</small>
            </a>
          ))}
        </section>
        <aside className="home-aside">
          <section className="home-inbox">
            <Inbox size={24} />
            <h2>让资料成为研究材料</h2>
            <p>Agent 整理的笔记与关系先进入草稿箱。查看来源、修改内容，再写入知识库。</p>
            <a className="button" href={workspace ? '#/drafts' : '#/manage'}>
              {workspace ? '打开草稿箱' : '了解本地 AI 整理'} <ArrowRight size={16} />
            </a>
          </section>
          <section>
            <div className="section-heading">
              <h2>研究专题</h2>
              <a href="#/topics">全部 →</a>
            </div>
            {dataset.topics.map((t) => (
              <a className="topic-shortcut" href={'#/topic/' + t.id} key={t.id}>
                <Layers size={18} />
                <span>
                  <b>{t.title}</b>
                  <small>
                    {papers.filter((p) => p.topics?.includes(t.id)).length} 篇资料 ·{' '}
                    {t.analysis ? '已有阶段性整理' : '待整理'}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </a>
            ))}
          </section>
          <section className="quiet-note">
            <h3>下一步可以做什么</h3>
            <a href="#/library?missing=1">补充尚未整理的实验与局限 →</a>
            <a href="#/graph?review=pending">检查候选研究关系 →</a>
          </section>
        </aside>
      </div>
    </>
  );
}
