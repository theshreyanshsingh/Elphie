import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/errors/httpError.js";
import {
  normalizeToolDefinition,
  validateToolStatusFilter
} from "../src/routes/tools.js";

test("tool status filter accepts comma-separated Python-compatible values", () => {
  assert.doesNotThrow(() => validateToolStatusFilter("active,archived,draft"));
  assert.throws(
    () => validateToolStatusFilter("active,deleted"),
    (err) => err instanceof HttpError && err.status === 400
  );
});

test("HTTP API tool definitions normalize method casing", () => {
  const definition = normalizeToolDefinition(
    {
      type: "http_api",
      schema_version: 1,
      config: {
        method: "post",
        url: "https://example.com"
      }
    },
    "http_api"
  );

  assert.equal((definition.config as Record<string, unknown>).method, "POST");
});

test("tool category must match definition type", () => {
  assert.throws(
    () =>
      normalizeToolDefinition(
        {
          type: "calculator",
          schema_version: 1
        },
        "http_api"
      ),
    (err) => err instanceof HttpError && err.status === 400
  );
});

test("MCP tool definitions require HTTP URLs and get default cache fields", () => {
  const definition = normalizeToolDefinition(
    {
      type: "mcp",
      schema_version: 1,
      config: {
        url: "https://mcp.example.com"
      }
    },
    "mcp"
  );
  const config = definition.config as Record<string, unknown>;
  assert.equal(config.transport, "streamable_http");
  assert.deepEqual(config.discovered_tools, []);

  assert.throws(
    () =>
      normalizeToolDefinition(
        {
          type: "mcp",
          schema_version: 1,
          config: {
            url: "ftp://example.com"
          }
        },
        "mcp"
      ),
    (err) => err instanceof HttpError && err.status === 422
  );
});
