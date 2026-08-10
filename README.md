# Elphie AI

**The self-hostable alternative to Vapi & Retell** — build production voice agents with a visual workflow builder, test them in minutes, and let AI coding assistants help design and edit them through MCP.

<p align="center">
  <a href="https://elphie.willowave.in">
    <img src="https://img.shields.io/badge/▶_Try_the_Cloud-elphie.willowave.in-2563eb?style=for-the-badge" alt="Try the Cloud">
  </a>
  &nbsp;
  <a href="#-get-started">
    <img src="https://img.shields.io/badge/⚡_Self--host_in_60s-One_command-111827?style=for-the-badge" alt="Self-host in 60s">
  </a>
  &nbsp;
  <a href="https://join.slack.com/t/elphie-community/shared_invite/zt-3zjb5vwvl-j7hRz3_F1SOn5cH~jm5f5g">
    <img src="https://img.shields.io/badge/💬_Join_Slack-Community-4A154B?style=for-the-badge&logo=slack" alt="Join Slack">
  </a>
</p>

<p align="center">
  <a href="https://elphie.willowave.in">📖 Docs</a> &nbsp;·&nbsp;
  <a href="LICENSE">📜 BSD 2-Clause</a> &nbsp;·&nbsp;
  <a href="README.zh-CN.md">🌐 中文</a> &nbsp;·&nbsp;
  <a href="README.ja-JP.md">🌐 日本語</a>
</p>

<p align="center">
  <img src="docs/images/hero.gif" alt="Elphie in action — build a workflow, launch a voice agent, talk to it" width="80%">
</p>

- **Self-hostable** — no vendor lock-in, unlike Vapi or Retell
- **Full control & transparency** — flexible LLM / TTS / STT integration you can customize
- **Maintained by YC alumni and exit founders**, committed to keeping voice AI accessible

## 🎥 Featured

<div align="center">
  <a href="https://www.youtube.com/watch?v=xD9JEvfCH9k">
    <img src="https://img.youtube.com/vi/xD9JEvfCH9k/maxresdefault.jpg" alt="Elphie featured by Better Stack" width="80%" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
  </a>
  <br>
  <em>Featured by <strong>Better Stack</strong> — a hands-on look at Elphie</em>
</div>

<details>
<summary>📺 Prefer a 2-minute product walkthrough? Click here.</summary>

<div align="center">
  <a href="https://youtu.be/9gPneyf9M9w">
    <img src="docs/images/video_thumbnail_1.png" alt="Watch Elphie AI Demo Video" width="70%" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
  </a>
</div>

</details>

## ⚖️ Elphie vs Vapi vs Retell

An honest comparison on the axes that matter most to teams evaluating voice AI platforms.

|  | **Elphie** | **Vapi** | **Retell** |
|---|---|---|---|
| **License** | BSD 2-Clause | Proprietary | Proprietary |
| **Self-hostable** | ✅ Yes — one Docker command | ❌ SaaS only | ❌ SaaS only |
| **Pricing** | Free (self-host) · usage-based (cloud) | Per-minute SaaS | Per-minute SaaS |
| **Bring your own LLM / STT / TTS** | ✅ Any provider, or use Elphie's stack | Configurable within their integrations | Configurable within their integrations |
| **Source-level customization** | ✅ Customize the platform to your needs | ❌ Closed source | ❌ Closed source |
| **Data residency** | Your infra, your rules | Their cloud | Their cloud |
| **Vendor lock-in** | None | Full | Full |


## 🚀 Get Started

##### Download and setup Elphie on your Local Machine

> **Note**
> We collect anonymous usage data to improve the product. You can opt out by setting `ENABLE_TELEMETRY=false` before running the startup script.

> **Note**
> If you wish to run the platform on a remote server instead, checkout our [Documentation](https://elphie.willowave.in/deployment/docker#option-2:-remote-server-deployment)

From a local checkout or distribution of Elphie (with `docker-compose.yaml` at the repo root):

```bash
# macOS / Linux
./scripts/start_docker.sh
```

```powershell
# Windows
.\scripts\start_docker.ps1
```

For more options, see the [Docker Deployment Guide](https://elphie.willowave.in/deployment/docker).

> **Note**
> First startup may take 2-3 minutes to download all images. Once running, open http://localhost:3010 to create your first AI voice assistant!
> For common issues and solutions, see 🔧 **[Troubleshooting](docs/getting-started/troubleshooting.mdx)**.

### 🎙️ Your First Voice Bot

1. Open [http://localhost:3010](http://localhost:3010) in your browser.
2. Pick **Inbound** or **Outbound**, name your bot (e.g. _Lead Qualification_), and describe the use case in 5–10 words (e.g. _Screen insurance form submissions for purchase intent_).
3. Click **Test Agent**.
4. Use **Test Audio** to talk to your agent in the browser, or **Test Chat** to iterate faster in text. In Test Chat, you can edit or replay user turns and Elphie will regenerate the agent's replies and node transitions from that point.

> 🔑 **No API keys needed.** Elphie ships with auto-generated keys and its own LLM / TTS / STT stack. Connect your own keys for LLM, TTS, STT, or Telephony (e.g. Twilio, Vonage, Telnyx) anytime.

## Build Agents with MCP

Elphie ships with an MCP server, so coding agents can work directly inside your Elphie workspace.

Connect Codex, Claude Code, Cursor, or any MCP client to inspect existing agents, search Elphie docs, fetch node schemas, create new workflows, and save draft edits from natural language.

When asking your coding agent to build a voice agent, share a short script for
the use case instead of only a one-line prompt. Include the agent persona, call
flow, rules, objection handling, success criteria, and a sample conversation if
you have one.

See the [MCP guide](https://elphie.willowave.in/integrations/mcp) to connect your assistant.

## Features

### Voice Agent Builder

- Visual workflow builder with start nodes, agent nodes, global instructions, tools, transitions, and end-call outcomes
- Test Agent panel with **Test Audio** for browser voice testing and **Test Chat** for fast prompt iteration
- QA node, knowledge bases, webhooks, embeds, and tool calling for production workflows

### Voice & Telephony

- Built-in telephony integrations including Twilio, Vonage, Telnyx, Plivo, Vobiz, Cloudonix, and Asterisk ARI
- Human handoff with call transfer on supported telephony providers
- Bring your own LLM, TTS, STT, and telephony providers; store artifacts in bundled MinIO or AWS/S3-compatible storage

### Developer Experience

- One-command Docker setup for self-hosting
- Python backend and modular provider architecture for customization
- Python and Node SDKs for programmatic agent creation and outbound calls

## Deployment Options

### Local Development

Refer [Local Setup](https://elphie.willowave.in/contribution/setup)

### Self-Hosted Deployment

For detailed deployment instructions including remote server setup with HTTPS, see our [Docker Deployment Guide](https://elphie.willowave.in/deployment/docker#option-2-remote-server-deployment).

### Cloud Version

Visit [https://www.elphie.com](https://www.elphie.com/) for our managed cloud offering.

## 📚Documentation

You can go to [https://elphie.willowave.in](https://elphie.willowave.in/) for our documentation.

## 📦 SDKs

- **Python SDK** — [pypi.org/project/elphie-sdk](https://pypi.org/project/elphie-sdk/)
- **Node SDK** — [npmjs.com/package/@elphie/sdk](https://www.npmjs.com/package/@elphie/sdk)

## 🤝Community & Support

> 👋 **Coming from the Better Stack video?** Drop your use case in our [Slack community](https://join.slack.com/t/elphie-community/shared_invite/zt-3zjb5vwvl-j7hRz3_F1SOn5cH~jm5f5g) — we read every reply and the founders personally onboard early adopters.

- **Slack** — the cornerstone of Elphie AI contributions. Connect with maintainers, discuss features before coding, get help with setup, and stay current on contribution sprints.
- **Docs** — guides and references at [elphie.willowave.in](https://elphie.willowave.in).

👉 Join us → [Elphie Community Slack](https://join.slack.com/t/elphie-community/shared_invite/zt-3zjb5vwvl-j7hRz3_F1SOn5cH~jm5f5g)

## 🙌 Contributing

We love contributions! Join the [Slack community](https://join.slack.com/t/elphie-community/shared_invite/zt-3zjb5vwvl-j7hRz3_F1SOn5cH~jm5f5g) to discuss ideas, and see the [contributor setup](https://elphie.willowave.in/contribution/setup) to get a local environment running.

### Getting Started

- Clone or obtain a local copy of the repository
- Create your feature branch (git checkout -b feature/AmazingFeature)
- Commit your changes (git commit -m 'Add some AmazingFeature')
- Share your changes with maintainers via Slack for review

## 📄 License

Elphie AI is licensed under the [BSD 2-Clause License](LICENSE)- the same license as projects that were used in building Elphie AI, ensuring compatibility and freedom to use, modify, and distribute.

## 🏢 About

Built with ❤️ by **Elphie**

<br><br><br>

  <p align="center">
    <a href="https://elphie.willowave.in">☁️ Try Cloud Version</a> |
    <a href="https://join.slack.com/t/elphie-community/shared_invite/zt-3zjb5vwvl-j7hRz3_F1SOn5cH~jm5f5g">💬 Join Slack</a>
  </p>
