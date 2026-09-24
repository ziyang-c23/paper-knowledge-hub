import React, { useEffect, useState } from 'react';
import { AITasks } from './ai-tasks.jsx';
import { noteSectionChanges } from './lib/note-sections.mjs';
import { Inbox, Upload, Check, Download } from 'lucide-react';
import { workspaceRequest } from './workspace.jsx';
import { PageHeader, objectHref } from './ui.jsx';
export function DraftInbox({ workspace, refresh, notify, Md, route }) {
  const [drafts, setDrafts] = useState([]),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState(route.params.get('id') || ''),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [rejectedFields, setRejectedFields] = useState([]),
    [rejectedSections, setRejectedSections] = useState([]);
  const load = async () => {
    const r = await workspaceRequest('/api/drafts');
    setDrafts(r.drafts);
    setSelected(
      (current) =>
        current || r.drafts.find((d) => d.status === 'pending')?.id || r.drafts[0]?.id || '',
    );
    setLoading(false);
    return r.drafts;
  };
  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, []);
  useEffect(() => {
    const id = route.params.get('id');
    if (id) {
      setSelected(id);
      setRejectedFields([]);
      setRejectedSections([]);
      setConfirmed(false);
    }
  }, [route.params.toString()]);
  const draft = drafts.find((d) => d.id === selected),
    record = draft?.record;
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const select = (d) => {
    setSelected(d.id);
    setText(JSON.stringify(d.record, null, 2));
    setEdit(false);
    setConfirmed(false);
    setRejectedFields([]);
    setRejectedSections([]);
  };
  const importDraft = async (file) => {
    const envelope = JSON.parse(await file.text());
    const next = await workspaceRequest('/api/drafts', envelope, workspace.csrfToken);
    await load();
    select(next);
    notify('草稿已保存到本地收件箱');
  };
  const save = async () => {
    const next = await workspaceRequest(
      '/api/drafts',
      { ...draft, record: JSON.parse(text) },
      workspace.csrfToken,
    );
    await load();
    select(next);
    notify('草稿修改已保存');
  };
  const apply = async () => {
    await workspaceRequest(
      '/api/drafts/apply',
      {
        id: draft.id,
        expectedRevision: workspace.revision,
        ...(draft.baseRecord
          ? {
              acceptedFields: changed.filter((key) => !rejectedFields.includes(key)),
              ...(sectionChanges.length && !rejectedFields.includes('note')
                ? {
                    acceptedNoteSections: sectionChanges
                      .filter((section) => !rejectedSections.includes(section.id))
                      .map((section) => section.id),
                  }
                : {}),
            }
          : {}),
      },
      workspace.csrfToken,
    );
    await refresh();
    await load();
    setConfirmed(false);
    notify('已写入知识库，可以打开记录继续整理');
  };
  const stale = draft && draft.baseRevision !== workspace.revision && draft.status !== 'applied';
  const changed = record
    ? [...new Set([...Object.keys(record), ...Object.keys(draft.baseRecord || {})])].filter(
        (k) => JSON.stringify(record[k]) !== JSON.stringify(draft.baseRecord?.[k]),
      )
    : [];
  let sectionChanges = [];
  try {
    if (draft?.baseRecord && changed.includes('note'))
      sectionChanges = noteSectionChanges(draft.baseRecord.note || '', record.note || '');
  } catch {}
  return (
    <>
      <PageHeader
        label="REVIEW BEFORE APPLY"
        title="整理草稿"
        description="检查内容与依据，保留你的判断。模型未配置也可以导入与应用 Agent 草稿。"
        actions={
          <label className="button">
            <Upload size={16} />
            导入草稿
            <input
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                if (e.target.files[0]) run(() => importDraft(e.target.files[0]));
                e.target.value = '';
              }}
            />
          </label>
        }
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <AITasks workspace={workspace} notify={notify} />
      <div className="draft-layout">
        <aside>
          <h2>
            收件箱 <small>{drafts.filter((d) => d.status === 'pending').length} 待审</small>
          </h2>
          {drafts.map((d) => (
            <button
              key={d.id}
              className={'draft-item ' + (selected === d.id ? 'selected' : '')}
              onClick={() => select(d)}
            >
              <small>
                {d.status === 'applied' ? '已应用' : d.status === 'cancelled' ? '已取消' : '待审阅'}{' '}
                · {d.collection}
              </small>
              <b>{d.record.title || d.record.id}</b>
              <small>{new Date(d.updatedAt).toLocaleDateString()}</small>
            </button>
          ))}
          {loading && <p role="status">正在读取草稿…</p>}
          {!loading && !drafts.length && (
            <p className="muted">暂时没有草稿。导入 JSON，或让 Agent 使用仓库 Skill 生成。</p>
          )}
          <details className="skill-help">
            <summary>如何让 AI 参与整理</summary>
            <p>在此仓库打开 Agent，使用：</p>
            <code>$paper-knowledge-hub</code>
            <p>论文整理与入库</p>
            <code>$hub-entities</code>
            <p>实体与关系整理</p>
            <code>$hub-study</code>
            <p>专题分析与材料输出</p>
            <p>生成后执行：</p>
            <pre>npm run ai:draft -- DRAFT.json --collection papers --stage</pre>
            <p>此操作仅保存草稿，不改主库。</p>
          </details>
        </aside>
        <section className="draft-preview">
          {draft ? (
            <>
              <div className="row between">
                <span className="badge">
                  {draft.status === 'applied'
                    ? '已应用'
                    : draft.status === 'cancelled'
                      ? '已取消'
                      : '待审草稿'}
                </span>
                <a href={objectHref(draft.collection, record.id)}>打开知识库记录 →</a>
              </div>
              <h2>{record.title || record.id}</h2>
              <p className="muted">
                {draft.baseRecord ? '更新已有记录' : '新增记录'} · 变更字段：
                {changed.join('、') || '无'}
              </p>
              <details>
                <summary>来源与未决问题</summary>
                <pre>
                  {JSON.stringify(
                    { sourceMaterial: draft.sourceMaterial, uncertainties: draft.uncertainties },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {stale && (
                <p role="alert" className="error">
                  知识库已改变。请导出草稿，与当前记录合并后重新导入；不会覆盖新内容。
                </p>
              )}
              <div className="row wrap">
                <button
                  disabled={draft.status === 'applied'}
                  onClick={() => {
                    setText(JSON.stringify(record, null, 2));
                    setEdit(!edit);
                  }}
                >
                  {edit ? '返回阅读' : '编辑草稿 JSON'}
                </button>
                <button
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob(
                        [
                          JSON.stringify(
                            { ...draft, id: undefined, baseRevision: undefined },
                            null,
                            2,
                          ),
                        ],
                        { type: 'application/json' },
                      ),
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = record.id + '-draft.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Download size={15} />
                  导出草稿
                </button>
              </div>
              {edit ? (
                <>
                  <textarea
                    className="draft-json"
                    aria-label="草稿内容"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button disabled={busy || stale} onClick={() => run(save)}>
                    校验并保存草稿
                  </button>
                </>
              ) : (
                <>
                  {draft.baseRecord ? (
                    changed.map((key) => (
                      <section className="draft-field-diff" key={key}>
                        <label>
                          <input
                            type="checkbox"
                            checked={!rejectedFields.includes(key)}
                            disabled={draft.status === 'applied'}
                            onChange={() =>
                              setRejectedFields(
                                rejectedFields.includes(key)
                                  ? rejectedFields.filter((field) => field !== key)
                                  : [...rejectedFields, key],
                              )
                            }
                          />
                          采纳 {key}
                        </label>
                        {key === 'note' && sectionChanges.length > 0 && (
                          <fieldset className="visual-controls">
                            <legend>选择采纳章节</legend>
                            {sectionChanges.map((section) => (
                              <label key={section.id}>
                                <input
                                  type="checkbox"
                                  checked={!rejectedSections.includes(section.id)}
                                  onChange={() =>
                                    setRejectedSections(
                                      rejectedSections.includes(section.id)
                                        ? rejectedSections.filter((id) => id !== section.id)
                                        : [...rejectedSections, section.id],
                                    )
                                  }
                                />
                                {section.title} ·{' '}
                                {section.kind === 'added'
                                  ? '新增'
                                  : section.kind === 'removed'
                                    ? '删除'
                                    : '修改'}
                              </label>
                            ))}
                          </fieldset>
                        )}
                        <div className="draft-diff-columns">
                          <div>
                            <h3>当前内容</h3>
                            {typeof draft.baseRecord[key] === 'string' ? (
                              <Md>{draft.baseRecord[key]}</Md>
                            ) : (
                              <pre>
                                {JSON.stringify(draft.baseRecord[key], null, 2) || '未设置'}
                              </pre>
                            )}
                          </div>
                          <div>
                            <h3>建议内容</h3>
                            {typeof record[key] === 'string' ? (
                              <Md>{record[key]}</Md>
                            ) : (
                              <pre>{JSON.stringify(record[key], null, 2) || '移除字段'}</pre>
                            )}
                          </div>
                        </div>
                      </section>
                    ))
                  ) : (
                    <Md>
                      {record.note ||
                        record.analysis ||
                        record.description ||
                        record.text ||
                        '此草稿主要更新结构化属性。'}
                    </Md>
                  )}
                  <details>
                    <summary>查看完整属性与原记录</summary>
                    <pre>{JSON.stringify(record, null, 2)}</pre>
                    <h3>修改前</h3>
                    <pre>{JSON.stringify(draft.baseRecord, null, 2)}</pre>
                  </details>
                </>
              )}
              {draft.status === 'pending' && (
                <div className="draft-apply">
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    我已检查内容、来源和变更范围
                  </label>
                  <button
                    className="button primary"
                    disabled={
                      !confirmed ||
                      busy ||
                      stale ||
                      edit ||
                      (Boolean(draft.baseRecord) &&
                        changed.every((key) => rejectedFields.includes(key)))
                    }
                    onClick={() => run(apply)}
                  >
                    <Check size={16} />
                    应用到知识库
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              <Inbox size={36} />
              <h2>选择一份草稿开始审阅</h2>
              <p>草稿与正式记录分开保存，审阅后才会更新知识库。</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
