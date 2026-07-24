import { Queue } from "bullmq";
import { env } from "../config/env.js";
import type { FunctionName } from "./functionNames.js";

let dograhQueue: Queue | null = null;

export const getDograhQueue = (): Queue => {
  dograhQueue ??= new Queue("dograh", {
    connection: {
      url: env.redisUrl
    }
  });
  return dograhQueue;
};

export const enqueueJob = async (
  name: FunctionName,
  ...args: unknown[]
): Promise<void> => {
  await getDograhQueue().add(name, { args });
};
