# AGENTS.md

Instructions for any AI coding agent working in this repository (Codex, Cursor, Gemini, Copilot
and others). Claude Code reads `CLAUDE.md`, which loads the same rule files automatically. Other
agents do not auto-load them, so **read these before touching code**, in this order:

1. `.claude/rules/agent-context.md` — where every kind of knowledge lives, and the code map.
2. `.claude/rules/domain.md` — what the client was promised.
3. `.claude/rules/architecture.md` — how the code is organised and the rules that keep it so.
4. `.claude/rules/conventions.md` — how work is done and verified here.
5. `.claude/rules/idempotency-concurrency.md` — non-negotiable: no double submits, duplicate-safe endpoints.
6. `.claude/rules/engineering-standards.md` — non-negotiable: clean, efficient, reviewed code.
7. `.claude/rules/vps-safety.md` — non-negotiable: before any command meant for a server.
8. `.claude/rules/lessons.md` — mistakes already made here. Do not repeat them.

Then the current work: the newest file in `docs/superpowers/plans/`, and the spec it names.

## What this is
Netpoleon WMS — an ICT equipment warehouse and demo-asset management system built by Prince IT
Solutions OPC for Netpoleon / NSPH INC. Partners book demo units through a portal; staff
approve, release, receive, inspect and restock; every movement is recorded.

## Hard rules, in one place
- Never commit a file whose name starts with `.env`, including examples. Never write a secret,
  token or password into code, a test fixture, a log line or documentation.
- Never weaken a database guarantee listed in `architecture.md` to make a feature easier.
- Never edit an applied migration. Add a new one.
- Every mutating endpoint is duplicate-safe and ships with a double-fire test.
- Do not say something works unless you ran it and read the output.
- When you learn something the hard way, append it to `.claude/rules/lessons.md`.
- When you change structure, update `architecture.md` and rebuild `graphify-out/` in the same commit.

## Commands
See the Commands section of `CLAUDE.md`. It is the single list, kept current there.
