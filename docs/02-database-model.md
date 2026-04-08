# GraphCore Database Model

Supabase tables are organized around collaborative authoring:

- `workspaces`, `workspace_memberships`
- `projects`, `project_drafts`
- `project_definitions`, `project_definition_components`
- `draft_graphs`, `draft_graph_nodes`, `draft_graph_edges`
- `project_assets`
- `patch_sets`, `compile_jobs`, `releases`, `audit_events`, `draft_presence`

All authored keys are unique per draft or project and act as the stable cross-engine identifier.
