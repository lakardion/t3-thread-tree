---
name: local-release
description: Release t3-thread-tree from a local build, end to end: sync main, check, bump, push, build and publish the GitHub release, then settle the thread. Use when asked to release, cut a version, or ship main.
argument-hint: "[patch|minor|major|X.Y.Z]"
---

# Local release

Work in the main checkout on `main`. Do each step in order. Stop at the first failed step, report the error verbatim, and leave the thread active.

## 1. Sync

Make `main` equal `origin/main` with no tracked changes.

- `git fetch origin --tags` (releases create their tags on GitHub, so local tags lag), then `git status` and `git log origin/main..main`.
- Uncommitted tracked changes: `git stash push -m "local-release"`.
- Local-only commits: put them on a branch (`git branch release-aside/<short-name>`), then `git reset --hard origin/main`.
- `git pull --ff-only origin main` to take the latest main.
- Untracked files (`.claude/`, ignored worktrees) stay where they are.

**Done when** `git rev-parse main` equals `git rev-parse origin/main` and `git status --short --untracked-files=no` is empty. Record each stash and branch you made: the report needs them.

## 2. Check

`bun run check` scans ignored folders such as `.worktrees/` and fails on files outside the repo. Run the same checks on tracked files only:

```sh
bun install
git ls-files -z | xargs -0 bunx oxfmt --check --disable-nested-config
git ls-files -z '*.ts' '*.tsx' '*.js' '*.jsx' | xargs -0 bunx oxlint --deny-warnings --disable-nested-config
bun run typecheck
bun test
```

**Done when** all five commands exit 0.

## 3. Version

The argument sets the version. With no argument, read `git log v<current>..HEAD --oneline`:

- **minor** if a commit adds a capability the user did not have before.
- **patch** if every commit fixes, tunes or documents existing behavior.

**Done when** you have the new `X.Y.Z` and one sentence that explains the choice.

## 4. Commit and push

Set `version` in `package.json` to `X.Y.Z`. Commit it as `Release X.Y.Z` and `git push origin main`. The push bypasses the required `check` rule on main; that is expected.

The release script tags `HEAD` on GitHub, so the commit must be on origin before step 5.

**Done when** `git log origin/main -1 --stat` shows `Release X.Y.Z` with `package.json` as the only file, and its parent is the `origin/main` from step 1.

## 5. Release

Run `bun run release` with a Bash timeout of 600000. The build takes about three minutes.

These lines are expected noise: ad-hoc signing (`identityName=-`), the `disable-library-validation` entitlement note, "skipped macOS notarization", and "description/author is missed in the package.json".

**Done when** the script exits 0.

## 6. Verify

```sh
gh release view vX.Y.Z --json isDraft,tagName,targetCommitish,url,assets --jq '{url, isDraft, tagName, assets: [.assets[].name]}'
```

**Done when** `isDraft` is false and the assets hold one `.dmg` and one `.zip` for `X.Y.Z`.

## 7. Restore and report

Put aside work back: `git cherry-pick` each set-aside branch onto `main` (leave it unpushed), then `git stash pop`. A conflict stays unresolved for the user.

Report:

- the release URL, the version and the reason for the bump;
- the uploaded asset names;
- each build line that is not expected noise;
- each stash, branch or cherry-pick from steps 1 and 7, and its state now.

## 8. Settle

Settle this thread with `t3_thread_organize` (`action: "settle"`, no `threadId`) in the same turn as the report. The settle applies at turn end.

Settle only when step 6 passed and step 7 restored all put-aside work cleanly. A conflict or a stash left in place keeps the thread active, so the user sees it.
