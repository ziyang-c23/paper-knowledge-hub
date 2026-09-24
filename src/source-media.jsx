import React, { useEffect, useState } from 'react';
import { mediaLocation } from './lib/media-location.mjs';

export function SourceMedia({ item }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
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
  const { start, end } = mediaLocation(item);
  const segment = start !== null ? `#t=${start}${end !== null ? ',' + end : ''}` : '';
  if (!safe) return null;
  return (
    <figure className="source-media">
      <figcaption>
        <strong>{item.caption || '来源媒体'}</strong>
        <p>{item.observation || '尚未逐帧观察；请结合来源说明阅读。'}</p>
      </figcaption>
      {(start !== null || end !== null) && (
        <p className="muted">
          阅读片段：{start !== null ? start + ' 秒' : '起点未记录'}
          {end !== null ? '–' + end + ' 秒' : ''}
        </p>
      )}
      {!loaded && figure && <button onClick={load}>加载来源图片（访问外部网站）</button>}
      {loaded && !failed && figure && (
        <img
          src={item.url}
          alt={item.alt || item.caption || '来源图片'}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ maxWidth: '100%' }}
        />
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
          aria-label={item.caption}
          style={{ width: '100%', maxHeight: 420 }}
        />
      )}
      {loaded && !failed && youtube && (
        <iframe
          src={
            item.url +
            (start !== null ? '?start=' + start + (end !== null ? '&end=' + end : '') : '')
          }
          title={item.caption || mediaLabel}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          style={{ width: '100%', aspectRatio: '16 / 9', border: 0 }}
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
          或使用下方官方来源。
        </p>
      )}
      {loaded && youtube && <p className="muted">若播放器无法访问，可在下方来源页面观看。</p>}
      <p className="muted">{item.cannotInfer}</p>
      <a href={item.url} target="_blank" rel="noreferrer">
        在{official ? '官方' : ''}来源打开 ↗
      </a>
    </figure>
  );
}
