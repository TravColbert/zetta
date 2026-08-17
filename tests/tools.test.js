import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { cpSync, rmSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
// The articles directory is a scratch directory created by tests/setup.js, not
// the one in the working tree: these tests delete and rewrite its contents.
const ARTICLES_DIR = process.env.ARTICLES_DIR;
const ARTICLE_FIXTURES = join(__dirname, "fixtures", "articles");
const AI_FIXTURES = join(__dirname, "fixtures", "ai");

// Lays down a set of articles plus one ai.js config, then reloads both caches.
function setup({ articles = [], config = "valid.js", extras = [] }) {
  if (existsSync(ARTICLES_DIR)) {
    for (const f of readdirSync(ARTICLES_DIR)) {
      if (f === "public") continue;
      rmSync(join(ARTICLES_DIR, f), { recursive: true, force: true });
    }
  } else {
    mkdirSync(ARTICLES_DIR, { recursive: true });
  }

  for (const name of articles) {
    cpSync(join(ARTICLE_FIXTURES, name), join(ARTICLES_DIR, name));
  }
  for (const name of extras) {
    cpSync(join(AI_FIXTURES, name), join(ARTICLES_DIR, name));
  }
  cpSync(join(AI_FIXTURES, config), join(ARTICLES_DIR, "ai.js"));

  articlesMod.reloadArticles();
  aiMod.reloadAiConfig();
}

function toolNames() {
  return tools.getToolDefinitions().map((definition) => definition.name);
}

let tools;
let articlesMod;
let aiMod;

beforeAll(async () => {
  articlesMod = await import("../lib/articles.js");
  aiMod = await import("../lib/ai.js");
  tools = await import("../lib/tools.js");
});

describe("getToolDefinitions", () => {
  test("builds curated tools from the config", () => {
    setup({ articles: ["about.js"], extras: ["topics.md"] });

    expect(toolNames()).toEqual([
      "get_about",
      "check_topic_policy",
      "search_articles",
      "read_article",
    ]);
  });

  test("gives curated tools a focus parameter and the config description", () => {
    setup({ articles: ["about.js"], extras: ["topics.md"] });

    const about = tools
      .getToolDefinitions()
      .find((definition) => definition.name === "get_about");
    expect(about.description).toBe("Call this for the about document.");
    expect(about.input_schema.properties.focus.type).toBe("string");
    expect(about.input_schema.required).toBeUndefined();
  });

  test("search tools are available with no configured tools", () => {
    setup({ articles: ["about.js"], config: "no-prompt.js" });

    expect(toolNames()).toEqual(["search_articles", "read_article"]);
  });

  test("drops an entry whose article is not published", () => {
    setup({ articles: ["about.js"], config: "actions.js" });

    expect(toolNames()).toContain("get_about");
    expect(toolNames()).not.toContain("get_ghost");
  });

  test("drops an entry whose file is missing", () => {
    setup({ articles: ["about.js"], config: "actions.js" });

    expect(toolNames()).not.toContain("read_missing_file");
  });

  test("includes an action tool only when the config names it", () => {
    setup({ articles: ["about.js"], extras: ["topics.md"] });
    expect(toolNames()).not.toContain("leave_message");

    setup({ articles: ["about.js"], config: "actions.js" });
    expect(toolNames()).toContain("leave_message");
    expect(toolNames()).not.toContain("reserve_speaking_date");
  });
});

describe("getDocument", () => {
  test("returns an article with its title restored", () => {
    setup({ articles: ["about.js"], extras: ["topics.md"] });

    const document = tools.getDocument("get_about");
    expect(document).toStartWith("# About This Blog");
    expect(document).toContain("This is the about page.");
  });

  test("returns a file from the articles directory", () => {
    setup({ articles: ["about.js"], extras: ["topics.md"] });

    expect(tools.getDocument("check_topic_policy")).toContain(
      "Decline questions about the weather.",
    );
  });

  test("returns undefined for an unknown tool", () => {
    setup({ articles: ["about.js"], extras: ["topics.md"] });

    expect(tools.getDocument("get_nothing")).toBeUndefined();
  });

  test("returns undefined rather than throwing when the file is gone", () => {
    setup({ articles: ["about.js"], config: "actions.js" });

    expect(tools.getDocument("read_missing_file")).toBeUndefined();
  });
});

describe("searchArticles", () => {
  test("ranks a title-and-blurb match above a title-and-body match", () => {
    setup({ articles: ["valid-article.js", "tagless-article.js"] });

    // "article" is in both titles, but only valid-article also carries it in
    // its blurb, which is weighted above body text.
    const results = tools.searchArticles("article");
    expect(results.map((result) => result.slug)).toEqual([
      "valid-article",
      "tagless-article",
    ]);
  });

  test("matches tags and blurbs", () => {
    setup({ articles: ["valid-article.js", "tagless-article.js"] });

    expect(tools.searchArticles("fixtures")[0].slug).toBe("valid-article");
    expect(tools.searchArticles("suite")[0].slug).toBe("valid-article");
  });

  test("returns the fields the model needs", () => {
    setup({ articles: ["valid-article.js"] });

    expect(tools.searchArticles("hello")[0]).toEqual({
      slug: "valid-article",
      title: "Valid Test Article",
      blurb: "A test article for the suite.",
      publishedAt: "2025-06-15",
      tags: ["testing", "fixtures"],
    });
  });

  test("ignores terms shorter than two characters", () => {
    setup({ articles: ["valid-article.js"] });

    expect(tools.searchArticles("a")).toEqual([]);
    expect(tools.searchArticles("")).toEqual([]);
  });

  test("returns nothing when no article matches", () => {
    setup({ articles: ["valid-article.js"] });

    expect(tools.searchArticles("zzzznotpresent")).toEqual([]);
  });

  test("caps the result count", () => {
    setup({ articles: ["valid-article.js", "tagless-article.js"] });

    expect(tools.searchArticles("article").length).toBeLessThanOrEqual(
      tools.MAX_SEARCH_RESULTS,
    );
  });
});

describe("dispatchTool", () => {
  test("serves a curated document", () => {
    setup({ articles: ["about.js"], extras: ["topics.md"] });

    const { content, isError } = tools.dispatchTool("get_about", {});
    expect(isError).toBe(false);
    expect(content).toContain("This is the about page.");
  });

  test("serves search results as JSON", () => {
    setup({ articles: ["valid-article.js"] });

    const { content } = tools.dispatchTool("search_articles", {
      query: "hello",
    });
    expect(JSON.parse(content).results[0].slug).toBe("valid-article");
  });

  test("reads an article by slug", () => {
    setup({ articles: ["valid-article.js"] });

    const { content } = tools.dispatchTool("read_article", {
      slug: "valid-article",
    });
    expect(content).toStartWith("# Valid Test Article");
  });

  test("suggests slugs when read_article misses", () => {
    setup({ articles: ["valid-article.js"] });

    const { content, isError } = tools.dispatchTool("read_article", {
      slug: "nope",
    });
    const payload = JSON.parse(content);
    expect(isError).toBe(false);
    expect(payload.ok).toBe(false);
    expect(payload.try_instead).toContain("valid-article");
  });

  test("runs an enabled action and returns a reference", () => {
    setup({ articles: ["about.js"], config: "actions.js" });

    const { content, isError, record } = tools.dispatchTool("leave_message", {
      name: "Ada",
      email: "ada@example.com",
      message: "Hello there.",
    });
    const payload = JSON.parse(content);
    expect(isError).toBe(false);
    expect(payload.ok).toBe(true);
    expect(payload.reference).toStartWith("msg_");
    expect(record.email).toBe("ada@example.com");
  });

  test("reports validation failures without flagging an error", () => {
    setup({ articles: ["about.js"], config: "actions.js" });

    const { content, isError } = tools.dispatchTool("leave_message", {
      name: "Ada",
      email: "not-an-email",
      message: "Hello there.",
    });
    const payload = JSON.parse(content);
    expect(isError).toBe(false);
    expect(payload.ok).toBe(false);
    expect(payload.errors.join(" ")).toContain("not a valid email address");
  });

  test("refuses an action the config does not enable", () => {
    setup({ articles: ["about.js"], extras: ["topics.md"] });

    const { content, isError } = tools.dispatchTool("leave_message", {
      name: "Ada",
      email: "ada@example.com",
      message: "Hello there.",
    });
    expect(isError).toBe(true);
    expect(content).toContain("Unknown tool");
  });

  test("reports an unknown tool as an error", () => {
    setup({ articles: ["about.js"], extras: ["topics.md"] });

    const { content, isError } = tools.dispatchTool("no_such_tool", {});
    expect(isError).toBe(true);
    expect(content).toContain("Unknown tool");
  });
});

describe("validateToolInput", () => {
  const future = "2999-01-01";

  test("accepts a complete reservation", () => {
    expect(
      tools.validateToolInput("reserve_speaking_date", {
        event: "Conf",
        date: future,
        location: "remote",
        name: "Ada",
        email: "ada@example.com",
      }),
    ).toEqual([]);
  });

  test("names every missing required field", () => {
    const errors = tools.validateToolInput("reserve_speaking_date", {});
    expect(errors).toHaveLength(5);
    expect(errors.join(" ")).toContain("event is required");
  });

  test("treats blank strings as missing", () => {
    const errors = tools.validateToolInput("leave_message", {
      name: "   ",
      email: "ada@example.com",
      message: "Hi",
    });
    expect(errors.join(" ")).toContain("name is required");
  });

  test("rejects a malformed email", () => {
    const errors = tools.validateToolInput("leave_message", {
      name: "Ada",
      email: "ada@",
      message: "Hi",
    });
    expect(errors.join(" ")).toContain("not a valid email address");
  });

  test("rejects a date that does not exist", () => {
    const errors = tools.validateToolInput("reserve_consultation_meeting", {
      date: "2026-02-30",
      time: "10:00",
      topic: "Hiring",
      name: "Ada",
      email: "ada@example.com",
    });
    expect(errors.join(" ")).toContain("must be a real date");
  });

  test("rejects a date in the past", () => {
    const errors = tools.validateToolInput("reserve_consultation_meeting", {
      date: "2020-01-01",
      time: "10:00",
      topic: "Hiring",
      name: "Ada",
      email: "ada@example.com",
    });
    expect(errors.join(" ")).toContain("is in the past");
  });

  test("rejects a malformed time", () => {
    const errors = tools.validateToolInput("reserve_consultation_meeting", {
      date: future,
      time: "25:00",
      topic: "Hiring",
      name: "Ada",
      email: "ada@example.com",
    });
    expect(errors.join(" ")).toContain("24-hour HH:MM form");
  });

  test("returns no errors for a tool it does not validate", () => {
    expect(tools.validateToolInput("search_articles", {})).toEqual([]);
  });
});
