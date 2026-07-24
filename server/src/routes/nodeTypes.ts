import type { RequestHandler, Router } from "express";
import { HttpError } from "../errors/httpError.js";
import { requireUser } from "../middleware/auth.js";
import {
  allNodeSpecs,
  getNodeSpec,
  specVersion
} from "../services/workflow/nodeSpecs.js";

const list: RequestHandler = (_req, res) => {
  res.json({
    spec_version: specVersion,
    node_types: allNodeSpecs()
  });
};

const getOne: RequestHandler = (req, res, next) => {
  try {
    const spec = getNodeSpec(String(req.params.name));
    if (!spec) {
      throw new HttpError(
        404,
        `Unknown node type: ${JSON.stringify(req.params.name)}`
      );
    }
    res.json(spec);
  } catch (err) {
    next(err);
  }
};

export const registerNodeTypeRoutes = (router: Router): void => {
  router.get("/node-types", requireUser, list);
  router.get("/node-types/:name", requireUser, getOne);
};
