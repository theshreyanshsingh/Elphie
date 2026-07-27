#!/usr/bin/env bash
set -e

###############################################################################
### Call-engine microservice
###
### The Express server (server/) does NOT run the WebRTC voice pipeline.
### That pipeline (pipecat + aiortc, STT/LLM/TTS) lives in the Python app.
### This launcher runs the existing Python app UNCHANGED on a dedicated port
### purely as the call engine. Express reverse-proxies signaling WebSockets here
### (see CALL_SERVICE_URL in server/src/config/env.ts).
###
### Its FastAPI lifespan only warms the arq pool + a Redis pub/sub subscriber;
### it does NOT start the arq worker or campaign orchestrator, so running this
### alongside the main stack will not double-dial campaigns.
###############################################################################

BASE_DIR="$(cd "$(dirname "$(dirname "${BASH_SOURCE[0]}")")" && pwd)"
cd "$BASE_DIR"

ENV_FILE="${ELPHIE_ENV_FILE:-$BASE_DIR/api/.env}"
VENV_PATH="$BASE_DIR/venv"
PORT="${CALL_SERVICE_PORT:-8001}"

if [[ -f "$ENV_FILE" ]]; then
  set -a && . "$ENV_FILE" && set +a
fi

# The Express server signs auth tokens with the OSS_JWT_SECRET from the repo-root
# .env (its dotenv loads .env before api/.env, and "first wins"). This call engine
# must validate proxied WebSocket tokens with the SAME secret, otherwise FastAPI
# rejects them with 401/403 (InvalidSignatureError). Override ONLY this one var
# from the root .env so the rest of the pipeline config from api/.env is untouched.
ROOT_ENV="$BASE_DIR/.env"
if [[ -f "$ROOT_ENV" ]]; then
  EXPRESS_JWT_SECRET="$(grep -E '^OSS_JWT_SECRET=' "$ROOT_ENV" | tail -n1 | cut -d= -f2-)"
  # Strip optional surrounding single or double quotes.
  EXPRESS_JWT_SECRET="${EXPRESS_JWT_SECRET%\"}"; EXPRESS_JWT_SECRET="${EXPRESS_JWT_SECRET#\"}"
  EXPRESS_JWT_SECRET="${EXPRESS_JWT_SECRET%\'}"; EXPRESS_JWT_SECRET="${EXPRESS_JWT_SECRET#\'}"
  if [[ -n "$EXPRESS_JWT_SECRET" ]]; then
    export OSS_JWT_SECRET="$EXPRESS_JWT_SECRET"
    echo "Aligned OSS_JWT_SECRET with Express (repo-root .env) for token validation."
  fi
fi

if [[ -d "$VENV_PATH" && -f "$VENV_PATH/bin/activate" ]]; then
  source "$VENV_PATH/bin/activate"
  echo "Virtual environment activated: $VENV_PATH"
else
  echo "Warning: Virtual environment not found at $VENV_PATH"
fi

echo "Starting call-engine microservice on port $PORT (Python pipecat pipeline)..."
exec uvicorn api.app:app --host 0.0.0.0 --port "$PORT" --reload --reload-dir api
