# Elphie

Self-hostable voice AI agent platform — build production voice agents with a drag-and-drop workflow builder.

See [LICENSE](LICENSE) for copyright and terms.

## Deploy (EC2 / remote Docker)

On a server with Docker Compose installed (recommended: 4 vCPU / 8 GB RAM):

```bash
# After cloning this repo (or copying docker-compose.yaml + helpers)
REGISTRY=ghcr.io/your-organization docker compose --profile remote pull
REGISTRY=ghcr.io/your-organization docker compose --profile remote up -d
```

Set `REGISTRY` to the container registry namespace that hosts the Elphie images.
For example, `REGISTRY=ghcr.io/your-organization` resolves the API and UI images
as `${REGISTRY}/elphie-api:latest` and `${REGISTRY}/elphie-ui:latest`.

Open ports: TCP `80`, `443`, `3478`, `5349` and UDP `3478`, `5349`, `49152-49200`.

## Local development

See upstream contribution docs, or run infra via `docker-compose-local.yaml` and start API/UI on the host.

## License

BSD 2-Clause — retain the copyright notice in [LICENSE](LICENSE).
