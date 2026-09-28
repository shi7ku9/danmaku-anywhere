# Tooling

Checks that keep the code consistent, and where each one runs.

## Scripts

| Script | What it does |
|---|---|
| `pnpm compile` | Type-check with `tsc --noEmit` |
| `pnpm lint` | Biome: formatting and lint, report only |
| `pnpm format` | Biome: apply formatting and safe lint fixes |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm build` / `pnpm build:firefox` | Production build for Chrome / Firefox |

## Biome

[Biome](https://biomejs.dev/) formats and lints TypeScript, JavaScript, JSON and
CSS with one tool and one config, `biome.jsonc`. It reads `.gitignore`, so build
output (`.output/`, `.wxt/`) and `node_modules/` are skipped.

The formatter is set to the style the code already used, so adopting it changed
little:

- 2-space indent, 120-column lines
- single quotes (also in CSS), semicolons, trailing commas, parentheses around
  arrow parameters

HTML is not formatted: Biome's HTML support is still partial.

The linter uses the recommended rules. A rule is turned off only when it fights an
intentional idiom of this codebase, with the reason next to it in `biome.jsonc`.

## Git hooks

[Lefthook](https://lefthook.dev/) runs the hooks, configured in `lefthook.yml`.
They are installed by `pnpm install` (the `prepare` script). pnpm blocks
dependency install scripts by default; `pnpm-workspace.yaml` leaves Lefthook's
disabled, since all it would do is install the hooks too.

| Hook | Runs |
|---|---|
| `pre-commit` | Biome on the staged files, fixing and restaging what it can; `pnpm compile`. Both run in parallel. |
| `commit-msg` | [commitlint](https://commitlint.js.org/) with the Conventional Commits preset, as required by `AGENTS.md` |
| `pre-push` | `pnpm test` |

Formatting is fixed automatically; lint errors, type errors and a malformed
commit message stop the commit and must be fixed.

In an emergency a hook can be skipped with `git commit --no-verify` (or
`git push --no-verify`), or all hooks with `LEFTHOOK=0`. CI runs the same checks,
so skipped problems still show up on the pull request.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on
pushes to `main`:

1. Install with the pinned pnpm version (`packageManager` in `package.json`) and
   `--frozen-lockfile`.
2. `pnpm compile`
3. `biome ci`: the same checks as `pnpm lint`, without writing
4. `pnpm test`
5. `pnpm build` and `pnpm build:firefox`

The manual browser checklist in [testing.md](testing.md) is not automated and
still has to be run before a change is done.

## Pull request titles

Pull requests are squash-merged (the only merge method enabled on GitHub), and
the squash commit's subject is the PR title followed by ` (#number)`, with no
body. The commits on a PR branch can therefore be granular; the title is what
lands on `main`.

The commit-msg hook never sees that title, so `.github/workflows/pr-title.yml`
checks it with the same commitlint config. It runs when a pull request is
opened, reopened, edited (e.g. retitled) or updated, and checks the exact
subject the squash will produce, `<title> (#<number>)`, so the length limit
applies to the final message.
