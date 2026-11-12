# Wayfinder tracker (local markdown)

- `map.md` is the map (label `wayfinder:map`).
- `tickets/NNN-slug.md` are the map's child tickets. `NNN` is the ticket id.
- Frontmatter fields per ticket:
  - `id`, `title`
  - `type`: `research` | `prototype` | `grilling` | `task` (the `wayfinder:<type>` label)
  - `status`: `open` | `closed`
  - `assignee`: empty = unclaimed. A session claims a ticket by writing its name here first.
  - `blocked_by`: list of ticket ids. No native blocking exists, so this field is the blocking edge.
- **Frontier**: `status: open`, empty `assignee`, and every id in `blocked_by` is `closed`.
- A resolution goes in a `## Resolution` section at the end of the ticket (the "resolution comment"), then `status: closed`.
- Research findings live on a `research/<name>` branch under `research/`. The ticket links to them.
