# Jersey Distributors isolated staging design

Authorization: the user selected a separate stack on the existing VM, separate URL, real-data copy, and deployment of their own fork. Production and the nightly QuickBooks process must remain unchanged. The verified pre-staging backup is the clone source.

## Approaches
A second company inside the production application would share code, migrations, queues, and credentials. A separate VM would add infrastructure beyond the requested scope. The selected approach is a separate Docker Compose project on the same VM, with its own database engine, Redis, object store, PDF converter, application, credentials, and private network.

## Behavior
Staging exposes a separate private-LAN application URL and signed-file endpoint. The runtime UI shows an orange STAGING / FEATURE TESTING / NOT PRODUCTION banner, copy timestamp, and commit version. Browser titles and generated PDFs identify staging. Legal production names and production UI remain unchanged. Staging has one active Jersey workspace and a separate login.

Restore only into a container whose name, environment label, network, and storage mounts prove it is staging. Remove copied history-protection triggers only there so test edits work. Never start the QuickBooks reader, sync worker, or notification bridge in staging. Use an empty Redis instance instead of replaying production queues. Stage credentials are fresh and are never committed.

## Safety and portability
The API, database, storage, Redis and converter are on an internal-only network. Only the static web/proxy container reaches the edge network. Email and SMS fail closed in staging even if tenant settings contain credentials; Telegram and recurring financial bootstrap are disabled. Browser billing scripts do not load in staging. Preserve the macOS scanner and provide a bounded Poppler/Tesseract Linux adapter. An optional public S3 signing endpoint supports browser downloads without giving the API egress.

## Release and GitHub
Capture intended existing local source changes in a managed worktree; leave the original checkout intact. The public fork receives source and synthetic tests only. Inherited upstream publishing workflows do not run on the fork. Fork CI tests PRs without deployment secrets and publishes commit-addressed Linux images only after verification. Production promotion remains a separate manual operation with a fresh backup and uses the same image digests; staging transactions never move back.

## Verification
Build API/CLI/shared/web, typecheck, run full server tests and synthetic Linux OCR tests. Restore and migrate only staging, compare financial counts/controls, verify login/editing/custom reports/PDFs/attachments/scan flows, prove email/SMS/outbound denial, and check mobile labels. Compare production container configuration and sync release/checkpoints before/after, allowing only the existing scheduled sync's own verified data changes.
