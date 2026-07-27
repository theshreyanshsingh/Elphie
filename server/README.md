# Elphie Express Backend Migration

This folder is the TypeScript/Express migration target for the existing
FastAPI backend in `api/`.

The Python backend remains untouched. The Node app is structured to mirror the
existing backend domains:

- `src/routes`
- `src/services`
- `src/db`
- `src/schemas`
- `src/tasks`
- `src/mcpServer`
- `src/utils`
- `src/migrations`
- `tests`

Current state:

- Express boots on port `8000` by default.
- `/api/v1/health` is implemented.
- `/api/v1/openapi.json` serves the checked-in FastAPI OpenAPI snapshot.
- Every REST operation in `docs/api-reference/openapi.json` is registered.
- Unported behavior returns `501` with a migration marker instead of silently
  pretending parity is complete.

Run:

```bash
npm install
npm run dev
npm test
```

The remaining migration work is tracked by the explicit `501` route markers,
the migration manifest, and the contract tests in `tests/`.
