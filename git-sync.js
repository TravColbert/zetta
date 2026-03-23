import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ARTICLES_REPO_URL = process.env.ARTICLES_REPO_URL || '';
const ARTICLES_REPO_BRANCH = process.env.ARTICLES_REPO_BRANCH || 'main';
const TEMPLATES_REPO_URL = process.env.TEMPLATES_REPO_URL || '';
const TEMPLATES_REPO_BRANCH = process.env.TEMPLATES_REPO_BRANCH || 'main';
const GIT_TOKEN = process.env.GIT_TOKEN || '';
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL ?? '300', 10);

const ARTICLES_DIR = join(__dirname, 'articles');
const TEMPLATES_CUSTOM_DIR = join(__dirname, 'templates', 'custom');

let isSyncing = false;
let pollTimer = null;

function injectToken(url) {
  if (!GIT_TOKEN || !url) return url;
  // GitLab requires oauth2:token format; GitHub accepts bare token
  const isGitLab = url.includes('gitlab.com');
  const credentials = isGitLab ? `oauth2:${GIT_TOKEN}` : GIT_TOKEN;
  return url.replace(/^https:\/\//, `https://${credentials}@`);
}

function redactUrl(url) {
  if (!GIT_TOKEN || !url) return url;
  return url.replace(GIT_TOKEN, '***');
}

async function getHeadSha(dir) {
  const proc = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim();
}

async function runGit(args, cwd) {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function cloneOrPull(repoUrl, branch, targetDir) {
  if (!repoUrl) return { changed: false };

  const authUrl = injectToken(repoUrl);
  const isExistingRepo = existsSync(join(targetDir, '.git'));

  if (isExistingRepo) {
    const shaBefore = await getHeadSha(targetDir);
    const result = await runGit(['pull', '--ff-only'], targetDir);
    if (result.exitCode !== 0) {
      console.error(`git pull failed for ${redactUrl(repoUrl)}:`, result.stderr);
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
      ['clone', '--branch', branch, '--single-branch', '--depth', '1', authUrl, tempDir],
      __dirname
    );
    if (result.exitCode !== 0) {
      console.error(`git clone failed for ${redactUrl(repoUrl)}:`, result.stderr);
      rmSync(tempDir, { recursive: true, force: true });
      return { changed: false };
    }
    try {
      rmSync(targetDir, { recursive: true, force: true });
      cpSync(tempDir, targetDir, { recursive: true });
      rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to swap directories for ${redactUrl(repoUrl)}:`, err.message);
      rmSync(tempDir, { recursive: true, force: true });
      return { changed: false };
    }
    return { changed: true };
  }

  // No existing content — clone directly
  mkdirSync(dirname(targetDir), { recursive: true });
  const result = await runGit(
    ['clone', '--branch', branch, '--single-branch', '--depth', '1', authUrl, targetDir],
    __dirname
  );
  if (result.exitCode !== 0) {
    console.error(`git clone failed for ${redactUrl(repoUrl)}:`, result.stderr);
    return { changed: false };
  }
  return { changed: true };
}

async function doSync() {
  if (isSyncing) return { articlesChanged: false, templatesChanged: false };
  isSyncing = true;
  try {
    const [articles, templates] = await Promise.all([
      cloneOrPull(ARTICLES_REPO_URL, ARTICLES_REPO_BRANCH, ARTICLES_DIR),
      cloneOrPull(TEMPLATES_REPO_URL, TEMPLATES_REPO_BRANCH, TEMPLATES_CUSTOM_DIR),
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
  if (!ARTICLES_REPO_URL && !TEMPLATES_REPO_URL) return;
  console.log('Starting initial git sync...');
  if (ARTICLES_REPO_URL) console.log(`  Articles repo: ${redactUrl(ARTICLES_REPO_URL)} (${ARTICLES_REPO_BRANCH})`);
  if (TEMPLATES_REPO_URL) console.log(`  Templates repo: ${redactUrl(TEMPLATES_REPO_URL)} (${TEMPLATES_REPO_BRANCH})`);

  try {
    const result = await doSync();
    onComplete(result);
  } catch (err) {
    console.error('Initial sync failed:', err.message);
  }
}

export function startPolling(onComplete) {
  if (!ARTICLES_REPO_URL && !TEMPLATES_REPO_URL) return;
  if (pollTimer) return;
  console.log(`Git sync polling every ${SYNC_INTERVAL}s`);
  pollTimer = setInterval(async () => {
    try {
      const result = await doSync();
      if (result.articlesChanged || result.templatesChanged) {
        onComplete(result);
      }
    } catch (err) {
      console.error('Sync poll failed:', err.message);
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
    console.error('Manual sync failed:', err.message);
    return { articlesChanged: false, templatesChanged: false };
  }
}
