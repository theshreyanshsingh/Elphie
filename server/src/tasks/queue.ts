import { Queue } from "bullmq";
import { env } from "../config/env.js";
import type { FunctionName } from "./functionNames.js";

let elphieQueue: Queue | null = null;

export const getElphieQueue = (): Queue => {
  elphieQueue ??= new Queue("elphie", {
    connection: {
      url: env.redisUrl
    }
  });
  return elphieQueue;
};

export const enqueueJob = async (
  name: FunctionName,
  ...args: unknown[]
): Promise<void> => {
  await getElphieQueue().add(name, { args });
};
