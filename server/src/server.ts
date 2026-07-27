import http from "node:http";
import { createApp } from "./app.js";
import { logger } from "./logging/logger.js";
import { registerWebSockets } from "./websocket/registerWebSockets.js";

const port = Number.parseInt(process.env.PORT ?? "8000", 10);
const host = process.env.HOST ?? "0.0.0.0";

const app = createApp();
const server = http.createServer(app);

registerWebSockets(server);

server.listen(port, host, () => {
  logger.info({ host, port }, "Elphie Express server listening");
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, "received shutdown signal");
  server.close((err) => {
    if (err) {
      logger.error({ err }, "server shutdown failed");
      process.exit(1);
    }
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
