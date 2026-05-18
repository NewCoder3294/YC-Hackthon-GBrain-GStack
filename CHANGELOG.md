# Changelog

All notable changes to WatchDog will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MIT license, contributor guide, code of conduct, and security policy.
- GitHub issue templates (bug report, feature request) and a pull request template.
- `.editorconfig` for consistent formatting across editors.
- `CHANGELOG.md`.
- **CI/CD pipeline:**
  - Shared composite action `.github/actions/setup` (pnpm + Node + Turbo cache + install).
  - `CodeQL` weekly + per-PR static analysis (`security-and-quality` query suite).
  - `Dependency review` blocks PRs that introduce high-severity vulnerabilities or
    strong-copyleft licenses (AGPL-3.0, GPL-3.0).
  - `PR validation` enforces conventional-commit-shaped PR titles.
  - `Release Please` opens automated release PRs from conventional commits on `main`.
  - `Dependabot` weekly bumps for npm and GitHub Actions, grouped by minor/patch,
    majors surfaced individually.
  - `CODEOWNERS` defaulting to @NewCoder3294.

### Changed
- `CI` workflow refactored into parallel jobs (lint, typecheck, test, build) with
  a summary gate, PR-only `cancel-in-progress` concurrency, and Turborepo cache
  reuse across runs.
