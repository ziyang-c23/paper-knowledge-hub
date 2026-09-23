import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { safePrivate } from './workspace-store.mjs';
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const safeId = (value) => /^[a-z0-9][a-z0-9-]{0,127}$/.test(value);
export async function processPDF({ root, paperId, bytes, filename = 'document.pdf' }) {
  if (!safeId(paperId || '')) throw new Error('Invalid paper ID');
  const buffer = Buffer.from(bytes || []);
  if (!buffer.length || buffer.length > MAX_PDF_BYTES)
    throw new Error('PDF must be between 1 byte and 25 MiB');
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))
    throw new Error('Not a PDF: missing PDF header');
  await safePrivate(root);
  const { getDocument, version } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const sha256 = digest(buffer),
    id = `doc-${digest(`${paperId}:${sha256}`).slice(0, 32)}`;
  const standardFontDataUrl =
    path.join(
      path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'))),
      'standard_fonts',
    ) + path.sep;
  const task = getDocument({
    standardFontDataUrl,
    data: Uint8Array.from(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
  });
  let pdf;
  try {
    pdf = await task.promise;
    if (pdf.numPages > 800) throw new Error('PDF exceeds the 800-page local import limit');
    const pages = [];
    let total = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      // Preserve PDF content-stream order, with real line boundaries. No invented table cells,
      // reading-order reconstruction, OCR, or printed page labels.
      const text = content.items
        .filter((item) => typeof item.str === 'string')
        .map((item) => item.str + (item.hasEOL ? '\n' : ' '))
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
      total += text.length;
      if (text.length > 200000 || total > 6000000)
        throw new Error('Extracted text exceeds safe import limit');
      const warnings = [
        'reading-order-unverified',
        'tables-unchecked',
        'formulas-unchecked',
        'figures-not-extracted',
      ];
      if (text.length < 80) warnings.push('sparse-text-or-scanned-page-no-ocr');
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
        warnings.push('control-characters-or-math-glyphs');
      if ((text.match(/\uFFFD/g) || []).length > 3) warnings.push('replacement-characters');
      pages.push({ pageIndex: n, pageLabel: `File page ${n}`, text, warnings });
      page.cleanup();
    }
    const record = {
      id,
      paperId,
      filename:
        path
          .basename(String(filename))
          .replace(/[\x00-\x1f]/g, '')
          .slice(0, 180) || 'document.pdf',
      sha256,
      pageCount: pages.length,
      parser: `pdfjs-dist/${version}`,
      parsedAt: new Date().toISOString(),
      quality: {
        text: 'extracted-unreviewed',
        readingOrder: 'unverified',
        tables: 'unchecked',
        formulas: 'unchecked',
        figures: 'not-extracted',
        ocr: false,
        pageNumbering: 'one-based-file-index',
      },
      pages,
    };
    const directory = path.join(root, 'private', 'documents');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `${id}.pdf`);
    try {
      await fs.writeFile(file, buffer, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (digest(await fs.readFile(file)) !== sha256)
        throw new Error('Existing document hash mismatch');
    }
    const target = path.join(directory, `${id}.json`),
      temp = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await fs.rename(temp, target);
    } finally {
      await fs.rm(temp, { force: true });
    }
    return record;
  } finally {
    await task.destroy();
  }
}
export async function listDocuments(root) {
  await safePrivate(root);
  const directory = path.join(root, 'private', 'documents');
  let names;
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const result = [];
  for (const name of names.filter((x) => /^doc-[a-f0-9]{32}\.json$/.test(x)).sort()) {
    const record = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
    if (
      `${record.id}.json` !== name ||
      !safeId(record.paperId || '') ||
      !Array.isArray(record.pages)
    )
      throw new Error(`Invalid parsed document record: ${name}`);
    result.push(record);
  }
  return result;
}
export function allowedPDFURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid arXiv PDF URL');
  }
  if (
    url.protocol !== 'https:' ||
    !['arxiv.org', 'export.arxiv.org'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/pdf\/(?:\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)(?:\.pdf)?$/.test(
      url.pathname,
    )
  )
    throw new Error('Only official https://arxiv.org/pdf/<paper-version> URLs are allowed');
  return url.href;
}
export async function downloadPDF(value) {
  let url = allowedPDFURL(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(60000),
      headers: { 'User-Agent': 'PaperKnowledgeHub/0.2 (personal research PDF import)' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      await response.body?.cancel();
      if (!next) throw new Error('Missing redirect target');
      url = allowedPDFURL(new URL(next, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`arXiv returned HTTP ${response.status}`);
    }
    if (Number(response.headers.get('content-length') || 0) > MAX_PDF_BYTES) {
      await response.body?.cancel();
      throw new Error('PDF exceeds 25 MiB');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_PDF_BYTES) {
        throw new Error('PDF exceeds 25 MiB');
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many PDF redirects');
}
