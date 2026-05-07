import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import * as admin from 'firebase-admin';
import { verifyToken } from './auth';
import { handleStream } from './stream-handler';
import {
  AuthMessage,
  ErrorMessage,
  AuthSuccessMessage,
} from './types';

// Initialize Firebase Admin SDK (uses default credentials on Cloud Run)
admin.initializeApp();

const app = express();

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const server = http.createServer(app);

// WebSocket server — only handle upgrade on /stream path
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);

  if (url.pathname !== '/stream') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws: WebSocket) => {
  console.log('New WebSocket connection — awaiting auth');

  // Set a timeout for auth: client must send auth within 10 seconds
  const authTimeout = setTimeout(() => {
    sendError(ws, 'Authentication timeout — no auth message received');
    ws.close();
  }, 10_000);

  let authenticated = false;

  ws.on('message', async (data: WebSocket.RawData, isBinary: boolean) => {
    // Ignore binary messages before auth
    if (isBinary) {
      if (!authenticated) {
        sendError(ws, 'Must authenticate before sending audio');
        ws.close();
        clearTimeout(authTimeout);
      }
      return;
    }

    // Only handle the first JSON message as auth
    if (authenticated) return;

    clearTimeout(authTimeout);

    try {
      const message = JSON.parse(data.toString()) as AuthMessage;

      if (message.type !== 'auth' || !message.token) {
        sendError(ws, 'First message must be an auth message with a valid token');
        ws.close();
        return;
      }

      // M5: Validate language codes are non-empty strings
      if (
        !message.sourceLanguage ||
        typeof message.sourceLanguage !== 'string' ||
        !message.targetLanguage ||
        typeof message.targetLanguage !== 'string'
      ) {
        sendError(ws, 'sourceLanguage and targetLanguage must be non-empty strings');
        ws.close();
        return;
      }

      if (
        typeof message.sampleRate !== 'number' ||
        !Number.isFinite(message.sampleRate) ||
        message.sampleRate <= 0
      ) {
        sendError(ws, 'sampleRate must be a positive number');
        ws.close();
        return;
      }

      if (message.channels !== 1 || message.encoding !== 'linear16') {
        sendError(ws, 'Unsupported audio format');
        ws.close();
        return;
      }

      const decodedToken = await verifyToken(message.token);
      const userId = decodedToken.uid;
      authenticated = true;

      console.log(`User ${userId} authenticated`);

      // Send auth success
      const successMsg: AuthSuccessMessage = { type: 'auth_success' };
      ws.send(JSON.stringify(successMsg));

      // Remove this listener before handing off to stream handler
      // (stream-handler will attach its own 'message' listener)
      ws.removeAllListeners('message');

      // C4: Parse optional startingSegmentOrder for reconnect support
      const startingSegmentOrder =
        typeof message.startingSegmentOrder === 'number' && message.startingSegmentOrder >= 0
          ? message.startingSegmentOrder
          : 0;

      // Hand off to stream handler
      await handleStream(
        ws,
        userId,
        message.sourceLanguage,
        message.targetLanguage,
        message.sampleRate,
        startingSegmentOrder,
      );
    } catch (error: any) {
      // M6: Sanitize auth error messages — don't expose raw error.message to client
      console.error('Authentication failed:', error);
      sendError(ws, 'Authentication failed');
      ws.close();
    }
  });
});

function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    const errorMsg: ErrorMessage = { type: 'error', message };
    ws.send(JSON.stringify(errorMsg));
  }
}

const PORT = parseInt(process.env.PORT ?? '8080', 10);

server.listen(PORT, () => {
  console.log(`Sheen server listening on port ${PORT}`);
});
