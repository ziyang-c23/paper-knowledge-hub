import React, { useState, useEffect } from 'react';
import './research-visuals.css';
import { ControlCycle } from './control-cycle.jsx';
import { ActionEncoding } from './action-encoding.jsx';
import { sourceFreshness } from './lib/sources.mjs';
import { OriginalMaterials, originalMedia } from './source-media.jsx';
function SourceUpdate({ paper, derived }) {
  return ['stale', 'missing'].includes(sourceFreshness(paper, derived).status) ? (
    <p className="muted">此讲解采用的来源版本已变化，需重新核对。</p>
  ) : null;
}

export function ResearchVisuals({ paper }) {
  if (
    !paper.visuals &&
    !originalMedia(paper, '方法').length &&
    !originalMedia(paper, '实验结果与分析').length
  )
    return null;
  return (
    <div className="research-visuals" key={paper.id}>
      <OriginalMaterials paper={paper} section="方法" />
      {paper.visuals?.method && <MethodExplorer paper={paper} method={paper.visuals.method} />}
      <OriginalMaterials paper={paper} section="实验结果与分析" />
      {paper.visuals?.experiments?.length > 0 && (
        <ExperimentExplorer paper={paper} groups={paper.visuals.experiments} />
      )}
    </div>
  );
}
function MethodExplorer({ paper, method }) {
  const [active, setActive] = useState(method.steps[0]?.id);
  const move = (delta) => {
    const index = method.steps.findIndex((item) => item.id === active);
    setActive(method.steps[Math.max(0, Math.min(method.steps.length - 1, index + delta))].id);
  };
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
      <svg
        className="mechanism-strip"
        viewBox={`0 0 ${Math.max(1, method.steps.length) * 160} 100`}
        role="img"
        aria-label="方法信息流，节点说明和操作在下方"
      >
        <defs>
          <marker
            id={`flow-arrow-${paper.id}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {method.steps.map((item, index) => (
          <g key={item.id} className={active === item.id ? 'active-mechanism' : ''}>
            {index < method.steps.length - 1 && (
              <path
                d={`M ${index * 160 + 142} 45 H ${index * 160 + 172}`}
                markerEnd={`url(#flow-arrow-${paper.id})`}
              />
            )}
            <rect x={index * 160 + 12} y="15" width="130" height="60" rx="5" />
            <text x={index * 160 + 77} y="42" textAnchor="middle">
              {item.label}
            </text>
            <text x={index * 160 + 77} y="62" textAnchor="middle" className="flow-caption">
              {item.updates?.includes(mode) ? '更新参数' : `${index + 1} / ${method.steps.length}`}
            </text>
          </g>
        ))}
      </svg>
      <div className="visual-controls" aria-label="方法讲解控制">
        <button disabled={active === method.steps[0]?.id} onClick={() => move(-1)}>
          上一步机制
        </button>
        <button disabled={active === method.steps.at(-1)?.id} onClick={() => move(1)}>
          下一步机制
        </button>
        <span className="muted">整理者流程重绘 · 非模型运行；全部步骤始终可点击</span>
      </div>
      <ol className="method-flow">
        {method.steps.map((item, index) => (
          <li key={item.id}>
            <button
              aria-pressed={active === item.id}
              onClick={() => {
                setActive(item.id);
              }}
            >
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
          <SourceUpdate paper={paper} derived={step} />
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
      {method.representation && (
        <>
          <ActionEncoding representation={method.representation} />
          <SourceUpdate paper={paper} derived={method.representation} />
        </>
      )}
      {method.timeline && (
        <ControlCycle timeline={method.timeline} source={method.steps.at(-1)?.source} />
      )}
    </section>
  );
}
function ExperimentExplorer({ paper, groups }) {
  const requestedGroup = new URLSearchParams(location.hash.split('?')[1] || '').get('experiment');
  const [groupId, setGroupId] = useState(requestedGroup || groups[0].id);
  useEffect(() => {
    if (requestedGroup && groups.some((item) => item.id === requestedGroup)) {
      setGroupId(requestedGroup);
      setHidden([]);
      setTask('');
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
  const values = group.rows.map((row) => row.value).filter(Number.isFinite);
  const minimum = Math.min(0, ...values),
    maximum = Math.max(0, ...values);
  const range = maximum - minimum || 1;
  const zero = (-minimum / range) * 100;
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
      <SourceUpdate paper={paper} derived={group} />
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
            <div style={{ position: 'relative' }}>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: zero + '%',
                  height: '100%',
                  borderLeft: '1px solid currentColor',
                }}
              />
              <i
                style={{
                  position: 'absolute',
                  left:
                    (Number.isFinite(row.value) && row.value < 0
                      ? ((row.value - minimum) / range) * 100
                      : zero) + '%',
                  width: Number.isFinite(row.value)
                    ? (Math.abs(row.value) / range) * 100 + '%'
                    : '0%',
                }}
              />
            </div>
            <b>{!Number.isFinite(row.value) ? '未知' : `${row.value}${group.unit}`}</b>
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
