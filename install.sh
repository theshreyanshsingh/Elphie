#!/usr/bin/env bash
# Elphie one-command remote install.
#
#   curl -fsSL https://raw.githubusercontent.com/theshreyanshsingh/Elphie/main/install.sh | bash -s -- YOUR.PUBLIC.IP
#
# Or:
#   SERVER_IP=YOUR.PUBLIC.IP bash <(curl -fsSL https://raw.githubusercontent.com/theshreyanshsingh/Elphie/main/install.sh)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_URL="${ELPHIE_REPO_URL:-https://github.com/theshreyanshsingh/Elphie.git}"
INSTALL_DIR="${ELPHIE_INSTALL_DIR:-$HOME/elphie}"
SERVER_IP="${SERVER_IP:-${1:-}}"

if [[ -z "$SERVER_IP" ]]; then
  echo -e "${RED}Usage:${NC}"
  echo "  curl -fsSL https://raw.githubusercontent.com/theshreyanshsingh/Elphie/main/install.sh | bash -s -- YOUR.PUBLIC.IP"
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

echo -e "${BLUE}==> Initializing git submodules (pipecat)${NC}"
git -C "$INSTALL_DIR" submodule sync --recursive
git -C "$INSTALL_DIR" submodule update --init --recursive --depth 1

if [[ ! -f "$INSTALL_DIR/pipecat/pyproject.toml" ]]; then
  echo -e "${RED}pipecat submodule missing pyproject.toml — clone failed${NC}"
  exit 1
fi

chmod +x "$INSTALL_DIR/scripts/install_elphie_remote.sh"
SERVER_IP="$SERVER_IP" bash "$INSTALL_DIR/scripts/install_elphie_remote.sh"

echo -e "${GREEN}Done. App: https://${SERVER_IP}${NC}"
