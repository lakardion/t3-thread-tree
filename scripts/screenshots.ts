/** Writes the framed README screenshots to `docs/` from the demo data. Needs Google Chrome. */
import { chromium, type Page } from "playwright-core";

const PORT = 4799;
const BASE = `http://127.0.0.1:${PORT}`;

type Shot = {
  file: string;
  title: string;
  sub: string;
  theme: "light" | "dark";
  /** Brings the page to the state the shot shows. */
  setup?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    file: "hero",
    title: "Every T3 thread in one live tree",
    sub: "Project › issue key › thread, with a status and PR marks on each row.",
    theme: "light",
  },
  {
    file: "needs-you",
    title: "See what each thread needs from you",
    sub: "The Catch-up line tells you what the thread did and what it asks.",
    theme: "dark",
    setup: (page) => page.getByLabel(/^Needs you/).click(),
  },
  {
    file: "triage",
    title: "Answer waiting threads one card at a time",
    sub: "Reply, pick a chip, settle or snooze, all from the keyboard.",
    theme: "dark",
    /** Skips to the card with a question and answer chips. */
    setup: async (page) => {
      await page.keyboard.press("t");
      for (let i = 0; i < 30 && !(await page.getByText("At once or Only when picked").isVisible()); i++)
        await page.getByRole("button", { name: /^Skip/ }).click();
    },
  },
];

const frame = (shot: Shot, png: Buffer) => `<!doctype html>
<style>
  body { margin: 0; font-family: -apple-system, "SF Pro Display", system-ui, sans-serif; }
  #frame {
    width: 1440px; box-sizing: border-box; padding: 72px 80px 0; overflow: hidden; text-align: center;
    background: ${shot.theme === "light" ? "linear-gradient(135deg, #dbeafe, #ede9fe 50%, #fce7f3)" : "linear-gradient(135deg, #0f172a, #312e81 55%, #581c87)"};
    color: ${shot.theme === "light" ? "#0f172a" : "#f8fafc"};
  }
  h1 { margin: 0; font-size: 48px; font-weight: 700; letter-spacing: -0.02em; }
  p { margin: 14px 0 48px; font-size: 22px; opacity: 0.7; }
  .window {
    border-radius: 14px 14px 0 0; overflow: hidden; text-align: left;
    background: ${shot.theme === "light" ? "#f8fafc" : "#0b0b0c"};
    box-shadow: 0 30px 80px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(127, 127, 127, 0.25);
  }
  .bar { height: 36px; display: flex; gap: 8px; align-items: center; padding: 0 14px; }
  .bar i { width: 12px; height: 12px; border-radius: 50%; }
  img { display: block; width: 100%; mask-image: linear-gradient(to bottom, black 80%, transparent); }
</style>
<div id="frame">
  <h1>${shot.title}</h1>
  <p>${shot.sub}</p>
  <div class="window">
    <div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
    <img src="data:image/png;base64,${png.toString("base64")}">
  </div>
</div>`;

const demo = Bun.spawn(["bun", "run", "scripts/demo.ts"], {
  /** Keeps the dev-only Retouche overlay out of screenshots. */
  env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
  stdout: "ignore",
});
const browser = await chromium.launch({ channel: "chrome" });
try {
  while (!(await fetch(BASE).catch(() => null))?.ok) await Bun.sleep(200);
  /** Turns the Catch-up on, so the rows show their Catch-up lines. */
  await fetch(`${BASE}/model-pick`, { method: "PUT", body: JSON.stringify({ pick: "claude" }) });

  for (const shot of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
    await ctx.addInitScript((theme) => localStorage.setItem("thread-tree:theme", theme), shot.theme);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.getByText("Thread tree").first().waitFor();
    await shot.setup?.(page);
    await page.waitForTimeout(500);
    const png = await page.screenshot();

    await page.setViewportSize({ width: 1440, height: 800 });
    await page.setContent(frame(shot, png));
    await page.locator("#frame").screenshot({ path: `docs/${shot.file}.png` });
    await ctx.close();
    console.log(`docs/${shot.file}.png`);
  }
} finally {
  await browser.close();
  demo.kill();
}
