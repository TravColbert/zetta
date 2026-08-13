import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIDGET_PATH = join(
  __dirname,
  "..",
  "articles",
  "public",
  "js",
  "widget.js",
);

// The widget's styling is a CSS string inside the script, so these read it as
// text. They guard the contract a custom template relies on; the cascade
// itself needs a browser and is checked by hand.
const source = readFileSync(WIDGET_PATH, "utf8");
const css = source.match(/const CSS = `([\s\S]*?)`;/)[1];

// The rules, with the two blocks that are allowed to hold literal colors
// removed. The media query goes first: it is stripped while its nested :root
// still gives it a closing pair to match on.
const withoutDefaults = css
  .replace(/@media[\s\S]*?\}\s*\}/g, "")
  .replace(/:root\s*\{[\s\S]*?\}/g, "");

describe("widget stylesheet", () => {
  test("is balanced CSS", () => {
    const open = (css.match(/\{/g) ?? []).length;
    const close = (css.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
  });

  test("goes in ahead of the page stylesheet so the page can override it", () => {
    expect(source).toContain("document.head.prepend(");
    expect(source).not.toContain("document.head.append(");
  });

  test("uses no cascade layer", () => {
    // A layer would drop these rules below an unlayered reset such as
    // `* { padding: 0 }` in the blog's stylesheet, stripping the widget's
    // spacing. Source order gives the same override without that cost.
    expect(css).not.toContain("@layer");
  });

  test("keeps its own spacing above a universal reset", () => {
    // Every padded rule must out-specify `*`, which is what the stock
    // stylesheet zeroes padding with.
    for (const selector of [".zai-log", ".zai-form", ".zai-head", ".zai-msg"]) {
      const rule = css.match(
        new RegExp(`\\${selector}[^{]*\\{[^}]*\\}`),
      )[0];
      expect(rule).toMatch(/padding:/);
    }
  });

  test("defines every variable it uses", () => {
    const defined = new Set(
      [...css.matchAll(/(--zai-[a-z-]+)\s*:/g)].map((match) => match[1]),
    );
    const used = [...css.matchAll(/var\((--zai-[a-z-]+)/g)].map(
      (match) => match[1],
    );

    expect(used.length).toBeGreaterThan(0);
    for (const variable of used) {
      expect(defined).toContain(variable);
    }
  });

  test("keeps literal colors out of the rules themselves", () => {
    expect(withoutDefaults.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(withoutDefaults.match(/\brgba?\(/g)).toBeNull();
  });

  test("routes the launcher, send button and user bubble through one variable", () => {
    for (const selector of [
      /\.zai-launcher\s*\{[^}]*\}/,
      /\.zai-send\s*\{[^}]*\}/,
      /\.zai-msg\[data-role="user"\]\s*\{[^}]*\}/,
    ]) {
      expect(css.match(selector)[0]).toContain("var(--zai-accent-bg)");
    }
  });

  test("inherits the page font and text color by default", () => {
    expect(css).toContain("--zai-font: inherit");
    expect(css).toContain("--zai-fg: inherit");
  });

  test("avoids the font shorthand where the family may be inherit", () => {
    // `font: 15px/1.5 inherit` is invalid, so these two must set font-family
    // separately or --zai-font: inherit silently breaks them.
    for (const selector of [/\.zai-launcher\s*\{[^}]*\}/, /\.zai-panel\s*\{[^}]*\}/]) {
      const rule = css.match(selector)[0];
      expect(rule).not.toMatch(/\bfont:\s/);
      expect(rule).toContain("font-family: var(--zai-font)");
    }
  });

  test("sizes the panel from variables so a theme can resize it", () => {
    const panel = css.match(/\.zai-panel\s*\{[^}]*\}/)[0];
    expect(panel).toContain("var(--zai-width)");
    expect(panel).toContain("var(--zai-height)");
    expect(panel).toContain("var(--zai-radius)");
    expect(panel).toContain("var(--zai-offset)");
  });
});

describe("widget script tag contract", () => {
  test("reads the greeting and label the layout supplies", () => {
    expect(source).toContain("script?.dataset.greeting");
    expect(source).toContain("script?.dataset.label");
  });
});
