import React, { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { AsyncPanel } from './async-panel.jsx';
import { mediaLocation } from './lib/media-location.mjs';
import './source-media.css';
const PdfViewer = lazy(() => import('./pdf-viewer.jsx'));
const originalTypes = new Set(['figure', 'image', 'official-video', 'pdf-page']);

export function originalMedia(paper, section) {
  return (Array.isArray(paper?.media) ? paper.media : []).filter(
    (item) => originalTypes.has(item.type) && item.section?.trim() === section?.trim(),
  );
}

export function OriginalMaterials({ paper, section }) {
  const items = originalMedia(paper, section);
  const pdfPage = items.findIndex((item) => item.type === 'pdf-page');
  const primary = items.findIndex((item) => item.role === 'primary');
  const preferred = pdfPage >= 0 ? pdfPage : primary;
  const [activeIndex, setActiveIndex] = useState(preferred >= 0 ? preferred : 0);
  useEffect(() => {
    setActiveIndex(preferred >= 0 ? preferred : 0);
  }, [paper?.id, section, items.length, preferred]);
  if (!items.length) return null;
  const active = items[activeIndex] || items[0];
  return (
    <section className="original-materials" aria-label={section + ' · 原始材料'}>
      <p className="original-materials-label">原始材料 · {section}</p>
      {items.length > 1 && (
        <div className="original-materials-picker" aria-label="选择原始材料">
          {items.map((item, index) => (
            <button
              key={item.id || index}
              type="button"
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            >
              {item.caption || (item.type === 'pdf-page' ? '论文原页' : '来源材料')}
            </button>
          ))}
        </div>
      )}
      <SourceMedia key={active.id || active.url} item={active} paperId={paper.id} />
    </section>
  );
}

export function SourceMedia({ item, paperId }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialog = useRef(null);
  const expandButton = useRef(null);
  const titleId = useId();
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    dialog.current?.close();
  }, [item.url]);
  const load = () => {
    setFailed(false);
    setLoaded(true);
  };
  const official = item.type === 'official-video';
  const mediaLabel = official ? '官方视频' : '来源视频';
  const safe = /^https:\/\//.test(item.url || '');
  const video = safe && /\.mp4(?:[?#]|$)/i.test(item.url);
  const youtube = safe && /^https:\/\/(www\.)?youtube\.com\/embed\/[\w-]+$/.test(item.url);
  const figure = safe && ['figure', 'image'].includes(item.type);
  const pdf = safe && item.type === 'pdf-page';
  const localPdf =
    pdf &&
    Boolean(window.__PKH_LOCAL__) &&
    item.documentId &&
    Number.isInteger(item.pageIndex) &&
    item.pageIndex > 0;
  const originalPageLink =
    localPdf && paperId
      ? '#/paper/' +
        encodeURIComponent(paperId) +
        '?mode=source&document=' +
        encodeURIComponent(item.documentId) +
        '&page=' +
        item.pageIndex
      : null;
  const sourceUrl = /^https:\/\//.test(item.sourceUrl || '') ? item.sourceUrl : item.url;
  const title = item.caption || (figure ? '来源图片' : '来源媒体');
  const { start, end } = mediaLocation(item);
  const segment = start !== null ? `#t=${start}${end !== null ? ',' + end : ''}` : '';
  if (!safe) return null;
  const sourceLink = (
    <a href={sourceUrl} target="_blank" rel="noreferrer">
      在{official ? '官方' : ''}来源打开 ↗
    </a>
  );
  const paperLink = item.paperUrl && /^https:\/\//.test(item.paperUrl) && (
    <a href={item.paperUrl} target="_blank" rel="noreferrer">
      {item.paperLabel || '回到论文原文'}
      {item.paperPage ? ` · 第 ${item.paperPage} 页` : ''} ↗
    </a>
  );
  const caption = item.originalCaption && (
    <p className="source-original-caption">
      <span>原文图注</span>
      {item.originalCaption}
    </p>
  );
  return (
    <figure className="source-media" data-section={item.section} data-role={item.role}>
      <figcaption className="source-media-heading">
        <strong>{title}</strong>
      </figcaption>
      {pdf && !loaded && localPdf && (
        <button onClick={load}>加载论文原页 · 第 {item.pageIndex} 页</button>
      )}
      {pdf && loaded && localPdf && (
        <AsyncPanel>
          <Suspense fallback={<p role="status">正在打开论文原页…</p>}>
            <PdfViewer id={item.documentId} page={item.pageIndex} />
          </Suspense>
        </AsyncPanel>
      )}
      {pdf && !localPdf && (
        <p className="source-media-detail">
          {item.pageIndex ? '文件第 ' + item.pageIndex + ' 页 · ' : ''}打开论文 PDF
          查看原图、表格与公式。
        </p>
      )}
      {!loaded && figure && <button onClick={load}>加载来源图片（访问外部网站）</button>}
      {loaded && !failed && figure && (
        <>
          <img
            className="source-figure-image"
            src={item.url}
            alt={item.alt || title}
            loading="lazy"
            onError={() => setFailed(true)}
          />
          <button
            ref={expandButton}
            className="source-expand"
            onClick={() => dialog.current?.showModal()}
            aria-haspopup="dialog"
          >
            放大查看原图
          </button>
        </>
      )}
      {(start !== null || end !== null) && (
        <p className="source-media-detail">
          阅读片段：{start !== null ? start + ' 秒' : '起点未记录'}
          {end !== null ? '–' + end + ' 秒' : ''}
        </p>
      )}
      {!loaded && (video || youtube) && (
        <button onClick={load}>加载{mediaLabel}（访问外部网站）</button>
      )}
      {loaded && !failed && video && (
        <video
          src={item.url.split('#')[0] + segment}
          controls
          onError={() => setFailed(true)}
          onLoadedMetadata={(event) => {
            if (start !== null) event.currentTarget.currentTime = start;
          }}
          onTimeUpdate={(event) => {
            if (
              end !== null &&
              event.currentTarget.currentTime >= end &&
              !event.currentTarget.paused
            )
              event.currentTarget.pause();
          }}
          preload="metadata"
          playsInline
          aria-label={title}
        />
      )}
      {loaded && !failed && youtube && (
        <iframe
          src={
            item.url +
            (start !== null ? '?start=' + start + (end !== null ? '&end=' + end : '') : '')
          }
          title={title}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-presentation"
        />
      )}
      {failed && (
        <p role="alert">
          媒体暂时无法加载。
          <button
            onClick={() => {
              setLoaded(false);
              setFailed(false);
            }}
          >
            重新选择加载
          </button>{' '}
          或使用下方来源。
        </p>
      )}
      {loaded && youtube && (
        <p className="source-media-detail">若播放器无法访问，可在下方来源页面观看。</p>
      )}
      {caption}
      {item.sourceText && (
        <p className="source-original-caption">
          <span>项目页原文</span>
          {item.sourceText}
        </p>
      )}
      {item.readingGuide && (
        <p className="source-reading-guide">
          <span>读图提示 · 整理者</span>
          {item.readingGuide}
        </p>
      )}
      {item.observation && <p className="source-media-detail">{item.observation}</p>}
      {(video || youtube) && !item.observation && (
        <p className="source-media-detail">尚未逐段观看；请结合来源说明阅读。</p>
      )}
      {item.cannotInfer && <p className="source-media-detail">{item.cannotInfer}</p>}
      <div className="source-media-links">
        {sourceLink}
        {paperLink}
        {originalPageLink && <a href={originalPageLink}>对照论文原页 · 第 {item.pageIndex} 页</a>}
      </div>
      {figure && (
        <dialog
          ref={dialog}
          className="source-image-dialog"
          aria-labelledby={titleId}
          onClose={() => expandButton.current?.focus({ preventScroll: true })}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.current?.close();
          }}
        >
          <div className="source-image-dialog-content">
            <header>
              <strong id={titleId}>{title}</strong>
              <button autoFocus onClick={() => dialog.current?.close()} aria-label="关闭原图">
                关闭 ×
              </button>
            </header>
            {loaded && !failed && <img src={item.url} alt={item.alt || title} />}
            {caption}
            <div className="source-media-links">
              {sourceLink}
              {paperLink}
              <a href={item.url} target="_blank" rel="noreferrer">
                打开原始图片 ↗
              </a>
            </div>
          </div>
        </dialog>
      )}
    </figure>
  );
}
