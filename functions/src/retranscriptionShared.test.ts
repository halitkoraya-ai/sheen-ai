import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveBatchTranscribeAction,
  resolveBatchFailureStatus,
  canRetranslateSession,
} from "./retranscriptionShared";

test("completed sessions are skipped unless force mode is enabled", () => {
  assert.deepEqual(
    resolveBatchTranscribeAction({
      status: "completed",
      force: false,
    }),
    {kind: "skip", reason: "alreadyCompleted"}
  );

  assert.deepEqual(
    resolveBatchTranscribeAction({
      status: "completed",
      force: true,
    }),
    {kind: "start", deleteExistingSegments: true}
  );
});

test("pending sessions still start normally without deleting segments", () => {
  assert.deepEqual(
    resolveBatchTranscribeAction({
      status: "pendingTranscription",
      force: false,
    }),
    {kind: "start", deleteExistingSegments: false}
  );
});

test("transcribing sessions are reported as already processing", () => {
  assert.deepEqual(
    resolveBatchTranscribeAction({
      status: "transcribing",
      force: true,
    }),
    {kind: "skip", reason: "alreadyProcessing"}
  );
});

test("force-mode failures roll completed sessions back to completed", () => {
  assert.equal(
    resolveBatchFailureStatus({
      initialStatus: "completed",
      force: true,
    }),
    "completed"
  );

  assert.equal(
    resolveBatchFailureStatus({
      initialStatus: "pendingTranscription",
      force: false,
    }),
    "pendingTranscription"
  );
});

test("retranslate is limited to completed sessions", () => {
  assert.equal(canRetranslateSession("completed"), true);
  assert.equal(canRetranslateSession("transcribing"), false);
  assert.equal(canRetranslateSession("pendingTranscription"), false);
});
