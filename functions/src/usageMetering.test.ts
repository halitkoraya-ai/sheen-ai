import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveMonthKey,
  resolveTrustedSeconds,
  shouldMeterCompletedSession,
} from "./usageMetering";

test("meters when a session transitions into completed", () => {
  assert.equal(
    shouldMeterCompletedSession(
      {status: "recording", duration: 42},
      {status: "completed", duration: 42}
    ),
    true
  );
});

test("does not meter completed sessions that are already marked recorded", () => {
  assert.equal(
    shouldMeterCompletedSession(
      {status: "completed", duration: 42, usageRecorded: true},
      {status: "completed", duration: 42, usageRecorded: true}
    ),
    false
  );
});

test("does not re-meter unchanged completed sessions", () => {
  assert.equal(
    shouldMeterCompletedSession(
      {status: "completed", duration: 42},
      {status: "completed", duration: 42}
    ),
    false
  );
});

test("re-meters an unrecorded completed session when its duration changes", () => {
  assert.equal(
    shouldMeterCompletedSession(
      {status: "completed", duration: 42},
      {status: "completed", duration: 43}
    ),
    true
  );
});

test("trusted seconds respect stored duration and caller duration", () => {
  assert.equal(resolveTrustedSeconds({duration: 300}, 120), 120);
  assert.equal(resolveTrustedSeconds({duration: 90}, 120), 120);
});

test("month key uses the session creation date when present", () => {
  const monthKey = resolveMonthKey({
    createdAt: {toDate: () => new Date("2026-04-08T12:00:00.000Z")},
  });
  assert.equal(monthKey, "2026-04");
});
