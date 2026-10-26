import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingFormat, recordCanvas } from '../lib/cinematic-export.mjs';

test('recording selects an available H.264 MP4 before any WebM format', () => {
  const available = new Set(['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9']);
  assert.deepEqual(recordingFormat(type => available.has(type)), {
    mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4', label: 'MP4',
  });
});

test('generic MP4 is used when an explicit H.264 profile is unavailable', () => {
  assert.deepEqual(recordingFormat(type => type === 'video/mp4' || type === 'video/webm'), {
    mimeType: 'video/mp4', extension: 'mp4', label: 'MP4',
  });
});

test('WebM fallback keeps its actual extension and prefers VP9 then VP8', () => {
  for (const [supported, expected] of [
    [['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'], 'video/webm;codecs=vp9'],
    [['video/webm;codecs=vp8', 'video/webm'], 'video/webm;codecs=vp8'],
    [['video/webm'], 'video/webm'],
  ]) {
    assert.deepEqual(recordingFormat(type => supported.includes(type)), {
      mimeType: expected, extension: 'webm', label: 'WebM',
    });
  }
});

test('an unsupported recorder gives a clear error instead of a mislabeled file', () => {
  assert.throws(() => recordingFormat(() => false), /MP4.*WebM|WebM.*MP4/i);
  assert.throws(() => recordingFormat(), /dukungan|support|function|fungsi/i);
});

test('recording rejects invalid or unbounded durations before accessing browser capture', () => {
  for (const durationMs of [0, -1, NaN, Infinity, -Infinity, 30001, '20000', null]) {
    assert.throws(() => recordCanvas(null, { durationMs }), /durasi|duration/i);
  }
});

test('the default and 30-second limit pass duration validation and require a capture canvas', () => {
  assert.throws(() => recordCanvas(null), /kanvas|canvas/i);
  assert.throws(() => recordCanvas(null, { durationMs: 30000 }), /kanvas|canvas/i);
  assert.throws(() => recordCanvas({ captureStream: 'not a function' }, { durationMs: 1 }), /kanvas|canvas/i);
});
