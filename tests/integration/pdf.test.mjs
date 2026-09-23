import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { processPDF, listDocuments, allowedPDFURL, MAX_PDF_BYTES } from '../../services/pdf.mjs';
// Synthetic fixture tests transport/page identity only. It is not academic quality evidence.
function samplePDF() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R',
    'BT /F1 12 Tf 40 760 Td (First file page memory) Tj ET',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R',
    'BT /F1 12 Tf 40 760 Td (Second file page diffusion) Tj ET',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  objects[2] += ' >>';
  objects[4] += ' >>';
  for (const n of [3, 5])
    objects[n] = `<< /Length ${objects[n].length} >>\nstream\n${objects[n]}\nendstream`;
  let text = '%PDF-1.4\n',
    offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 8\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => String(x).padStart(10, '0') + ' 00000 n ')
    .join('\n')}\ntrailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
test('PDF extraction, immutable file identity, reprocessing, and no invented printed numbers', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pkh-pdf-'));
  try {
    const bytes = samplePDF();
    const d = await processPDF({ root, paperId: 'paper-one', bytes, filename: '../../source.pdf' });
    assert.equal(d.pageCount, 2);
    assert.equal(d.filename, 'source.pdf');
    assert.equal(d.pages[1].pageIndex, 2);
    assert.equal(d.pages[1].pageLabel, 'File page 2');
    assert.match(d.pages[1].text, /diffusion/);
    assert.equal(d.quality.tables, 'unchecked');
    assert(d.pages[1].warnings.includes('formulas-unchecked'));
    const again = await processPDF({ root, paperId: 'paper-one', bytes, filename: 'renamed.pdf' });
    assert.equal(again.id, d.id);
    assert.equal((await listDocuments(root)).length, 1);
    assert.deepEqual(
      await fs.readFile(path.join(root, 'private', 'documents', d.id + '.pdf')),
      bytes,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test('PDF importer rejects malformed, oversized, invalid owner and unsafe URL targets', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pkh-invalid-'));
  try {
    await assert.rejects(processPDF({ root, paperId: '../bad', bytes: samplePDF() }), /ID/);
    await assert.rejects(
      processPDF({ root, paperId: 'one', bytes: Buffer.from('not pdf') }),
      /header/,
    );
    await assert.rejects(
      processPDF({ root, paperId: 'one', bytes: Buffer.alloc(MAX_PDF_BYTES + 1) }),
      /25 MiB/,
    );
    for (const url of [
      'http://arxiv.org/pdf/2406.09246',
      'https://evil.test/pdf/2406.09246',
      'https://arxiv.org@localhost/pdf/2406.09246',
      'https://arxiv.org/pdf/../../secret',
      'https://arxiv.org:4433/pdf/2406.09246',
    ])
      assert.throws(() => allowedPDFURL(url));
    assert.equal(
      allowedPDFURL('https://arxiv.org/pdf/2406.09246v3'),
      'https://arxiv.org/pdf/2406.09246v3',
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test('PDF importer refuses a private-directory symlink', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pkh-link-'));
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'pkh-target-'));
  try {
    await fs.symlink(dest, path.join(root, 'private'));
    await assert.rejects(processPDF({ root, paperId: 'one', bytes: samplePDF() }), /Symlinks/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(dest, { recursive: true, force: true });
  }
});
