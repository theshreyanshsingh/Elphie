#!/usr/bin/env bash
# One-shot Elphie remote install (build-from-source, no GHCR login required).
# Usage (from repo root on the server):
#   SERVER_IP=13.234.195.233 bash scripts/install_elphie_remote.sh
# Or:
#   bash scripts/install_elphie_remote.sh 13.234.195.233

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

SERVER_IP="${SERVER_IP:-${1:-}}"
if [[ -z "$SERVER_IP" ]]; then
  echo -e "${RED}Usage: SERVER_IP=x.x.x.x bash scripts/install_elphie_remote.sh${NC}"
  echo -e "${RED}   or: bash scripts/install_elphie_remote.sh x.x.x.x${NC}"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}Docker is not installed. Install Docker + Compose first.${NC}"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo -e "${RED}Docker Compose plugin missing. Install docker compose.${NC}"
  exit 1
fi

echo -e "${BLUE}==> Installing Elphie on ${SERVER_IP}${NC}"

# 1) .env
if [[ ! -f .env ]]; then
  echo -e "${BLUE}==> Creating .env${NC}"
  cat > .env <<EOF
ENVIRONMENT=production
SERVER_IP=${SERVER_IP}
PUBLIC_HOST=${SERVER_IP}
PUBLIC_BASE_URL=https://${SERVER_IP}
BACKEND_API_ENDPOINT=https://${SERVER_IP}
MINIO_PUBLIC_ENDPOINT=https://${SERVER_IP}
TURN_HOST=${SERVER_IP}
TURN_SECRET=$(openssl rand -hex 32)
FORCE_TURN_RELAY=false
OSS_JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
MINIO_ROOT_USER=elphie$(openssl rand -hex 6)
MINIO_ROOT_PASSWORD=$(openssl rand -hex 32)
FASTAPI_WORKERS=4
EOF
else
  echo -e "${GREEN}✓ .env already exists (keeping it)${NC}"
fi

# 2) TLS certs
echo -e "${BLUE}==> Ensuring TLS certs${NC}"
mkdir -p certs
if [[ ! -f certs/local.crt || ! -f certs/local.key ]]; then
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout certs/local.key \
    -out certs/local.crt \
    -days 365 \
    -subj "/CN=${SERVER_IP}"
fi

# 3) Build-from-source override (avoids private GHCR pull)
echo -e "${BLUE}==> Writing docker-compose.override.yaml (local build)${NC}"
cat > docker-compose.override.yaml <<'EOF'
services:
  api:
    build:
      context: .
      dockerfile: api/Dockerfile
    image: elphie-local/elphie-api:local
    pull_policy: never

  ui:
    build:
      context: .
      dockerfile: ui/Dockerfile
    image: elphie-local/elphie-ui:local
    pull_policy: never
EOF

# 4) Swap if needed (helps small EC2s during docker build)
if ! swapon --show 2>/dev/null | grep -q .; then
  echo -e "${BLUE}==> Adding 4G swap${NC}"
  if [[ ! -f /swapfile ]]; then
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile || true
fi

# 5) Build one service at a time (more reliable on small instances)
echo -e "${BLUE}==> Building API image (this can take a while)${NC}"
docker compose --profile remote build api

echo -e "${BLUE}==> Building UI image (this can take a while)${NC}"
docker compose --profile remote build ui

# 6) Start stack
echo -e "${BLUE}==> Starting stack${NC}"
if [[ -x ./remote_up.sh ]]; then
  ./remote_up.sh || docker compose --profile remote up -d
else
  docker compose --profile remote up -d
fi

echo -e "${BLUE}==> Waiting for health${NC}"
for i in $(seq 1 40); do
  if curl -kf "https://${SERVER_IP}/api/v1/health" >/dev/null 2>&1 \
    || curl -sf "http://127.0.0.1:8000/api/v1/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Elphie is up${NC}"
    echo -e "${GREEN}Open: https://${SERVER_IP}${NC}"
    docker compose --profile remote ps
    exit 0
  fi
  sleep 5
done

echo -e "${RED}Stack started but health check did not pass yet.${NC}"
echo "Check: docker compose --profile remote ps"
echo "Logs:  docker compose --profile remote logs -f api"
exit 1
