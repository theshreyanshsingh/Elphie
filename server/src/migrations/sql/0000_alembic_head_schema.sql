-- Generated from api.db.models.Base metadata. Do not edit by hand.
-- This bootstrap schema lets the Node backend own clean database creation without importing Python at runtime.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE campaign_state AS ENUM ('created', 'syncing', 'running', 'paused', 'completed', 'failed');
CREATE TYPE document_processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE queued_run_state AS ENUM ('queued', 'processed', 'processing', 'failed');
CREATE TYPE quota_type AS ENUM ('monthly', 'annual');
CREATE TYPE recording_storage_backend AS ENUM ('s3', 'minio');
CREATE TYPE storage_backend AS ENUM ('s3', 'minio');
CREATE TYPE tool_category AS ENUM ('http_api', 'end_call', 'transfer_call', 'calculator', 'native', 'integration', 'mcp');
CREATE TYPE tool_status AS ENUM ('active', 'archived', 'draft');
CREATE TYPE trigger_state AS ENUM ('active', 'archived');
CREATE TYPE webhook_credential_type AS ENUM ('none', 'api_key', 'bearer_token', 'basic_auth', 'custom_header');
CREATE TYPE workflow_call_type AS ENUM ('inbound', 'outbound');
CREATE TYPE workflow_run_state AS ENUM ('initialized', 'running', 'completed');
CREATE TYPE workflow_status AS ENUM ('active', 'archived');


CREATE TABLE organizations (
	id SERIAL NOT NULL, 
	provider_id VARCHAR NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	quota_type quota_type DEFAULT 'monthly'::quota_type NOT NULL, 
	quota_elphie_tokens INTEGER DEFAULT 0 NOT NULL,
	quota_reset_day INTEGER DEFAULT 1 NOT NULL, 
	quota_start_date TIMESTAMP WITH TIME ZONE, 
	quota_enabled BOOLEAN DEFAULT false NOT NULL, 
	price_per_second_usd FLOAT, 
	PRIMARY KEY (id)
);


CREATE TABLE workflow_templates (
	id SERIAL NOT NULL, 
	template_name VARCHAR NOT NULL, 
	template_description VARCHAR NOT NULL, 
	template_json JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
);


CREATE TABLE folders (
	id SERIAL NOT NULL, 
	organization_id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_folder_org_name UNIQUE (organization_id, name), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id)
);


CREATE TABLE organization_configurations (
	id SERIAL NOT NULL, 
	organization_id INTEGER NOT NULL, 
	key VARCHAR NOT NULL, 
	value JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT _organization_key_uc UNIQUE (organization_id, key), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);


CREATE TABLE organization_usage_cycles (
	id SERIAL NOT NULL, 
	organization_id INTEGER NOT NULL, 
	period_start TIMESTAMP WITH TIME ZONE NOT NULL, 
	period_end TIMESTAMP WITH TIME ZONE NOT NULL, 
	quota_elphie_tokens INTEGER NOT NULL,
	used_elphie_tokens FLOAT NOT NULL,
	total_duration_seconds INTEGER DEFAULT 0 NOT NULL, 
	used_amount_usd FLOAT, 
	quota_amount_usd FLOAT, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT unique_org_period UNIQUE (organization_id, period_start, period_end), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id)
);


CREATE TABLE telephony_configurations (
	id SERIAL NOT NULL, 
	organization_id INTEGER NOT NULL, 
	name VARCHAR(64) NOT NULL, 
	provider VARCHAR(32) NOT NULL, 
	credentials JSON NOT NULL, 
	is_default_outbound BOOLEAN DEFAULT false NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_telephony_configurations_org_name UNIQUE (organization_id, name), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);


CREATE TABLE users (
	id SERIAL NOT NULL, 
	provider_id VARCHAR NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	selected_organization_id INTEGER, 
	is_superuser BOOLEAN, 
	email VARCHAR, 
	password_hash VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(selected_organization_id) REFERENCES organizations (id)
);


CREATE TABLE api_keys (
	id SERIAL NOT NULL, 
	organization_id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	key_hash VARCHAR NOT NULL, 
	key_prefix VARCHAR NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_by INTEGER, 
	last_used_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE, 
	archived_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
);


CREATE TABLE external_credentials (
	id SERIAL NOT NULL, 
	credential_uuid VARCHAR(36) NOT NULL, 
	organization_id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	description VARCHAR, 
	credential_type webhook_credential_type NOT NULL, 
	credential_data JSON NOT NULL, 
	created_by INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT unique_org_credential_name UNIQUE (organization_id, name), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
);


CREATE TABLE integrations (
	id SERIAL NOT NULL, 
	integration_id VARCHAR NOT NULL, 
	organization_id INTEGER NOT NULL, 
	provider VARCHAR NOT NULL, 
	created_by INTEGER, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	connection_details JSON NOT NULL, 
	action VARCHAR NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT integrations_organisation_id_fkey FOREIGN KEY(organization_id) REFERENCES organizations (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);


CREATE TABLE knowledge_base_documents (
	id SERIAL NOT NULL, 
	document_uuid VARCHAR(36) NOT NULL, 
	organization_id INTEGER NOT NULL, 
	filename VARCHAR(500) NOT NULL, 
	file_size_bytes INTEGER, 
	file_hash VARCHAR(64), 
	mime_type VARCHAR(100), 
	retrieval_mode VARCHAR(20) DEFAULT 'chunked' NOT NULL, 
	full_text TEXT, 
	source_url VARCHAR, 
	total_chunks INTEGER NOT NULL, 
	processing_status document_processing_status DEFAULT 'pending'::document_processing_status NOT NULL, 
	processing_error TEXT, 
	docling_metadata JSON NOT NULL, 
	custom_metadata JSON NOT NULL, 
	created_by INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	is_active BOOLEAN NOT NULL, 
	archived_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
);


CREATE TABLE organization_users (
	user_id INTEGER NOT NULL, 
	organization_id INTEGER NOT NULL, 
	PRIMARY KEY (user_id, organization_id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id)
);


CREATE TABLE tools (
	id SERIAL NOT NULL, 
	tool_uuid VARCHAR(36) NOT NULL, 
	organization_id INTEGER NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	description VARCHAR, 
	category tool_category NOT NULL, 
	icon VARCHAR(50), 
	icon_color VARCHAR(7), 
	status tool_status DEFAULT 'active'::tool_status NOT NULL, 
	definition JSON NOT NULL, 
	created_by INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
);


CREATE TABLE user_configurations (
	id SERIAL NOT NULL, 
	user_id INTEGER, 
	key VARCHAR NOT NULL, 
	configuration JSON NOT NULL, 
	last_validated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT _user_configuration_key_uc UNIQUE (user_id, key), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);


CREATE TABLE workflows (
	id SERIAL NOT NULL, 
	workflow_uuid VARCHAR(36) NOT NULL, 
	user_id INTEGER, 
	organization_id INTEGER, 
	folder_id INTEGER, 
	name VARCHAR NOT NULL, 
	status workflow_status DEFAULT 'active'::workflow_status NOT NULL, 
	workflow_definition JSON NOT NULL, 
	template_context_variables JSON NOT NULL, 
	call_disposition_codes JSON NOT NULL, 
	workflow_configurations JSON DEFAULT '{}'::json NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	released_definition_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id), 
	CONSTRAINT fk_workflows_folder_id FOREIGN KEY(folder_id) REFERENCES folders (id) ON DELETE SET NULL
);


CREATE TABLE agent_triggers (
	id SERIAL NOT NULL, 
	trigger_path VARCHAR(36) NOT NULL, 
	workflow_id INTEGER NOT NULL, 
	organization_id INTEGER NOT NULL, 
	state trigger_state DEFAULT 'active'::trigger_state NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workflow_id) REFERENCES workflows (id) ON DELETE CASCADE, 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);


CREATE TABLE campaigns (
	id SERIAL NOT NULL, 
	name VARCHAR NOT NULL, 
	organization_id INTEGER NOT NULL, 
	workflow_id INTEGER NOT NULL, 
	created_by INTEGER NOT NULL, 
	telephony_configuration_id INTEGER, 
	source_type VARCHAR NOT NULL, 
	source_id VARCHAR NOT NULL, 
	state campaign_state NOT NULL, 
	total_rows INTEGER, 
	processed_rows INTEGER NOT NULL, 
	failed_rows INTEGER NOT NULL, 
	rate_limit_per_second INTEGER NOT NULL, 
	max_retries INTEGER NOT NULL, 
	source_sync_status VARCHAR NOT NULL, 
	source_last_synced_at TIMESTAMP WITH TIME ZONE, 
	source_sync_error VARCHAR, 
	retry_config JSON DEFAULT '{"enabled": true, "max_retries": 2, "retry_on_busy": true, "retry_on_no_answer": true, "retry_on_voicemail": true, "retry_delay_seconds": 120}'::jsonb NOT NULL, 
	last_batch_scheduled_at TIMESTAMP WITH TIME ZONE, 
	last_activity_at TIMESTAMP WITH TIME ZONE, 
	orchestrator_metadata JSON DEFAULT '{}'::json NOT NULL, 
	logs JSON DEFAULT '[]'::json NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	started_at TIMESTAMP WITH TIME ZONE, 
	completed_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id), 
	FOREIGN KEY(workflow_id) REFERENCES workflows (id), 
	FOREIGN KEY(created_by) REFERENCES users (id), 
	CONSTRAINT fk_campaigns_telephony_configuration_id FOREIGN KEY(telephony_configuration_id) REFERENCES telephony_configurations (id)
);


CREATE TABLE embed_tokens (
	id SERIAL NOT NULL, 
	token VARCHAR(255) NOT NULL, 
	workflow_id INTEGER NOT NULL, 
	organization_id INTEGER NOT NULL, 
	allowed_domains JSON, 
	settings JSON, 
	is_active BOOLEAN NOT NULL, 
	usage_limit INTEGER, 
	usage_count INTEGER NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE, 
	created_by INTEGER NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workflow_id) REFERENCES workflows (id) ON DELETE CASCADE, 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE
);


CREATE TABLE knowledge_base_chunks (
	id SERIAL NOT NULL, 
	document_id INTEGER NOT NULL, 
	organization_id INTEGER NOT NULL, 
	chunk_text TEXT NOT NULL, 
	contextualized_text TEXT, 
	chunk_index INTEGER NOT NULL, 
	chunk_metadata JSON NOT NULL, 
	embedding_model VARCHAR(200) NOT NULL, 
	embedding_dimension INTEGER NOT NULL, 
	embedding VECTOR(1536), 
	token_count INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES knowledge_base_documents (id) ON DELETE CASCADE, 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);


CREATE TABLE telephony_phone_numbers (
	id SERIAL NOT NULL, 
	organization_id INTEGER NOT NULL, 
	telephony_configuration_id INTEGER NOT NULL, 
	address VARCHAR(255) NOT NULL, 
	address_normalized VARCHAR(255) NOT NULL, 
	address_type VARCHAR(16) NOT NULL, 
	country_code VARCHAR(2), 
	label VARCHAR(64), 
	inbound_workflow_id INTEGER, 
	is_active BOOLEAN DEFAULT true NOT NULL, 
	is_default_caller_id BOOLEAN DEFAULT false NOT NULL, 
	extra_metadata JSON DEFAULT '{}'::json NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_phone_numbers_org_address UNIQUE (organization_id, address_normalized), 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(telephony_configuration_id) REFERENCES telephony_configurations (id) ON DELETE CASCADE, 
	FOREIGN KEY(inbound_workflow_id) REFERENCES workflows (id) ON DELETE SET NULL
);


CREATE TABLE workflow_definitions (
	id SERIAL NOT NULL, 
	workflow_hash VARCHAR, 
	workflow_json JSON NOT NULL, 
	workflow_id INTEGER, 
	is_current BOOLEAN DEFAULT false NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	status VARCHAR DEFAULT 'published' NOT NULL, 
	version_number INTEGER, 
	published_at TIMESTAMP WITH TIME ZONE, 
	workflow_configurations JSON DEFAULT '{}'::json NOT NULL, 
	template_context_variables JSON DEFAULT '{}'::json NOT NULL, 
	call_disposition_codes JSON DEFAULT '{}'::json NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workflow_id) REFERENCES workflows (id)
);

ALTER TABLE workflows ADD CONSTRAINT workflows_released_definition_id_fkey FOREIGN KEY(released_definition_id) REFERENCES workflow_definitions (id);


CREATE TABLE workflow_recordings (
	id SERIAL NOT NULL, 
	recording_id VARCHAR(64) NOT NULL, 
	workflow_id INTEGER, 
	organization_id INTEGER NOT NULL, 
	tts_provider VARCHAR, 
	tts_model VARCHAR, 
	tts_voice_id VARCHAR, 
	transcript TEXT NOT NULL, 
	storage_key VARCHAR NOT NULL, 
	storage_backend recording_storage_backend DEFAULT 's3'::recording_storage_backend NOT NULL, 
	recording_metadata JSON DEFAULT '{}'::json NOT NULL, 
	created_by INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_workflow_recordings_recording_id_org UNIQUE (recording_id, organization_id), 
	FOREIGN KEY(workflow_id) REFERENCES workflows (id) ON DELETE CASCADE, 
	FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
);


CREATE TABLE queued_runs (
	id SERIAL NOT NULL, 
	campaign_id INTEGER NOT NULL, 
	source_uuid VARCHAR NOT NULL, 
	context_variables JSON NOT NULL, 
	state queued_run_state NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	processed_at TIMESTAMP WITH TIME ZONE, 
	retry_count INTEGER DEFAULT 0 NOT NULL, 
	parent_queued_run_id INTEGER, 
	scheduled_for TIMESTAMP WITH TIME ZONE, 
	retry_reason VARCHAR, 
	PRIMARY KEY (id), 
	CONSTRAINT unique_campaign_source_retry UNIQUE (campaign_id, source_uuid, retry_count), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE, 
	FOREIGN KEY(parent_queued_run_id) REFERENCES queued_runs (id)
);


CREATE TABLE workflow_runs (
	id SERIAL NOT NULL, 
	name VARCHAR NOT NULL, 
	workflow_id INTEGER NOT NULL, 
	definition_id INTEGER, 
	mode VARCHAR(64) NOT NULL, 
	call_type workflow_call_type DEFAULT 'outbound'::workflow_call_type NOT NULL, 
	state workflow_run_state DEFAULT 'initialized'::workflow_run_state NOT NULL, 
	is_completed BOOLEAN, 
	recording_url VARCHAR, 
	transcript_url VARCHAR, 
	extra JSON DEFAULT '{}'::json NOT NULL, 
	storage_backend storage_backend DEFAULT 's3'::storage_backend NOT NULL, 
	usage_info JSON NOT NULL, 
	cost_info JSON NOT NULL, 
	initial_context JSON NOT NULL, 
	gathered_context JSON NOT NULL, 
	logs JSON DEFAULT '{}'::json NOT NULL, 
	annotations JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	campaign_id INTEGER, 
	queued_run_id INTEGER, 
	public_access_token VARCHAR(36), 
	PRIMARY KEY (id), 
	FOREIGN KEY(workflow_id) REFERENCES workflows (id), 
	FOREIGN KEY(definition_id) REFERENCES workflow_definitions (id), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id), 
	FOREIGN KEY(queued_run_id) REFERENCES queued_runs (id)
);


CREATE TABLE embed_sessions (
	id SERIAL NOT NULL, 
	session_token VARCHAR(255) NOT NULL, 
	embed_token_id INTEGER NOT NULL, 
	workflow_run_id INTEGER, 
	client_ip VARCHAR(45), 
	user_agent VARCHAR(500), 
	origin VARCHAR(255), 
	created_at TIMESTAMP WITH TIME ZONE, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(embed_token_id) REFERENCES embed_tokens (id) ON DELETE CASCADE, 
	FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs (id) ON DELETE CASCADE
);


CREATE TABLE workflow_run_text_sessions (
	workflow_run_id INTEGER NOT NULL, 
	revision INTEGER DEFAULT 0 NOT NULL, 
	session_data JSON DEFAULT '{}'::json NOT NULL, 
	checkpoint JSON DEFAULT '{}'::json NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (workflow_run_id), 
	FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs (id) ON DELETE CASCADE
);

CREATE INDEX idx_campaigns_active_status ON campaigns (state) WHERE state IN ('syncing', 'running', 'paused');
CREATE INDEX idx_queued_runs_campaign_state ON queued_runs (campaign_id, state);
CREATE INDEX idx_queued_runs_created ON queued_runs (created_at);
CREATE INDEX idx_queued_runs_scheduled ON queued_runs (scheduled_for);
CREATE INDEX idx_queued_runs_scheduled_optimized ON queued_runs (campaign_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX idx_queued_runs_source_uuid ON queued_runs (source_uuid);
CREATE INDEX idx_usage_cycles_org_period ON organization_usage_cycles (organization_id, period_end);
CREATE INDEX idx_workflow_runs_call_id ON workflow_runs ((gathered_context->>'call_id')) WHERE gathered_context->>'call_id' IS NOT NULL;
CREATE INDEX idx_workflow_runs_campaign_id ON workflow_runs (campaign_id);
CREATE UNIQUE INDEX idx_workflow_runs_public_access_token ON workflow_runs (public_access_token) WHERE public_access_token IS NOT NULL;
CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs (workflow_id);
CREATE INDEX ix_agent_triggers_state ON agent_triggers (state);
CREATE UNIQUE INDEX ix_agent_triggers_trigger_path ON agent_triggers (trigger_path);
CREATE INDEX ix_agent_triggers_workflow_id ON agent_triggers (workflow_id);
CREATE INDEX ix_api_keys_active ON api_keys (is_active);
CREATE UNIQUE INDEX ix_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX ix_api_keys_organization_id ON api_keys (organization_id);
CREATE INDEX ix_campaigns_name ON campaigns (name);
CREATE INDEX ix_campaigns_org_id ON campaigns (organization_id);
CREATE INDEX ix_campaigns_state ON campaigns (state);
CREATE INDEX ix_campaigns_telephony_config ON campaigns (telephony_configuration_id) WHERE telephony_configuration_id IS NOT NULL;
CREATE INDEX ix_campaigns_workflow_id ON campaigns (workflow_id);
CREATE INDEX ix_embed_sessions_expires_at ON embed_sessions (expires_at);
CREATE UNIQUE INDEX ix_embed_sessions_session_token ON embed_sessions (session_token);
CREATE INDEX ix_embed_tokens_is_active ON embed_tokens (is_active);
CREATE INDEX ix_embed_tokens_organization_id ON embed_tokens (organization_id);
CREATE UNIQUE INDEX ix_embed_tokens_token ON embed_tokens (token);
CREATE INDEX ix_embed_tokens_workflow_id ON embed_tokens (workflow_id);
CREATE UNIQUE INDEX ix_external_credentials_credential_uuid ON external_credentials (credential_uuid);
CREATE INDEX ix_folders_organization_id ON folders (organization_id);
CREATE INDEX ix_integrations_integration_id ON integrations (integration_id);
CREATE INDEX ix_kb_chunks_chunk_index ON knowledge_base_chunks (chunk_index);
CREATE INDEX ix_kb_chunks_document_id ON knowledge_base_chunks (document_id);
CREATE INDEX ix_kb_chunks_embedding_ivfflat ON knowledge_base_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ix_kb_chunks_embedding_model ON knowledge_base_chunks (embedding_model);
CREATE INDEX ix_kb_chunks_organization_id ON knowledge_base_chunks (organization_id);
CREATE INDEX ix_kb_documents_created_at ON knowledge_base_documents (created_at);
CREATE INDEX ix_kb_documents_organization_id ON knowledge_base_documents (organization_id);
CREATE INDEX ix_kb_documents_status ON knowledge_base_documents (processing_status);
CREATE INDEX ix_kb_documents_uuid ON knowledge_base_documents (document_uuid);
CREATE UNIQUE INDEX ix_knowledge_base_documents_document_uuid ON knowledge_base_documents (document_uuid);
CREATE INDEX ix_organization_configurations_id ON organization_configurations (id);
CREATE INDEX ix_organization_configurations_organization_id ON organization_configurations (organization_id);
CREATE INDEX ix_organization_usage_cycles_id ON organization_usage_cycles (id);
CREATE UNIQUE INDEX ix_organizations_provider_id ON organizations (provider_id);
CREATE INDEX ix_phone_numbers_config ON telephony_phone_numbers (telephony_configuration_id);
CREATE INDEX ix_phone_numbers_inbound_lookup ON telephony_phone_numbers (address_normalized, organization_id) WHERE is_active = true;
CREATE INDEX ix_phone_numbers_workflow ON telephony_phone_numbers (inbound_workflow_id) WHERE inbound_workflow_id IS NOT NULL;
CREATE INDEX ix_telephony_configurations_org ON telephony_configurations (organization_id);
CREATE INDEX ix_tools_category ON tools (category);
CREATE INDEX ix_tools_organization_id ON tools (organization_id);
CREATE INDEX ix_tools_status ON tools (status);
CREATE UNIQUE INDEX ix_tools_tool_uuid ON tools (tool_uuid);
CREATE INDEX ix_tools_uuid ON tools (tool_uuid);
CREATE UNIQUE INDEX ix_users_email_lower ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX ix_users_provider_id ON users (provider_id);
CREATE INDEX ix_webhook_credentials_organization_id ON external_credentials (organization_id);
CREATE INDEX ix_webhook_credentials_uuid ON external_credentials (credential_uuid);
CREATE INDEX ix_workflow_definitions_workflow_status ON workflow_definitions (workflow_id, status);
CREATE INDEX ix_workflow_recordings_org_id ON workflow_recordings (organization_id);
CREATE INDEX ix_workflow_recordings_recording_id ON workflow_recordings (recording_id);
CREATE INDEX ix_workflow_recordings_workflow_id ON workflow_recordings (workflow_id);
CREATE INDEX ix_workflow_run_text_sessions_updated_at ON workflow_run_text_sessions (updated_at);
CREATE INDEX ix_workflow_templates_template_description ON workflow_templates (template_description);
CREATE INDEX ix_workflow_templates_template_name ON workflow_templates (template_name);
CREATE INDEX ix_workflows_folder_id ON workflows (folder_id);
CREATE INDEX ix_workflows_name ON workflows (name);
CREATE UNIQUE INDEX ix_workflows_workflow_uuid ON workflows (workflow_uuid);
CREATE UNIQUE INDEX uq_phone_numbers_default_caller ON telephony_phone_numbers (telephony_configuration_id) WHERE is_default_caller_id = true;
CREATE UNIQUE INDEX uq_telephony_configurations_default ON telephony_configurations (organization_id) WHERE is_default_outbound = true;

CREATE TABLE IF NOT EXISTS alembic_version (
  version_num VARCHAR(32) NOT NULL PRIMARY KEY
);

INSERT INTO alembic_version (version_num) VALUES ('d4f5a6b7c8e9')
ON CONFLICT (version_num) DO NOTHING;

CREATE TABLE IF NOT EXISTS node_schema_migrations (
  id VARCHAR(128) NOT NULL PRIMARY KEY,
  alembic_revision VARCHAR(32) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO node_schema_migrations (id, alembic_revision)
VALUES ('0000_alembic_head_schema', 'd4f5a6b7c8e9')
ON CONFLICT (id) DO NOTHING;
