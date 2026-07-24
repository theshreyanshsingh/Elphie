import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../errors/httpError.js";
import { logger } from "../logging/logger.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(err.payload);
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      detail: err.issues.map((issue) => ({
        loc: issue.path,
        msg: issue.message,
        type: issue.code
      }))
    });
    return;
  }

  logger.error({ err, path: req.originalUrl }, "unhandled request error");
  res.status(500).json({ detail: "Internal Server Error" });
};
