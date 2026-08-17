// Preloaded by bunfig.toml before any test module.
//
// Two jobs. The first is to give the tests their own articles directory. These
// tests delete and rewrite whatever directory they are pointed at, and in a
// normal checkout articles/ holds a site's own content as a separate git repo,
// so they are pointed at a scratch directory instead of the working tree.
//
// The second is that Bun loads .env for `bun test` just as it does for the
// server. Without clearing them, a deployment's real settings — a CUSTOM_THEME,
// repo URLs, an API key — would decide what the tests render, whether git sync
// runs against a live remote, and whether a stubbed fetch is the only thing
// keeping them off the network.

import { cpSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORK_DIR = join(ROOT, "tests", ".work");
const ARTICLES_DIR = join(WORK_DIR, "articles");
const TEMPLATE_DIR = join(WORK_DIR, "theme");
const BUILTIN_THEME = join(ROOT, "templates", "default");

// Left behind by a run that crashed before its cleanup.
rmSync(WORK_DIR, { recursive: true, force: true });
mkdirSync(join(ARTICLES_DIR, "public"), { recursive: true });

// A copy of the built-in theme, so assertions can be written against the
// templates that ship with Zetta while the git-sync tests stay free to clone
// over the top of the active theme directory.
cpSync(BUILTIN_THEME, TEMPLATE_DIR, { recursive: true });

process.env.ARTICLES_DIR = ARTICLES_DIR;
process.env.TEMPLATE_DIR = TEMPLATE_DIR;

// TEMPLATE_DIR is read once, at import, so a test that needs a different theme
// starts a server in a subprocess with its own environment — see theme.test.js.

for (const name of [
  "CUSTOM_THEME",
  "ARTICLES_REPO_URL",
  "ARTICLES_REPO_BRANCH",
  "TEMPLATES_REPO_URL",
  "TEMPLATES_REPO_BRANCH",
  "GIT_TOKEN",
  "SYNC_INTERVAL",
  "WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "RESERVATION_WEBHOOK_URL",
  "NOT_FOUND_PATH",
  "SERVER_ERROR_PATH",
]) {
  delete process.env[name];
}
