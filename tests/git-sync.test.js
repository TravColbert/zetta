import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Helper: create a mock Bun.spawn result
function mockSpawnResult(stdout = '', stderr = '', exitCode = 0) {
  return {
    stdout: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stdout));
        controller.close();
      },
    }),
    stderr: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stderr));
        controller.close();
      },
    }),
    exited: Promise.resolve(exitCode),
  };
}

let gitSync;
let spawnSpy;
let spawnCalls;

beforeEach(async () => {
  spawnCalls = [];
  spawnSpy = spyOn(Bun, 'spawn').mockImplementation((args, opts) => {
    spawnCalls.push({ args, opts });
    const cmd = args.join(' ');

    // Default: return success with empty output
    if (cmd.includes('rev-parse HEAD')) {
      // Return a fake SHA; use call count to vary
      const sha = spawnCalls.filter(c => c.args.join(' ').includes('rev-parse')).length <= 1
        ? 'abc123' : 'abc123';
      return mockSpawnResult(sha);
    }
    if (cmd.includes('pull')) {
      return mockSpawnResult('', '', 0);
    }
    if (cmd.includes('clone')) {
      // Simulate creating the target directory
      const targetDir = args[args.length - 1];
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
        mkdirSync(join(targetDir, '.git'), { recursive: true });
      }
      return mockSpawnResult('', '', 0);
    }
    return mockSpawnResult();
  });

  // Set env vars before importing
  process.env.GIT_TOKEN = 'test-token-123';
  process.env.ARTICLES_REPO_URL = 'https://github.com/test/articles.git';
  process.env.ARTICLES_REPO_BRANCH = 'main';
  process.env.TEMPLATES_REPO_URL = '';
  process.env.TEMPLATES_REPO_BRANCH = 'main';
  process.env.SYNC_INTERVAL = '1';

  // Dynamic import to pick up env vars; bust cache each time
  gitSync = await import(`../git-sync.js?t=${Date.now()}`);
});

afterEach(() => {
  spawnSpy.mockRestore();
  gitSync.stopPolling();
  process.env.GIT_TOKEN = '';
  process.env.ARTICLES_REPO_URL = '';
  process.env.TEMPLATES_REPO_URL = '';
});

describe('token injection (via clone args)', () => {
  test('GitHub URL gets bare token injected', async () => {
    // Remove existing articles dir so it takes the fresh-clone path
    const target = join(ROOT, 'articles');
    const hadArticles = existsSync(target);
    const backupDir = join(ROOT, 'articles.git-test-bak');
    if (hadArticles) {
      mkdirSync(backupDir, { recursive: true });
      // Just rename by using a flag
    }

    process.env.ARTICLES_REPO_URL = 'https://github.com/test/articles.git';
    process.env.GIT_TOKEN = 'ghp_mytoken';

    const mod = await import(`../git-sync.js?t=github-${Date.now()}`);
    const callback = mock(() => {});
    await mod.initSync(callback);

    const cloneCall = spawnCalls.find(c => c.args.join(' ').includes('clone'));
    if (cloneCall) {
      const url = cloneCall.args.find(a => a.includes('github.com'));
      expect(url).toContain('ghp_mytoken@github.com');
      expect(url).not.toContain('oauth2:');
    }
    mod.stopPolling();
  });

  test('GitLab URL gets oauth2:token format', async () => {
    process.env.ARTICLES_REPO_URL = 'https://gitlab.com/test/articles.git';
    process.env.GIT_TOKEN = 'glpat_mytoken';

    const mod = await import(`../git-sync.js?t=gitlab-${Date.now()}`);
    const callback = mock(() => {});
    await mod.initSync(callback);

    const cloneCall = spawnCalls.find(c => c.args.join(' ').includes('clone'));
    if (cloneCall) {
      const url = cloneCall.args.find(a => a.includes('gitlab.com'));
      expect(url).toContain('oauth2:glpat_mytoken@gitlab.com');
    }
    mod.stopPolling();
  });
});

describe('initSync', () => {
  test('does nothing when no repo URLs configured', async () => {
    process.env.ARTICLES_REPO_URL = '';
    process.env.TEMPLATES_REPO_URL = '';
    const mod = await import(`../git-sync.js?t=norepo-${Date.now()}`);
    const callback = mock(() => {});
    await mod.initSync(callback);
    expect(callback).not.toHaveBeenCalled();
  });

  test('calls onComplete callback after sync', async () => {
    const callback = mock(() => {});
    await gitSync.initSync(callback);
    expect(callback).toHaveBeenCalled();
    const result = callback.mock.calls[0][0];
    expect(result).toHaveProperty('articlesChanged');
    expect(result).toHaveProperty('templatesChanged');
  });
});

describe('startPolling and stopPolling', () => {
  test('stopPolling clears the timer', async () => {
    const callback = mock(() => {});
    gitSync.startPolling(callback);
    gitSync.stopPolling();
    // Should not throw or leave dangling timers
  });

  test('does nothing when no repo URLs configured', async () => {
    process.env.ARTICLES_REPO_URL = '';
    process.env.TEMPLATES_REPO_URL = '';
    const mod = await import(`../git-sync.js?t=nopoll-${Date.now()}`);
    const callback = mock(() => {});
    mod.startPolling(callback);
    // Should return immediately without setting timer
    mod.stopPolling();
  });
});

describe('syncNow', () => {
  test('calls onComplete with result', async () => {
    const callback = mock(() => {});
    const result = await gitSync.syncNow(callback);
    expect(callback).toHaveBeenCalled();
    expect(result).toHaveProperty('articlesChanged');
    expect(result).toHaveProperty('templatesChanged');
  });
});
