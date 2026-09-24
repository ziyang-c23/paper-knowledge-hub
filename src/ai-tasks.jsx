import React, { useEffect, useState } from 'react';
import { workspaceRequest } from './workspace.jsx';
import { NOTE_SECTIONS } from './lib/note-template.mjs';
const labels = {
  queued: '待运行',
  running: '等待 Agent 结果',
  review: '待审',
  failed: '失败',
  applied: '已应用',
  cancelled: '已取消',
};
export function AITasks({ workspace, notify }) {
  const [tasks, setTasks] = useState([]),
    [type, setType] = useState('section'),
    [ids, setIds] = useState([]),
    [sectionId, setSectionId] = useState(NOTE_SECTIONS[0].id),
    [topicId, setTopicId] = useState(''),
    [question, setQuestion] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const load = () => workspaceRequest('/api/ai-tasks').then((result) => setTasks(result.tasks));
  useEffect(() => {
    load().catch((error) => setError(error.message));
  }, []);
  const run = async (payload) => {
    setBusy(true);
    setError('');
    try {
      const result = await workspaceRequest(
        '/api/ai-tasks',
        { ...payload, expectedRevision: workspace.revision },
        workspace.csrfToken,
      );
      await load();
      notify('任务状态已保存');
      return result;
    } catch (error) {
      setError(error.message);
      load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ai-task-panel panel padded">
      <h2>让 AI 帮助当前研究</h2>
      <p>选择明确任务，导出上下文交给 Agent，导入结果后审阅。此处不会自动发送全文到云端。</p>
      {error && <p role="alert">{error}</p>}
      <div className="row wrap">
        <label>
          任务{' '}
          <select aria-label="AI整理任务" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="section">补当前章节</option>
            <option value="experiments">抽取实验结果</option>
            <option value="explanation">多源解释 / 代码映射 / 视频说明</option>
            <option value="compare">比较所选论文</option>
          </select>
        </label>
        {type === 'section' && (
          <label>
            章节{' '}
            <select
              aria-label="章节"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              {NOTE_SECTIONS.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === 'compare' && (
          <label>
            保存到专题{' '}
            <select
              aria-label="AI比较目标专题"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
            >
              <option value="">选择私有专题</option>
              {workspace.dataset.topics
                .filter((t) => t.visibility === 'private')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <fieldset className="visual-controls">
        <legend>研究材料</legend>
        {workspace.dataset.papers
          .filter((p) => p.lifecycle !== 'archived')
          .map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={ids.includes(p.id)}
                onChange={() =>
                  setIds(
                    ids.includes(p.id)
                      ? ids.filter((id) => id !== p.id)
                      : type === 'compare'
                        ? [...ids, p.id]
                        : [p.id],
                  )
                }
              />
              {p.acronym || p.title}
            </label>
          ))}
      </fieldset>
      <label>
        具体问题{' '}
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="希望补充、解释或比较什么"
        />
      </label>
      <button
        className="button primary"
        disabled={busy || !ids.length || (type === 'compare' && (!topicId || ids.length < 2))}
        onClick={() =>
          run({
            action: 'create',
            type,
            paperIds: ids,
            sectionId,
            topicId: topicId || undefined,
            question,
          })
        }
      >
        建立整理任务
      </button>
      <div>
        {tasks.map((task) => (
          <article className="draft-field-diff" key={task.id}>
            <h3>
              {
                {
                  section: '章节补充',
                  experiments: '实验提取',
                  compare: '论文比较',
                  explanation: '多源研究解释',
                }[task.type]
              }{' '}
              · {labels[task.status] || task.status}
            </h3>
            <p>
              {task.question ||
                task.paperIds
                  ?.map((id) => workspace.dataset.papers.find((p) => p.id === id)?.acronym || id)
                  .join(' / ')}
            </p>
            {task.error && <p role="alert">{task.error}</p>}
            <div className="row wrap">
              {task.status === 'queued' && (
                <button disabled={busy} onClick={() => run({ action: 'prepare', id: task.id })}>
                  准备上下文
                </button>
              )}
              {['running', 'review', 'failed'].includes(task.status) && (
                <a className="button" href={'/api/ai-tasks/context?id=' + task.id} download>
                  下载 Agent 上下文
                </a>
              )}
              {task.status === 'running' && (
                <label className="button">
                  导入 Agent 结果
                  <input
                    type="file"
                    accept=".json"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        try {
                          await run({
                            action: 'import',
                            id: task.id,
                            result: JSON.parse(await file.text()),
                          });
                        } catch (error) {
                          setError(error.message);
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              {task.status === 'review' && task.draftId && (
                <a className="button primary" href={'#/drafts?id=' + task.draftId}>
                  审阅改动
                </a>
              )}
              {['failed', 'cancelled'].includes(task.status) && (
                <button disabled={busy} onClick={() => run({ action: 'retry', id: task.id })}>
                  重新准备
                </button>
              )}
              {['queued', 'running', 'failed'].includes(task.status) && (
                <button disabled={busy} onClick={() => run({ action: 'cancel', id: task.id })}>
                  取消任务
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
