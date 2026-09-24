import React, { useState, useEffect } from 'react';
import './research-visuals.css';

export function ResearchVisuals({ paper }) {
  if (!paper.visuals) return null;
  return (
    <div className="research-visuals" key={paper.id}>
      {paper.visuals.method && <MethodExplorer paper={paper} method={paper.visuals.method} />}
      {paper.visuals.experiments?.length > 0 && (
        <ExperimentExplorer groups={paper.visuals.experiments} />
      )}
    </div>
  );
}
function MethodExplorer({ paper, method }) {
  const [active, setActive] = useState(method.steps[0]?.id);
  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setTick((tick) => (tick + 1) % (method.timeline?.prediction || 1)),
      450,
    );
    return () => clearInterval(timer);
  }, [playing, method.timeline?.prediction]);
  const [mode, setMode] = useState(method.modes?.[0]?.id || 'inference');
  const step = method.steps.find((item) => item.id === active);
  const currentMode = method.modes?.find((item) => item.id === mode);
  return (
    <section className="method-explorer" aria-label="交互式方法解释">
      <h2>{method.title}</h2>
      {method.modes?.length > 0 && (
        <div className="visual-controls" aria-label="方法阶段">
          {method.modes.map((item) => (
            <button key={item.id} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
      {currentMode && <p>{currentMode.description}</p>}
      <ol className="method-flow">
        {method.steps.map((item, index) => (
          <li key={item.id}>
            <button aria-pressed={active === item.id} onClick={() => setActive(item.id)}>
              <span>{index + 1}</span>
              <b>{item.label}</b>
              {item.updates?.includes(mode) && <small>参数更新</small>}
            </button>
          </li>
        ))}
      </ol>
      {step && (
        <aside className="method-detail" aria-live="polite">
          <h3>{step.label}</h3>
          <p>{step.description}</p>
          <div className="row wrap">
            {step.section && (
              <a
                href={`#/paper/${paper.id}?mode=note&section=${encodeURIComponent(
                  'note-' +
                    step.section
                      .normalize('NFKC')
                      .toLowerCase()
                      .replace(/[^\p{L}\p{N}]+/gu, '-')
                      .replace(/^-|-$/g, ''),
                )}`}
              >
                阅读对应解释
              </a>
            )}
            {step.source && (
              <a href={step.source.url} target="_blank" rel="noreferrer">
                {step.source.locator} ↗
              </a>
            )}
          </div>
        </aside>
      )}
      {method.timeline && (
        <div className="action-timeline">
          <h3>预测与执行窗口</h3>
          <button
            onClick={() => setPlaying(!playing)}
            disabled={matchMedia('(prefers-reduced-motion: reduce)').matches}
          >
            {playing ? '暂停时间示意' : '播放时间示意'}
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setTick((tick + 1) % method.timeline.prediction);
            }}
          >
            下一步
          </button>
          <p>{method.timeline.description}</p>
          <div className="action-steps">
            {Array.from({ length: method.timeline.prediction }, (_, i) => (
              <span
                key={i}
                className={
                  (i < method.timeline.execution ? 'executed' : '') +
                  (i === tick ? ' current-step' : '')
                }
              >
                {i + 1}
                <small>{i < method.timeline.execution ? '执行' : '预测'}</small>
              </span>
            ))}
          </div>
          <small>控制流程示意，非机器人实测轨迹。</small>
        </div>
      )}
    </section>
  );
}
function ExperimentExplorer({ groups }) {
  const requestedGroup = new URLSearchParams(location.hash.split('?')[1] || '').get('experiment');
  const [groupId, setGroupId] = useState(requestedGroup || groups[0].id);
  useEffect(() => {
    if (requestedGroup && groups.some((item) => item.id === requestedGroup)) {
      setGroupId(requestedGroup);
      requestAnimationFrame(() =>
        document.querySelector('.experiment-explorer')?.scrollIntoView({ block: 'start' }),
      );
    }
  }, [requestedGroup]);
  const group = groups.find((item) => item.id === groupId) || groups[0];
  const [hidden, setHidden] = useState([]);
  const [task, setTask] = useState('');
  const tasks = [...new Set(group.rows.map((row) => row.task).filter(Boolean))];
  const rows = group.rows.filter((row, i) => !hidden.includes(i) && (!task || row.task === task));
  const maximum = Math.max(...group.rows.map((row) => Math.abs(row.value || 0)), 1);
  return (
    <section className="experiment-explorer" aria-label="条件化实验结果">
      <h2>实验回答了什么</h2>
      <label>
        实验条件{' '}
        <select
          aria-label="实验条件"
          value={group.id}
          onChange={(event) => {
            setGroupId(event.target.value);
            setHidden([]);
            setTask('');
          }}
        >
          {groups.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <h3>{group.label}</h3>
      <dl className="experiment-protocol">
        {[
          ['任务', group.task],
          ['版本', group.version],
          ['数据', group.data],
          ['适配设置', group.adaptation],
          ['指标', `${group.metric} (${group.unit})`],
          ['试验数', group.trials],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || '未报告'}</dd>
          </div>
        ))}
      </dl>
      {tasks.length > 0 && (
        <label>
          任务{' '}
          <select
            aria-label="实验任务"
            value={task}
            onChange={(event) => setTask(event.target.value)}
          >
            <option value="">全部任务</option>
            {tasks.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="visual-controls">
        <legend>显示方法或变体</legend>
        {group.rows.map((row, i) => (
          <label key={i}>
            <input
              type="checkbox"
              checked={!hidden.includes(i)}
              onChange={() =>
                setHidden(
                  hidden.includes(i) ? hidden.filter((index) => index !== i) : [...hidden, i],
                )
              }
            />
            {row.label}
          </label>
        ))}
      </fieldset>
      <div
        className="result-bars"
        role="img"
        aria-label={`${group.label}，${group.metric}，${group.unit}。完整数值见下表。`}
      >
        {rows.map((row, i) => (
          <div className="result-bar" key={i}>
            <span>{row.label}</span>
            <div>
              <i
                style={{
                  width: row.value === null ? '0%' : `${(Math.abs(row.value) / maximum) * 100}%`,
                }}
              />
            </div>
            <b>{row.value === null ? '未知' : `${row.value}${group.unit}`}</b>
          </div>
        ))}
      </div>
      <div className="result-table" tabIndex={0} aria-label="实验数值表，可横向滚动">
        <table>
          <thead>
            <tr>
              <th>方法 / 变体</th>
              <th>
                {group.metric} ({group.unit})
              </th>
              <th>条件</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <th>{row.label}</th>
                <td>{row.value ?? '未知'}</td>
                <td>{row.condition || '同本组协议'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p role="status">请勾选至少一个方法查看结果。</p>}
      <a href={group.source.url} target="_blank" rel="noreferrer">
        {group.source.locator} · 查看原表 ↗
      </a>
    </section>
  );
}
