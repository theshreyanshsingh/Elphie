import crypto from "node:crypto";

export const hashApiKey = (rawApiKey: string): string =>
  crypto.createHash("sha256").update(rawApiKey).digest("hex");
