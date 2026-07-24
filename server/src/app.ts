import express from "express";
import helmet from "helmet";
import multer from "multer";
import { createCorsMiddleware, publicEmbedCors } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { createApiRouter } from "./routes/index.js";

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
  }
}

const captureRawBody = (
  req: express.Request,
  _res: express.Response,
  buffer: Buffer
): void => {
  req.rawBody = Buffer.from(buffer);
};

export const createApp = (): express.Express => {
  const app = express();
  const upload = multer();

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(requestLogger);
  app.use(publicEmbedCors);
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: "25mb", verify: captureRawBody }));
  app.use(express.urlencoded({ extended: true, limit: "25mb", verify: captureRawBody }));
  app.use(upload.any());

  app.use("/api/v1", createApiRouter());

  app.use((_req, res) => {
    res.status(404).json({ detail: "Not found" });
  });
  app.use(errorHandler);

  return app;
};
