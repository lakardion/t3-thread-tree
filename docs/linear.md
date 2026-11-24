# Linear setup

The app can do two things with [Linear](https://linear.app):

- **Links.** An issue key in a thread title, such as `ENG-123`, links to its Linear issue. This needs your workspace name.
- **Grouping.** The tree can group threads by Linear project and milestone. This also needs a Linear API key.

## Link issue keys

1. Find your workspace slug. It is the first part of the path in a Linear URL: `linear.app/<workspace>/…`.
2. In the app, open Settings › **Linear links**.
3. Type the workspace slug.
4. Optional: type the team keys, for example `ENG, OPS`. Then only the keys of these teams link. With no team keys, each issue key links.

The page keeps these values in the browser storage of the app.

## Group by Linear project

1. In Linear, go to `linear.app/settings/account/security`.
2. Make a new personal API key.
3. In the app, open Settings › **Linear links**, paste the key in the API key field and click Save.
4. In the header, open the **Group by** menu and pick **Linear project**.

The fold shows "Key set" when the key works and "Key rejected" when Linear refuses it. The app keeps the key in a file with mode `0600`:

- Desktop app: `~/Library/Application Support/T3 Thread Tree/linear-key`
- From source: `~/.config/t3-thread-tree/linear-key`

The app asks Linear for new data every 10 minutes.

## Defaults from a `.env` file

A `.env` file gives default values. A value saved in Settings wins. Put the file in `~/Library/Application Support/T3 Thread Tree/` for the desktop app, or in the repo when you run from source.

```sh
LINEAR_WORKSPACE=acme      # the slug in linear.app/<workspace>
LINEAR_TEAMS=ENG,OPS       # optional: link only the keys of these teams
LINEAR_API_KEY=lin_api_…   # optional: for grouping
```

Restart the app after you change the file.
