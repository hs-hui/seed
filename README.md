# 🌱 Seed

Plant an idea. Grow what matters.

<p align="center">
  <img src="./assets/seed-overview.png" alt="Seed idea growth workflow: seed, grow, branch, bloom, and harvest" width="1200" />
</p>

Seed turns a vague thought into a focused, buildable direction through a gentle CLI workflow:

**Seed → Grow → Branch → Prune → Bloom → Harvest**

Seed is a local-first CLI for turning an early idea into a clearer, testable project definition. It keeps state in `.seed/`, never edits your source files, and can use a configured OpenAI-compatible provider or a deterministic local fallback.

On the first interactive run, Seed asks for your CLI language (English is the default) and AI provider. You can revisit both settings with `seed config`.
Use `seed --setup` (or `npm run dev -- --setup`) to reopen the first-run wizard at any time.

## Quick start

```bash
npm install
npm run build
node dist/cli/index.js "A tool that helps developers understand unfamiliar repositories"
node dist/cli/index.js grow --answer "Start with a map of the repository and its execution flow"
node dist/cli/index.js bloom
node dist/cli/index.js harvest idea
```

The package is not published under the unscoped `seed` name (that name belongs to another npm package). From this repository, run the CLI with:

```bash
npm exec --package . -- seed --help
# or, directly from the current GitHub branch:
npx --yes --package github:hs-hui/seed#feat/seed-mvp-bootstrap seed --help
```

After publishing the scoped package, use either `npx @seed-cli/seed` or the explicit binary form:

```bash
npm install @seed-cli/seed
npx seed
```

For a one-off run without adding it to your project:

```bash
npx --yes --package @seed-cli/seed seed
```

Bare `npx seed` only resolves this CLI when `@seed-cli/seed` is already installed locally (or linked); otherwise npm resolves the unrelated unscoped `seed` package.

The CLI defaults to English. Use `--lang ko` or `SEED_LANG=ko` for Korean UI. The first interactive run asks for both language and provider; `seed --setup` opens that wizard again. AI responses follow the selected language, including the local fallback.

In interactive mode, `seed` and `seed grow` keep the question → answer → summary loop running until the seed has enough essential context. Press Enter on an empty answer to pause and resume later with `seed grow`.

## AI providers

API keys are read from environment variables and are never written to `.seed/` or the config file:

```bash
# OpenAI (official API-key flow)
OPENAI_API_KEY=sk-...
seed config set provider openai

# Gemini or Claude
SEED_GEMINI_API_KEY=...
seed config set provider gemini
SEED_ANTHROPIC_API_KEY=...
seed config set provider anthropic
```

Run `seed config test` to check that the active provider has a usable credential. If a key is missing or a request fails, Seed keeps the deterministic local fallback available so the idea is not lost.

OpenAI account login is also exposed for the PRD flow:

```bash
seed config login openai
```

This opens the local browser OAuth flow provided by `openai-oauth` and stores credentials in `~/.seed/oauth/openai.json` (override with `SEED_OPENAI_AUTH_FILE`). If an older login exists in `~/.codex/auth.json`, Seed copies it to the Seed path automatically. It does not require you to create a Client ID. You can also run `npx openai-oauth login` directly, then Seed will import the credentials on first use. For ChatGPT-account OAuth, Seed defaults to the supported `gpt-5.4-mini` model; you can change it with `seed config set model <model>`.

The supported, documented OpenAI API path is still an API key; a ChatGPT subscription and API billing are separate.

## MVP commands

`seed`, `grow`, `branch`, `prune`, `bloom`, `tree`, `history`, `harvest idea|brief|prd|trd|readme|prompt|all`, and `config` are included. `water`, `sunlight`, `evolve`, lifecycle commands, and remote sync are intentionally left for later phases described in `PRD.md` and `TRD.md`.

## Development

```bash
npm run build
npm test
npm run dev -- --help
```

MIT © Seed contributors
