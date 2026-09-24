import React from 'react';

/** Keep the surrounding reading workspace available if a deferred module fails. */
export class AsyncPanel extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel padded" role="alert">
        <h3>阅读工具暂时无法加载</h3>
        <p>网络中断或网站更新可能使旧标签页失效。笔记仍可阅读；保存未提交的内容后刷新页面重试。</p>
        <button onClick={() => location.reload()}>刷新页面</button>
      </section>
    );
  }
}
