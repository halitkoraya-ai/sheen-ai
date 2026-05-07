export interface DeepgramLiveOptionsInput {
  sourceLanguage: string;
  sampleRate: number;
}

export function buildDeepgramLiveOptions({
  sourceLanguage,
  sampleRate,
}: DeepgramLiveOptionsInput) {
  return {
    model: 'nova-2',
    language: sourceLanguage,
    encoding: 'linear16',
    sample_rate: sampleRate,
    channels: 1,
    diarize: true,
    punctuate: true,
    interim_results: true,
    endpointing: 300,
  };
}
