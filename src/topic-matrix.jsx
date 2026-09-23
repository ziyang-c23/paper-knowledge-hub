import React, { useState } from 'react';
import config from '../site.config.json';
import './topic-matrix.css';

export function TopicMatrix({ topic, dataset, dimensions, local = false }) {
  const papers = dataset.papers.filter(
    (paper) => paper.lifecycle !== 'archived' && paper.topics?.includes(topic.id),
  );
  const available = new Set(papers.map((paper) => paper.id));
  const [selected, setSelected] = useState(() =>
    (topic.compareIds || []).filter((id) => available.has(id)).slice(0, config.display.maxCompare),
  );
  const [dimension, setDimension] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const selectedIds = selected.filter((id) => available.has(id));
  const objects = new Map(
    dataset.concepts.filter((item) => item.lifecycle !== 'archived').map((item) => [item.id, item]),
  );
  const values = (paper, key) =>
    (paper.facets?.[key] || []).map((id) => objects.get(id)).filter(Boolean);
  const rows = Object.entries(dimensions).filter(
    ([key]) =>
      (!dimension || key === dimension) &&
      (!missingOnly || papers.some((paper) => !values(paper, key).length)),
  );
  const toggle = (id) =>
    setSelected((ids) =>
      ids.includes(id)
        ? ids.filter((item) => item !== id)
        : [...ids.filter((item) => available.has(item)), id].slice(0, config.display.maxCompare),
    );

  return (
    <section className="topic-comparison" aria-label="专题比较矩阵">
      <div className="topic-comparison-heading">
        <div>
          <h3>专题比较矩阵</h3>
          <p>按维度梳理论文，选中论文继续比较；未整理的格子可直接打开补充。</p>
        </div>
        <span>{papers.length} 篇论文</span>
      </div>
      {!papers.length ? (
        <div className="topic-comparison-empty">
          <h4>专题尚未收录论文</h4>
          <p>将论文加入这个专题后，会在这里按维度展开。</p>
          <a className="button" href={local ? '#/database' : '#/library'}>
            前往论文库
          </a>
        </div>
      ) : (
        <>
          <div className="topic-comparison-controls">
            <label>
              研究维度
              <select
                aria-label="矩阵研究维度"
                value={dimension}
                onChange={(event) => setDimension(event.target.value)}
              >
                <option value="">全部维度</option>
                {Object.entries(dimensions).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(event) => setMissingOnly(event.target.checked)}
              />
              只看含未整理项的维度
            </label>
            <div className="topic-comparison-selection">
              <output aria-live="polite">
                已选 {selectedIds.length} / {config.display.maxCompare} 篇
              </output>
              <button
                className="text-button"
                disabled={!selectedIds.length}
                onClick={() => setSelected([])}
              >
                清空选择
              </button>
              {selectedIds.length ? (
                <a className="button primary" href={'#/compare?ids=' + selectedIds.join(',')}>
                  比较所选论文
                </a>
              ) : (
                <button className="button primary" disabled>
                  比较所选论文
                </button>
              )}
            </div>
          </div>
          {rows.length ? (
            <div
              className="topic-comparison-scroll"
              tabIndex={0}
              role="region"
              aria-label="按维度比较专题论文"
            >
              <table className="topic-comparison-table">
                <caption className="sr-only">{topic.title}的论文研究维度</caption>
                <thead>
                  <tr>
                    <th scope="col">研究维度</th>
                    {papers.map((paper) => (
                      <th scope="col" key={paper.id}>
                        <div className="topic-comparison-paper">
                          <input
                            type="checkbox"
                            aria-label={'选择比较 ' + (paper.acronym || paper.title)}
                            checked={selectedIds.includes(paper.id)}
                            disabled={
                              !selectedIds.includes(paper.id) &&
                              selectedIds.length >= config.display.maxCompare
                            }
                            onChange={() => toggle(paper.id)}
                          />
                          <span>
                            <a href={'#/paper/' + paper.id}>{paper.acronym || paper.title}</a>
                            <small>{paper.year}</small>
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([key, label]) => (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      {papers.map((paper) => {
                        const items = values(paper, key);
                        return (
                          <td
                            key={paper.id}
                            className={items.length ? '' : 'topic-comparison-missing'}
                          >
                            {items.length ? (
                              items.map((item) => (
                                <a
                                  className="topic-comparison-object"
                                  key={item.id}
                                  href={'#/entities/' + item.id}
                                >
                                  {item.title}
                                </a>
                              ))
                            ) : (
                              <a
                                aria-label={
                                  (paper.acronym || paper.title) + ' · ' + label + '未整理'
                                }
                                href={
                                  local
                                    ? '#/edit/' + paper.id
                                    : '#/paper/' + paper.id + '?mode=note'
                                }
                              >
                                未整理 <span aria-hidden="true">↗</span>
                              </a>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="topic-comparison-empty" role="status">
              当前维度已整理，可切换维度或关闭筛选。
            </p>
          )}
        </>
      )}
    </section>
  );
}
