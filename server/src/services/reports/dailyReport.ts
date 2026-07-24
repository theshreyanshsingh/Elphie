import { sql } from "kysely";
import { db } from "../../db/database.js";

type JsonRecord = Record<string, unknown>;

export type DailyReportRun = {
  id: number;
  workflow_id: number;
  workflow_name: string;
  created_at: Date;
  gathered_context: JsonRecord;
  usage_info: JsonRecord;
  initial_context: JsonRecord;
};

const jsonField = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const durationBuckets = {
  "0-10": { range_start: 0, range_end: 10, count: 0 },
  "10-30": { range_start: 10, range_end: 30, count: 0 },
  "30-60": { range_start: 30, range_end: 60, count: 0 },
  "60-120": { range_start: 60, range_end: 120, count: 0 },
  "120-180": { range_start: 120, range_end: 180, count: 0 },
  ">180": { range_start: 180, range_end: null as number | null, count: 0 }
};

const bucketForDuration = (duration: number): keyof typeof durationBuckets => {
  if (duration < 10) return "0-10";
  if (duration < 30) return "10-30";
  if (duration < 60) return "30-60";
  if (duration < 120) return "60-120";
  if (duration < 180) return "120-180";
  return ">180";
};

export const fetchWorkflowRunsForDailyReport = async (input: {
  organizationId: number;
  date: string;
  timezone: string;
  workflowId?: number;
}): Promise<DailyReportRun[]> => {
  let query = db
    .selectFrom("workflow_runs as wr")
    .innerJoin("workflows as w", "wr.workflow_id", "w.id")
    .select([
      "wr.id as id",
      "wr.workflow_id as workflow_id",
      "w.name as workflow_name",
      "wr.created_at as created_at",
      "wr.usage_info as usage_info",
      "wr.initial_context as initial_context",
      "wr.gathered_context as gathered_context"
    ])
    .where("w.organization_id", "=", input.organizationId)
    .where(
      sql<boolean>`wr.created_at >= (${input.date}::timestamp AT TIME ZONE ${input.timezone})`
    )
    .where(
      sql<boolean>`wr.created_at < ((${input.date}::date + interval '1 day')::timestamp AT TIME ZONE ${input.timezone})`
    );

  if (input.workflowId != null) {
    query = query.where("wr.workflow_id", "=", input.workflowId);
  }

  const rows = await query.orderBy("wr.created_at", "desc").execute();

  return rows.map((row) => ({
    id: row.id,
    workflow_id: row.workflow_id,
    workflow_name: row.workflow_name,
    created_at: row.created_at,
    usage_info: jsonField(row.usage_info),
    initial_context: jsonField(row.initial_context),
    gathered_context: jsonField(row.gathered_context)
  }));
};

export const buildDailyReport = (input: {
  date: string;
  timezone: string;
  workflowId?: number | null;
  runs: DailyReportRun[];
}) => {
  const { date, timezone, workflowId, runs } = input;
  const totalRuns = runs.length;
  const xferCount = runs.filter(
    (run) => run.gathered_context.mapped_call_disposition === "XFER"
  ).length;

  const dispositionCounts = new Map<string, number>();
  for (const run of runs) {
    const disposition = String(
      run.gathered_context.mapped_call_disposition ?? "UNKNOWN"
    );
    dispositionCounts.set(disposition, (dispositionCounts.get(disposition) ?? 0) + 1);
  }

  const sortedDispositions = [...dispositionCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  );

  const dispositionDistribution: Array<{
    disposition: string;
    count: number;
    percentage: number;
  }> = [];
  let otherCount = 0;

  sortedDispositions.forEach(([disposition, count], index) => {
    if (index < 5) {
      dispositionDistribution.push({
        disposition,
        count,
        percentage: totalRuns > 0 ? Math.round((count / totalRuns) * 10000) / 100 : 0
      });
    } else {
      otherCount += count;
    }
  });

  if (otherCount > 0) {
    dispositionDistribution.push({
      disposition: "Other",
      count: otherCount,
      percentage:
        totalRuns > 0 ? Math.round((otherCount / totalRuns) * 10000) / 100 : 0
    });
  }

  const buckets = structuredClone(durationBuckets);
  for (const run of runs) {
    const raw = run.usage_info.call_duration_seconds;
    const duration =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number.parseFloat(raw)
          : Number.NaN;
    if (Number.isFinite(duration)) {
      buckets[bucketForDuration(duration)].count += 1;
    }
  }

  const totalCallsWithDuration = Object.values(buckets).reduce(
    (sum, bucket) => sum + bucket.count,
    0
  );

  const callDurationDistribution = Object.entries(buckets).map(
    ([bucket, bucketData]) => ({
      bucket,
      range_start: bucketData.range_start,
      range_end: bucketData.range_end,
      count: bucketData.count,
      percentage:
        totalCallsWithDuration > 0
          ? Math.round((bucketData.count / totalCallsWithDuration) * 10000) / 100
          : 0
    })
  );

  return {
    date,
    timezone,
    workflow_id: workflowId ?? null,
    metrics: { total_runs: totalRuns, xfer_count: xferCount },
    disposition_distribution: dispositionDistribution,
    call_duration_distribution: callDurationDistribution
  };
};

export const formatDailyRunsDetail = (runs: DailyReportRun[]) =>
  runs.map((run) => {
    const phoneNumber = String(
      run.gathered_context.customer_phone_number ??
        run.initial_context.phone_number ??
        ""
    );
    const disposition = String(run.gathered_context.mapped_call_disposition ?? "");
    const rawDuration = run.usage_info.call_duration_seconds;
    const durationSeconds =
      typeof rawDuration === "number"
        ? rawDuration
        : typeof rawDuration === "string"
          ? Number.parseFloat(rawDuration) || 0
          : 0;

    return {
      phone_number: phoneNumber,
      disposition,
      duration_seconds: durationSeconds,
      workflow_id: run.workflow_id,
      run_id: run.id,
      workflow_name: run.workflow_name,
      created_at: run.created_at.toISOString()
    };
  });
