import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerURL;
export default function PdfViewer({ id, page }) {
  const canvas = useRef(null),
    container = useRef(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let gone = false,
      render;
    setLoading(true);
    setError('');
    const task = getDocument({ url: '/api/documents/' + id + '/file', isEvalSupported: false });
    (async () => {
      try {
        const pdf = await task.promise;
        const source = await pdf.getPage(page);
        if (gone) return;
        const base = source.getViewport({ scale: 1 });
        const width = Math.max(280, (container.current?.clientWidth || 600) - 24);
        const scale = Math.min(2, width / base.width);
        const viewport = source.getViewport({ scale });
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const target = canvas.current;
        target.width = Math.ceil(viewport.width * ratio);
        target.height = Math.ceil(viewport.height * ratio);
        target.style.width = viewport.width + 'px';
        target.style.height = viewport.height + 'px';
        render = source.render({
          canvasContext: target.getContext('2d'),
          viewport,
          transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
        });
        await render.promise;
        if (!gone) setLoading(false);
      } catch (e) {
        if (!gone && e.name !== 'RenderingCancelledException') {
          setError('原文渲染失败：' + e.message);
          setLoading(false);
        }
      }
    })();
    return () => {
      gone = true;
      render?.cancel();
      task.destroy();
    };
  }, [id, page]);
  return (
    <section
      ref={container}
      className="pdf-canvas-panel"
      aria-label={'PDF 原文文件第 ' + page + ' 页'}
    >
      {loading && <p role="status">正在渲染文件第 {page} 页…</p>}
      {error && <p role="alert">{error}；可使用上方链接打开原件。</p>}
      <canvas ref={canvas} aria-label={'已渲染的 PDF 原文第 ' + page + ' 页'} role="img" />
    </section>
  );
}
