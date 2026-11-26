# Jersey staging implementation plan

> For agentic workers: execute task-by-task with executing-plans. Do not deploy to production.

Goal: deploy the user's fork to an isolated, labeled, real-data Jersey staging copy on the existing VM.
Architecture: separate Compose project and storage; no backend egress or copied live queues; runtime deployment labels permit image promotion.
Tech stack: Docker Compose, MariaDB, Redis, MinIO, Gotenberg, Node18/pnpm9, NestJS, React/Vite, Poppler/Tesseract, GitHub Actions/GHCR.
Spec: ../specs/2026-11-26-jersey-staging-design.md

## Global constraints
- Production containers, databases, storage, credentials, and sync configuration are never mutation targets.
- Source backup must be restore-verified; all mutation commands validate staging identity.
- Real data/credentials/backups never enter the public fork or Actions artifacts.
- App/S3 URLs bind only to the private VM address. No production VM credential enters PR jobs.

## Review focus
- Wrong database/volume target: bootstrap target guard rejects production name/network/mount.
- Copied credentials: central email/SMS guards and network egress block delivery; Telegram disabled.
- Automatic financial writes: recurring bootstrap disabled and Redis empty.
- Linux-only portability: container build plus real synthetic OCR smoke test.
- Misidentified environment: persistent banner, browser title, printable PDFs, source timestamp and release ID.

## Tasks
- [x] Prepare managed worktree and capture intended fork source, excluding local private data.
- [x] Add deployment-environment safeguards, labels, watermarks and focused safety tests.
- [x] Add Linux OCR adapter and optional public S3 signing endpoint with focused tests.
- [x] Prepare Dockerfiles, isolated Compose/proxy, and fork CI.
- [ ] Run complete builds/typechecks/test suites; fix deployment-blocking failures.
- [ ] Commit reviewed source, push branch to the user's fork, create draft PR, and obtain tested immutable Linux images.
- [ ] Restore verified backup into validated staging infrastructure; fresh credentials and one active Jersey workspace.
- [ ] Run only staging migrations and start fork API/webapp by immutable image digest.
- [ ] Test functional/data/security/browser flows and verify production/sync unchanged.
- [ ] Save deployment/rollback runbook and reusable deployment skill, evidence and staging login.
- [ ] Remove temporary SSH access and confirm its rejection after successful handoff.
