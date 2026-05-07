import WebSocket from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { TranslationServiceClient } from '@google-cloud/translate';
import {
  TranscriptMessage,
  ErrorMessage,
  StopMessage,
} from './types';
import { buildDeepgramLiveOptions } from './live-options';

const translationClient = new TranslationServiceClient();

async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string | null> {
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      console.error('GOOGLE_CLOUD_PROJECT environment variable not set');
      return null;
    }

    const [response] = await translationClient.translateText({
      parent: `projects/${projectId}/locations/global`,
      contents: [text],
      sourceLanguageCode: sourceLanguage,
      targetLanguageCode: targetLanguage,
      mimeType: 'text/plain',
    });

    return response.translations?.[0]?.translatedText ?? null;
  } catch (error) {
    console.error('Translation failed:', error);
    return null;
  }
}

function sendJSON(ws: WebSocket, data: TranscriptMessage | ErrorMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export async function handleStream(
  ws: WebSocket,
  userId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sampleRate: number,
  startingSegmentOrder: number = 0,
): Promise<void> {
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    sendJSON(ws, { type: 'error', message: 'Deepgram API key not configured' });
    ws.close();
    return;
  }

  const deepgram = createClient(deepgramApiKey);

  const connection = deepgram.listen.live(
    buildDeepgramLiveOptions({
      sourceLanguage,
      sampleRate,
    }),
  );

  let segmentOrder = startingSegmentOrder;
  let deepgramReady = false;
  let cleanedUp = false;

  function cleanup(): void {
    if (cleanedUp) return;
    cleanedUp = true;

    try {
      connection.requestClose();
    } catch (err) {
      console.error('Error closing Deepgram connection:', err);
    }

    console.log(`[${userId}] Stream session ended. Total final segments: ${segmentOrder}`);
  }

  // Deepgram event: connection opened
  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log(`[${userId}] Deepgram connection opened`);
    deepgramReady = true;
  });

  // Deepgram event: transcript result
  connection.on(LiveTranscriptionEvents.Transcript, async (data: any) => {
    try {
      const alternative = data.channel?.alternatives?.[0];
      if (!alternative) return;

      const transcript = alternative.transcript?.trim();
      if (!transcript) return;

      const words = alternative.words ?? [];
      const speakerIndex = words.length > 0 ? (words[0].speaker ?? 0) : 0;
      const startTime = words.length > 0 ? (words[0].start ?? 0) : 0;
      const endTime = words.length > 0 ? (words[words.length - 1].end ?? 0) : 0;
      const isFinal = data.is_final === true;

      if (isFinal && transcript.length > 0) {
        // Capture and increment order synchronously BEFORE async translation
        // to prevent race conditions with concurrent finals
        const currentOrder = segmentOrder++;

        // Final segment: translate and send
        const translatedText = await translateText(
          transcript,
          sourceLanguage,
          targetLanguage,
        );

        const message: TranscriptMessage = {
          type: 'transcript',
          speakerIndex,
          originalText: transcript,
          translatedText,
          isFinal: true,
          startTime,
          endTime,
          order: currentOrder,
        };

        sendJSON(ws, message);
      } else if (!isFinal) {
        // Interim result: send without translation
        const message: TranscriptMessage = {
          type: 'transcript',
          speakerIndex,
          originalText: transcript,
          translatedText: null,
          isFinal: false,
          startTime,
          endTime,
          order: segmentOrder,
        };

        sendJSON(ws, message);
      }
    } catch (error) {
      console.error(`[${userId}] Error processing transcript:`, error);
      sendJSON(ws, {
        type: 'error',
        message: 'Failed to process transcript segment',
      });
    }
  });

  // Deepgram event: error
  connection.on(LiveTranscriptionEvents.Error, (error: any) => {
    console.error(`[${userId}] Deepgram error:`, error);
    sendJSON(ws, {
      type: 'error',
      message: `Transcription error: ${error.message ?? 'Unknown error'}`,
    });
  });

  // Deepgram event: close
  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log(`[${userId}] Deepgram connection closed`);
  });

  // Handle messages from Flutter client
  ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
    if (cleanedUp) return;

    if (isBinary) {
      // Binary message: audio chunk -> forward to Deepgram
      if (deepgramReady) {
        try {
          const buf = Buffer.isBuffer(data)
            ? data
            : Buffer.from(data as ArrayBuffer);
          // Convert to ArrayBuffer for Deepgram SDK compatibility
          const arrayBuffer = buf.buffer.slice(
            buf.byteOffset,
            buf.byteOffset + buf.byteLength,
          );
          connection.send(arrayBuffer);
        } catch (error) {
          console.error(`[${userId}] Error forwarding audio to Deepgram:`, error);
        }
      }
    } else {
      // JSON message from client
      try {
        const message = JSON.parse(data.toString()) as StopMessage;
        if (message.type === 'stop') {
          console.log(`[${userId}] Client requested stop`);
          cleanup();
        }
      } catch (error) {
        console.error(`[${userId}] Failed to parse client message:`, error);
      }
    }
  });

  // Handle Flutter client disconnect
  ws.on('close', () => {
    console.log(`[${userId}] Client disconnected`);
    cleanup();
  });

  ws.on('error', (error: Error) => {
    console.error(`[${userId}] WebSocket error:`, error);
    cleanup();
  });
}
