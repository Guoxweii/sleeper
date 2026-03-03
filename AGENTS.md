# AGENTS.md

This guide is for agentic coding assistants working in this repository.
It covers build/test commands and the project-specific coding conventions.

## 1) Project Snapshot

- Project: `sleeper`
- Goal: family sleep tracking with weekly/monthly analysis
- Monorepo workspaces:
  - `web/` Vue 3 + Vite + Pinia + Vue Router + Tailwind CSS
  - `server/` Fastify + SQLite (`better-sqlite3`) + Luxon
- Deploy flow: Docker + `scripts/deploy-scp.sh` (`scp -O` based)

## 2) Repository Layout

- `web/` frontend app
- `server/` backend API + DB bootstrap
- `scripts/` deployment scripts
- `docker-compose.yml` production compose
- `Dockerfile` production image
- `docs/` project docs

## 3) Cursor / Copilot Rules Status

Checked for additional local AI rules:

- `.cursor/rules/**`
- `.cursorrules`
- `.github/copilot-instructions.md`

Current status: these files do not exist in this repo.
If they appear later, treat them as higher-priority instructions.

## 4) Setup and Dev Commands

Run from repo root:

```bash
npm install
cp .env.example .env
npm run db:init
npm run dev
```

Split mode:

```bash
npm run dev:web
npm run dev:api
```

## 5) Build / Lint / Test Commands

### Build

- Main build: `npm run build` (builds frontend workspace)
- Frontend only: `npm run build --workspace web`
- Backend placeholder build: `npm run build --workspace server`

### Lint

- No lint script is configured currently.
- Do not assume ESLint/Prettier are present.

### Tests

- No automated test framework is configured currently.
- No `*.test.*` or `*.spec.*` files exist.

### Single-Test Equivalent (important)

Since no test runner exists, use targeted checks as a single-test substitute:

- Backend syntax check (single file):
  - `node --check server/src/index.js`
  - `node --check server/src/analysis.js`
- Frontend sanity check:
  - `npm run build --workspace web`
- Optional module smoke check (inside `server/`):
  - `node -e "import('./src/analysis.js')"`

If a real test framework is added later, update this section with exact single-test commands.

## 6) Run and Deploy

- Start production server locally: `npm run start`
- Docker run/build: `docker compose up -d --build --remove-orphans`
- Deploy to server: `npm run deploy`
- Quick deploy (no rebuild): `npm run deploy:quick`

Supported deploy env vars:

- `DEPLOY_HOST` (default `root@local-nas`)
- `DEPLOY_PATH` (default `/volume1/docker/sleeper`)
- `DEPLOY_PORT` (optional SSH port)
- `DEPLOY_WITH_BUILD=0` for quick mode

## 7) Code Style and Conventions

### Language and Modules

- JavaScript only (no TypeScript in current codebase).
- Use ESM syntax (`import`/`export`) everywhere.
- Prefer `node:` prefix for Node built-in imports.

### Imports

- Keep import order consistent:
  1) Node built-ins
  2) external packages
  3) local modules
- Avoid wildcard imports.

### Formatting

- 2-space indentation.
- No semicolons.
- Single quotes for strings.
- Prefer small functions and early returns.
- Avoid unrelated formatting churn in touched files.

### Naming

- Variables/functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE` when global-like
- DB schema columns: `snake_case`
- API DTO fields: `camelCase`
- Vue SFC files: PascalCase (e.g., `BoardRecordsPage.vue`)

### Frontend (Vue) Patterns

- Use `<script setup>`.
- Use `ref`, `reactive`, `computed` for state.
- Use `watch` for route/filter-triggered reloads.
- Put reusable formatting/data helpers under `web/src/lib/*`.
- Reuse established utility classes (`glass-card`, `btn-*`, `input-field`).

### Backend (Fastify) Patterns

- Keep routes in `server/src/index.js` unless refactor is explicitly requested.
- Validate inputs early; return `400` with clear messages.
- Use `reply.code(...).send(...)` for explicit status control.
- Wrap user-input-driven logic in `try/catch`.
- Keep protected endpoints behind `requireAuth`.

### Error Handling

- User-facing expected errors should be clear Chinese messages.
- Avoid leaking stack/internal details in API responses.
- Use explicit guard checks before heavy logic (`if (!board)`, etc.).

### Date/Time Rules

- Use Luxon for parsing/formatting/timezone math.
- Store times in UTC ISO strings in DB.
- Convert to local timezone only for display or period calculations.
- Weekly/monthly assignment logic is wake-day based.

### SQL / DB Rules

- Always use prepared statements with placeholders (`?`).
- Never construct SQL by concatenating user input.
- Add schema evolution via explicit migration functions in `server/src/db.js`.
- Keep migrations backward compatible for existing DB files.

## 8) Agent Working Rules

- Keep changes scoped to the requested task.
- Do not refactor unrelated code while implementing a feature/fix.
- For API shape changes, update frontend callers in the same change.
- For UI changes, sanity-check desktop and mobile behavior.

## 9) Pre-Commit Checklist

- Run relevant build/check commands from Section 5.
- Confirm no secrets were added (`.env`, credentials, tokens).
- Verify `git status` includes only intended files.
- Ensure Chinese user-facing text remains clear and consistent.
- Update README/AGENTS docs when commands or workflows change.
