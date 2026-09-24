import test from 'node:test';
import assert from 'node:assert/strict';
import { timestampSeconds, mediaLocation } from '../../src/lib/media-location.mjs';
test('media locators retain zero, hours and unknowns without fabricating intervals', () => {
  assert.equal(timestampSeconds('00:42'), 42);
  assert.equal(timestampSeconds('01:02:03'), 3723);
  assert.equal(timestampSeconds('00:00'), 0);
  for (const v of [undefined, '', '01:70', -1, Infinity]) assert.equal(timestampSeconds(v), null);
  assert.deepEqual(mediaLocation({ start: '00:42', end: '01:08' }), { start: 42, end: 68 });
  assert.deepEqual(mediaLocation({ start: '00:42', end: '00:10' }), { start: 42, end: null });
});
