import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { Markdown } from "../src/page/markdown";

test("renders Markdown emphasis and GFM tables", () => {
  const text = "**a**\n\n| Header |\n| --- |\n| Cell |";
  const html = renderToStaticMarkup(<Markdown text={text} />);

  expect(html).toContain("<strong>a</strong>");
  expect(html).toContain("<td>Cell</td>");
});

test("omits raw HTML from the preview", () => {
  const html = renderToStaticMarkup(<Markdown text={"<script>alert(1)</script>"} />);

  expect(html).not.toContain("<script");
  expect(html).not.toContain("alert(1)");
});

test("renders link and image labels without interactive or remote content", () => {
  const text = "[Link](https://example.com) ![Image](https://example.com/image.png)";
  const html = renderToStaticMarkup(<Markdown text={text} />);

  expect(html).toContain("Link Image");
  expect(html).not.toContain("<a ");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("https://example.com");
});
