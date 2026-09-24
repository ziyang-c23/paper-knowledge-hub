import React, { useEffect, useState } from 'react';

const phases = ['接收观测', '生成动作', '执行窗口', '重新观测', '重新预测'];

/** A discrete teaching state, deliberately not a robot trajectory or a timing model. */
export function ControlCycle({ timeline, source }) {
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!playing || reduced) return;
    if (phase === phases.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setPhase(phase + 1), 2200);
    return () => clearTimeout(timer);
  }, [playing, reduced, phase]);
  const prediction = timeline.prediction,
    execution = Math.min(timeline.execution, prediction);
  const hasRemainder = prediction > execution;
  const explanations = [
    '先读取当前观测。预测只以已经收到的观测为条件，不能提前知道未来环境。',
    `生成覆盖 ${prediction} 步的动作预测。预测还不是执行：控制器尚未完成这些动作。`,
    `执行其中 ${execution} 步。${hasRemainder ? `另外 ${prediction - execution} 步仍是未执行的预测。` : '此处是单步输出，没有剩余的动作块。'}`,
    `执行后重新观测。${hasRemainder ? '旧预测中的剩余动作不会被当作已经完成的动作。' : '下一次输出需要新的观测条件。'}`,
    `${hasRemainder ? '基于新观测重新预测，替换旧计划中尚未执行的部分。' : '基于新观测生成下一步动作。'}图中方格只表示步骤身份，不表示动作数值或机器人路径。`,
  ];
  const cells = (next) =>
    Array.from({ length: prediction }, (_, i) => {
      const state = next
        ? phase === 4
          ? 'new'
          : 'empty'
        : phase < 1
          ? 'empty'
          : i < execution && phase >= 2
            ? 'done'
            : phase >= 3
              ? 'unused'
              : 'planned';
      return (
        <span
          key={i}
          className={'cycle-cell ' + state}
          title={`${next ? '新预测' : '首次预测'} ${i + 1}：${state === 'done' ? '已执行' : state === 'unused' ? '未执行，等待替换' : state === 'empty' ? '尚未生成' : '预测'}`}
          aria-hidden="true"
        >
          {prediction <= 16 ? i + 1 : ''}
        </span>
      );
    });
  return (
    <section className="control-cycle" aria-label="预测与执行讲解">
      <div className="cycle-title">
        <span className="eyebrow">理解闭环</span>
        <h3>
          {hasRemainder ? '为什么预测一整段，却只执行一部分？' : '一组动作输出之后，如何继续控制？'}
        </h3>
      </div>
      <p className="cycle-protocol">{timeline.description}</p>
      <ol className="cycle-phases">
        {phases.map((label, i) => (
          <li key={label}>
            <button
              aria-current={i === phase ? 'step' : undefined}
              onClick={() => {
                setPlaying(false);
                setPhase(i);
              }}
            >
              <span>{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <div
        className="cycle-diagram"
        role="img"
        aria-label={`${phases[phase]}。${explanations[phase]}`}
      >
        <div className="cycle-observation">
          {phase >= 3 ? '新观测 o(t + 执行窗口)' : '当前观测 o(t)'}{' '}
          <span>→ 条件策略 → 动作预测</span>
        </div>
        <div className="cycle-lane">
          <b>首次预测</b>
          <div
            className="cycle-cells"
            style={{
              '--cycle-columns': Math.min(prediction, 32),
              '--cycle-mobile-columns': Math.min(prediction, 8),
            }}
          >
            {cells(false)}
          </div>
          <small>
            {phase < 1
              ? '等待生成'
              : phase < 2
                ? `${prediction} 步尚未执行`
                : `${execution} 步已执行${hasRemainder ? ` · ${prediction - execution} 步未执行` : ''}`}
          </small>
        </div>
        <div className="cycle-lane">
          <b>下一轮</b>
          <div
            className="cycle-cells"
            style={{
              '--cycle-columns': Math.min(prediction, 32),
              '--cycle-mobile-columns': Math.min(prediction, 8),
            }}
          >
            {cells(true)}
          </div>
          <small>{phase === 4 ? `新观测 → 新的 ${prediction} 步预测` : '等待执行与重新观测'}</small>
        </div>
        <div className="cycle-legend">
          <span>□ 未生成</span>
          <span>▧ 预测</span>
          <span>■ 已执行</span>
          <span>┄ 未执行 / 将被替换</span>
        </div>
      </div>
      <p className="cycle-explanation" aria-live={playing ? 'off' : 'polite'}>
        <b>{phases[phase]}。</b>
        {explanations[phase]}
      </p>
      <div className="visual-controls">
        <button
          disabled={phase === 0}
          onClick={() => {
            setPlaying(false);
            setPhase(phase - 1);
          }}
        >
          上一步
        </button>
        <button
          disabled={phase === 4}
          onClick={() => {
            setPlaying(false);
            setPhase(phase + 1);
          }}
        >
          下一步
        </button>
        <button
          disabled={reduced}
          onClick={() => {
            if (phase === 4) setPhase(0);
            setPlaying(!playing);
          }}
        >
          {playing ? '暂停闭环讲解' : '播放闭环讲解'}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setPhase(0);
          }}
        >
          从头查看
        </button>
        {source && (
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.locator} ↗
          </a>
        )}
      </div>
      <small className="muted">
        整理者控制流程示意；动画间隔不是控制频率，方格不是模型运行结果。预测窗口的索引和历史对齐以原文设置为准。
      </small>
    </section>
  );
}
