import React, { useState } from 'react';
import { encodeAction } from './lib/action-encoding.mjs';
export function ActionEncoding({ representation }) {
  const [value, setValue] = useState(0.25);
  const decoded = encodeAction(value, representation);
  const code = representation.convention === 'openvla-tokenizer';
  return (
    <section className="action-encoding" aria-label="动作表示讲解">
      <span className="eyebrow">理解动作接口</span>
      <h3>连续动作如何变成离散输出？</h3>
      <p>{representation.description}</p>
      <label className="encoding-slider">
        示意归一化动作值 <output>{value.toFixed(3)}</output>
        <input
          aria-label="示意归一化动作值"
          type="range"
          min="-1"
          max="1"
          step="0.001"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
      </label>
      <div className="encoding-stages" aria-live="polite">
        <div>
          <small>连续输入</small>
          <strong>{value.toFixed(3)}</strong>
          <span>仅示意一个连续维度</span>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <small>{code ? 'digitize 索引' : '示意区间编号'}</small>
          <strong>{decoded.index}</strong>
          <span>{code ? `词表映射 V − ${decoded.index}` : '用离散符号表达区间'}</span>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <small>区间中心解码</small>
          <strong>{decoded.center.toFixed(4)}</strong>
          <span>量化会丢失区间内细节</span>
        </div>
      </div>
      <svg
        className="encoding-scale"
        viewBox="0 0 640 95"
        role="img"
        aria-label={`输入${value.toFixed(3)}，区间中心${decoded.center.toFixed(4)}`}
      >
        <line x1="30" x2="610" y1="42" y2="42" stroke="currentColor" />
        <text x="30" y="85">
          −1
        </text>
        <text x="600" y="85">
          1
        </text>
        <circle cx={30 + (value + 1) * 290} cy="29" r="7" fill="#315f55" />
        <path d={`M ${30 + (decoded.center + 1) * 290} 47 l -7 14 h 14 z`} fill="#a26934" />
        <text x="30" y="16">
          ● 输入值　▲ 解码中心（两者可能非常接近）
        </text>
      </svg>
      <p className="muted">
        {code
          ? `${representation.bins} 个 linspace 边界，对应 ${decoded.intervals} 个中心；最大端点的 digitize 索引会经裁剪映射到最后中心。V 代表词表大小。`
          : '等宽区间和中心解码为教学构造，不主张复现封闭实现的具体取整或词表映射。'}{' '}
        此处不生成真实机器人命令，也不改变论文报告的性能。
      </p>
      {representation.source && (
        <a href={representation.source.url} target="_blank" rel="noreferrer">
          {representation.source.locator} ↗
        </a>
      )}
    </section>
  );
}
