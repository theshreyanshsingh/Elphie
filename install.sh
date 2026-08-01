#!/usr/bin/env bash
# Elphie one-command remote install.
#
#   ELPHIE_REPO_URL=https://github.com/your-organization/elphie.git \
#     bash install.sh YOUR.PUBLIC.IP
#
# Or:
#   ELPHIE_REPO_URL=https://github.com/your-organization/elphie.git \
#     SERVER_IP=YOUR.PUBLIC.IP bash install.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_URL="${ELPHIE_REPO_URL:-}"
INSTALL_DIR="${ELPHIE_INSTALL_DIR:-$HOME/elphie}"
SERVER_IP="${SERVER_IP:-${1:-}}"

if [[ -z "$SERVER_IP" ]]; then
  echo -e "${RED}Usage:${NC}"
  echo "  ELPHIE_REPO_URL=https://github.com/your-organization/elphie.git bash install.sh YOUR.PUBLIC.IP"
  exit 1
fi

if [[ -z "$REPO_URL" && ! -d "$INSTALL_DIR/.git" ]]; then
  echo -e "${RED}ELPHIE_REPO_URL is required for a new installation.${NC}"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}Docker is required. Install Docker first, then re-run.${NC}"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo -e "${RED}Docker Compose plugin is required.${NC}"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo -e "${RED}git is required.${NC}"
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo -e "${RED}openssl is required.${NC}"
  exit 1
fi

echo -e "${BLUE}==> Elphie install → ${INSTALL_DIR} (SERVER_IP=${SERVER_IP})${NC}"

mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo -e "${BLUE}==> Updating existing clone${NC}"
  git -C "$INSTALL_DIR" fetch --depth 1 origin main
  git -C "$INSTALL_DIR" reset --hard origin/main
else
  echo -e "${BLUE}==> Cloning ${REPO_URL}${NC}"
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch main "$REPO_URL" "$INSTALL_DIR"
fi

# pipecat is a git submodule; Docker build bind-mounts it. Ensure sources exist.
ensure_pipecat() {
  local root="$1"
  if [[ -f "$root/pipecat/pyproject.toml" ]]; then
    echo -e "${GREEN}✓ pipecat sources present${NC}"
    return 0
  fi

  echo -e "${BLUE}==> Initializing git submodules (pipecat)${NC}"
  git -C "$root" submodule sync --recursive || true
  git -C "$root" submodule update --init --recursive || true

  if [[ -f "$root/pipecat/pyproject.toml" ]]; then
    echo -e "${GREEN}✓ pipecat submodule checked out${NC}"
    return 0
  fi

  # Fallback: some hosts fail shallow/submodule fetch. Clone pinned SHA directly.
  local sha
  sha="$(git -C "$root" ls-tree HEAD pipecat | awk '{print $3}')"
  if [[ -z "$sha" ]]; then
    echo -e "${RED}Could not resolve pipecat submodule SHA from git tree${NC}"
    return 1
  fi

  local pipecat_url
  pipecat_url="${ELPHIE_PIPECAT_REPO_URL:-$(git -C "$root" config -f .gitmodules --get submodule.pipecat.url || true)}"
  if [[ -z "$pipecat_url" ]]; then
    echo -e "${RED}Could not resolve the pipecat repository URL${NC}"
    return 1
  fi

  echo -e "${BLUE}==> Fallback: cloning pipecat @ ${sha}${NC}"
  rm -rf "$root/pipecat"
  git clone "$pipecat_url" "$root/pipecat"
  git -C "$root/pipecat" fetch --depth 1 origin "$sha"
  git -C "$root/pipecat" checkout --force "$sha"

  if [[ ! -f "$root/pipecat/pyproject.toml" ]]; then
    echo -e "${RED}pipecat/pyproject.toml still missing after fallback clone${NC}"
    return 1
  fi
  echo -e "${GREEN}✓ pipecat cloned via fallback${NC}"
}

ensure_pipecat "$INSTALL_DIR"

chmod +x "$INSTALL_DIR/scripts/install_elphie_remote.sh"
SERVER_IP="$SERVER_IP" bash "$INSTALL_DIR/scripts/install_elphie_remote.sh"

echo -e "${GREEN}Done. App: https://${SERVER_IP}${NC}"
