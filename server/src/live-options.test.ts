import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDeepgramLiveOptions } from './live-options';

test('buildDeepgramLiveOptions configures raw PCM streaming for Deepgram', () => {
  const options = buildDeepgramLiveOptions({
    sourceLanguage: 'en',
    sampleRate: 48000,
  });

  assert.equal(options.model, 'nova-2');
  assert.equal(options.language, 'en');
  assert.equal(options.encoding, 'linear16');
  assert.equal(options.channels, 1);
  assert.equal(options.sample_rate, 48000);
  assert.equal(options.diarize, true);
  assert.equal(options.punctuate, true);
  assert.equal(options.interim_results, true);
  assert.equal(options.endpointing, 300);
});
