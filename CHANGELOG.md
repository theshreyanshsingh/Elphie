# Changelog

## 1.37.0 (2026-06-19)

<!-- Release notes generated using configuration in .github/release.yml at main -->

## What's Changed
### Features
* feat: add Inworld TTS provider support by @manasseh-zw in pull #420
### Bug Fixes
* fix(workflow): detect duplicate trigger paths when first node has no id by @Mubashirrrr in pull #409
* fix(qa): tolerate non-dict JSON from QA LLM instead of crashing by @Mubashirrrr in pull #408
* fix(devcontainer): expose UI/API ports for host access by @faisu in pull #405
* fix: disable duplicate trigger nodes in workflow builder by @nuthalapativarun in pull #402
* fix(ui): proxy WebSocket signaling upgrade so local web calls work (#425) by @yogi6969 in pull #454

## New Contributors
* @faisu made their first contribution in pull #405
* @yogi6969 made their first contribution in pull #454

**Version range**: v1.36.0...v1.37.0

## 1.36.0 (2026-06-18)

<!-- Release notes generated using configuration in .github/release.yml at main -->

## What's Changed
### Features
* feat: add Smallest AI TTS and STT provider integration by @harshitajain165 in pull #444
* feat: refreshed user onboarding by @a6kme in pull #430
* feat: add custom sarvam tts voice by @chewwbaka in pull #449
* feat(examples): add load-and-edit workflow SDK example in Python and TypeScript by @nuthalapativarun in pull #441
* feat(examples): add multi-node Workflow SDK example in Python and TypeScript by @nuthalapativarun in pull #440
### Bug Fixes
* fix: add pace option in sarvam tts config by @chewwbaka in pull #447
* fix(ui): release microphone stream on call teardown so a second test call works by @Aymenbenpakiss in pull #446
* fix: add language field to CartesiaTTSConfiguration and pass to Cartesia TTS service by @nuthalapativarun in pull #442
* fix: sync Smallest AI voice dropdown with selected model by @harshitajain165 in pull #451
### Other Changes
* Validate workflow status filter to prevent 500 on invalid enum value by @a6kme in pull #450
* allow self-hosters to enable Stack Auth via Dockerfile build args (v33.0) by @neggmmm in pull #445

## New Contributors
* @harshitajain165 made their first contribution in pull #444
* @Aymenbenpakiss made their first contribution in pull #446
* @neggmmm made their first contribution in pull #445

**Version range**: v1.35.0...v1.36.0

## 1.35.0 (2026-06-12)

<!-- Release notes generated using configuration in .github/release.yml at main -->

## What's Changed
### Features
* feat: add config v2 to simplify billing by @a6kme in pull #428
* feat: add Cartesia Sonic 3.5 as a TTS option by @manasseh-zw in pull #423
* feat: add a start docker script by @a6kme in pull #426
* feat: billing and credit management v2 by @a6kme in pull #429
### Bug Fixes
* fix(telephony): handle Cloudonix CDR webhooks missing session/disposition by @Mubashirrrr in pull #407

## New Contributors
* @manasseh-zw made their first contribution in pull #423
* @Mubashirrrr made their first contribution in pull #407

**Version range**: v1.34.0...v1.35.0

## 1.34.0 (2026-06-03)

<!-- Release notes generated using configuration in .github/release.yml at main -->

## What's Changed
### Features
* feat: add mcp guides for various topic and stages for bot building by @a6kme in pull #380
* feat: allow overriding base URL of OpenAI STT and TTS by @developer603 in pull #377
* feat: add Azure AI multi-provider support (TTS, STT, Embeddings, Realtime) by @vishaldhateria in pull #381
### Bug Fixes
* fix: support object and array parameters in custom HTTP tools by @mvanhorn in pull #373
* fix(telephony): resolve transfer context via call-sid index instead of KEYS scan by @shiminshen in pull #387
* fix(webrtc): enforce embed allowed-domain policy on public signaling websocket by @shiminshen in pull #388
* fix: use runtime BACKEND_URL for proxying by @a6kme in pull #411
* fix: add CORS preflight handler and ACAO header for embed config endpoint by @nuthalapativarun in pull #403
### Other Changes
* Add Sarvam LLM, update Sarvam STT models, expose usage_info on run detail by @abhaybabbar in pull #351
* fix: make email lookup case-insensitive in get_user_by_email by @developer603 in pull #397

## New Contributors
* @abhaybabbar made their first contribution in pull #351
* @mvanhorn made their first contribution in pull #373
* @developer603 made their first contribution in pull #377
* @vishaldhateria made their first contribution in pull #381
* @shiminshen made their first contribution in pull #387

**Version range**: v1.33.0...v1.34.0

## 1.33.0 (2026-05-31)


### Features

* abort immediately on max call duration exceed (c586d02)
* banner if API is not reachable (78ba62e)


### Bug Fixes

* fix inbound for Cloudonix with softphone (e695436)
* store channel id in gathered context for ARI outbound (8f10bca)

## 1.32.0 (2026-05-28)


### Features

* add copy-to-clipboard button for inbound webhook URL (#359) (62d3749)
* add delete button in an edge in workflow builder (#366) (9675151)
* add devcontainer based setup  (#352) (0716582)
* add google stt and tts. add folders to organize agents (ad2fa07)
* add MiniMax provider support (Chat + TTS) (#309) (0e0d313)
* add transcript and recording public URLs in API (3df5730)
* add ultravox realtime and fix signature issue in telephony (#345) (3892b58)
* add xai grok as realtime model (9135c2d)
* allow overriding base URL of OpenAI models (#368) (8a58b09)
* stamp API key into model override at save time to survive global provider change (#362) (5b61ad6)


### Bug Fixes

* abort docker compose when OSS_JWT_SECRET is unset (#356) (7eecadd)
* fix 1008 policy violation issue on ElevenLabs (93edef3)
* fix projection to TS when fetching agnet in MCP (bbb4f91)
* fix service key validation in OSS (#371) (b891091), closes #303
* fix vobiz webhook signature validation (285de92)
* harden CORS origin allow list (6f79bd6), closes #322
* run api container as non-root Elphie user (#360) (573dd68)


### Documentation

* add github trending badge in README (1e8f832)
* **asterisk-ari:** add required TLS config for Elphie Cloud and reload/codec notes (9e12d96)
* clarify Asterisk ARI WebSocket URI for Elphie Cloud vs self-hosted (#358) (92c8dad)
* fix asterisk protocol in mintlify websocket client config (a725fda)

## 1.31.0 (2026-05-21)


### Features

* add agent skills to review PR (#320) (151bf77)
* add chat based testing for voice agent (#308) (d97d1d7)
* add Review AGENTS.md Skill (d93d7af)
* add Tuner Integration to Elphie (#311) (5f28c1b)
* **mcp:** add search_docs tool over docs corpus (closes #295) (#316) (5762095)
* **mcp:** generic MCP tool source with per-node function filtering (#301) (75839f9)


### Bug Fixes

* **security:** bump python-multipart 0.0.20 -&gt; 0.0.27 (#332) (332754a)
* **stt:** align Speechmatics language registry with official transcription codes (#317) (afa78fe)
* **webRTC:** LAN IP filtering (#333) (af66372)


### Documentation

* add Simplified Chinese translation of README (#305) (5b1e398)

## 1.30.1 (2026-05-17)


### Bug Fixes

* fix race between context init and keepalive for Elphie TTS (ba7d45f)

## 1.30.0 (2026-05-16)


### Features

* add openai realtime models (#298) (2381a80)


### Bug Fixes

* force FORCE_TURN_RELAY for local IPs in setup (fc04f31)
* provider resolution in telephony cost calculation post workflow integration calls (0523dcb)


### Documentation

* add telnyx to telephony providers supporting call transfer (4ff1f57)
* update README.md (ea13492)

## 1.29.0 (2026-05-13)


### Features

* an option to setup remote server with docker compose build (#280) (59619e9)
* configurable ElevenLabs base URL for Data Residency (#278) (7f0dac1)
* inline rename of workflow on the editor page (#273) (f2cb649)
* **telephony/telnyx:** add call transfer via conference bridge (#274) (4a6752e)
* verify telnyx webhook signature optionally (#279) (b670004)


### Bug Fixes

* **ari:** pre-register ext channel id and defer bridge to its StasisS… (#284) (ebeffdb)
* prior pre-pr drift check failures (#276) (a190282)

## 1.28.0 (2026-05-11)


### Features

* add headless mode, redesign floating widget, refactor lifecycle callbacks (#268) (d2a119c)
* add logs in campaigns for failure or pausing (#265) (d4b6afb)
* add telnyx webhook api key in telephony config (#270) (01c201b)
* add voicemail detection in realtime branch (025bc14)
* add workflow graph constraints fixtures (5a358d4)
* enable FORCE_TURN_RELAY to diagnose turn connectivity for local deployment setups (#272) (e2fe1f3)


### Bug Fixes

* add missing call_id in gathered_context for telnyx (31e2c13)
* number pool initialization in multi telephony setup (6d93be3)

## 1.27.0 (2026-05-02)


### Features

* add create workflow tool in MCP (3e3773f)
* add examples to create workflow and use sdk (f041e60)
* add Plivo telephony provider support (#245) (2218ba8)
* add posthog signup and signin events, enable backend posthog events for oss version (#249) (f7c1f63)
* add test mode for API trigger (4171ad7)
* agent stream for cloudonix OPBX (#261) (7fd3b96)
* refactor telephony to support multiple telephony configurations (#251) (e16f643)


### Bug Fixes

* api trigger for telnyx & cloudonix (#258) (6c4830c)
* honor telnyxs per-call codec in bidirectional stream (#256) (085ab0a)
* make trigger paths globally unique (a1d4a1f)
* normalise telnyx event types (#259) (14bc66d)


### Documentation

* add missing config image (983b9be)

## 1.26.0 (2026-04-21)


### Features

* refactor node spec and add mcp tools (#244) (00a1a22)


### Bug Fixes

* compare dirty against correct baseline (6606a7f)
* fix slack community URL (86026f5)

## 1.25.0 (2026-04-17)


### Features

* add mcp server to Elphie OSS (#240) (79bc91b)


### Bug Fixes

* allow cross subdomain cookies at posthog (#243) (5ecc0d4)
* fix interruption handling for Gemini Live (e31b381)

## 1.24.0 (2026-04-14)


### Features

* add redial option in campaigns (7fab959)


### Bug Fixes

* ssl error when using self signed certificate (#238) (50a5916)
* ssl error when using self signed certificate with remote deployment (50a5916)

## 1.23.1 (2026-04-11)


### Bug Fixes

* eslint import issue (1f89b4f)

## 1.23.0 (2026-04-11)


### Features

* add github and slack community buttons (73e5ca8)


### Bug Fixes

* bake punkt_tab file into docker images (#234) (ebde28d)

## 1.22.0 (2026-04-10)


### Features

* add full document mode in knowledge base (87c8c5e)
* add posthog events (#231) (3f19a16)
* add recording audio option in tool and node transitions (#232) (7c24505)


### Bug Fixes

* render prompt template for variable extraction (8b3dc02)

## 1.21.0 (2026-04-08)


### Features

* add agent lifecycle events in widget (#226) (f5fa9ce)
* add Assembly AI STT (501d06c)
* add default initial context variables (96c9037)
* add default telephony variables (e7adbc7)
* add gladia stt support (c4c4b59)
* add pre call fetch configuration (#222) (ec2f322)
* add Rime TTS (e255b33)
* add worker sync events (03df559)
* agent versioning and model configurations override (#227) (38d1d92)
* allow multiple recording file upload (6792ecd)
* enable context summarization (56763a4)
* set calculator as custom tool on demand (f368fe5)


### Bug Fixes

* scope the overridden config over global for recording (6968d20)
* send volume in cartesia (9decdb2)
* set context before update settings for live (6a473a9)
* Speaches STT service wiring (95d6dd4)


### Documentation

* improve api trigger documentation (89fce77)
* override agent model config (32d0766)

## 1.20.0 (2026-03-31)


### Features

* add gemini live and speaches integration (#220) (87e72d5)
* add QA node documentation (0b3a8bc)
* date range in download report (0b5fd10)


### Bug Fixes

* add disposition codes in workflows (9bc2ffc)
* resize chatwoot icon for workflow run page (#217) (bb263a4)
* skip updating gathered_context when the extracted variables is not a dict (#219) (e0c3d6c)

## 1.19.2 (2026-03-26)


### Bug Fixes

* send auth credentials with validate service keys (83f05ab)

## 1.19.1 (2026-03-26)


### Bug Fixes

* cleanup rtf on pipeline finish (2d91336)
* ui build error, slack notification for vercel deployment status (fea0e4d)

## 1.19.0 (2026-03-25)


### Features

* add CAMB AI TTS integration (#187) (31e075d)
* add speed configuration for cartesia (f8cf433)
* add support for self hosted llm models (ac0731a)
* allow recording audio in workflow builder (2fa4191)
* integrate Telnyx telephony for outbound and inbound calling (#206) (5b820cb)


### Bug Fixes

* imports in telnyx_provider (e5e1954)
* incorrect system instruction in llm inference of variable extrac… (#201) (7073061)
* pass system_instruction to one shot llm inferences to avoid syst… (#203) (330e4a0)


### Documentation

* pre-recorded audio (#207) (da19ddc)

## 1.18.0 (2026-03-23)


### Features

* add AWS Bedrock support (fe84f08)
* add rtf log when user speaks when muted (1967a71)
* add tool response in variable extraction llm (#196) (522e696)
* campaign create error on missing template variables (e513e56)
* custom telemetry configuration (affb39e)
* distribute calling CLIs randomly (c61a384)
* enable duplicate workflow feature (93c4558)


### Bug Fixes

* await pending variable extraction tasks before pipeline finishes (#198) (d42c52d)
* workflow set dirty after config update (d996547)


### Documentation

* add video tutorial for local and remote deployment (#194) (1604e30)

## 1.17.0 (2026-03-17)


### Features

* add early voicemail detection (7717810)
* add hybrid text + recording functionality in agents (#191) (494c60d)
* add message before tool calls (#185) (ec58356)
* allow multiple API keys (#186) (57e8768)
* download campaign report (4d80726)
* hang up cloudonix machine answered call if feature flag enabled (#182) (3c5bc68)


### Bug Fixes

* add cloudonix call hangup strategy (#181) (7b77721)
* cold start for gemini (a381b36)
* fix npm run build (ff92c6a)
* handle delayed transcription in ExternalTurnStopStrategy (77a55fc)


### Documentation

* add developer and api reference tabs (#190) (f075bcb)
* add documentation links to nodes & tools (#184) (5698338)
* update Elphie overview link (1b03191)

## 1.16.0 (2026-03-05)


### Features

* abort call on pipeline error and send rtf event (dfb741e)
* add cartesia tts (e111cbb)
* add cloudonix amd callback with logs only (#177) (628132f)
* Add end call reason in tool calls. (7e2de09)
* add qa node in workflow builder (#172) (a836825)
* add rolling updates for production deployment (#175) (aed5a78)
* render QA in UI (ef080d5)
* run per node QA (c8742db)
* tansfer calls with aasterisk (#171) (bd07b75)


### Bug Fixes

* fix appsidebar on mobile (9e05869)
* fix circuit breaker failure recording (3ea235a)
* fix circuit breaker failure recording (3ea235a)
* fix default voice of cartesia tts (f1f4830)
* keep the start_services_dev script alive for docker (#178) (21b32c1)
* safe parse timestamp (7aef9c6)
* use environment variable for BACKEND_URL (20b8dc6)

## 1.15.0 (2026-02-20)


### Features

* add asterisk ARI websocket interface (#159) (7552b6c)
* add authentication for OSS (#167) (642cc34)


### Bug Fixes

* Fixes #139 (9ce5a8e)
* missing call_id in gathered_context (#165) (13b4143)
* trigger user turn stop (ee4a874)

## 1.14.0 (2026-02-16)


### Features

* telephony call transfer (#155) (c711920)


### Bug Fixes

* add check for workflow run mode in transfer call (#160) (67e92e6)
* limit cloudonix transport to 20 ms packets (559c0ca)
* llm generation to annouce failed transfer call (28eaa93)

## 1.13.0 (2026-02-13)


### Features

* add languages for deepgram and Elphie (5256010)
* add openrouter support (4c936ae)
* add sarvam v3 voices (a75bc72)
* limit campaign concurrency to number of CLIs (3cdede0)


### Bug Fixes

* add vad_analyzer in user aggregator (6711dcb)
* fix cloudonix call hangup (#154) (b9ddd30)
* fixes aggregation in elevenlabs TTS (#153) (e156524)
* send sample rate to STT services (7a10202)

## 1.12.0 (2026-02-05)


### Features

* add coturn configurations (#143) (bf972fc)
* add dictionary support for STT boosting in voice agents (#136) (db75d90)
* add retry config during campaign creation (6f41e91)
* allow turn credentials fetching from embed agent (6ccc649)
* check for duplicate phone number in campaign (814271e)
* mute on function call (#138) (9191176)


### Bug Fixes

* add cloudonix CDR handling (#140) (b1c982a)
* add error in cloudonix cdr report (e9c5da1)
* allow interruption on start_node (7e438ad)
* BACKEND_API_ENDPOINT resolution from env and cloudflared tunnel (#135) (4a8e4fe)
* better error handling for telephony (8c42866)
* fix remote deployment method  (#145) (87fc64d)
* make campaign process batch thread safe (#141) (6827744)

## 1.11.2 (2026-01-27)


### Bug Fixes

* fix variable extraction during pipeline execution flow (6b408e5)
* remove duplicate index addition in migration (#129) (2aedb83)

## 1.11.1 (2026-01-24)


### Bug Fixes

* free disk space for docker build (#126) (be50a24)

## 1.11.0 (2026-01-23)


### Features

* add end_call tool (#118) (a172db8)
* add rtf in logs (#119) (cac2587)
* add transcript panel during live call for better visibility (#116) (e771247)
* add voices in Elphie configuration (c58aa55)
* handle cloudonix incoming calls (#121) (e2fa4bb)
* knowledge base functionality for the voice agent (#120) (ef5b9e4)


### Bug Fixes

* changes to update pipecat version to 0.0.100 (#122) (911c5ed)
* fix npm run build (692ef27)
* fix OPENAI_API_KEY bug in retrieval (d35eeb1)
* fix release please (4c073b7)
* make embeddings api key optional (3b614b8)
* set_node during node execution (a4367bd)


### Documentation

* inbound telephony (#124) (b996cb8)

## 1.10.0 (2026-01-13)


### Features

* enable api key access to routes (05ead4d)
* enable Sarvam Models (514d9c5)


### Bug Fixes

* API calling endpoint (df2bfd7)
* catch initiate call exception in public agent (92bdfd6)
* formatting fix and fix #79 (11e033c)
* initialize engine earlier than event handler (b79bc42)
* migrate from custom audio recorder to native AudioBuffer (#115) (edf0fa4)


### Documentation

* fix broker internal link (#114) (3152100)
* tracing with langfuse (#112) (d41f696)

## 1.9.0 (2026-01-03)


### Features

* add cloudonix outbound telephony (#101) (90b690e)
* add keyboard shortcut for save (fec8da9)
* add trace URL in workflow runs (cdf6853)
* add voice selectors in elevenlabs (#88) (45c5b7c)
* user defined custom tools as part of workflow execution (#94) (3e55af9)


### Bug Fixes

* change type definition from enum to str for consistency (e83f3a3)
* fix configuration option (74b0693)
* fix db filters (de09f1c)
* fix links (480e8a5)
* fix migration version (9adc766)
* llm generation in case of user idle (04576ac)


### Documentation

* add page for Workflow editing basics (#93) (3afae6c)
* add webhook tutorial in mintilify docs (#92) (0b07319)
* modify tools section (#103) (a33fa6c)
* tools in workflow node (#102) (db89aed)

## 1.8.0 (2025-12-22)


### Features

* add coturn for remote deployments (#84) (1740999)
* add smart turn v3 (4640f69)
* add voices to elevenlabs (94b7d7e)


### Bug Fixes

* add text filter for tts and logs for filter (#74) (0a8ce3f)
* call_id and stream_id for vobiz pipeline, add workflow run state (#78) (c99bd29)
* fixes wrong selection in model config dropdown (#80) (2e37c89)
* prevent pipeline freezes when sending endframe (#77) (909c258)
* use config for turn (4ddb144)

## 1.7.1 (2025-12-01)


### Bug Fixes

* fix pointer events on phone call dialog (#70) (713c35d)

## 1.7.0 (2025-11-29)


### Features

* added vobiz telephony (#65) (09897cb)
* Update Elphie's UI Design (#67) (a7f2238)


### Bug Fixes

* set provider during campaign run (#69) (8342cd1)

## 1.6.0 (2025-11-26)


### Features

* add llm models in Elphie (#64) (a7bf64a)
* add new elevenlabs voices (d60c020)
* allow www domain for embedded websites (#60) (ed3ceaf)
* show error if quota is exceeded (#66) (145da30)


### Bug Fixes

* permission in slack announcements action (c37fbcd)
* slack message body (#59) (5ab5c1d)


### Documentation

* add ui telephony integration (3d710ca)
* update Elphie overview (#63) (93a6a0a)

## 1.5.0 (2025-11-21)


### Features

* enable remote server deployment for OSS deployment (#57) (6efe7d6)

## 1.4.0 (2025-11-15)


### Features

* enable workflows to be embedded in websites as a script tag (#47) (99a768f)
* simplify pipecat engine execution (#54) (6ce25a5)


### Documentation

* add development workflow to CONTRIBUTING.md (#52) (6d7b0a9)
* update Slack link in README.md (5e4aef3)

## 1.3.1 (2025-11-13)


### Bug Fixes

* upgrade pipecat with bundled Silero VAD model (#50) (1e32eba)

## 1.3.0 (2025-11-12)


### Features

* improve workflow builder UX (#41) (1a0a18a)


### Bug Fixes

* arm docker build step (#48) (c028c79)
* fix npm build (#43) (8d05c9f)
* slack annoucement workflow (#46) (dc6d696)

## 1.2.0 (2025-11-06)


### Features

* add chatwoot integration (#39) (5c1fe2c)
* add csv upload functionality (3babb5c)
* add csv upload functionality for OSS (#29) (3babb5c)
* add gmail integration for searching and reply to emails (#34) (6503d80)
* add issue templates (35c9ab7)
* add issue templates (fe664cb)
* add more issue templates (8c5e9b4)
* add privacy policy and terms of service links (a2d02d8)
* add README, LICENSE, CONTRIBUTING (957cdcf)
* add vonage telephony (#35) (4cfdc3d)
* create docker-image.yml, update README.md and docker-compose.yaml (43c56d0)
* Enable Poshog and Sentry for OSS (#23) (90f7aac)
* enable posthog and sentry for oss (90f7aac)
* Enable telephony for OSS (#21) (8e2e5c9)
* multi stage dockerfile (548e6f8)
* set start metadata in pipeline (8376e3e)
* Trickle ice candidates for faster WebRTC connection (034c551)
* Trickle ice candidates for faster WebRTC connection (895af47)
* update readme and docker compose file (606398b)
* UX improvements for onboarding (d39a811)


### Bug Fixes

* add minio policy (136f370)
* fix audio permission issue on safari (#26) (e9c0afd)
* fix ui of webrtc call (efd93ad)
* install soundfile in oss docker build (c7e7581)
* install soundfile in oss docker build (6a97fd1)
* link for 'Try Cloud Version' in README (28926d0)
* pipecat commit hash & add webrtc in requirements.txt (d89bb84)
* redirect user to /workflow page if they have workflow (9cb7582)
* redirect user to /workflow page if they have workflow (73664e6)
* release package name and add write permission for 'comment on release' step of deployment action (#31) (b9d1720)
* renamed check_pipecat_sync.sh (75af6cf)
* rethrow NEXT_REDIRECT error (4906393)
* telephony bugs and improve code structure (#38) (d58f37f)


### Documentation

* add video for vonage config (#40) (dca4904)


### Code Refactoring

* change pipecat to submodule & add github alerts (a9a97ab)
* change pipecat to submodule & add github alerts (6562963)

## 1.1.0 (2025-10-09)


### Features

* add csv upload functionality (3babb5c)
* add csv upload functionality for OSS (#29) (3babb5c)
* add issue templates (35c9ab7)
* add issue templates (fe664cb)
* add more issue templates (8c5e9b4)
* add privacy policy and terms of service links (a2d02d8)
* add README, LICENSE, CONTRIBUTING (957cdcf)
* create docker-image.yml, update README.md and docker-compose.yaml (43c56d0)
* Enable Poshog and Sentry for OSS (#23) (90f7aac)
* enable posthog and sentry for oss (90f7aac)
* Enable telephony for OSS (#21) (8e2e5c9)
* multi stage dockerfile (548e6f8)
* set start metadata in pipeline (8376e3e)
* Trickle ice candidates for faster WebRTC connection (034c551)
* Trickle ice candidates for faster WebRTC connection (895af47)
* update readme and docker compose file (606398b)
* UX improvements for onboarding (d39a811)


### Bug Fixes

* add minio policy (136f370)
* fix audio permission issue on safari (#26) (e9c0afd)
* fix ui of webrtc call (efd93ad)
* install soundfile in oss docker build (c7e7581)
* install soundfile in oss docker build (6a97fd1)
* link for 'Try Cloud Version' in README (28926d0)
* pipecat commit hash & add webrtc in requirements.txt (d89bb84)
* redirect user to /workflow page if they have workflow (9cb7582)
* redirect user to /workflow page if they have workflow (73664e6)
* renamed check_pipecat_sync.sh (75af6cf)
* rethrow NEXT_REDIRECT error (4906393)


### Code Refactoring

* change pipecat to submodule & add github alerts (a9a97ab)
* change pipecat to submodule & add github alerts (6562963)
