export type BatchTranscribeAction =
  | {
      kind: "skip";
      reason: "alreadyCompleted" | "alreadyProcessing";
    }
  | {
      kind: "start";
      deleteExistingSegments: boolean;
    }
  | {
      kind: "error";
      expectedStatus: "pendingTranscription";
      actualStatus: string;
    };

interface BatchTranscribeActionParams {
  status: string;
  force: boolean;
}

export function resolveBatchTranscribeAction({
  status,
  force,
}: BatchTranscribeActionParams): BatchTranscribeAction {
  if (status === "transcribing") {
    return {kind: "skip", reason: "alreadyProcessing"};
  }

  if (status === "completed") {
    if (!force) {
      return {kind: "skip", reason: "alreadyCompleted"};
    }
    return {kind: "start", deleteExistingSegments: true};
  }

  if (status === "pendingTranscription") {
    return {kind: "start", deleteExistingSegments: false};
  }

  return {
    kind: "error",
    expectedStatus: "pendingTranscription",
    actualStatus: status,
  };
}

interface BatchFailureStatusParams {
  initialStatus: string;
  force: boolean;
}

export function resolveBatchFailureStatus({
  initialStatus,
  force,
}: BatchFailureStatusParams): "completed" | "pendingTranscription" {
  if (force && initialStatus === "completed") {
    return "completed";
  }
  return "pendingTranscription";
}

export function canRetranslateSession(status: string): boolean {
  return status === "completed";
}
