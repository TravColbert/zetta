import { join, dirname } from "path";
import {
  existsSync,
  mkdirSync,
  cpSync,
  readdirSync,
  renameSync,
  rmSync,
} from "fs";
import { log } from "./logger.js";
import {
  ROOT_DIR,
  USING_CUSTOM_THEME,
  ARTICLES_DIR,
  TEMPLATE_DIR,
} from "./config.js";

const ARTICLES_REPO_URL = process.env.ARTICLES_REPO_URL || "";
const ARTICLES_REPO_BRANCH = process.env.ARTICLES_REPO_BRANCH || "main";
const TEMPLATES_REPO_URL = process.env.TEMPLATES_REPO_URL || "";
const TEMPLATES_REPO_BRANCH = process.env.TEMPLATES_REPO_BRANCH || "main";
const GIT_TOKEN = process.env.GIT_TOKEN || "";
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL ?? "300", 10);

// What each half of a sync needs to be configured. These sit here with the
// values they gate rather than in config.js, so they are re-read whenever this
// module is.
const SYNC_CUSTOM_ARTICLES = ARTICLES_REPO_URL !== "";
// A templates sync replaces the whole theme directory, so it takes a theme of
// its own. Without one the target would be templates/default, and the sync would
// clone over the templates that ship with Zetta.
const SYNC_CUSTOM_TEMPLATES = TEMPLATES_REPO_URL !== "" && USING_CUSTOM_THEME;

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

// Delete everything inside a directory but leave the directory itself. Used
// instead of rmSync on a sync target, because the target can be a container
// mount point, which cannot be removed.
function emptyDir(dir) {
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

// Move a directory. renameSync is the fast path, but it fails with EXDEV when
// the source is on a different filesystem than the destination — which is what
// a directory baked into a container image looks like once it is running on an
// overlay filesystem, and what a mounted volume looks like anywhere. Copying
// and then emptying gets the same result: the source keeps its inode and ends
// up empty rather than gone, and both callers handle that.
function moveDir(src, dest) {
  try {
    renameSync(src, dest);
    return;
  } catch (err) {
    if (err.code !== "EXDEV" && err.code !== "EBUSY") throw err;
  }
  cpSync(src, dest, { recursive: true });
  emptyDir(src);
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
      moveDir(targetDir, previousDir);
      cpSync(tempDir, targetDir, { recursive: true });
      rmSync(previousDir, { recursive: true, force: true });
      rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      log.error("directory swap failed", {
        repo: redactUrl(repoUrl),
        error: err.message,
      });
      if (existsSync(previousDir)) {
        // The target may be gone, or still there and holding a half-written
        // copy; either way it has to be an empty slot before the backup can go
        // back into it.
        if (existsSync(targetDir)) emptyDir(targetDir);
        moveDir(previousDir, targetDir);
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
  // Keyed rather than positional: either repo can be configured on its own, so
  // a plain array would hand the templates result to articlesChanged, or leave
  // one of them undefined.
  const noChange = { changed: false };
  try {
    const [articles, templates] = await Promise.all([
      SYNC_CUSTOM_ARTICLES
        ? cloneOrPull(ARTICLES_REPO_URL, ARTICLES_REPO_BRANCH, ARTICLES_DIR)
        : noChange,
      SYNC_CUSTOM_TEMPLATES
        ? cloneOrPull(TEMPLATES_REPO_URL, TEMPLATES_REPO_BRANCH, TEMPLATE_DIR)
        : noChange,
    ]);
    return {
      articlesChanged: articles.changed,
      templatesChanged: templates.changed,
    };
  } finally {
    isSyncing = false;
  }
}

export async function initSync(onComplete) {
  if (!SYNC_CUSTOM_ARTICLES && !SYNC_CUSTOM_TEMPLATES) return;
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
    if (result.articlesChanged || result.templatesChanged) {
      onComplete(result);
    }
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
    if (result.articlesChanged || result.templatesChanged) {
      onComplete(result);
    }
    return result;
  } catch (err) {
    log.error("manual sync failed", { error: err.message });
    return { articlesChanged: false, templatesChanged: false };
  }
}
