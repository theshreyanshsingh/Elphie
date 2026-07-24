import crypto from "node:crypto";
import { env } from "../../config/env.js";

export type TurnCredentials = {
  username: string;
  password: string;
  ttl: number;
  uris: string[];
};

export const generateTurnCredentials = (
  userId: string,
  ttl = env.turnCredentialTtl
): TurnCredentials => {
  if (!env.turnSecret) {
    throw new Error("TURN_SECRET is not configured");
  }

  const expiration = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiration}:${userId}`;
  const password = crypto
    .createHmac("sha1", env.turnSecret)
    .update(username)
    .digest("base64");

  const uris =
    env.environment === "local"
      ? [
          `turn:${env.turnHost}:${env.turnPort}?transport=tcp`,
          `turn:${env.turnHost}:${env.turnPort}`
        ]
      : [
          `turn:${env.turnHost}:${env.turnPort}`,
          `turn:${env.turnHost}:${env.turnPort}?transport=tcp`
        ];

  if (env.turnTlsPort) {
    uris.push(
      `turns:${env.turnHost}:${env.turnTlsPort}`,
      `turns:${env.turnHost}:${env.turnTlsPort}?transport=tcp`
    );
  }

  return {
    username,
    password,
    ttl,
    uris
  };
};
