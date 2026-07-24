import { registerApiKeyRoutes } from "./apiKeys.js";
import { Router } from "express";
import { registerAuthRoutes } from "./auth.js";
import { registerCampaignRoutes } from "./campaign.js";
import { registerCredentialRoutes } from "./credentials.js";
import { registerFolderRoutes } from "./folders.js";
import { registerHealthRoute } from "./health.js";
import { registerKnowledgeBaseRoutes } from "./knowledgeBase.js";
import { registerMcpRouter } from "../mcpServer/router.js";
import { registerNodeTypeRoutes } from "./nodeTypes.js";
import { registerOpenApiRoute } from "./openapi.js";
import { registerOrganizationRoutes } from "./organizations.js";
import { registerPublicRoutes } from "./public.js";
import { registerS3Routes } from "./s3.js";
import { registerSuperuserRoutes } from "./superuser.js";
import { registerTelephonyRoutes } from "./telephony.js";
import { registerToolRoutes } from "./tools.js";
import { registerTurnRoutes } from "./turn.js";
import { registerUserRoutes } from "./user.js";
import { registerWorkflowRoutes } from "./workflow.js";
import { registerWorkflowRecordingRoutes } from "./workflowRecordings.js";

export const createApiRouter = (): Router => {
  const router = Router();

  registerHealthRoute(router);
  registerOpenApiRoute(router);
  registerAuthRoutes(router);
  registerTurnRoutes(router);
  registerNodeTypeRoutes(router);
  registerFolderRoutes(router);
  registerCredentialRoutes(router);
  registerUserRoutes(router);
  registerApiKeyRoutes(router);
  registerSuperuserRoutes(router);
  registerOrganizationRoutes(router);
  registerTelephonyRoutes(router);
  registerCampaignRoutes(router);
  registerS3Routes(router);
  registerToolRoutes(router);
  registerWorkflowRoutes(router);
  registerWorkflowRecordingRoutes(router);
  registerKnowledgeBaseRoutes(router);
  registerPublicRoutes(router);
  registerMcpRouter(router);

  return router;
};
