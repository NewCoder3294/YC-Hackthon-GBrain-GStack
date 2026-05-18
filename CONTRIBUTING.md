# Contributing

Thanks for your interest in contributing. This guide covers local setup,
project layout, code style, and the PR workflow. For high-level architecture
read [`docs/STATUS.md`](docs/STATUS.md); for the original product brief read
[`docs/PRD.md`](docs/PRD.md).

## Quickstart

You'll need **Node ≥ 20**, **pnpm ≥ 9**, and a free **Supabase** project of
your own (no team access required for OSS contributors).

```bash
git clone https://github.com/NewCoder3294/YC-Hackthon-GBrain-GStack.git watchdog
cd watchdog
pnpm install
cp apps/web/.env.example apps/web/.env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, and CRON_SECRET (any value).
pnpm dev
```

Open http://localhost:3000. Other env vars (Twilio, Resend, Upstash, 511,
Socrata) are optional — code falls back to console logs / in-memory caches
when unset.

Database migrations live in `packages/db/migrations`. Apply them to your
Supabase project with `pnpm db:push` (Drizzle).

## Repo layout

This is a `pnpm` + Turborepo monorepo.

```
apps/web                  Next.js 15 app (operator + citizen surfaces)
packages/db               Drizzle schema, migrations, typed client
packages/sync             camera catalog parser + upsert
packages/ingestion        signal-event ingestion helpers
packages/openclaw-worker  fusion/scripted worker (TypeScript)
docs/                     PRD, TRD, STATUS, demo script, design specs
```

## Branches and PRs

- Branch off `main`. Name branches `feat/<topic>`, `fix/<topic>`,
  `docs/<topic>`, or `refactor/<topic>`.
- Open a PR against `main`. Fill out the PR template. Keep PRs focused —
  one logical change per PR.
- All CI checks must pass before merge. Squash-merge is the default.
- The maintainer (currently @NewCoder3294) reviews and merges.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): short imperative description
fix(scope): ...
docs(scope): ...
refactor(scope): ...
test(scope): ...
chore(scope): ...
```

Scopes you'll see in the log: `web`, `db`, `sync`, `ingestion`, `worker`,
`docs`, `ci`, `gbrain`, `auth`, `policy`. Add new scopes when they make
sense.

## Code style

- **TypeScript strict.** No `any` — use `unknown` with type guards or
  proper interfaces.
- **Zod** at boundaries (HTTP routes, env parsing, external APIs).
- **No force-unwraps / non-null assertions** unless commented with a clear
  invariant.
- **Async** with `async/await`. Handle errors explicitly.
- **Tailwind v4** monochrome tokens. No ad-hoc hex colors in components;
  use existing tokens.
- **Components** named in `PascalCase`, files in `kebab-case`.
- Run `pnpm typecheck` and `pnpm lint` before pushing.

## Testing

We use [Vitest](https://vitest.dev/).

```bash
pnpm test              # run once
pnpm test:watch        # watch mode
```

- New logic should ship with tests. Aim for the smallest unit that proves
  the contract — a single logical assertion per test.
- Mock external services (Supabase admin, Twilio, fetches) with explicit
  mocks. No `Math.random`, no `Date.now` without freezing time.
- Test files live next to the code under test as `*.test.ts`.

## Documentation

- Update [`docs/STATUS.md`](docs/STATUS.md) when adding or removing a
  surface, route, or major package.
- Update [`docs/GBRAIN_HANDOFF.md`](docs/GBRAIN_HANDOFF.md) if you touch
  GBrain RPCs, the Postgres schema GBrain reads from, or page write
  conventions.
- Inline code comments should explain **why**, not **what**. Default to no
  comment unless removing it would confuse a reader six months from now.

## Reporting issues

- **Bugs:** use the **Bug report** template. Include repro steps and the
  smallest possible reproduction.
- **Feature requests:** use the **Feature request** template. Describe the
  problem before the proposed solution.
- **Security issues:** **do not open a public issue.** See
  [`SECURITY.md`](SECURITY.md).

## Code of conduct

By participating you agree to follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Licensing

This project is MIT-licensed (see [`LICENSE`](LICENSE)). By contributing
you agree your contributions will be licensed under the same terms.
