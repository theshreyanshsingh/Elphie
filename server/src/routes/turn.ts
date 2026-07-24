import type { RequestHandler, Router } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../errors/httpError.js";
import { requireUser } from "../middleware/auth.js";
import { generateTurnCredentials } from "../services/turn/credentials.js";

const credentials: RequestHandler = (req, res, next) => {
  try {
    if (!env.turnSecret) {
      throw new HttpError(503, "TURN server not configured");
    }
    const user = req.user;
    if (!user) {
      throw new HttpError(401, "Unauthorized");
    }
    res.json(generateTurnCredentials(String(user.id)));
  } catch (err) {
    next(err);
  }
};

export const registerTurnRoutes = (router: Router): void => {
  router.get("/turn/credentials", requireUser, credentials);
};
