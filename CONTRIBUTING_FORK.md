# Contributing to this fork

This repository is a fork of Bigcapital. Open feature branches and pull requests against this repository's `develop` branch. Preserve upstream attribution and licensing. Use synthetic examples and fixtures; do not upload company databases, invoices, exports, credentials, `.env` files, screenshots containing business data, or backup/recovery keys.

Use Node 18.20.8 and pnpm 9.1.2 for this release. Install with `pnpm install --frozen-lockfile`, configure your own local `.env` from `.env.example`, and follow the existing local development guide. Builds and tests must run without production access. Linux document scanning uses Python3, Poppler, and Tesseract English; macOS retains Apple Vision.

Fork CI tests PRs with read-only repository access and no VM secrets. Successful trusted pushes build images under `ghcr.io/<owner>/bigcapital/server:sha-<commit>` and `webapp:sha-<commit>`. Images are not deployed automatically. The owner selects an image digest for staging, tests it against an isolated real-data copy, and later explicitly approves production promotion. Never promote the staging database or its transactions.

Before production deployment: take a fresh verified backup, check migration and nightly-sync compatibility, deploy the same image digests tested in staging, and verify the next sync. Revert images for an application-only regression when schemas permit; data restoration is a separate reviewed recovery operation that may discard later imports.
