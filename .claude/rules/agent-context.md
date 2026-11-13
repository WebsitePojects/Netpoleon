# Agent context — where knowledge lives and how to keep it current

> Auto-loaded. For every AI agent and every human working here. The aim: a newcomer with no
> chat history can find any fact, and nothing important exists only in someone's conversation.

## Where each kind of knowledge is written down

| Kind | Home | Rule |
|---|---|---|
| What the client was promised | `.claude/rules/domain.md` | Changes only when the proposal changes |
| Decisions and their reasons | `docs/superpowers/specs/*.md` | Marked `[USER]` or `[CALL]`; a changed decision gets a dated note, the old text is not silently rewritten |
| What to build next, step by step | `docs/superpowers/plans/*.md` | Tick the checkbox when a step is verified, not when it is written |
| How the code is organised | `.claude/rules/architecture.md` | Update in the same commit as a structural change |
| Working rules | `.claude/rules/conventions.md` and the three non-negotiable rule files | — |
| Mistakes and gotchas | `.claude/rules/lessons.md` | Append-only, newest on top |
| What changed and when | git history | One logical change per commit, message says why |
| How the code connects | `graphify-out/` | Rebuilt after structural changes, committed |
| How to deploy and operate | `docs/DEPLOY-vps.md`, `docs/RUNBOOK.md` | Environment variable names in prose, never values |

If a fact has no home in this table, it belongs in `lessons.md` until a pattern emerges.

## The code map: `graphify-out/`
A knowledge graph of the repository, built by the `graphify` tool and committed so every agent
starts with the same map instead of re-reading the tree.

- `graphify-out/GRAPH_REPORT.md` — read this first: the most connected nodes, the clusters,
  the surprising links.
- `graphify-out/graph.json` — the graph itself, for queries.
- `graphify-out/graph.html` — the same graph for a human, opened in a browser.

**Before exploring the codebase**, ask the graph: `graphify query "<question>"`,
`graphify path "<A>" "<B>"`, `graphify explain "<node>"`. Fall back to reading files only for
what the graph cannot answer. The graph tells you where to look; the file is still the truth.

**After a structural change** (new module, package, table, or a moved file), run
`graphify . --update` from the repository root and commit the three files above together with
the change. A stale map is worse than none, because it is trusted.

Only those three files are tracked. Everything else in `graphify-out/` is a per-machine cache
or holds absolute local paths, and is ignored by git.

## Before ending a session that changed code
1. Tests, lint and type-check ran, and the real output was read.
2. `lessons.md` has an entry — a lesson, or one honest line saying there was none.
3. `architecture.md` and the graph match the code if structure changed.
4. Plan checkboxes reflect what is verified.
5. Nothing needed to continue the work exists only in the conversation.
