export type RecordingTrack = "mixed" | "user" | "bot";

const recordingsObject = (
  extra: unknown
): Record<string, unknown> | null => {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
    return null;
  }
  const recordings = (extra as Record<string, unknown>).recordings;
  if (!recordings || typeof recordings !== "object" || Array.isArray(recordings)) {
    return null;
  }
  return recordings as Record<string, unknown>;
};

export const getRecordingStorageKey = (
  extra: unknown,
  track: RecordingTrack
): string | null => {
  const recordings = recordingsObject(extra);
  const artifact = recordings?.[track];
  if (typeof artifact === "string") {
    return artifact;
  }
  if (artifact && typeof artifact === "object" && !Array.isArray(artifact)) {
    const storageKey = (artifact as Record<string, unknown>).storage_key;
    return typeof storageKey === "string" ? storageKey : null;
  }
  return null;
};

export const getRecordingStorageBackend = (
  extra: unknown,
  track: RecordingTrack
): string | null => {
  const recordings = recordingsObject(extra);
  const artifact = recordings?.[track];
  if (artifact && typeof artifact === "object" && !Array.isArray(artifact)) {
    const storageBackend = (artifact as Record<string, unknown>).storage_backend;
    return typeof storageBackend === "string" ? storageBackend : null;
  }
  return null;
};
