export interface AuthMessage {
  type: 'auth';
  token: string;
  sourceLanguage: string;
  targetLanguage: string;
  sampleRate: number;
  channels: number;
  encoding: string;
  startingSegmentOrder?: number;
}

export interface StopMessage {
  type: 'stop';
}

export interface TranscriptMessage {
  type: 'transcript';
  speakerIndex: number;
  originalText: string;
  translatedText: string | null;
  isFinal: boolean;
  startTime: number;
  endTime: number;
  order: number;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface AuthSuccessMessage {
  type: 'auth_success';
}

export type ClientMessage = AuthMessage | StopMessage;
export type ServerMessage = TranscriptMessage | ErrorMessage | AuthSuccessMessage;
