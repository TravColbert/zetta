import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { cpSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const THEME_DIR = join(__dirname, "fixtures", "theme");
const ARTICLE_FIXTURES = join(__dirname, "fixtures", "articles");
const AI_FIXTURES = join(__dirname, "fixtures", "ai");
const WORK_DIR = join(ROOT, "tests", ".work", "theme-run");
const ARTICLES_DIR = join(WORK_DIR, "articles");

// The theme a site renders with is decided when lib/config.js is imported, and
// every test file in a `bun test` run shares one process and therefore one copy
// of it. So this file drives a server in a subprocess, which is also the only
// way to exercise the whole path from CUSTOM_THEME to the bytes on the wire.
//
// The fixture theme is deliberately partial. It has a layout, one content
// partial and one stylesheet; it has no js/ at all, no partials/tag-list.html
// and no css/reset.css. Each of those gaps is a fall-through to the built-in
// theme that a real theme relies on.

let proc;
let BASE;

function setupArticles() {
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(ARTICLES_DIR, { recursive: true });
  for (const name of ["valid-article.js", "xss-metadata.js", "about.js"]) {
    cpSync(join(ARTICLE_FIXTURES, name), join(ARTICLES_DIR, name));
  }
  // Turns the chat on, so {{chatWidget}} has something to render.
  cpSync(join(AI_FIXTURES, "valid.js"), join(ARTICLES_DIR, "ai.js"));
}

async function startServer() {
  proc = Bun.spawn(["bun", "run", "server.js"], {
    cwd: ROOT,
    // Passed explicitly rather than inherited: a real .env in the project root
    // is loaded by the subprocess too, and these have to win over it.
    env: {
      ...process.env,
      PORT: "0",
      TEMPLATE_DIR: THEME_DIR,
      ARTICLES_DIR,
      ARTICLES_REPO_URL: "",
      TEMPLATES_REPO_URL: "",
      ANTHROPIC_API_KEY: "test-key",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  // The server logs NDJSON to stdout and its start line carries the port it was
  // given, which is how a PORT of 0 becomes a usable address. One reader is held
  // for the life of the server and keeps reading after the port is found: access
  // logs keep coming, and a pipe that is closed or left to fill up takes the
  // server down with it on the next line it writes.
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let base = null;

  while (base === null) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.msg === "server started") base = `http://localhost:${entry.port}`;
    }
  }

  if (base === null) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`server exited before it started listening: ${stderr}`);
  }

  keepDraining(reader);
  return base;
}

async function keepDraining(reader) {
  try {
    while (!(await reader.read()).done);
  } catch {
    // Expected: the stream ends when the server is killed in afterAll.
  }
}

beforeAll(async () => {
  setupArticles();
  BASE = await startServer();
});

afterAll(() => {
  proc?.kill();
  rmSync(WORK_DIR, { recursive: true, force: true });
});

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, type: res.headers.get("content-type"), body: await res.text() };
}

describe("a custom theme's layout", () => {
  test("layout.html replaces the built-in layout", async () => {
    const page = await get("/articles/valid-article");
    expect(page.status).toBe(200);
    expect(page.body).toContain('data-fixture-theme="yes"');
    // The marker the built-in JS layout would have left.
    expect(page.body).not.toContain("— Zetta</title>");
  });

  test("resolves {{> partial}} from the theme's own directory", async () => {
    const page = await get("/articles/valid-article");
    expect(page.body).toContain(":: fixture theme</title>");
  });

  test("fills in the page placeholders", async () => {
    const page = await get("/articles/valid-article");
    expect(page.body).toContain('data-slug="valid-article"');
    expect(page.body).toContain("Valid Test Article :: fixture theme");
    expect(page.body).toContain('name="keywords" content="testing, fixtures"');
    expect(page.body).toContain(
      'name="description" content="A test article for the suite."',
    );
  });

  test("renders the chat widget where {{chatWidget}} appears", async () => {
    const page = await get("/articles/valid-article");
    expect(page.body).toContain('<script src="/js/widget.js"');
  });

  test("escapes metadata that would otherwise break out of its tag", async () => {
    const page = await get("/articles/xss-metadata");
    expect(page.status).toBe(200);
    expect(page.body).not.toContain("<script>alert(1)</script>");
    expect(page.body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("a custom theme's partials", () => {
  test("a partial the theme supplies wins over the built-in one", async () => {
    const page = await get("/articles/valid-article");
    expect(page.body).toContain('class="fixture-article"');
  });

  test("a partial the theme leaves out falls back to the built-in one", async () => {
    const page = await get("/tags");
    expect(page.status).toBe(200);
    // From templates/default/partials/tag-list.html, which the fixture theme
    // has no version of.
    expect(page.body).toContain('class="tag-list"');
    expect(page.body).toContain("fixtures");
  });
});

describe("a custom theme's assets", () => {
  test("serves a stylesheet the theme owns", async () => {
    const css = await get("/css/theme.css");
    expect(css.status).toBe(200);
    expect(css.type).toBe("text/css");
    expect(css.body).toContain("rebeccapurple");
  });

  test("falls back to the built-in theme for a stylesheet it lacks", async () => {
    const css = await get("/css/reset.css");
    expect(css.status).toBe(200);
    expect(css.type).toBe("text/css");
  });

  test("falls back to the built-in theme for the chat widget script", async () => {
    const js = await get("/js/widget.js");
    expect(js.status).toBe(200);
    expect(js.type).toBe("application/javascript");
    expect(js.body).toContain("const CSS = `");
  });

  test("still 404s for an asset neither theme has", async () => {
    expect((await get("/css/nope.css")).status).toBe(404);
    expect((await get("/js/nope.js")).status).toBe(404);
  });
});
