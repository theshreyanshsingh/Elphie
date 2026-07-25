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

# 0) Ensure pipecat sources are present (required for API Docker build bind-mount)
if [[ ! -f "$ROOT_DIR/pipecat/pyproject.toml" ]]; then
  echo -e "${BLUE}==> Initializing git submodules (pipecat)${NC}"
  git -C "$ROOT_DIR" submodule sync --recursive || true
  git -C "$ROOT_DIR" submodule update --init --recursive || true
fi
if [[ ! -f "$ROOT_DIR/pipecat/pyproject.toml" ]]; then
  PIPECAT_SHA="$(git -C "$ROOT_DIR" ls-tree HEAD pipecat | awk '{print $3}')"
  echo -e "${BLUE}==> Fallback: cloning dograh-hq/pipecat @ ${PIPECAT_SHA:-latest}${NC}"
  rm -rf "$ROOT_DIR/pipecat"
  git clone https://github.com/dograh-hq/pipecat.git "$ROOT_DIR/pipecat"
  if [[ -n "${PIPECAT_SHA:-}" ]]; then
    git -C "$ROOT_DIR/pipecat" fetch --depth 1 origin "$PIPECAT_SHA"
    git -C "$ROOT_DIR/pipecat" checkout --force "$PIPECAT_SHA"
  fi
fi
if [[ ! -f "$ROOT_DIR/pipecat/pyproject.toml" ]]; then
  echo -e "${RED}pipecat/pyproject.toml missing — cannot build API image${NC}"
  echo -e "${RED}Manual fix:${NC}"
  echo "  cd $ROOT_DIR && rm -rf pipecat && git clone https://github.com/dograh-hq/pipecat.git pipecat"
  exit 1
fi
echo -e "${GREEN}✓ pipecat ready ($(git -C "$ROOT_DIR/pipecat" rev-parse --short HEAD 2>/dev/null || echo ok))${NC}"

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

# 4) Swap if needed (helps small VMs during docker build)
if ! swapon --show 2>/dev/null | grep -q .; then
  echo -e "${BLUE}==> Adding 4G swap${NC}"
  if [[ ! -f /swapfile ]]; then
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile || true
fi

# 4b) Disk check + Docker prune (API image + BuildKit cache needs ~15–25GB free)
AVAIL_KB="$(df -Pk / | awk 'NR==2{print $4}')"
AVAIL_GB=$(( AVAIL_KB / 1024 / 1024 ))
echo -e "${BLUE}==> Free disk on /: ~${AVAIL_GB}G${NC}"
if (( AVAIL_GB < 12 )); then
  echo -e "${BLUE}==> Low disk — pruning Docker build cache / unused images${NC}"
  docker builder prune -af || true
  docker system prune -af || true
  AVAIL_KB="$(df -Pk / | awk 'NR==2{print $4}')"
  AVAIL_GB=$(( AVAIL_KB / 1024 / 1024 ))
  echo -e "${BLUE}==> Free disk after prune: ~${AVAIL_GB}G${NC}"
fi
if (( AVAIL_GB < 8 )); then
  echo -e "${RED}Not enough disk (~${AVAIL_GB}G free). Need ~12G+ to build elphie-api.${NC}"
  echo -e "${RED}Resize the Azure disk, or free space, then re-run.${NC}"
  df -h /
  docker system df || true
  exit 1
fi

# 5) Build one service at a time (more reliable on small instances)
echo -e "${BLUE}==> Building API image (this can take a while)${NC}"
docker compose --profile remote build api

# Drop intermediate BuildKit layers before UI build (keeps disk pressure down)
docker builder prune -af || true

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
