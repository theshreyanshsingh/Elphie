import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export type AuthTokenPayload = {
  sub: string;
  email?: string | null;
  iat?: number;
  exp?: number;
};

export const createJwtToken = (userId: number, email: string | null): string =>
  jwt.sign(
    {
      sub: String(userId),
      email
    },
    env.ossJwtSecret,
    {
      algorithm: "HS256",
      expiresIn: `${env.ossJwtExpiryHours}h`
    }
  );

export const decodeJwtToken = (token: string): AuthTokenPayload =>
  jwt.verify(token, env.ossJwtSecret, {
    algorithms: ["HS256"]
  }) as AuthTokenPayload;
