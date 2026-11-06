# AGENTS.md — rules for every agent working on WebFM

## Mission

Rebuild Framer's editor as WebFM, from scratch. Framer's editor is the spec:
someone who knows Framer must find controls, panels, terminology and workflows
where they expect them, behaving the way they expect. Never guess UI facts that
can be verified against the live editor.

## Hard limits

1. **Framer is read-only.** Only the designated reference agent may use the
   browser against Framer, and only its one scratch project. Never modify another
   project, publish, delete, invite, or change account settings.
2. **Only this repository.** Do not edit files in other workspace projects,
   including `Projects/moreweb-services`, `Projects/OpenRemote`, or the workspace
   root. Scratch reference material may go to `.reference/` (gitignored).
3. **No deletions or force-pushes.** Never `git push --force`, `git reset --hard`
   on shared branches, or delete branches/records you did not create.
4. **No committed secrets.** Tokens, keys, passwords, cookies, `.env` files and
   account data never enter the repository.
5. **One browser agent at a time.** Do not open the browser while another agent
   is using it. The lead serializes browser work.

## Working process

- `main` always builds and passes tests. Work happens on a branch
  (`feat/<area>`, `fix/<area>`) and merges only after `npm run check` is green.
- Agents do **not** commit or push unless the lead explicitly asks. The lead
  verifies and commits.
- Keep changes inside the files assigned to you. If a change requires touching
  another area, report it instead of editing.
- Add or update unit tests for behavior you implement. Unit tests are the merge
  gate; browser verification is done by the lead.
- No new dependencies without the lead's approval. Prefer what is installed.

## Shared record

Every substantial change reports its state delta to the lead. The lead is the
only writer of `docs/STATE.md`, so concurrent agents never edit the same file.
Append to `docs/DECISIONS.md` only when the lead asks for a decision record.

If you discover a fact about Framer that contradicts a documented assumption,
record the verified fact in `docs/FRAMER-REFERENCE.md` and flag it in your report.

## File ownership

The lead assigns paths per task. Default boundaries:

| Area | Owner path |
| --- | --- |
| Document model | `packages/model/` |
| Renderer | `packages/render/` |
| Publishing | `packages/publish/` |
| API/server | `apps/server/` |
| Editor | `apps/editor/` |
| Docs/root config | lead only |

Do not edit root config (`package.json`, `tsconfig.json`, `vitest.config.ts`,
CI) unless the lead assigns it.

## Code conventions

- TypeScript strict mode; no `any` unless justified and localized.
- Model and publish packages are DOM-free and framework-free except where React
  rendering is explicitly required (`packages/render`).
- Prefer pure functions and plain JSON. Every persisted structure carries
  `schemaVersion`.
- User-visible Framer terminology is fixed: Frame, Stack, Text, Image, Page,
  Layers, Insert, Assets, Breakpoint, Component, Variant, Preview, Publish.
- UI copy is sentence case, matching Framer where it has a label.
- Keep the editor fast: no work in render loops that can be derived once.

## Report format

A subagent's final message is data for the lead, not prose for a human. Return:

1. Files created/changed.
2. What is implemented and what is deliberately not.
3. Tests added and commands run with results.
4. Verified facts, assumptions, and open questions.
5. Anything that needs the lead's integration or a decision.
