import { join, dirname } from "path";
import { existsSync, mkdirSync, cpSync, renameSync, rmSync } from "fs";
import { log } from "./logger.js";
import {
  ROOT_DIR,
  SYNC_CUSTOM_TEMPLATES,
  SYNC_CUSTOM_ARTICLES,
  ARTICLES_DIR,
  TEMPLATE_DIR,
} from "./config.js";

const ARTICLES_REPO_URL = process.env.ARTICLES_REPO_URL || "";
const ARTICLES_REPO_BRANCH = process.env.ARTICLES_REPO_BRANCH || "main";
const TEMPLATES_REPO_URL = process.env.TEMPLATES_REPO_URL || "";
const TEMPLATES_REPO_BRANCH = process.env.TEMPLATES_REPO_BRANCH || "main";
const GIT_TOKEN = process.env.GIT_TOKEN || "";
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL ?? "300", 10);

let isSyncing = false;
let pollTimer = null;

function injectToken(url) {
  if (!GIT_TOKEN || !url) return url;
  // GitLab requires oauth2:token format; GitHub accepts bare token
  const isGitLab = url.includes("gitlab.com");
  const credentials = isGitLab ? `oauth2:${GIT_TOKEN}` : GIT_TOKEN;
  return url.replace(/^https:\/\//, `https://${credentials}@`);
}

function redactUrl(url) {
  if (!GIT_TOKEN || !url) return url;
  return url.replace(GIT_TOKEN, "***");
}

async function getHeadSha(dir) {
  const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim();
}

async function runGit(args, cwd) {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function cloneOrPull(repoUrl, branch, targetDir) {
  if (!repoUrl) return { changed: false };

  const authUrl = injectToken(repoUrl);
  const isExistingRepo = existsSync(join(targetDir, ".git"));

  if (isExistingRepo) {
    const shaBefore = await getHeadSha(targetDir);
    const result = await runGit(["pull", "--ff-only"], targetDir);
    if (result.exitCode !== 0) {
      log.error("git pull failed", {
        repo: redactUrl(repoUrl),
        stderr: redactUrl(result.stderr),
      });
      return { changed: false };
    }
    const shaAfter = await getHeadSha(targetDir);
    return { changed: shaBefore !== shaAfter };
  }

  // Clone strategy: if targetDir already has content (baked-in articles),
  // clone to a temp dir then swap via rename to avoid downtime.
  const hasExistingContent = existsSync(targetDir);
  if (hasExistingContent) {
    const tempDir = `${targetDir}.tmp-${Date.now()}`;
    const result = await runGit(
      [
        "clone",
        "--branch",
        branch,
        "--single-branch",
        "--depth",
        "1",
        authUrl,
        tempDir,
      ],
      ROOT_DIR,
    );
    if (result.exitCode !== 0) {
      log.error("git clone failed", {
        repo: redactUrl(repoUrl),
        stderr: redactUrl(result.stderr),
      });
      rmSync(tempDir, { recursive: true, force: true });
      return { changed: false };
    }
    // The old content is moved aside rather than deleted, so a swap that
    // fails part way through can put it back instead of leaving the site with
    // nothing to serve.
    const previousDir = `${targetDir}.old-${Date.now()}`;
    try {
      if (!existsSync(tempDir)) {
        throw new Error("clone reported success but left no directory");
      }
      renameSync(targetDir, previousDir);
      cpSync(tempDir, targetDir, { recursive: true });
      rmSync(previousDir, { recursive: true, force: true });
      rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      log.error("directory swap failed", {
        repo: redactUrl(repoUrl),
        error: err.message,
      });
      if (existsSync(previousDir)) {
        rmSync(targetDir, { recursive: true, force: true });
        renameSync(previousDir, targetDir);
      }
      rmSync(tempDir, { recursive: true, force: true });
      return { changed: false };
    }
    return { changed: true };
  }

  // No existing content — clone directly
  mkdirSync(dirname(targetDir), { recursive: true });
  const result = await runGit(
    [
      "clone",
      "--branch",
      branch,
      "--single-branch",
      "--depth",
      "1",
      authUrl,
      targetDir,
    ],
    ROOT_DIR,
  );
  if (result.exitCode !== 0) {
    log.error("git clone failed", {
      repo: redactUrl(repoUrl),
      stderr: redactUrl(result.stderr),
    });
    return { changed: false };
  }
  return { changed: true };
}

async function doSync() {
  if (isSyncing) return { articlesChanged: false, templatesChanged: false };
  isSyncing = true;
  console.log(`==== CUSTOM ARTICLES / CUSTOM TEMPLATES ====`);
  console.dir([SYNC_CUSTOM_ARTICLES, SYNC_CUSTOM_TEMPLATES]);
  console.log(`========`);
  let syncJobs = [];
  if (SYNC_CUSTOM_ARTICLES) {
    syncJobs.push(
      cloneOrPull(ARTICLES_REPO_URL, ARTICLES_REPO_BRANCH, ARTICLES_DIR),
    );
  }
  if (SYNC_CUSTOM_TEMPLATES) {
    syncJobs.push(
      cloneOrPull(TEMPLATES_REPO_URL, TEMPLATES_REPO_BRANCH, TEMPLATE_DIR),
    );
  }
  try {
    const [articles, templates] = await Promise.all(syncJobs);
    console.log(`==== ARTICLES / TEMPLATES ====`);
    console.dir([articles, templates]);
    console.log(`========`);
    return {
      articlesChanged: articles.changed,
      templatesChanged: templates.changed,
    };
  } finally {
    isSyncing = false;
  }
}

export async function initSync(onComplete) {
  if (!SYNC_CUSTOM_ARTICLES || !SYNC_CUSTOM_TEMPLATES) return;
  log.info("starting git sync");
  if (SYNC_CUSTOM_ARTICLES)
    log.info("sync target", {
      type: "articles",
      repo: redactUrl(ARTICLES_REPO_URL),
      branch: ARTICLES_REPO_BRANCH,
    });
  if (SYNC_CUSTOM_TEMPLATES)
    log.info("sync target", {
      type: "templates",
      repo: redactUrl(TEMPLATES_REPO_URL),
      branch: TEMPLATES_REPO_BRANCH,
    });

  try {
    const result = await doSync();
    onComplete(result);
  } catch (err) {
    log.error("initial sync failed", { error: err.message });
  }
}

export function startPolling(onComplete) {
  if (!SYNC_CUSTOM_ARTICLES && !SYNC_CUSTOM_TEMPLATES) return;
  if (pollTimer) return;
  log.info("git sync polling started", { interval_s: SYNC_INTERVAL });
  pollTimer = setInterval(async () => {
    try {
      const result = await doSync();
      if (result.articlesChanged || result.templatesChanged) {
        onComplete(result);
      }
    } catch (err) {
      log.error("sync poll failed", { error: err.message });
    }
  }, SYNC_INTERVAL * 1000);
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function syncNow(onComplete) {
  try {
    const result = await doSync();
    onComplete(result);
    return result;
  } catch (err) {
    log.error("manual sync failed", { error: err.message });
    return { articlesChanged: false, templatesChanged: false };
  }
}
