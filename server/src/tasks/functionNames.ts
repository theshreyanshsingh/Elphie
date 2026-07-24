export const functionNames = {
  runIntegrationsPostWorkflowRun: "run_integrations_post_workflow_run",
  uploadVoicemailAudioToS3: "upload_voicemail_audio_to_s3",
  processWorkflowCompletion: "process_workflow_completion",
  syncCampaignSource: "sync_campaign_source",
  processCampaignBatch: "process_campaign_batch",
  processKnowledgeBaseDocument: "process_knowledge_base_document"
} as const;

export type FunctionName = (typeof functionNames)[keyof typeof functionNames];
