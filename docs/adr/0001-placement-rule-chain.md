# Placement is one server rule chain; order is the page's

Thread placement was written twice (`buildTree` and `buildLinearTree`), with two different launch-nesting conditions, and the fixed places of Reviews and "No issue key" were coded in five places that the page found by label text. We replace this with one ordered chain of placement rules (Map group, Reviews, PR stack, Issue key, Launch nesting) that runs on the server in one module, `place(input, rules, layout)`. Each rule claims threads from a pool, the first claim wins, and a project layout or a Linear layout turns the claims into groups. The page sends the rule switches and order on `/events`, and owns everything that orders a built list: drag order, filters, sort, sections and pins. Placement is cheap (under 1 ms for a build), so the rule settings can join the stream cache key with no runtime cost worth work.

## Considered Options

- **Rules on the page.** Rejected: only the server has the facts that placement needs (stack slots, spawner chain, map keys), and the page would need a second copy of them.
- **A rule that claims one thread.** Rejected: the map rule moves the keyless stack mates of a member, and the Linear stack placer moves a whole stack, so a rule claims a set.
- **Fixed places as a layout fact** (Reviews first and "No issue key" last in each project). Rejected: Reviews is an ordinary group that the user can pin, and an unclaimed thread is a loose thread in the same list as the groups.
- **Pins as a placement rule.** Rejected: a pin never moves an item to another list; it only orders a list that the chain built, so it stays on the page.
- **Keep the saved drag order per rule setting.** Rejected: a rule change can give a group a new id, and `prune` then drops the saved order of that list. This is accepted.

## Consequences

- Map group is always first, because it adds Map headers that later rules place. Launch nesting is always last, because it needs the place of the spawner. Only the three middle rules reorder.
- One nest condition, "the thread and its spawner have the same home", replaces the two conditions of today. The tests must show no change in the default placement.
