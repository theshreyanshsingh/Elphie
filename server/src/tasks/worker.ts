import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../logging/logger.js";
import { taskHandlers } from "./handlers.js";
import type { FunctionName } from "./functionNames.js";

const worker = new Worker(
  "elphie",
  async (job) => {
    const handler = taskHandlers[job.name as FunctionName];
    if (!handler) {
      throw new Error(`Unknown Elphie task: ${job.name}`);
    }
    const args = Array.isArray(job.data?.args) ? job.data.args : [];
    return handler(...args);
  },
  {
    connection: {
      url: env.redisUrl
    },
    concurrency: 10
  }
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, name: job.name }, "task completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, name: job?.name, err }, "task failed");
});
