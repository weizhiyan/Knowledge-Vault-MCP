# Changelog

## v0.3.0

### Added

- Added AI context trigger planning based on `项目`, `别名`, `触发词`, `标签`, `类型`, and `读取优先级`.
- Added context planning tools:
  - `knowledge.contextRules`
  - `knowledge.planContext`
  - `knowledge.loadContextPlan`
- Added `kb.routeContext` built-in skill guidance.

## v0.2.0

### Added

- Added UI-ready Markdown document browsing tools:
  - `knowledge.documents`
  - `knowledge.readDocumentForUi`
- Added AI selection editing protocol:
  - `knowledge.prepareEdit`
  - `knowledge.previewEdit`
  - `knowledge.applyEdit`
- Added project attachment management with Markdown embeds:
  - `knowledge.attachAsset`
- Added `AI索引.md` as the standard project AI index filename.
- Added compatibility for legacy `_AI索引.md` project files.

### Documented

- Architecture and responsibility boundaries.
- Core knowledge-base principles.
- Built-in skills table.
- Main MCP tools table.
- UI integration interfaces for a future Markdown editor.

### Validation

- `npm run typecheck`
- `npm run build`
- Temporary vault acceptance tests for document browsing, assets, selection editing, diff preview, confirm writes, duplicate selections, line range edits, and stale hash protection.
