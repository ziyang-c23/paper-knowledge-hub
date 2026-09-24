/** Shared read adapter. New writes use paper.sources; legacy bundles remain read-only. */
export function paperSources(paper = {}) {
  const legacy = Array.isArray(paper.sourceBundle)
    ? paper.sourceBundle
    : paper.sourceBundle?.items || paper.sourceBundle?.sources || [];
  const seen = new Set();
  return [...(paper.sources || []), ...legacy].filter((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
    // Different locations or revisions in the same file are distinct sources.
    // An authoritative ID wins as a whole; never merge private legacy fields into it.
    const key = source.id
      ? `id:${source.id}`
      : JSON.stringify([
          source.url,
          source.revision,
          source.locator || source.path,
          source.symbol,
          source.type || source.kind,
          source.title || source.label,
        ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sourceReferences(derived = {}) {
  return [
    ...new Set([
      ...(derived.sourceIds || []),
      ...(derived.sourceId ? [derived.sourceId] : []),
      ...Object.keys(derived.sourceRevisions || {}),
    ]),
  ];
}

export function hasPublicSources(paper, derived = {}) {
  const allowed = new Set(
    paperSources(paper)
      .filter((s) => s.visibility === 'public')
      .map((s) => s.id),
  );
  return (
    derived.visibility !== 'private' && sourceReferences(derived).every((id) => allowed.has(id))
  );
}

/** Revision consistency only, never an assertion that a source supports a claim.
 * Derived content snapshots source revisions as { [sourceId]: revision }.
 * Missing snapshots and unversioned sources are unknown, not current.
 */
export function sourceFreshness(paper, derived = {}) {
  const sources = new Map(
    paperSources(paper)
      .filter((s) => s.id)
      .map((s) => [s.id, s]),
  );
  const revisions = derived.sourceRevisions || {};
  const ids = sourceReferences(derived);
  const references = ids.map((sourceId) => {
    const source = sources.get(sourceId);
    const expectedRevision = revisions[sourceId];
    const currentRevision = source?.revision;
    const status = !source
      ? 'missing'
      : !expectedRevision || !currentRevision
        ? 'unknown'
        : expectedRevision === currentRevision
          ? 'current'
          : 'stale';
    return { sourceId, status, expectedRevision, currentRevision };
  });
  const status = references.some((r) => r.status === 'missing')
    ? 'missing'
    : references.some((r) => r.status === 'stale')
      ? 'stale'
      : !references.length || references.some((r) => r.status === 'unknown')
        ? 'unknown'
        : 'current';
  return { status, references };
}

/** Local Agent export boundary: filter sources and anything derived from excluded sources.
 * This does not authorize external transmission of the remaining private material. */
export function aiContextRecord(record) {
  const sources = paperSources(record).filter((source) => source.aiAllowed === true);
  const allowed = new Set(sources.map((source) => source.id));
  const sanitize = (value) => {
    if (Array.isArray(value)) return value.map(sanitize).filter((item) => item !== undefined);
    if (!value || typeof value !== 'object') return value;
    if (value.aiAllowed === false || sourceReferences(value).some((id) => !allowed.has(id)))
      return undefined;
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              'personalAnalysis',
              'privateNotes',
              'internalNotes',
              'localPath',
              'sourceBundle',
            ].includes(key),
        )
        .map(([key, item]) => [
          key,
          sanitize(
            key === 'sources' && Array.isArray(item)
              ? item.filter((source) => source.aiAllowed === true)
              : item,
          ),
        ])
        .filter(([, item]) => item !== undefined),
    );
  };
  return sanitize(
    record && ('sources' in record || 'sourceBundle' in record) ? { ...record, sources } : record,
  );
}
