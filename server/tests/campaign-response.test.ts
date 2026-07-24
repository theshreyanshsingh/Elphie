import assert from "node:assert/strict";
import test from "node:test";
import { buildCampaignResponse } from "../src/routes/campaign.js";

test("campaign response maps orchestrator metadata like the Python route", () => {
  const response = buildCampaignResponse(
    {
      id: 7,
      name: "June Leads",
      workflow_id: 3,
      organization_id: 2,
      created_by: 1,
      telephony_configuration_id: 9,
      source_type: "csv",
      source_id: "campaigns/2/leads.csv",
      state: "running",
      total_rows: 20,
      processed_rows: 5,
      failed_rows: 1,
      rate_limit_per_second: 1,
      max_retries: 0,
      source_sync_status: "completed",
      source_last_synced_at: null,
      source_sync_error: null,
      retry_config: { enabled: true, max_retries: 1 },
      last_batch_scheduled_at: null,
      last_activity_at: null,
      orchestrator_metadata: {
        max_concurrency: 4,
        parent_campaign_id: 1,
        redialed_campaign_id: 8,
        circuit_breaker: { enabled: true, failure_threshold: 0.25 }
      },
      logs: [{ ts: "now", level: "info", event: "start", message: "Started" }],
      created_at: "2026-01-01T00:00:00Z",
      started_at: "2026-01-01T00:01:00Z",
      completed_at: null,
      updated_at: "2026-01-01T00:01:00Z"
    } as any,
    "Sales Agent",
    { executed: 5, total: 20 },
    "Twilio Main"
  );

  assert.equal(response.workflow_name, "Sales Agent");
  assert.equal(response.max_concurrency, 4);
  assert.equal(response.parent_campaign_id, 1);
  assert.equal(response.redialed_campaign_id, 8);
  assert.equal(response.executed_count, 5);
  assert.equal(response.total_queued_count, 20);
  assert.equal(response.telephony_configuration_name, "Twilio Main");
  assert.equal(response.circuit_breaker.enabled, true);
  assert.equal(response.retry_config.max_retries, 1);
  assert.equal(response.logs.length, 1);
});
