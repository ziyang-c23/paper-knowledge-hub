import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './reading.css';
GlobalWorkerOptions.workerSrc = workerURL;

export default function PdfViewer({ id, page, onSelection }) {
  const container = useRef(null),
    surface = useRef(null),
    textRef = useRef(null);
  const [document, setDocument] = useState(null),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(600);
  const [query, setQuery] = useState(''),
    [matches, setMatches] = useState([]),
    [matchIndex, setMatchIndex] = useState(0);
  const [textVersion, setTextVersion] = useState(0),
    [quote, setQuote] = useState('');
  useEffect(() => {
    let gone = false;
    setDocument(null);
    setLoading(true);
    setError('');
    setZoom(1);
    setQuery('');
    setQuote('');
    const task = getDocument({ url: '/api/documents/' + id + '/file', isEvalSupported: false });
    task.promise
      .then((pdf) => {
        if (!gone) setDocument({ id, pdf });
      })
      .catch((e) => {
        if (!gone) {
          setError('无法打开 PDF：' + e.message);
          setLoading(false);
        }
      });
    return () => {
      gone = true;
      task.destroy();
    };
  }, [id, retry]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(160, entry.contentRect.width - 24)),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || document.id !== id) return;
    let gone = false,
      render,
      textLayer;
    setLoading(true);
    setError('');
    setQuote('');
    surface.current?.replaceChildren();
    textRef.current = null;
    (async () => {
      try {
        const source = await document.pdf.getPage(page);
        if (gone) return;
        const base = source.getViewport({ scale: 1 });
        const viewport = source.getViewport({ scale: Math.min(2, width / base.width) * zoom });
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        canvas.setAttribute('aria-label', '已渲染的 PDF 原文第 ' + page + ' 页');
        canvas.setAttribute('role', 'img');
        const layer = window.document.createElement('div');
        layer.className = 'pdf-text-layer';
        layer.setAttribute('aria-label', 'PDF 可选择文字');
        surface.current.style.width = viewport.width + 'px';
        surface.current.style.height = viewport.height + 'px';
        surface.current.style.setProperty('--total-scale-factor', viewport.scale);
        surface.current.replaceChildren(canvas, layer);
        textRef.current = layer;
        const content = await source.getTextContent();
        if (gone) return;
        render = source.render({
          canvasContext: canvas.getContext('2d'),
          viewport,
          transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
        });
        textLayer = new TextLayer({ textContentSource: content, container: layer, viewport });
        await Promise.all([render.promise, textLayer.render()]);
        if (!gone) {
          setLoading(false);
          setTextVersion((version) => version + 1);
        }
      } catch (e) {
        if (!gone && !['RenderingCancelledException', 'AbortException'].includes(e.name)) {
          setError('原文渲染失败：' + e.message);
          setLoading(false);
        }
      }
    })();
    return () => {
      gone = true;
      render?.cancel();
      textLayer?.cancel();
    };
  }, [document, id, page, zoom, width]);
  useEffect(() => {
    const spans = [...(textRef.current?.querySelectorAll('span') || [])];
    spans.forEach((span) => span.classList.remove('pdf-search-hit', 'pdf-search-current'));
    const term = query.trim().toLocaleLowerCase();
    const found = term
      ? spans.filter((span) => span.textContent.toLocaleLowerCase().includes(term))
      : [];
    found.forEach((span) => span.classList.add('pdf-search-hit'));
    setMatches(found);
    setMatchIndex(0);
  }, [query, textVersion, page]);
  useEffect(() => {
    matches.forEach((span, index) =>
      span.classList.toggle('pdf-search-current', index === matchIndex),
    );
    matches[matchIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [matches, matchIndex]);
  useEffect(() => {
    const select = () => {
      const selection = window.getSelection();
      setQuote(
        selection &&
          textRef.current?.contains(selection.anchorNode) &&
          textRef.current?.contains(selection.focusNode)
          ? selection.toString().trim()
          : '',
      );
    };
    window.document.addEventListener('selectionchange', select);
    return () => window.document.removeEventListener('selectionchange', select);
  }, []);
  return (
    <section
      ref={container}
      className="pdf-canvas-panel pdf-reader"
      aria-label={'PDF 原文文件第 ' + page + ' 页'}
    >
      <div className="pdf-reading-controls">
        <button
          aria-label="缩小原文"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
        >
          −
        </button>
        <output aria-label="原文缩放">{Math.round(zoom * 100)}%</output>
        <button
          aria-label="放大原文"
          disabled={zoom >= 3}
          onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
        >
          ＋
        </button>
        <button onClick={() => setZoom(1)}>适应宽度</button>
        <label>
          页内查找
          <input
            type="search"
            aria-label="页内查找"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {query && (
          <>
            <output aria-live="polite">
              {matches.length ? `${matchIndex + 1} / ${matches.length} 处` : '本页无匹配'}
            </output>
            <button
              disabled={!matches.length}
              onClick={() => setMatchIndex((index) => (index + 1) % matches.length)}
            >
              下一处
            </button>
          </>
        )}
      </div>
      {loading && <p role="status">正在渲染文件第 {page} 页…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry((value) => value + 1)}>重试 PDF</button>
          <a href={'/api/documents/' + id + '/file'} target="_blank" rel="noreferrer">
            打开原件
          </a>
        </div>
      )}
      {onSelection && (
        <button
          disabled={!quote}
          onClick={() =>
            onSelection({
              documentId: id,
              pageIndex: page,
              quote,
              section: new URLSearchParams(location.hash.split('?')[1] || '').get('section') || '',
            })
          }
        >
          从选区记录问题
        </button>
      )}
      <div className="pdf-page-scroll">
        <div ref={surface} className="pdf-page-surface" />
      </div>
    </section>
  );
}
