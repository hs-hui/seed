# 🌱 Seed

Plant an idea. Grow what matters.

Seed is a local-first CLI for turning an early idea into a clearer, testable project definition. It keeps state in `.seed/`, never edits your source files, and can use a configured OpenAI-compatible provider or a deterministic local fallback.

## Quick start

```bash
npm install
npm run build
node dist/cli/index.js "A tool that helps developers understand unfamiliar repositories"
node dist/cli/index.js grow --answer "Start with a map of the repository and its execution flow"
node dist/cli/index.js bloom
node dist/cli/index.js harvest idea
```

Use `--lang ko` or `SEED_LANG=ko` for Korean UI. Configure an API key with `seed config set provider openai` and `OPENAI_API_KEY`, or keep using the local fallback while exploring the workflow.

## MVP commands

`seed`, `grow`, `branch`, `prune`, `bloom`, `tree`, `history`, `harvest idea|brief|prd|trd`, and `config` are included. `water`, `sunlight`, `evolve`, lifecycle commands, and remote sync are intentionally left for later phases described in `PRD.md` and `TRD.md`.

## Development

```bash
npm run build
npm test
npm run dev -- --help
```

MIT © Seed contributors
