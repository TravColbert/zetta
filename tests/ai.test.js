import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { cpSync, rmSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
// The articles directory is a scratch directory created by tests/setup.js, not
// the one in the working tree: these tests delete and rewrite its contents.
const ARTICLES_DIR = process.env.ARTICLES_DIR;
const CONFIG_PATH = join(ARTICLES_DIR, "ai.js");
const FIXTURES_DIR = join(__dirname, "fixtures", "ai");

// Same destructive pattern as articles.test.js: ARTICLES_DIR is fixed at
// import time, so the only way to test another config is to swap the real one.
function useConfig(name) {
  cpSync(join(FIXTURES_DIR, name), CONFIG_PATH);
  mod.reloadAiConfig();
}

function writeConfig(source) {
  writeFileSync(CONFIG_PATH, source);
  mod.reloadAiConfig();
}

function useNoConfig() {
  rmSync(CONFIG_PATH, { force: true });
  mod.reloadAiConfig();
}

let mod;
const originalKey = process.env.ANTHROPIC_API_KEY;

beforeAll(async () => {
  mod = await import("../lib/ai.js");
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

describe("getAiConfig", () => {
  test("loads a valid config", () => {
    useConfig("valid.js");
    const config = mod.getAiConfig();
    expect(config.systemPrompt).toBe("You are a test assistant.");
    expect(config.label).toBe("Ask away");
    expect(config.tools).toHaveLength(2);
    expect(config.tools[0].slug).toBe("about");
  });

  test("defaults tools to an empty array", () => {
    writeConfig('module.exports = { systemPrompt: "p" };');
    expect(mod.getAiConfig().tools).toEqual([]);
  });

  test("returns null when the file is missing", () => {
    useNoConfig();
    expect(mod.getAiConfig()).toBeNull();
  });

  test("returns null when the file throws", () => {
    useConfig("throws.js");
    expect(mod.getAiConfig()).toBeNull();
  });

  test("returns null when systemPrompt is missing", () => {
    useConfig("no-prompt.js");
    expect(mod.getAiConfig()).toBeNull();
  });

  test("returns null when tools is not an array", () => {
    useConfig("bad-tools.js");
    expect(mod.getAiConfig()).toBeNull();
  });
});

describe("reloadAiConfig", () => {
  test("picks up a config that arrives after startup", () => {
    useNoConfig();
    expect(mod.getAiConfig()).toBeNull();

    useConfig("valid.js");
    expect(mod.getAiConfig().systemPrompt).toBe("You are a test assistant.");
  });

  test("picks up a config that breaks after startup", () => {
    useConfig("valid.js");
    expect(mod.getAiConfig()).not.toBeNull();

    useConfig("throws.js");
    expect(mod.getAiConfig()).toBeNull();
  });
});

describe("isChatEnabled", () => {
  test("is false without an API key", () => {
    useConfig("valid.js");
    delete process.env.ANTHROPIC_API_KEY;
    expect(mod.isChatEnabled()).toBe(false);
  });

  test("is false without a config", () => {
    useNoConfig();
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(mod.isChatEnabled()).toBe(false);
  });

  test("is true with both", () => {
    useConfig("valid.js");
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(mod.isChatEnabled()).toBe(true);
  });
});

describe("chatWidgetTag", () => {
  test("is empty when chat is disabled", () => {
    useConfig("valid.js");
    delete process.env.ANTHROPIC_API_KEY;
    expect(mod.chatWidgetTag()).toBe("");
  });

  test("escapes the greeting and label into data attributes", () => {
    useConfig("valid.js");
    process.env.ANTHROPIC_API_KEY = "test-key";

    const tag = mod.chatWidgetTag();
    expect(tag).toContain('src="/js/widget.js"');
    expect(tag).toContain('data-greeting="Ask me &quot;anything&quot; &lt;here&gt;."');
    expect(tag).toContain('data-label="Ask away"');
  });

  test("omits attributes the config does not set", () => {
    writeConfig('module.exports = { systemPrompt: "p" };');
    process.env.ANTHROPIC_API_KEY = "test-key";

    const tag = mod.chatWidgetTag();
    expect(tag).toBe('<script src="/js/widget.js" defer></script>');
  });
});
