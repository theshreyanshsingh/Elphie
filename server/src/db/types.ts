import type { ColumnType, Generated } from "kysely";

export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
export type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
export type Json = ColumnType<JsonValue, JsonValue | undefined, JsonValue>;
export type Vector = ColumnType<number[], number[] | string | undefined, number[] | string>;

type Id = Generated<number>;

export interface UserTable {
  id: Id;
  provider_id: string;
  created_at: Timestamp;
  selected_organization_id: number | null;
  is_superuser: boolean;
  email: string | null;
  password_hash: string | null;
}

export interface OrganizationScopedTable {
  organization_id: number;
}

export interface OrganizationTable {
  id: Id;
  provider_id: string;
  created_at: Timestamp;
  quota_type: string;
  quota_dograh_tokens: number;
  quota_reset_day: number;
  quota_start_date: Timestamp | null;
  quota_enabled: boolean;
  price_per_second_usd: number | null;
}

export interface APIKeyTable extends OrganizationScopedTable {
  id: Id;
  name: string;
  key_hash: string;
  key_prefix: string;
  is_active: boolean;
  created_by: number | null;
  last_used_at: Timestamp | null;
  created_at: Timestamp;
  archived_at: Timestamp | null;
}

export interface FolderTable extends OrganizationScopedTable {
  id: Id;
  name: string;
  created_at: Timestamp;
}

export interface ExternalCredentialTable extends OrganizationScopedTable {
  id: Id;
  credential_uuid: string;
  name: string;
  description: string | null;
  credential_type: string;
  credential_data: Json;
  created_by: number;
  created_at: Timestamp;
  updated_at: Timestamp | null;
  is_active: boolean;
}

export interface JsonConfigTable extends OrganizationScopedTable {
  id: Id;
  key: string;
  value: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface UserConfigurationTable {
  id: Id;
  user_id: number | null;
  key: string;
  configuration: Json;
  last_validated_at: Timestamp | null;
}

export interface GenericTable {
  id: Id;
  [column: string]: unknown;
}

export interface WorkflowDefinitionTable {
  id: Id;
  workflow_hash: string | null;
  workflow_json: Json;
  workflow_id: number | null;
  is_current: boolean;
  created_at: Timestamp;
  status: string;
  version_number: number | null;
  published_at: Timestamp | null;
  workflow_configurations: Json;
  template_context_variables: Json;
  call_disposition_codes: Json;
}

export interface WorkflowTable extends OrganizationScopedTable {
  id: Id;
  workflow_uuid: string | null;
  user_id: number | null;
  name: string;
  status: string;
  workflow_definition: Json;
  workflow_configurations: Json;
  template_context_variables: Json;
  call_disposition_codes: Json;
  created_at: Timestamp;
  folder_id: number | null;
  released_definition_id: number | null;
}

export interface WorkflowRunTable {
  id: Id;
  workflow_id: number;
  definition_id: number | null;
  name: string;
  state: string;
  mode: string | null;
  call_type: string | null;
  is_completed: boolean;
  recording_url: string | null;
  transcript_url: string | null;
  extra: Json;
  storage_backend: string;
  usage_info: Json;
  cost_info: Json;
  initial_context: Json;
  gathered_context: Json;
  logs: Json;
  annotations: Json;
  created_at: Timestamp;
  campaign_id: number | null;
  queued_run_id: number | null;
  public_access_token: string | null;
}

export interface WorkflowTemplateTable {
  id: Id;
  template_name: string;
  template_description: string;
  template_json: Json;
  created_at: Timestamp;
}

export interface WorkflowRunTextSessionTable {
  workflow_run_id: number;
  revision: number;
  session_data: Json;
  checkpoint: Json;
  created_at: Timestamp;
  updated_at: Timestamp | null;
}

export interface EmbedTokenTable extends OrganizationScopedTable {
  id: Id;
  token: string;
  workflow_id: number;
  allowed_domains: Json;
  settings: Json;
  is_active: boolean;
  usage_limit: number | null;
  usage_count: number;
  expires_at: Timestamp | null;
  created_at: Timestamp;
  created_by: number;
  updated_at: Timestamp | null;
}

export interface EmbedSessionTable {
  id: Id;
  session_token: string;
  embed_token_id: number;
  workflow_run_id: number | null;
  client_ip: string | null;
  user_agent: string | null;
  origin: string | null;
  created_at: Timestamp;
  expires_at: Timestamp;
}

export interface AgentTriggerTable extends OrganizationScopedTable {
  id: Id;
  trigger_path: string;
  workflow_id: number;
  state: string;
  created_at: Timestamp;
}

export interface TelephonyConfigurationTable extends OrganizationScopedTable {
  id: Id;
  name: string;
  provider: string;
  credentials: Json;
  is_default_outbound: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TelephonyPhoneNumberTable extends OrganizationScopedTable {
  id: Id;
  telephony_configuration_id: number;
  address: string;
  address_normalized: string;
  address_type: string;
  country_code: string | null;
  label: string | null;
  inbound_workflow_id: number | null;
  is_active: boolean;
  is_default_caller_id: boolean;
  extra_metadata: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CampaignTable extends OrganizationScopedTable {
  id: Id;
  name: string;
  workflow_id: number;
  created_by: number;
  telephony_configuration_id: number | null;
  source_type: string;
  source_id: string;
  state: string;
  total_rows: number | null;
  processed_rows: number;
  failed_rows: number;
  rate_limit_per_second: number;
  max_retries: number;
  source_sync_status: string;
  source_last_synced_at: Timestamp | null;
  source_sync_error: string | null;
  retry_config: Json;
  last_batch_scheduled_at: Timestamp | null;
  last_activity_at: Timestamp | null;
  orchestrator_metadata: Json;
  logs: Json;
  created_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  updated_at: Timestamp;
}

export interface QueuedRunTable {
  id: Id;
  campaign_id: number;
  source_uuid: string;
  context_variables: Json;
  state: string;
  created_at: Timestamp;
  processed_at: Timestamp | null;
  retry_count: number;
  parent_queued_run_id: number | null;
  scheduled_for: Timestamp | null;
  retry_reason: string | null;
}

export interface KnowledgeBaseDocumentTable extends OrganizationScopedTable {
  id: Id;
  document_uuid: string;
  filename: string;
  file_size_bytes: number | null;
  file_hash: string | null;
  mime_type: string | null;
  retrieval_mode: string;
  full_text: string | null;
  source_url: string | null;
  total_chunks: number;
  processing_status: string;
  processing_error: string | null;
  docling_metadata: Json;
  custom_metadata: Json;
  created_by: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  is_active: boolean;
  archived_at: Timestamp | null;
}

export interface KnowledgeBaseChunkTable extends OrganizationScopedTable {
  id: Id;
  document_id: number;
  chunk_text: string;
  contextualized_text: string | null;
  chunk_index: number;
  chunk_metadata: Json;
  embedding_model: string;
  embedding_dimension: number;
  embedding: Vector | null;
  token_count: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ToolTable extends OrganizationScopedTable {
  id: Id;
  tool_uuid: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  icon_color: string | null;
  status: string;
  definition: Json;
  created_by: number;
  created_at: Timestamp;
  updated_at: Timestamp | null;
}

export interface WorkflowRecordingTable extends OrganizationScopedTable {
  id: Id;
  recording_id: string;
  workflow_id: number | null;
  tts_provider: string | null;
  tts_model: string | null;
  tts_voice_id: string | null;
  transcript: string;
  storage_key: string;
  storage_backend: string;
  recording_metadata: Json;
  created_by: number;
  created_at: Timestamp;
  is_active: boolean;
}

export interface Database {
  users: UserTable;
  organization_users: {
    user_id: number;
    organization_id: number;
  };
  user_configurations: UserConfigurationTable;
  organizations: OrganizationTable;
  api_keys: APIKeyTable;
  organization_configurations: JsonConfigTable;
  telephony_configurations: TelephonyConfigurationTable;
  telephony_phone_numbers: TelephonyPhoneNumberTable;
  integrations: GenericTable & OrganizationScopedTable;
  workflow_definitions: WorkflowDefinitionTable;
  folders: FolderTable;
  workflows: WorkflowTable;
  workflow_templates: WorkflowTemplateTable;
  workflow_runs: WorkflowRunTable;
  workflow_run_text_sessions: WorkflowRunTextSessionTable;
  organization_usage_cycles: GenericTable & OrganizationScopedTable;
  campaigns: CampaignTable;
  queued_runs: QueuedRunTable;
  embed_tokens: EmbedTokenTable;
  embed_sessions: EmbedSessionTable;
  agent_triggers: AgentTriggerTable;
  external_credentials: ExternalCredentialTable;
  tools: ToolTable;
  knowledge_base_documents: KnowledgeBaseDocumentTable;
  workflow_recordings: WorkflowRecordingTable;
  knowledge_base_chunks: KnowledgeBaseChunkTable;
}
