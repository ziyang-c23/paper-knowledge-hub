import React, { useEffect, useRef, useState } from 'react';
import {
  Users,
  Building2,
  Network,
  Search,
  Plus,
  ArrowLeft,
  FileText,
  ExternalLink,
  Save,
  Download,
  Archive,
  RotateCcw,
  LayoutGrid,
  List,
  X,
} from 'lucide-react';
import { workspaceRequest, dimensions } from './workspace.jsx';
import {
  entityKinds,
  entityGroups,
  entityDimensions,
  effectiveEntityKind,
  entityConnections,
  entityExport,
} from './lib/entities.mjs';
import './entities.css';
const routeTo = (id, dataset) =>
  dataset.papers.some((p) => p.id === id)
    ? '#/paper/' + id
    : dataset.topics.some((t) => t.id === id)
      ? '#/topic/' + id
      : '#/entities/' + id;
function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const statusLabel = { approved: '已审核', pending: '待审核', rejected: '已拒绝' };
function SourceList({ sources = [] }) {
  return sources.length ? (
    <ol className="entity-sources">
      {sources.map((source, i) => (
        <li key={i}>
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.title}
            <ExternalLink size={13} />
          </a>
          {source.note && <p>{source.note}</p>}
        </li>
      ))}
    </ol>
  ) : (
    <p className="entity-muted">尚未记录来源。资料链接与研究结论的核验状态分开维护。</p>
  );
}
export function EntitiesPage({ workspace, route, refresh, notify, Md }) {
  const dataset = workspace.dataset,
    id = route.path.startsWith('/entities/') ? route.path.slice(10) : null,
    creating = !id && route.params.get('create') === '1',
    editing = creating || route.params.get('edit') === '1',
    existing = dataset.concepts.find((e) => e.id === id);
  if (!id && !editing) sessionStorage.setItem('pkh-entities-route', location.hash);
  if (editing && !workspace.readOnly)
    return (
      <EntityEditor
        key={id}
        {...{ workspace, refresh, notify, Md }}
        existing={existing}
        missing={!creating && !existing}
      />
    );
  if (id)
    return existing ? (
      <EntityDetail {...{ dataset, entity: existing, Md }} readOnly={workspace.readOnly} />
    ) : (
      <div className="panel padded">
        <h1>实体不存在</h1>
        <a href="#/entities">返回实体库</a>
      </div>
    );
  return <EntityCollection {...{ dataset, route }} readOnly={workspace.readOnly} />;
}
function EntityCollection({ dataset, route, readOnly }) {
  const q = route.params.get('q') || '',
    kind = route.params.get('kind') || '',
    groupParam = route.params.get('group'),
    archived = route.params.get('archived') === '1',
    layout = route.params.get('layout') || 'gallery';
  const kindGroup = entityGroups.find((item) => item.kinds.includes(kind)),
    selectedGroup =
      groupParam === 'all'
        ? undefined
        : entityGroups.find((item) => item.id === groupParam) || kindGroup,
    visibleKinds = selectedGroup?.kinds || Object.keys(entityKinds);
  const inGroup = (entity, kinds = visibleKinds) => kinds.includes(effectiveEntityKind(entity));
  const setMany = (updates) => {
    const params = new URLSearchParams(route.params);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    history.replaceState(null, '', '#/entities?' + params);
    dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const set = (key, value) => setMany({ [key]: value });
  const entities = dataset.concepts
    .filter(
      (e) =>
        (archived || e.lifecycle !== 'archived') &&
        inGroup(e) &&
        (!kind || effectiveEntityKind(e) === kind) &&
        (!q ||
          [e.title, ...(e.aliases || []), e.description || '']
            .join(' ')
            .normalize('NFKC')
            .toLowerCase()
            .includes(q.normalize('NFKC').toLowerCase())),
    )
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  return (
    <div className="entities-page">
      <header className="entity-heading">
        <div>
          <div className="entity-eyebrow">
            <Network size={17} /> RESEARCH DIRECTORY
          </div>
          <h1>研究对象</h1>
          <p>
            先按对象职责进入，再查看跨论文联系。人物、方法、数据、任务、概念与开放问题拥有不同的档案语义，关系在论文上下文中回查。
          </p>
        </div>
        <a hidden={readOnly} className="button primary" href="#/entities?create=1">
          <Plus size={16} /> 新建对象
        </a>
      </header>
      <div className="entity-groups" role="tablist" aria-label="研究对象分组">
        <button
          role="tab"
          aria-selected={groupParam === 'all' || (!groupParam && !kind)}
          className={groupParam === 'all' || (!groupParam && !kind) ? 'selected' : ''}
          onClick={() => setMany({ group: 'all', kind: '' })}
        >
          跨域索引
        </button>
        {entityGroups.map((item) => (
          <button
            role="tab"
            aria-selected={selectedGroup?.id === item.id}
            className={selectedGroup?.id === item.id ? 'selected' : ''}
            key={item.id}
            onClick={() => setMany({ group: item.id, kind: item.kinds.includes(kind) ? kind : '' })}
          >
            {item.label}
            <b>
              {
                dataset.concepts.filter(
                  (e) => inGroup(e, item.kinds) && (archived || e.lifecycle !== 'archived'),
                ).length
              }
            </b>
          </button>
        ))}
      </div>
      <p className="entity-group-description">
        {selectedGroup?.description || '仅用于跨对象回查；日常整理建议进入一个明确的对象分组。'}
      </p>
      <div className="entity-kinds" role="group" aria-label="实体类型筛选">
        <button className={!kind ? 'selected' : ''} onClick={() => set('kind', '')}>
          分组内全部{' '}
          <b>
            {
              dataset.concepts.filter((e) => inGroup(e) && (archived || e.lifecycle !== 'archived'))
                .length
            }
          </b>
        </button>
        {Object.entries(entityKinds)
          .filter(([key]) => visibleKinds.includes(key))
          .map(([key, label]) => (
            <button
              key={key}
              className={kind === key ? 'selected' : ''}
              onClick={() => set('kind', key)}
            >
              {label}
              <b>
                {
                  dataset.concepts.filter(
                    (e) =>
                      effectiveEntityKind(e) === key && (archived || e.lifecycle !== 'archived'),
                  ).length
                }
              </b>
            </button>
          ))}
      </div>
      <div className="entity-toolbar">
        <label>
          <Search size={17} />
          <input
            aria-label="搜索研究对象"
            placeholder="搜索名称、别名或简介…"
            value={q}
            onChange={(e) => set('q', e.target.value)}
          />
        </label>
        <div>
          <label>
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => set('archived', e.target.checked ? '1' : '')}
            />
            包含归档
          </label>
          <button
            aria-label="实体画廊"
            aria-pressed={layout === 'gallery'}
            onClick={() => set('layout', 'gallery')}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            aria-label="实体列表"
            aria-pressed={layout === 'list'}
            onClick={() => set('layout', 'list')}
          >
            <List size={17} />
          </button>
        </div>
      </div>
      <p className="entity-muted">
        {entities.length} 个实体 · 数量反映当前收录，不代表研究质量或领域覆盖。
      </p>
      {entities.length ? (
        <div className={'entity-collection ' + layout}>
          {entities.map((entity) => {
            const connections = entityConnections(dataset, entity.id),
              effectiveKind = effectiveEntityKind(entity),
              Icon =
                effectiveKind === 'person'
                  ? Users
                  : effectiveKind === 'institution'
                    ? Building2
                    : Network;
            return (
              <article className="entity-card" key={entity.id}>
                <div className={'entity-icon ' + effectiveKind}>
                  <Icon size={23} />
                </div>
                <div className="entity-card-body">
                  <div className="entity-card-type">
                    {entityKinds[effectiveKind]}
                    {entity.lifecycle === 'archived' && ' · 已归档'}
                  </div>
                  <a href={'#/entities/' + entity.id}>
                    <h2>{entity.title}</h2>
                  </a>
                  {entity.aliases?.length > 0 && (
                    <p className="entity-aliases">{entity.aliases.join(' · ')}</p>
                  )}
                  <p className="entity-description">
                    {entity.description || '尚未填写简介，可打开档案补充。'}
                  </p>
                  <div className="entity-card-bottom">
                    <span>{connections.papers.length} 篇关联论文</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="entity-empty">
          <Network size={34} />
          <h2>这里还没有符合条件的实体</h2>
          <p>可以调整筛选，或从一个学者、团队、模型或研究问题开始。</p>
          <a hidden={readOnly} className="button primary" href="#/entities?create=1">
            新建对象档案
          </a>
        </div>
      )}
    </div>
  );
}
function EntityDetail({ dataset, entity, Md, readOnly }) {
  const { outgoing, incoming, papers, taxonomyPapers, evidencePapers, relations } =
      entityConnections(dataset, entity.id),
    all = [...dataset.papers, ...dataset.topics, ...dataset.concepts],
    effectiveKind = effectiveEntityKind(entity);
  return (
    <div className="entities-page">
      <a
        className="entity-back"
        href={sessionStorage.getItem('pkh-entities-route') || '#/entities'}
      >
        <ArrowLeft size={15} />
        研究对象
      </a>
      <header className="entity-heading">
        <div>
          <div className="entity-eyebrow">
            {entityKinds[effectiveKind]} ·{' '}
            {entity.lifecycle === 'archived' ? '已归档' : readOnly ? '公开档案' : '本地档案'}
          </div>
          <h1>{entity.title}</h1>
          <p>{(entity.aliases || []).join(' · ') || '暂无别名'}</p>
        </div>
        <div className="entity-actions">
          <button onClick={() => download(entity.id + '.md', entityExport(entity, dataset))}>
            <Download size={16} /> 导出档案
          </button>
          <a
            hidden={readOnly}
            className="button primary"
            href={'#/entities/' + entity.id + '?edit=1'}
          >
            编辑档案
          </a>
        </div>
      </header>
      <div className="entity-detail-grid">
        <div className="entity-main">
          <section className="entity-section">
            <h2>
              {effectiveKind === 'person'
                ? '身份与研究方向'
                : effectiveKind === 'institution'
                  ? '团队与研究方向'
                  : ['model', 'method'].includes(effectiveKind)
                    ? '机制与适用问题'
                    : ['dataset', 'environment', 'benchmark'].includes(effectiveKind)
                      ? '任务与使用范围'
                      : '简介与研究关注'}
            </h2>
            <p>{entity.description || '尚未填写。'}</p>
            {entity.url && (
              <a href={entity.url} target="_blank" rel="noreferrer">
                主页 / 官方资料 <ExternalLink size={14} />
              </a>
            )}
          </section>
          {(!readOnly || entity.note) && (
            <section className="entity-section">
              <h2>研究档案</h2>
              <small className="entity-muted">本地整理内容 · 不自动进入公开投影</small>
              {entity.note ? (
                <Md>{entity.note}</Md>
              ) : (
                <p className="entity-muted">
                  可记录身份消歧、代表贡献、研究脉络与待核实问题。没有资料的内容保持未知。
                </p>
              )}
            </section>
          )}
          {(!readOnly || entity.sources?.length) && (
            <section className="entity-section">
              <h2>资料来源 · {entity.sources?.length || 0}</h2>
              <p className="entity-muted">
                用于回查整理依据；链接存在不等于任职、贡献等主张已核验。
              </p>
              <SourceList sources={entity.sources} />
            </section>
          )}
          <section className="entity-section">
            <h2>关联论文 · {papers.length}</h2>
            <p className="entity-muted">
              {taxonomyPapers.length} 篇分类命中 · {evidencePapers.length}{' '}
              篇有关系回查；分类命中不等于论文明确采用或评测。
            </p>
            {papers.map((p) => (
              <a className="entity-record-link" key={p.id} href={'#/paper/' + p.id}>
                <FileText size={17} />
                <span>
                  {p.title}
                  <small>
                    {p.year} ·{' '}
                    {evidencePapers.some((item) => item.id === p.id)
                      ? '已核验关系'
                      : taxonomyPapers.some((item) => item.id === p.id)
                        ? '分类关联'
                        : '手工关联'}
                  </small>
                </span>
              </a>
            ))}
            {!papers.length && (
              <p className="entity-muted">暂无明确关联。作者姓名相同不会自动合并为同一学者。</p>
            )}
          </section>
        </div>
        <aside>
          <section className="entity-section">
            <h2>手工关联 · {outgoing.length}</h2>
            <p className="entity-muted">仅用于组织资料，不自动表示任职、采用或继承。</p>
            {outgoing.map((e) => (
              <a className="entity-record-link" key={e.id} href={routeTo(e.id, dataset)}>
                {e.title}
                {e.lifecycle === 'archived' && ' · 已归档'}
              </a>
            ))}
            {!outgoing.length && <p className="entity-muted">暂无关联，可在编辑档案中选择。</p>}
          </section>
          <section className="entity-section">
            <h2>反向引用 · {incoming.length}</h2>
            {incoming.map((e) => (
              <a className="entity-record-link" key={e.id} href={'#/entities/' + e.id}>
                {e.title}
                {e.lifecycle === 'archived' && ' · 已归档'}
              </a>
            ))}
            {!incoming.length && <p className="entity-muted">没有其他实体手工引用此档案。</p>}
          </section>
          <section className="entity-section">
            <h2>证据关系 · {relations.length}</h2>
            {!readOnly && (
              <a className="button" href={'#/associations?collection=relations&paper=' + entity.id}>
                整理关系
              </a>
            )}
            {relations.map((r) => (
              <div key={r.id} className="entity-relation">
                <a href={routeTo(r.source === entity.id ? r.target : r.source, dataset)}>
                  {all.find((e) => e.id === (r.source === entity.id ? r.target : r.source))
                    ?.title || r.id}
                </a>
                <p>
                  {
                    {
                      related: '相关',
                      uses: '采用',
                      extends: '扩展',
                      cites: '引用',
                      studies: '研究',
                    }[r.type]
                  }{' '}
                  · {statusLabel[r.status]} ·{' '}
                  {
                    {
                      curator: '人工整理',
                      source: '原文依据',
                      model: '模型候选',
                      similarity: '相似关联',
                    }[r.origin]
                  }
                </p>
                {r.evidenceIds.map((id) => {
                  const e = dataset.evidence.find((e) => e.id === id);
                  return (
                    e && (
                      <a key={id} href={'#/paper/' + e.paperId + '?evidence=' + id}>
                        查看原文依据
                      </a>
                    )
                  );
                })}
              </div>
            ))}
            {!relations.length && <p className="entity-muted">暂无经记录的研究关系。</p>}
            <a className="button" href={'#/graph?node=' + entity.id}>
              查看关系图
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}
function EntityEditor({ existing, missing, workspace, refresh, notify, Md }) {
  const blank = () => ({
    schemaVersion: 1,
    id: 'entity-' + crypto.randomUUID(),
    kind: 'person',
    title: '',
    description: '',
    aliases: [],
    visibility: 'private',
    lifecycle: 'active',
    note: '',
    relatedIds: [],
    sources: [],
  });
  const [record, setRecord] = useState(() => structuredClone(existing || blank())),
    [baseline, setBaseline] = useState(() => JSON.stringify(existing || null)),
    [revision, setRevision] = useState(workspace.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [consent, setConsent] = useState(false),
    [preview, setPreview] = useState(false),
    [find, setFind] = useState('');
  const dirty = baseline !== JSON.stringify(record),
    leaving = useRef(false),
    inFlight = useRef(false),
    dataset = workspace.dataset,
    allowedDimensions = entityDimensions[record.kind] || [];
  const change = (key, value) => {
    setRecord((r) => ({ ...r, [key]: value }));
    setConsent(false);
  };
  useEffect(() => {
    const guard = (e) => {
      if (
        inFlight.current ||
        (!leaving.current && dirty && !confirm('实体档案有未保存修改，仍要离开？'))
      )
        e.preventDefault();
    };
    const unload = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    addEventListener('pkh-before-navigate', guard);
    addEventListener('beforeunload', unload);
    return () => {
      removeEventListener('pkh-before-navigate', guard);
      removeEventListener('beforeunload', unload);
    };
  }, [dirty]);
  if (missing)
    return (
      <div className="panel padded">
        <h1>实体不存在</h1>
        <a href="#/entities">返回实体库</a>
      </div>
    );
  const choices = [
    ...dataset.concepts.map((e) => ({
      ...e,
      label: entityKinds[effectiveEntityKind(e)] || entityKinds[e.kind],
    })),
    ...dataset.papers.map((e) => ({ ...e, label: '论文' })),
    ...dataset.topics.map((e) => ({ ...e, label: '专题' })),
  ].filter(
    (e) =>
      e.id !== record.id &&
      (e.lifecycle !== 'archived' || (record.relatedIds || []).includes(e.id)),
  );
  const matches = choices.filter(
    (e) =>
      !find || [e.title, ...(e.aliases || [])].join(' ').toLowerCase().includes(find.toLowerCase()),
  );
  const duplicates = dataset.concepts.filter(
    (e) =>
      e.id !== record.id &&
      [e.title, ...(e.aliases || [])].some(
        (name) =>
          name.normalize('NFKC').toLowerCase() ===
          record.title.trim().normalize('NFKC').toLowerCase(),
      ),
  );
  const save = async (lifecycle = record.lifecycle || 'active') => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const target = {
        ...record,
        aliases: [...new Set((record.aliases || []).map((x) => x.trim()).filter(Boolean))],
        lifecycle,
        visibility: consent ? 'public' : 'private',
      };
      if (!target.url) delete target.url;
      await workspaceRequest(
        '/api/records',
        {
          collection: 'concepts',
          record: target,
          createOnly: !existing,
          expectedRevision: revision,
          publishConsent: consent,
        },
        workspace.csrfToken,
      );
      const next = await refresh();
      setRecord(target);
      setBaseline(JSON.stringify(target));
      setRevision(next.revision);
      leaving.current = true;
      inFlight.current = false;
      notify('实体档案已保存');
      location.hash = '/entities/' + target.id;
    } catch (e) {
      setError(
        e.message.includes('Record ID already exists')
          ? '该稳定 ID 已存在，请打开原档案编辑。已有内容完整保留。'
          : e.status === 409
            ? '版本冲突，未覆盖主库。请先导出草稿，再重新读取并合并。'
            : e.message,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const reload = async () => {
    if (inFlight.current) return;
    if (!confirm('重新读取会放弃未保存档案；需要的内容已导出？')) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const next = await refresh(),
        entity = next.dataset.concepts.find((e) => e.id === record.id);
      if (!entity) throw Error('主库中尚无此实体，请保留当前草稿。');
      setRecord(structuredClone(entity));
      setBaseline(JSON.stringify(entity));
      setRevision(next.revision);
      setConsent(false);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="entities-page">
      <a className="entity-back" href={existing ? '#/entities/' + existing.id : '#/entities'}>
        <ArrowLeft size={15} />
        返回{existing ? '档案' : '实体库'}
      </a>
      <header className="entity-heading">
        <div>
          <div className="entity-eyebrow">ENTITY EDITOR</div>
          <h1>{existing ? '编辑对象档案' : '新建研究对象'}</h1>
          <p>先明确对象身份，再补来源和关联。未知信息可以留空。</p>
        </div>
        <button
          onClick={() => download(record.id + '-draft.json', JSON.stringify(record, null, 2))}
        >
          <Download size={16} /> 导出未保存草稿
        </button>
      </header>
      {error && (
        <div className="entity-error" role="alert">
          {error}
          <button onClick={reload} disabled={busy}>
            重新读取
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset disabled={busy}>
          <div className="entity-edit-grid">
            <section className="entity-section">
              <h2>身份与简介</h2>
              <div className="entity-fields">
                <label>
                  实体名称
                  <input
                    required
                    value={record.title}
                    onChange={(e) => change('title', e.target.value)}
                  />
                </label>
                <label>
                  实体类型
                  <select
                    aria-label="实体类型"
                    value={record.kind}
                    onChange={(e) => {
                      const kind = e.target.value;
                      setRecord((current) => {
                        const next = { ...current, kind };
                        if (next.dimension && !entityDimensions[kind]?.includes(next.dimension))
                          delete next.dimension;
                        return next;
                      });
                      setConsent(false);
                    }}
                  >
                    {Object.entries(entityKinds).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  稳定 ID
                  <input
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={120}
                    disabled={!!existing}
                    value={record.id}
                    onChange={(e) => change('id', e.target.value)}
                  />
                </label>
                <label>
                  主页 / 官方资料
                  <input
                    type="url"
                    pattern="https://.*"
                    placeholder="https://…（未知可留空）"
                    value={record.url || ''}
                    onChange={(e) => change('url', e.target.value)}
                  />
                </label>
                <label>
                  别名（每行一个）
                  <textarea
                    rows={3}
                    value={(record.aliases || []).join('\n')}
                    onChange={(e) => change('aliases', e.target.value.split('\n'))}
                  />
                </label>
                {allowedDimensions.length > 0 ? (
                  <label>
                    分类维度
                    <select
                      aria-label="分类维度"
                      value={record.dimension || ''}
                      onChange={(e) => {
                        const next = { ...record };
                        if (e.target.value) next.dimension = e.target.value;
                        else delete next.dimension;
                        setRecord(next);
                        setConsent(false);
                      }}
                    >
                      <option value="">不作为论文分类维度</option>
                      {allowedDimensions.map((key) => (
                        <option key={key} value={key}>
                          {dimensions[key]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="entity-field-hint">
                    人物、机构和项目只维护身份档案，不作为论文分类维度。
                  </p>
                )}
                <label className="wide">
                  简介
                  <textarea
                    rows={4}
                    value={record.description || ''}
                    onChange={(e) => change('description', e.target.value)}
                  />
                </label>
              </div>
              {duplicates.length > 0 && (
                <p className="entity-warning">
                  已有同名或同别名实体：
                  {duplicates.map((e) => (
                    <a key={e.id} href={'#/entities/' + e.id}>
                      {e.title}（{entityKinds[effectiveEntityKind(e)] || entityKinds[e.kind]}）{' '}
                    </a>
                  ))}
                  。请检查身份；同名不会自动合并。
                </p>
              )}
            </section>
            <section className="entity-section">
              <h2>关联记录 · {record.relatedIds?.length || 0}</h2>
              <p className="entity-muted">
                选择论文、专题或其他实体。保存后自动显示反向引用；仅表示手工组织关系。
              </p>
              <input
                aria-label="查找关联记录"
                placeholder="搜索名称或别名"
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
              <div className="entity-choice-list">
                {matches.map((e) => (
                  <label key={e.id}>
                    <input
                      type="checkbox"
                      checked={(record.relatedIds || []).includes(e.id)}
                      onChange={(event) =>
                        change(
                          'relatedIds',
                          event.target.checked
                            ? [...(record.relatedIds || []), e.id]
                            : (record.relatedIds || []).filter((id) => id !== e.id),
                        )
                      }
                    />
                    <span>
                      {e.title}
                      <small>
                        {e.label}
                        {e.lifecycle === 'archived' && ' · 已归档'}
                      </small>
                    </span>
                  </label>
                ))}
                {!matches.length && <p className="entity-muted">没有匹配记录。</p>}
              </div>
            </section>
          </div>
          <section className="entity-section">
            <div className="entity-section-heading">
              <h2>档案正文 · Markdown</h2>
              <button type="button" onClick={() => setPreview(!preview)}>
                {preview ? '继续编辑' : '预览正文'}
              </button>
            </div>
            <p className="entity-muted">
              可整理身份、贡献、来源支持范围与待核实问题。正文始终保留在本地。
            </p>
            {preview ? (
              <Md>{record.note || '尚无正文'}</Md>
            ) : (
              <textarea
                className="entity-note-input"
                aria-label="实体档案正文"
                rows={16}
                value={record.note || ''}
                onChange={(e) => change('note', e.target.value)}
              />
            )}
          </section>
          <section className="entity-section">
            <div className="entity-section-heading">
              <h2>资料来源</h2>
              <button
                type="button"
                onClick={() =>
                  change('sources', [...(record.sources || []), { title: '', url: '', note: '' }])
                }
              >
                <Plus size={15} />
                添加资料来源
              </button>
            </div>
            {(record.sources || []).map((source, i) => (
              <div className="entity-source-editor" key={i}>
                <label>
                  来源名称
                  <input
                    required
                    value={source.title}
                    onChange={(e) =>
                      change(
                        'sources',
                        record.sources.map((s, j) =>
                          j === i ? { ...s, title: e.target.value } : s,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  来源网址
                  <input
                    required
                    type="url"
                    pattern="https://.*"
                    value={source.url}
                    onChange={(e) =>
                      change(
                        'sources',
                        record.sources.map((s, j) => (j === i ? { ...s, url: e.target.value } : s)),
                      )
                    }
                  />
                </label>
                <label>
                  支持范围 / 待核验事项
                  <textarea
                    value={source.note || ''}
                    onChange={(e) =>
                      change(
                        'sources',
                        record.sources.map((s, j) =>
                          j === i ? { ...s, note: e.target.value } : s,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={'移除来源 ' + (i + 1)}
                  onClick={() =>
                    change(
                      'sources',
                      record.sources.filter((_, j) => j !== i),
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </section>
          <div className="entity-savebar">
            <div>
              <strong>{busy ? '正在保存…' : dirty ? '有未保存修改' : '当前档案已保存'}</strong>
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                已审查名称、简介、别名与分类，允许它们进入公开构建
              </label>
              <small>正文、资料来源与手工关联仍为本地内容。默认保存为私有。</small>
            </div>
            <div>
              <button type="submit" className="button primary">
                <Save size={16} />
                保存实体
              </button>
              {existing && (
                <button
                  type="button"
                  onClick={() => save(record.lifecycle === 'archived' ? 'active' : 'archived')}
                >
                  {record.lifecycle === 'archived' ? (
                    <RotateCcw size={16} />
                  ) : (
                    <Archive size={16} />
                  )}{' '}
                  {record.lifecycle === 'archived' ? '恢复实体' : '归档实体'}
                </button>
              )}
            </div>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
