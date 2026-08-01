/**
 * Elphie SDK — typed builder for voice-AI workflows.
 *
 * Runtime SDK: fetches the spec catalog from the Elphie backend at session
 * start and validates every `Workflow.add()` call against it. Don't import
 * per-node-type classes — the `type` argument is a string keyed against the
 * fetched spec catalog.
 *
 * @example
 * ```ts
 * import { ElphieClient, Workflow } from "@elphie/sdk";
 *
 * const client = new ElphieClient({ baseUrl: "http://localhost:8000", apiKey: "..." });
 * const wf = new Workflow({ client, name: "loan_qualification" });
 *
 * const start = await wf.add({
 *   type: "startCall",
 *   name: "greeting",
 *   prompt: "You are Sarah from Acme Loans...",
 * });
 * const done = await wf.add({ type: "endCall", name: "done", prompt: "Thank them." });
 * wf.edge(start, done, { label: "done", condition: "Conversation wrapped." });
 *
 * await client.saveWorkflow(123, wf);
 * ```
 */

export { ElphieClient } from "./client.js";
export type {
    ElphieClientOptions,
    ElphieFetch,
    ElphieFetchInit,
    ElphieFetchResponse,
} from "./client.js";
export {
    ApiError,
    ElphieSdkError,
    SpecMismatchError,
    ValidationError,
} from "./errors.js";
export type {
    AddNodeOptions,
    EdgeOptions,
    SpecProvider,
    WorkflowOptions,
} from "./workflow.js";
export { Workflow } from "./workflow.js";
export type {
    DisplayOptions,
    NodeCategory,
    NodeRef,
    NodeSpec,
    PropertyOption,
    PropertySpec,
    PropertyType,
    WireEdge,
    WireNode,
    WireWorkflow,
} from "./types.js";

// Typed SDK — generated per-node interfaces + factories. Importable as
// `import { startCall, type StartCall } from "@elphie/sdk/typed"` for
// tree-shaking, or via the `TypedNode` union here.
export type { TypedNode } from "./typed/index.js";
