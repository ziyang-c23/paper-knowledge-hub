# Paper Knowledge Hub agent contract · V2

This independent repository owns its code, public source, schema, tests and local workspace. Do not modify other research repositories or publish remotely without authorization.

- Read docs/data-model.md, docs/authoring.md and docs/v2-storage.md before data changes. Check whether private/workspace.json exists: it is authoritative once initialized; content/ is only the pre-initialization public template source. Never silently reinitialize or overwrite a local store from seeds.
- Keep one paper body in its JSON note field. Never hand-edit generated/public.json, dist, graph nodes, counts or a competing Markdown body. Local saving updates the workspace directly; public builds are separate derived output.
- Use the workspace API/CLI for persistent updates: full validated record, stable ID, expectedRevision and lock. CLI writes are dry-run unless --write. Preserve omitted unrelated fields when merging input. Do not change an ID to evade DOI/arXiv/title conflicts.
- All initialized objects default private. Store attachments and personal facts under ignored private/. Never put credentials or personal analysis in content, public note, config, logs, screenshots for distribution or fixtures. personalAnalysis is always excluded from publication.
- Minimum paper fields are schemaVersion, id, title, year, authors, url, visibility; empty authors means not yet recorded. Keep unknown optional data absent. lifecycle draft/active/archived is separate from reading status. Default local views exclude archived; public projection accepts only active public papers.
- New or changed public records require explicit publish consent. Publish related objects only within user-authorized scope; never make private dependencies public merely to satisfy a graph or test. Public builds, exports and source packages must use the current authoritative projection, not stale seeds.
- Browsers have two explicit modes: local complete dataset via protected loopback API, and static public projection. Never send local-only dataset, personalAnalysis or PDF chunks to the model provider. The gateway retrieves public evidence itself, checks consent and filters, and validates citation IDs.
- Source evidence requires material actually read. Preserve version and real locator or omit it. PDF pageIndex is a one-based file ordinal, not an inferred printed page number. Extracted text remains unreviewed; table/formula/layout quality warnings matter.
- Separate paper claims, curator synthesis, model candidates and measured runtime facts. Relations cite evidenceIds; approved requires verified evidence and source/curator origin. cites does not mean uses or extends. Pending/rejected and model/similarity candidates never drive approved expansion.
- Use centralized concepts/dimensions/aliases and stable references. Do not replace another repository's taxonomy. Awesome exports are reviewable candidate text, not permission to edit or publish elsewhere.
- Backup/restore includes the local store, selected document originals/text and site config; source ZIP is not a private backup. Keep recovery before replacement. Never delete a stale lock without verifying that no writer remains active.
- Keep dataset schemaVersion 1 for compatible optional additions; local envelope storeVersion is 2. Design explicit migration for breaking changes. Preserve original seed manifest unless intentionally changing seed source; tests own synthetic fixtures and isolated temp libraries, not user data.
- Run focused tests and builds; for UI changes run relevant browser scenarios and inspect actual screenshots. Distinguish V1 historical example checks from current V2 acceptance. Model mocks and configured status are not live-provider verification. Do not claim push/deployment/reproduction without its actual evidence.
- Do not commit, push, deploy, send external messages or mutate unrelated repositories merely because a command exists in documentation.

## Current product and skills

- Shared navigation/layout: `src/ui.jsx` and `src/ui.css`; domain pages reuse the existing storage APIs. Five primary areas: workbench, knowledge, topics, explore, settings.
- `npm run build` then `npm run local` serves the full local workspace at 4176. `npm run dev` is public projection development, not the private library.
- `.agents/skills/paper-knowledge-hub/SKILL.md`: paper intake and editing.
- `.agents/skills/hub-entities/SKILL.md`: entity identity and evidence relations.
- `.agents/skills/hub-study/SKILL.md`: topic synthesis and local exports.
- Agent drafts: `npm run ai:draft -- FILE --collection COLLECTION --stage`; browser inbox `#/drafts`. Data writes still use putRecord and revision locks. Read `docs/ai-workflows.md` for the contract.
- `npm run study:export -- --ids ID1,ID2 --out private/exports/comparison.md` exports local materials; the existing export command stays public-only.
