import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.logLevel.toLowerCase(),
  base: {
    service: "elphie-server",
    environment: env.environment
  }
});
