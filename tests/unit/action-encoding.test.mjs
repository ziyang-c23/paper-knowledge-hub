import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAction } from '../../src/lib/action-encoding.mjs';
test('OpenVLA fixed implementation clips inputs and inverse endpoints to 255 centers', () => {
  const config = { bins: 256, convention: 'openvla-tokenizer' };
  assert.equal(encodeAction(-2, config).index, 1);
  assert.equal(encodeAction(2, config).index, 256);
  assert.equal(encodeAction(1, config).intervals, 255);
  assert.equal(encodeAction(0.999, config).center, encodeAction(1, config).center);
  assert.equal(encodeAction(0, config).index, 128);
  assert.ok(Math.abs(encodeAction(0, config).center) < 1e-12);
});
test('illustrative uniform quantization keeps clipping and does not use vocabulary IDs', () => {
  for (const value of [-1, -0.5, 0, 0.5, 1]) {
    const result = encodeAction(value);
    assert.ok(result.index >= 0 && result.index < 256);
    assert.ok(Math.abs(result.center - value) <= 1 / 256 + 1e-12);
  }
});
