# Elphie

Self-hostable voice AI agent platform — build production voice agents with a drag-and-drop workflow builder.

This repository is a fork of the open-source Dograh project (BSD 2-Clause). See [LICENSE](LICENSE) for copyright and terms. Product branding and deployment defaults in this fork are customized for **Elphie**. Modifications © 2026 Vasudev.

## Deploy (EC2 / remote Docker)

On a server with Docker Compose installed (recommended: 4 vCPU / 8 GB RAM):

```bash
# After cloning this repo (or copying docker-compose.yaml + helpers)
docker compose --profile remote pull
docker compose --profile remote up -d
```

Prebuilt images (this fork):

- `ghcr.io/theshreyanshsingh/elphie-api:latest`
- `ghcr.io/theshreyanshsingh/elphie-ui:latest`

Open ports: TCP `80`, `443`, `3478`, `5349` and UDP `3478`, `5349`, `49152-49200`.

## Local development

See upstream contribution docs, or run infra via `docker-compose-local.yaml` and start API/UI on the host.

## License

BSD 2-Clause — retain the copyright notice in [LICENSE](LICENSE).
