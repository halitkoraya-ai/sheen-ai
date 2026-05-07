import test from "node:test";
import assert from "node:assert/strict";

import {buildDeepgramLiveOptions} from "./live-options";

test("buildDeepgramLiveOptions sets explicit raw-audio params", () => {
  assert.deepEqual(buildDeepgramLiveOptions({
    sourceLanguage: "en",
    sampleRate: 48000,
  }), {
    model: "nova-2",
    language: "en",
    diarize: true,
    punctuate: true,
    interim_results: true,
    endpointing: 300,
    encoding: "linear16",
    sample_rate: 48000,
    channels: 1,
  });
});
