import React, { useEffect, useRef, useState } from 'react';
import {
  Table2,
  Columns3,
  LayoutGrid,
  List,
  CalendarDays,
  Plus,
  SlidersHorizontal,
  Download,
  Search,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  BookOpen,
  FileText,
  Check,
  Settings2,
} from 'lucide-react';
import { workspaceRequest } from './workspace.jsx';
import {
  defaultDatabase,
  fieldsFor,
  queryRows,
  groupRows,
  valueOf,
  displayValue,
  makeView,
  layouts,
  labels,
  typeNames,
  formulaResultTypes,
  rollupAggregates,
  operators,
  operatorsFor,
  changeFor,
  csvRows,
  empty,
} from './lib/database.mjs';
import './database.css';
const layoutIcons = {
  table: Table2,
  board: Columns3,
  gallery: LayoutGrid,
  list: List,
  calendar: CalendarDays,
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const uid = (prefix) => prefix + '-' + crypto.randomUUID();
function download(name, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({ title, children, close, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={'db-dialog ' + (wide ? 'wide' : '')}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="关闭弹窗">
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function ValueInput({ field, value, onChange, dataset, label, filter = false }) {
  const options = field.options || [];
  const optionLabel = (x) => displayValue(x, field, dataset);
  if (field.type === 'checkbox')
    return (
      <select
        aria-label={label}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')}
      >
        <option value="">未设置</option>
        <option value="true">已勾选</option>
        <option value="false">未勾选</option>
      </select>
    );
  if (
    (field.type === 'select' || (filter && ['multiSelect', 'relation'].includes(field.type))) &&
    options.length
  )
    return (
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">选择…</option>
        {options.map((x) => (
          <option key={x} value={x}>
            {optionLabel(x)}
          </option>
        ))}
      </select>
    );
  if (['multiSelect', 'relation'].includes(field.type) && !filter)
    return (
      <div className="db-choice-list" role="group" aria-label={label}>
        {options.map((x) => (
          <label key={x}>
            <input
              type="checkbox"
              checked={(value || []).includes(x)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...(value || []), x] : (value || []).filter((y) => y !== x),
                )
              }
            />
            {optionLabel(x)}
          </label>
        ))}
        {field.id === 'tags' && (
          <input
            aria-label="新标签"
            placeholder="输入新标签，按 Enter 添加"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const text = e.currentTarget.value.trim();
                if (text && !(value || []).includes(text)) onChange([...(value || []), text]);
                e.currentTarget.value = '';
              }
            }}
          />
        )}
        <small>取消全部勾选可清空。</small>
      </div>
    );
  return (
    <input
      aria-label={label}
      type={
        field.type === 'number'
          ? 'number'
          : field.type === 'date'
            ? 'date'
            : field.type === 'url'
              ? 'url'
              : 'text'
      }
      step={field.type === 'number' ? 'any' : undefined}
      value={value ?? ''}
      onChange={(e) =>
        onChange(
          e.target.value === ''
            ? null
            : field.type === 'number'
              ? Number(e.target.value)
              : e.target.value,
        )
      }
    />
  );
}
function FilterGroup({ group, fields, dataset, change, depth = 0 }) {
  const add = () =>
    change({ ...group, rules: [...group.rules, { field: 'title', op: 'contains', value: '' }] });
  const update = (index, rule) =>
    change({ ...group, rules: group.rules.map((r, i) => (i === index ? rule : r)) });
  return (
    <div className="db-filter-group">
      <div className="db-filter-heading">
        <span>满足</span>
        <select
          aria-label={'筛选逻辑 ' + depth}
          value={group.mode}
          onChange={(e) => change({ ...group, mode: e.target.value })}
        >
          <option value="and">全部条件（AND）</option>
          <option value="or">任一条件（OR）</option>
        </select>
      </div>
      {group.rules.map((r, i) => (
        <div className="db-filter-rule" key={i}>
          {r.rules ? (
            <FilterGroup
              group={r}
              fields={fields}
              dataset={dataset}
              change={(next) => update(i, next)}
              depth={depth + 1}
            />
          ) : (
            <>
              <select
                aria-label="筛选属性"
                value={r.field}
                onChange={(e) => {
                  const f = fields.find((x) => x.id === e.target.value);
                  update(i, {
                    field: f.id,
                    op: 'is',
                    value: f.type === 'number' ? 0 : f.type === 'checkbox' ? true : '',
                  });
                }}
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="筛选运算"
                value={r.op}
                onChange={(e) => update(i, { ...r, op: e.target.value })}
              >
                {operatorsFor(fields.find((f) => f.id === r.field)).map((op) => (
                  <option key={op} value={op}>
                    {operators[op]}
                  </option>
                ))}
              </select>
              {!['empty', 'notEmpty'].includes(r.op) && (
                <ValueInput
                  field={fields.find((f) => f.id === r.field)}
                  value={r.value}
                  dataset={dataset}
                  filter
                  label="筛选值"
                  onChange={(value) => update(i, { ...r, value })}
                />
              )}
            </>
          )}
          <button
            className="icon-button"
            aria-label="移除筛选条件"
            onClick={() => change({ ...group, rules: group.rules.filter((_, j) => i !== j) })}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <div className="db-inline-actions">
        <button onClick={add}>
          <Plus size={14} /> 添加条件
        </button>
        {depth < 3 && (
          <button
            onClick={() => change({ ...group, rules: [...group.rules, { mode: 'or', rules: [] }] })}
          >
            添加条件组
          </button>
        )}
      </div>
    </div>
  );
}
function Settings({ view, update, fields, dataset }) {
  const reorder = (index, offset) => {
    const columns = [...view.columns];
    [columns[index], columns[index + offset]] = [columns[index + offset], columns[index]];
    update({ columns });
  };
  return (
    <section className="db-settings" aria-label="视图设置">
      <div>
        <h3>筛选</h3>
        <FilterGroup
          group={view.filters}
          fields={fields}
          dataset={dataset}
          change={(filters) => update({ filters })}
        />
      </div>
      <div className="db-settings-side">
        <div>
          <h3>排序优先级</h3>
          {view.sorts.map((sort, i) => (
            <div className="db-sort" key={i}>
              <select
                aria-label="排序属性"
                value={sort.field}
                onChange={(e) =>
                  update({
                    sorts: view.sorts.map((x, j) =>
                      j === i ? { ...x, field: e.target.value } : x,
                    ),
                  })
                }
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="排序方向"
                value={sort.direction}
                onChange={(e) =>
                  update({
                    sorts: view.sorts.map((x, j) =>
                      j === i ? { ...x, direction: e.target.value } : x,
                    ),
                  })
                }
              >
                <option value="asc">升序</option>
                <option value="desc">降序</option>
              </select>
              <button
                aria-label="移除排序"
                onClick={() => update({ sorts: view.sorts.filter((_, j) => i !== j) })}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            disabled={view.sorts.length >= 8}
            onClick={() => update({ sorts: [...view.sorts, { field: 'title', direction: 'asc' }] })}
          >
            添加次级排序
          </button>
        </div>
        <div>
          <h3>显示属性 · 按顺序排列</h3>
          <div className="db-columns">
            {[
              ...view.columns,
              ...fields.filter((f) => !view.columns.includes(f.id)).map((f) => f.id),
            ].map((id) => {
              const f = fields.find((f) => f.id === id),
                index = view.columns.indexOf(id);
              return (
                <div key={id}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={id === 'title'}
                      checked={index >= 0}
                      onChange={(e) =>
                        update({
                          columns: e.target.checked
                            ? [...view.columns, id]
                            : view.columns.filter((x) => x !== id),
                        })
                      }
                    />
                    {f.name}
                  </label>
                  {index >= 0 && (
                    <span>
                      <button
                        aria-label={'上移 ' + f.name}
                        disabled={index === 0}
                        onClick={() => reorder(index, -1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        aria-label={'下移 ' + f.name}
                        disabled={index === view.columns.length - 1}
                        onClick={() => reorder(index, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="db-settings-options">
          <label>
            分组属性
            <select value={view.groupBy} onChange={(e) => update({ groupBy: e.target.value })}>
              {fields
                .filter((f) => ['select', 'multiSelect', 'checkbox', 'relation'].includes(f.type))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            日历日期
            <select value={view.dateField} onChange={(e) => update({ dateField: e.target.value })}>
              {fields
                .filter((f) => f.type === 'date')
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            行密度
            <select value={view.density} onChange={(e) => update({ density: e.target.value })}>
              <option value="comfortable">舒适</option>
              <option value="compact">紧凑</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={view.showArchived}
              onChange={(e) => update({ showArchived: e.target.checked })}
            />
            包含归档
          </label>
        </div>
      </div>
    </section>
  );
}
function PropertyManager({ database, dataset, save, busy }) {
  const [draft, setDraft] = useState({
      name: '',
      type: 'text',
      options: '',
      resultType: 'number',
      expression: '',
      relation: '',
      source: 'year',
      aggregate: 'count',
    }),
    [editing, setEditing] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    const property = {
      id: editing || uid('prop'),
      name: draft.name.trim(),
      type: draft.type,
      ...(['select', 'multiSelect'].includes(draft.type)
        ? {
            options: draft.options
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean),
          }
        : {}),
      ...(draft.type === 'formula'
        ? { resultType: draft.resultType, expression: draft.expression.trim() }
        : {}),
      ...(draft.type === 'rollup'
        ? {
            relation: draft.relation,
            aggregate: draft.aggregate,
            ...(draft.aggregate !== 'count' ? { source: draft.source } : {}),
          }
        : {}),
    };
    const properties = editing
      ? database.properties.map((p) => (p.id === editing ? property : p))
      : [...database.properties, property];
    if (await save({ ...database, properties })) {
      setEditing(null);
      setDraft({
        name: '',
        type: 'text',
        options: '',
        resultType: 'number',
        expression: '',
        relation: '',
        source: 'year',
        aggregate: 'count',
      });
    }
  };
  return (
    <div className="db-property-manager">
      <p>
        自定义属性仅保存在本地，随完整备份迁移；关联论文用于个人组织，不会自动产生已审核的研究关系。
      </p>
      <div className="db-property-list">
        {database.properties.map((p) => (
          <button
            key={p.id}
            disabled={busy}
            onClick={() => {
              setEditing(p.id);
              setDraft({
                name: p.name,
                type: p.type,
                options: (p.options || []).join('\n'),
                resultType: p.resultType || 'number',
                expression: p.expression || '',
                relation: p.relation || '',
                source: p.source || 'year',
                aggregate: p.aggregate || 'count',
              });
            }}
          >
            <span>{p.name}</span>
            <small>{typeNames[p.type]} · 编辑</small>
          </button>
        ))}
        {!database.properties.length && (
          <small>还没有自定义属性。可以添加阅读日期、优先级或实验进度。</small>
        )}
      </div>
      <form onSubmit={submit}>
        <h3>{editing ? '编辑属性' : '新建属性'}</h3>
        <label>
          属性名称
          <input
            required
            maxLength={80}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          属性类型
          <select
            disabled={!!editing}
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value })}
          >
            {Object.entries(typeNames).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {['select', 'multiSelect'].includes(draft.type) && (
          <label>
            选项（每行一个）
            <textarea
              required
              value={draft.options}
              onChange={(e) => setDraft({ ...draft, options: e.target.value })}
            />
          </label>
        )}
        {draft.type === 'formula' && (
          <>
            <label>
              返回类型
              <select
                aria-label="公式返回类型"
                value={draft.resultType}
                onChange={(e) => setDraft({ ...draft, resultType: e.target.value })}
              >
                {Object.entries(formulaResultTypes).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              公式表达式
              <textarea
                aria-label="公式表达式"
                required
                maxLength={500}
                rows="3"
                placeholder={'例如：prop("year") - 2020 或 length(prop("tags"))'}
                value={draft.expression}
                onChange={(e) => setDraft({ ...draft, expression: e.target.value })}
              />
            </label>
            <small>
              只读计算值；支持 prop、length、count、sum、if、ifEmpty、concat、round 和基本算术。
            </small>
          </>
        )}
        {draft.type === 'rollup' && (
          <>
            <label>
              关联属性
              <select
                aria-label="汇总关联属性"
                required
                value={draft.relation}
                onChange={(e) => setDraft({ ...draft, relation: e.target.value })}
              >
                <option value="">选择关联属性…</option>
                {database.properties
                  .filter((p) => p.type === 'relation')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              汇总方式
              <select
                aria-label="汇总方式"
                value={draft.aggregate}
                onChange={(e) => setDraft({ ...draft, aggregate: e.target.value })}
              >
                {Object.entries(rollupAggregates).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {draft.aggregate !== 'count' && (
              <label>
                汇总字段
                <select
                  aria-label="汇总字段"
                  required
                  value={draft.source}
                  onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                >
                  {fieldsFor(database, dataset)
                    .filter((f) => f.id !== 'title' || draft.aggregate === 'unique')
                    .filter((f) => draft.aggregate === 'unique' || f.type === 'number')
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <small>汇总值来自每篇论文的关联属性；结果只读，关系改变后自动更新。</small>
          </>
        )}
        {editing && <small>稳定 ID 与类型保持不变；仍被使用的选项不能移除。</small>}
        <div className="db-inline-actions">
          <button className="primary" disabled={busy}>
            {editing ? '保存属性' : '创建属性'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft({ name: '', type: 'text', options: '' });
              }}
            >
              取消编辑
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
export function DatabasePage({
  workspace,
  refresh,
  notify,
  route,
  Md,
  setSelected: setCompare,
  config,
}) {
  const database = workspace.database || defaultDatabase(),
    dataset = workspace.dataset;
  const requested = route.params.get('view');
  const saved = database.views.find((v) => v.id === requested) || database.views[0];
  const [view, setView] = useState(() => structuredClone(saved)),
    [baseRevision, setBaseRevision] = useState(workspace.revision),
    [settings, setSettings] = useState(false),
    [propertyPanel, setPropertyPanel] = useState(route.params.get('properties') === '1'),
    [naming, setNaming] = useState(null),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState([]),
    [editing, setEditing] = useState(null),
    [peekId, setPeekId] = useState(null),
    [undo, setUndo] = useState(null),
    [page, setPage] = useState(1),
    [batchField, setBatchField] = useState('status'),
    [batchValue, setBatchValue] = useState('reading'),
    [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const allowSavedNavigation = useRef(false);
  const inFlight = useRef(false),
    fields = fieldsFor(database, dataset),
    dirty = !same(view, saved),
    rows = queryRows(dataset, database, view),
    visibleIds = new Set(rows.map((p) => p.id)),
    chosen = selected.filter((id) => visibleIds.has(id)),
    activeField = fields.find((f) => f.id === batchField) || fields[2],
    peek = dataset.papers.find((p) => p.id === peekId),
    columns = view.columns.map((id) => fields.find((f) => f.id === id)).filter(Boolean),
    pageCount = Math.max(1, Math.ceil(rows.length / 50)),
    currentPage = Math.min(page, pageCount),
    pageRows = rows.slice((currentPage - 1) * 50, currentPage * 50);
  const update = (changes) => {
    if (editing && (changes.layout || changes.groupBy)) {
      if (!confirm('放弃当前单元格未保存修改并切换布局？')) return;
      setEditing(null);
    }
    setView((v) => ({ ...v, ...changes }));
    setPage(1);
  };
  useEffect(() => {
    if (!dirty) {
      setView(structuredClone(saved));
      setBaseRevision(workspace.revision);
    }
    setSelected((ids) => ids.filter((id) => dataset.papers.some((p) => p.id === id)));
  }, [workspace.revision]);
  useEffect(() => {
    const guard = (e) => {
      if (dirty || editing) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const click = (e) => {
      if (inFlight.current) {
        e.preventDefault();
        return;
      }
      if (allowSavedNavigation.current) {
        allowSavedNavigation.current = false;
        return;
      }
      if ((dirty || editing) && !confirm('有未保存的视图设置或单元格修改，仍要离开？'))
        e.preventDefault();
    };
    addEventListener('beforeunload', guard);
    window.addEventListener('pkh-before-navigate', click);
    return () => {
      removeEventListener('beforeunload', guard);
      window.removeEventListener('pkh-before-navigate', click);
    };
  }, [dirty, editing]);
  useEffect(() => {
    sessionStorage.setItem('pkh-library-route', location.hash);
  }, [route.params.toString()]);
  const run = async (action) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (e) {
      setError(
        e.saved
          ? '此次保存已成功，但回读前主库又有更新。保留当前草稿供核对；请重新读取后合并，不能覆盖新版本。'
          : e.status === 409
            ? '版本冲突：修改尚未保存。请先导出当前视图或记下单元格内容，再重新读取；不会自动覆盖其他修改。'
            : e.message,
      );
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const persistDatabase = (next, revision = baseRevision) =>
    run(async () => {
      const response = await workspaceRequest(
        '/api/database',
        { database: next, expectedRevision: revision },
        workspace.csrfToken,
      );
      const state = await refresh();
      setBaseRevision(response.revision);
      if (state.revision !== response.revision)
        throw Object.assign(Error('Workspace changed during readback'), {
          status: 409,
          saved: true,
        });
      setUndo(null);
      notify('数据库设置已保存到本机');
    });
  const saveView = async () => {
    const next = { ...database, views: database.views.map((v) => (v.id === saved.id ? view : v)) };
    await persistDatabase(next);
  };
  const saveProperty = async (next) => {
    const result = await persistDatabase(next);
    if (result && !dirty)
      setView(structuredClone(next.views.find((v) => v.id === view.id) || next.views[0]));
    return result;
  };
  const mutate = async (changes, undoing = false) => {
    const savingCell =
      editing &&
      !undoing &&
      changes.length === 1 &&
      changes[0].id === editing.paperId &&
      same(changes[0].changes, changeFor(editing.field, editing.value));
    if (editing && !savingCell && !confirm('此操作将放弃当前单元格未保存修改，继续？'))
      return false;
    const published = changes.filter(
      (c) => dataset.papers.find((p) => p.id === c.id)?.visibility === 'public',
    ).length;
    if (
      published &&
      !confirm(`将修改 ${published} 篇允许公开的论文。已审查这些更改，并同意它们进入下次公开构建？`)
    )
      return false;
    const previous = changes.map((c) => {
      const p = dataset.papers.find((p) => p.id === c.id);
      return {
        id: c.id,
        changes: Object.fromEntries(
          Object.entries(c.changes).map(([key, value]) => [
            key,
            key === 'customProperties'
              ? Object.fromEntries(
                  Object.keys(value).map((k) => [k, p.customProperties?.[k] ?? null]),
                )
              : (p[key] ?? null),
          ]),
        ),
      };
    });
    return run(async () => {
      const response = await workspaceRequest(
        '/api/papers/batch',
        {
          changes,
          expectedRevision: undoing
            ? undo.revision
            : savingCell
              ? editing.revision
              : workspace.revision,
          publishConsent: published > 0,
        },
        workspace.csrfToken,
      );
      await refresh();
      setBaseRevision((revision) =>
        revision === workspace.revision ? response.revision : revision,
      );
      setUndo(undoing ? null : { revision: response.revision, changes: previous });
      setEditing(null);
      notify(undoing ? '已撤销上次修改' : `已保存 ${changes.length} 篇论文`);
    });
  };
  const changeCell = (p, f) => {
    if (editing && !confirm('放弃当前单元格未保存修改？')) return;
    setEditing({
      paperId: p.id,
      field: f.id,
      revision: workspace.revision,
      value: structuredClone(valueOf(p, f.id, database, dataset) ?? null),
    });
  };
  const toggle = (id) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const selectAll = () => setSelected(chosen.length === rows.length ? [] : rows.map((p) => p.id));
  const openView = (id) => {
    location.hash = '/database?view=' + id;
  };
  const renameOrCreate = async (e) => {
    e.preventDefault();
    if (editing && naming !== 'rename' && !confirm('放弃当前单元格未保存修改并打开新视图？'))
      return;
    const candidate =
      naming === 'rename'
        ? { ...view, name: name.trim() }
        : { ...view, id: uid('view'), name: name.trim() };
    const next = {
      ...database,
      views:
        naming === 'rename'
          ? database.views.map((v) => (v.id === view.id ? candidate : v))
          : [...database.views, candidate],
    };
    if (await persistDatabase(next)) {
      setView(candidate);
      setNaming(null);
      if (candidate.id !== view.id) {
        allowSavedNavigation.current = true;
        location.hash = '/database?view=' + candidate.id;
      }
    }
  };
  const discard = async () => {
    if (!confirm('重新读取会放弃本页未保存的视图与单元格修改，继续？')) return;
    await run(async () => {
      const state = await refresh();
      const db = state.database || defaultDatabase();
      setView(structuredClone(db.views.find((v) => v.id === saved.id) || db.views[0]));
      setBaseRevision(state.revision);
      setEditing(null);
      setUndo(null);
    });
  };
  const titleButton = (p) => (
    <button className="db-title-button" onClick={() => setPeekId(p.id)}>
      <FileText size={16} />
      <span>
        {p.acronym || p.title}
        {p.acronym && <small>{p.title}</small>}
      </span>
    </button>
  );
  const cell = (p, f) => {
    const edit = editing?.paperId === p.id && editing.field === f.id;
    if (f.id === 'title') return titleButton(p);
    if (edit)
      return (
        <form
          className="db-cell-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            await mutate([{ id: p.id, changes: changeFor(f.id, editing.value) }]);
          }}
        >
          <ValueInput
            field={f}
            value={editing.value}
            onChange={(value) => setEditing({ ...editing, value })}
            dataset={dataset}
            label={'编辑 ' + f.name}
          />
          <div>
            <button type="submit" disabled={busy} aria-label="保存单元格">
              <Check size={14} />
            </button>
            <button type="button" onClick={() => setEditing(null)} aria-label="取消单元格">
              <X size={14} />
            </button>
          </div>
        </form>
      );
    return (
      <button
        className={
          'db-cell-value ' +
          (f.type === 'select'
            ? 'db-pill ' + String(valueOf(p, f.id, database, dataset) || '')
            : '')
        }
        disabled={f.readonly || busy}
        title={f.readonly ? '只读属性' : '点击编辑 ' + f.name}
        aria-label={`${p.acronym || p.title} · ${f.name}：${displayValue(valueOf(p, f.id, database, dataset), f, dataset)}`}
        onClick={() => changeCell(p, f)}
      >
        {displayValue(valueOf(p, f.id, database, dataset), f, dataset)}
      </button>
    );
  };
  const card = (p) => (
    <article
      key={p.id}
      className="db-card"
      draggable={
        !busy &&
        !editing &&
        view.layout === 'board' &&
        fields.find((f) => f.id === view.groupBy)?.type === 'select'
      }
      onDragStart={(e) => e.dataTransfer.setData('text/x-paper-id', p.id)}
    >
      <div className="db-card-top">
        <label>
          <input
            type="checkbox"
            checked={chosen.includes(p.id)}
            onChange={() => toggle(p.id)}
            aria-label={'选择 ' + (p.acronym || p.title)}
          />
          <span>{p.year}</span>
        </label>
        <span className={'db-status ' + (p.status || 'unread')}>
          {labels[p.status || 'unread']}
        </span>
      </div>
      {titleButton(p)}
      {view.layout === 'gallery' && (
        <p className="db-card-summary">
          {p.summary || p.abstract || '尚未填写摘要，可打开论文继续整理。'}
        </p>
      )}
      <div className="db-card-fields">
        {columns
          .filter((f) => !['title', 'year'].includes(f.id))
          .map((f) => (
            <div key={f.id}>
              <small>{f.name}</small>
              {cell(p, f)}
            </div>
          ))}
      </div>
      <footer>
        <span>
          {p.note ? '已附笔记' : '待补笔记'} ·{' '}
          {(p.authors || []).slice(0, 2).join(', ') || '作者待录入'}
        </span>
        <button aria-label={'打开 ' + (p.acronym || p.title)} onClick={() => setPeekId(p.id)}>
          <MoreHorizontal size={17} />
        </button>
      </footer>
    </article>
  );
  const calendar = () => {
    const [year, mon] = month.split('-').map(Number),
      days = new Date(year, mon, 0).getDate(),
      offset = (new Date(year, mon - 1, 1).getDay() + 6) % 7,
      field = fields.find((f) => f.id === view.dateField),
      unscheduled = rows.filter((p) => empty(valueOf(p, view.dateField, database, dataset))),
      thisMonth = rows.filter((p) =>
        String(valueOf(p, view.dateField, database, dataset) || '').startsWith(month),
      );
    const shift = (delta) => {
      const date = new Date(year, mon - 1 + delta, 1);
      setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    };
    return (
      <div className="db-calendar-wrap">
        <div className="db-calendar-toolbar">
          <div>
            <h3>
              {year} 年 {mon} 月
            </h3>
            <small>
              按「{field.name}」展示 · 本月 {thisMonth.length} 篇
            </small>
          </div>
          <div>
            <button aria-label="上个月" onClick={() => shift(-1)}>
              <ChevronLeft size={17} />
            </button>
            <button onClick={() => setMonth(new Date().toISOString().slice(0, 7))}>本月</button>
            <button aria-label="下个月" onClick={() => shift(1)}>
              <ChevronRight size={17} />
            </button>
            <input
              type="month"
              aria-label="跳转月份"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
          </div>
        </div>
        <div className="db-calendar">
          {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
            <div className="db-weekday" key={d}>
              周{d}
            </div>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <div className="db-day blank" key={'blank' + i} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const date = month + '-' + String(i + 1).padStart(2, '0');
            return (
              <div
                className={
                  'db-day ' + (date === new Date().toISOString().slice(0, 10) ? 'today' : '')
                }
                key={date}
              >
                <span>{i + 1}</span>
                {rows
                  .filter((p) => valueOf(p, view.dateField, database, dataset) === date)
                  .map((p) => (
                    <button key={p.id} onClick={() => setPeekId(p.id)} title={p.title}>
                      {p.acronym || p.title}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
        {unscheduled.length > 0 && (
          <details className="db-unscheduled">
            <summary>未设置日期 · {unscheduled.length} 篇</summary>
            <div className="db-unscheduled-list">
              {unscheduled.map((p) => (
                <div key={p.id}>
                  {titleButton(p)}
                  {cell(p, field)}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  };
  return (
    <div className={'database-page density-' + view.density} aria-busy={busy}>
      <fieldset className="db-interactions" disabled={busy}>
        <header className="db-heading">
          <div>
            <div className="db-eyebrow">
              <BookOpen size={16} /> RESEARCH COLLECTION
            </div>
            <h1>论文数据库</h1>
            <p>把收集、阅读与下一步研究安排放在同一个工作台。</p>
          </div>
          <a className="button primary" href="#/edit/new">
            <Plus size={17} /> 新建论文
          </a>
        </header>
        <div className="db-metrics">
          <span>
            <b>{dataset.papers.filter((p) => p.lifecycle !== 'archived').length}</b> 在库论文
          </span>
          <span>
            <b>
              {
                dataset.papers.filter((p) => p.lifecycle !== 'archived' && p.status === 'reading')
                  .length
              }
            </b>{' '}
            正在阅读
          </span>
          <span>
            <b>
              {
                dataset.papers.filter(
                  (p) => p.lifecycle !== 'archived' && p.status === 'reviewed' && !p.note?.trim(),
                ).length
              }
            </b>{' '}
            已整理待补笔记
          </span>
          <span>
            <b>{database.views.length}</b> 保存视图
          </span>
        </div>
        <section className="db-surface">
          <div className="db-viewbar">
            <div role="tablist" aria-label="数据库视图" className="db-viewtabs">
              {database.views.map((v) => {
                const Icon = layoutIcons[v.layout];
                return (
                  <button
                    key={v.id}
                    role="tab"
                    aria-selected={saved.id === v.id}
                    onClick={() => openView(v.id)}
                  >
                    <Icon size={16} />
                    {v.name}
                  </button>
                );
              })}
              <button
                aria-label="新建视图"
                onClick={() => {
                  setNaming('create');
                  setName('新视图');
                }}
              >
                <Plus size={17} />
              </button>
            </div>
            <button aria-label="管理自定义属性" onClick={() => setPropertyPanel(true)}>
              <Settings2 size={16} />
              <span>属性</span>
            </button>
          </div>
          <div className="db-toolbar">
            <label className="db-search">
              <Search size={17} />
              <input
                aria-label="搜索数据库"
                placeholder="搜索标题、作者或标签…"
                value={view.query}
                onChange={(e) => update({ query: e.target.value })}
              />
            </label>
            <div className="db-toolbar-actions">
              <select
                aria-label="视图布局"
                value={view.layout}
                onChange={(e) => update({ layout: e.target.value })}
              >
                {Object.entries(layouts).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className={settings ? 'active' : ''}
                aria-expanded={settings}
                onClick={() => setSettings(!settings)}
              >
                <SlidersHorizontal size={16} /> 筛选与布局
              </button>
              <button disabled={busy || !dirty} onClick={saveView}>
                <Save size={16} /> 保存视图{dirty ? ' *' : ''}
              </button>
              <details className="db-menu">
                <summary aria-label="更多视图操作">
                  <MoreHorizontal size={20} />
                </summary>
                <div>
                  <button
                    onClick={() => {
                      setNaming('rename');
                      setName(view.name);
                    }}
                  >
                    重命名视图
                  </button>
                  <button
                    onClick={() => {
                      setNaming('copy');
                      setName(view.name + ' 副本');
                    }}
                  >
                    复制当前视图
                  </button>
                  <button
                    disabled={busy || database.views.length <= 1}
                    onClick={async () => {
                      if (!confirm('删除此保存视图？论文和属性会保留。')) return;
                      const next = {
                        ...database,
                        views: database.views.filter((v) => v.id !== saved.id),
                      };
                      if (await persistDatabase(next)) {
                        setView(next.views[0]);
                        allowSavedNavigation.current = true;
                        location.hash = '/database?view=' + next.views[0].id;
                      }
                    }}
                  >
                    删除此视图
                  </button>
                  <button
                    onClick={() =>
                      download(
                        'database-view.json',
                        JSON.stringify(view, null, 2),
                        'application/json',
                      )
                    }
                  >
                    导出当前视图设置
                  </button>
                </div>
              </details>
              <button
                title="导出当前筛选结果与显示列（可能含私有内容）"
                onClick={() =>
                  download(
                    'papers.csv',
                    csvRows(rows, columns, dataset, database),
                    'text/csv;charset=utf-8',
                  )
                }
              >
                <Download size={16} /> CSV
              </button>
            </div>
          </div>
          {settings && <Settings view={view} update={update} fields={fields} dataset={dataset} />}
          {error && (
            <div className="db-error" role="alert">
              {error}
              <button disabled={busy} onClick={discard}>
                重新读取并放弃未保存修改
              </button>
            </div>
          )}
          <div className="db-resultbar">
            <span>
              {rows.length} 条结果 {view.showArchived && '· 包含归档'} ·{' '}
              {dirty ? '视图设置未保存' : '视图设置已保存'}
              {busy && ' · 正在保存…'}
            </span>
            <div>
              {undo && (
                <button
                  disabled={busy || undo.revision !== workspace.revision}
                  onClick={() => mutate(undo.changes, true)}
                  title="仅在主库版本未继续变化时可撤销"
                >
                  <RotateCcw size={14} /> 撤销上次修改
                </button>
              )}
              <button disabled={!rows.length} onClick={selectAll}>
                {chosen.length === rows.length && rows.length ? '取消全选' : '选择全部结果'}
              </button>
            </div>
          </div>
          {chosen.length > 0 && (
            <div className="db-batch">
              <strong>已选 {chosen.length} 篇</strong>
              <select
                aria-label="批量属性"
                value={activeField.id}
                onChange={(e) => {
                  const f = fields.find((f) => f.id === e.target.value);
                  setBatchField(f.id);
                  setBatchValue(null);
                }}
              >
                {fields
                  .filter((f) => !f.readonly)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
              <ValueInput
                field={activeField}
                value={batchValue}
                onChange={setBatchValue}
                dataset={dataset}
                label="批量值"
              />
              <button
                disabled={busy || chosen.length > 1000}
                onClick={() =>
                  mutate(
                    chosen.map((id) => ({ id, changes: changeFor(activeField.id, batchValue) })),
                  )
                }
              >
                应用到所选
              </button>
              <button
                disabled={chosen.length > config.display.maxCompare}
                onClick={() => {
                  setCompare(chosen);
                  location.hash = '/compare?ids=' + chosen.join(',');
                }}
              >
                加入比较
              </button>
              <button onClick={() => setSelected([])} aria-label="清除选择">
                <X size={16} />
              </button>
              <small>多选属性将替换原值；清空需明确选择空值。</small>
            </div>
          )}
          {!rows.length ? (
            <div className="db-empty">
              <Search size={32} />
              <h2>{dataset.papers.length ? '没有符合条件的论文' : '从第一篇论文开始'}</h2>
              <p>
                {dataset.papers.length
                  ? '试试修改搜索词、筛选条件或归档范围。'
                  : '新增书目信息，随后在表格中安排阅读状态与自定义属性。'}
              </p>
              {dataset.papers.length ? (
                <button onClick={() => update({ query: '', filters: { mode: 'and', rules: [] } })}>
                  清除搜索与筛选
                </button>
              ) : (
                <a href="#/edit/new" className="button primary">
                  新增论文
                </a>
              )}
            </div>
          ) : view.layout === 'table' ? (
            <div className="db-table-scroll">
              <table className="db-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="选择全部结果"
                        checked={chosen.length === rows.length && rows.length > 0}
                        onChange={selectAll}
                      />
                    </th>
                    {columns.map((f) => (
                      <th key={f.id}>
                        {f.name}
                        {view.sorts.some((s) => s.field === f.id) && (
                          <span>
                            {' '}
                            {view.sorts.find((s) => s.field === f.id).direction === 'asc'
                              ? '↑'
                              : '↓'}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr key={p.id} className={chosen.includes(p.id) ? 'selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={'选择 ' + (p.acronym || p.title)}
                          checked={chosen.includes(p.id)}
                          onChange={() => toggle(p.id)}
                        />
                      </td>
                      {columns.map((f) => (
                        <td key={f.id}>{cell(p, f)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td colSpan={columns.length}>
                      共 {rows.length} 条 · 当前显示 {(currentPage - 1) * 50 + 1}–
                      {Math.min(currentPage * 50, rows.length)} · 点击属性编辑，点击论文打开侧览
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : view.layout === 'board' ? (
            <div className="db-board">
              {groupRows(
                rows,
                fields.find((f) => f.id === view.groupBy),
                database,
                dataset,
              ).map((group) => (
                <section
                  key={group.key}
                  className="db-board-column"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/x-paper-id'),
                      f = fields.find((f) => f.id === view.groupBy);
                    if (
                      !busy &&
                      !editing &&
                      visibleIds.has(id) &&
                      f.type === 'select' &&
                      !f.readonly
                    )
                      mutate([{ id, changes: changeFor(f.id, group.key || null) }]);
                  }}
                >
                  <h3>
                    <span className={'db-status ' + group.key}>
                      {group.key
                        ? displayValue(
                            group.key,
                            fields.find((f) => f.id === view.groupBy),
                            dataset,
                          )
                        : '未设置'}
                    </span>
                    <small>{group.papers.length}</small>
                  </h3>
                  {group.papers.map(card)}
                  {!group.papers.length && <p className="db-board-empty">暂无论文</p>}
                </section>
              ))}
            </div>
          ) : view.layout === 'calendar' ? (
            calendar()
          ) : view.layout === 'gallery' ? (
            <div className="db-gallery">{pageRows.map(card)}</div>
          ) : (
            <div className="db-list">
              {pageRows.map((p) => (
                <div key={p.id}>
                  <input
                    type="checkbox"
                    aria-label={'选择 ' + (p.acronym || p.title)}
                    checked={chosen.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  {titleButton(p)}
                  <span>{p.year}</span>
                  {cell(
                    p,
                    fields.find((f) => f.id === 'status'),
                  )}
                  <button
                    onClick={() => setPeekId(p.id)}
                    aria-label={'打开 ' + (p.acronym || p.title)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {rows.length > 50 && !['board', 'calendar'].includes(view.layout) && (
            <div className="db-pagination">
              <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                上一页
              </button>
              <span>
                {currentPage} / {pageCount}
              </span>
              <button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                下一页
              </button>
            </div>
          )}
        </section>
        <p className="db-footnote">
          本地属性与视图不会进入公开站。多选分组中的论文可出现在多个分组；统计按论文去重。CSV
          导出包含当前可见属性，请按私有资料管理。
        </p>
        {propertyPanel && (
          <Modal title="数据库属性" close={() => setPropertyPanel(false)}>
            <PropertyManager
              database={database}
              dataset={dataset}
              save={saveProperty}
              busy={busy}
            />
            {error && (
              <p role="alert" className="db-error">
                {error}
              </p>
            )}
          </Modal>
        )}
        {naming && (
          <Modal
            title={naming === 'rename' ? '重命名视图' : '保存新视图'}
            close={() => setNaming(null)}
          >
            <form className="db-name-form" onSubmit={renameOrCreate}>
              <label>
                视图名称
                <input
                  required
                  autoFocus
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <p>保留当前布局、筛选、排序、列顺序与日期属性。</p>
              <button className="primary" disabled={busy}>
                确认保存
              </button>
              {error && <p role="alert">{error}</p>}
            </form>
          </Modal>
        )}
        {peek && (
          <Modal title={peek.acronym || peek.title} close={() => setPeekId(null)} wide>
            <div className="db-peek">
              <div className="db-peek-actions">
                <span className={'db-status ' + (peek.status || 'unread')}>
                  {labels[peek.status || 'unread']}
                </span>
                <a className="button" href={'#/paper/' + peek.id}>
                  完整详情与证据
                </a>
                <a className="button primary" href={'#/edit/' + peek.id}>
                  编辑论文
                </a>
              </div>
              <h1>{peek.title}</h1>
              <p>
                {(peek.authors || []).join(', ')} · {peek.year}
              </p>
              <dl>
                {fields
                  .filter((f) => f.id !== 'title')
                  .map((f) => (
                    <div key={f.id}>
                      <dt>{f.name}</dt>
                      <dd>{displayValue(valueOf(peek, f.id, database, dataset), f, dataset)}</dd>
                    </div>
                  ))}
              </dl>
              <h2>论文笔记</h2>
              {peek.note ? <Md>{peek.note}</Md> : <p>尚无笔记，可进入编辑器补充。</p>}
            </div>
          </Modal>
        )}
      </fieldset>
    </div>
  );
}
