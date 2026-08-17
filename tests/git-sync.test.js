import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  spyOn,
  mock,
} from 'bun:test';
import * as realFs from 'fs';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
// The articles directory is a scratch directory created by tests/setup.js, not
// the one in the working tree: these tests delete and rewrite its contents.
const ARTICLES_DIR = process.env.ARTICLES_DIR;

const TEMPLATE_DIR = process.env.TEMPLATE_DIR;

// git is mocked, so a "clone" only leaves a stub directory behind. Both target
// directories are scratch copies, so a sync is free to replace them.
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

// One SHA per `rev-parse HEAD`, in order: a pull reads the SHA before and after,
// so two different values are what makes it register as a change. The default is
// the same value twice — a pull that brought nothing down.
let shas;

function headSequence(...values) {
  shas = values;
}

// Each test starts from a known target directory: a plain directory takes the
// clone path, one with a .git in it takes the pull path.
function resetArticlesDir({ asRepo = false } = {}) {
  rmSync(ARTICLES_DIR, { recursive: true, force: true });
  mkdirSync(join(ARTICLES_DIR, 'public'), { recursive: true });
  if (asRepo) mkdirSync(join(ARTICLES_DIR, '.git'), { recursive: true });
}

function restoreThemeDir() {
  rmSync(TEMPLATE_DIR, { recursive: true, force: true });
  cpSync(join(ROOT, 'templates', 'default'), TEMPLATE_DIR, { recursive: true });
}

beforeEach(async () => {
  spawnCalls = [];
  headSequence('abc123', 'abc123');
  resetArticlesDir();
  spawnSpy = spyOn(Bun, 'spawn').mockImplementation((args, opts) => {
    spawnCalls.push({ args, opts });
    const cmd = args.join(' ');

    // Default: return success with empty output
    if (cmd.includes('rev-parse HEAD')) {
      return mockSpawnResult(shas.length > 1 ? shas.shift() : shas[0]);
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
  gitSync = await import(`../lib/git-sync.js?t=${Date.now()}`);
});

afterEach(() => {
  spawnSpy.mockRestore();
  gitSync.stopPolling();
  process.env.GIT_TOKEN = '';
  process.env.ARTICLES_REPO_URL = '';
  process.env.TEMPLATES_REPO_URL = '';
});

afterAll(() => {
  resetArticlesDir();
  restoreThemeDir();
});

describe('token injection (via clone args)', () => {
  test('GitHub URL gets bare token injected', async () => {
    process.env.ARTICLES_REPO_URL = 'https://github.com/test/articles.git';
    process.env.GIT_TOKEN = 'ghp_mytoken';

    const mod = await import(`../lib/git-sync.js?t=github-${Date.now()}`);
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

    const mod = await import(`../lib/git-sync.js?t=gitlab-${Date.now()}`);
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
    const mod = await import(`../lib/git-sync.js?t=norepo-${Date.now()}`);
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

  // Only one of the two repos is configured here, which is the ordinary case for
  // a site that keeps its articles in git and its theme in the image. Reporting
  // it has to survive the missing half.
  test('reports the articles repo alone without touching templatesChanged', async () => {
    const callback = mock(() => {});
    const result = await gitSync.syncNow(callback);
    expect(result.articlesChanged).toBe(true);
    expect(result.templatesChanged).toBe(false);
  });

  test('runs the initial sync when only the articles repo is configured', async () => {
    const callback = mock(() => {});
    await gitSync.initSync(callback);
    const cloned = spawnCalls.some(c => c.args.join(' ').includes('clone'));
    expect(cloned).toBe(true);
    expect(callback).toHaveBeenCalled();
  });

  test('reports the templates repo alone without touching articlesChanged', async () => {
    process.env.ARTICLES_REPO_URL = '';
    process.env.TEMPLATES_REPO_URL = 'https://github.com/test/theme.git';
    try {
      const mod = await import(`../lib/git-sync.js?t=tmplonly-${Date.now()}`);
      const result = await mod.syncNow(mock(() => {}));
      expect(result.templatesChanged).toBe(true);
      expect(result.articlesChanged).toBe(false);
      mod.stopPolling();
    } finally {
      restoreThemeDir();
    }
  });
});

describe('directory swap', () => {
  // A container's overlay filesystem answers rename(2) on a directory that came
  // from the image with EXDEV, so the first sync of a deploy cannot move the
  // baked-in articles directory aside. The swap has to fall back to copying.
  test('replaces the target when renameSync fails with EXDEV', async () => {
    mock.module('fs', () => ({
      ...realFs,
      default: realFs.default,
      renameSync: () => {
        const err = new Error('EXDEV: cross-device link not permitted');
        err.code = 'EXDEV';
        throw err;
      },
    }));
    try {
      const mod = await import(`../lib/git-sync.js?t=exdev-${Date.now()}`);
      const result = await mod.syncNow(mock(() => {}));
      expect(result.articlesChanged).toBe(true);
      // The clone's content is in place and the directory it replaced is gone.
      expect(existsSync(join(ARTICLES_DIR, '.git'))).toBe(true);
      expect(existsSync(join(ARTICLES_DIR, 'public'))).toBe(false);
      // No .old- backup or .tmp- clone left next to it.
      const siblings = readdirSync(dirname(ARTICLES_DIR));
      expect(siblings.filter(n => n.startsWith('articles.'))).toEqual([]);
      mod.stopPolling();
    } finally {
      mock.module('fs', () => realFs);
    }
  });
});

describe('change detection on pull', () => {
  test('a pull that moves HEAD counts as a change', async () => {
    resetArticlesDir({ asRepo: true });
    headSequence('before1', 'after2');
    const callback = mock(() => {});
    const result = await gitSync.syncNow(callback);
    expect(result.articlesChanged).toBe(true);
    expect(callback).toHaveBeenCalled();
  });

  test('a pull that changes nothing does not call onComplete', async () => {
    resetArticlesDir({ asRepo: true });
    headSequence('same1', 'same1');
    const callback = mock(() => {});
    const result = await gitSync.syncNow(callback);
    expect(result.articlesChanged).toBe(false);
    expect(callback).not.toHaveBeenCalled();
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
    const mod = await import(`../lib/git-sync.js?t=nopoll-${Date.now()}`);
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
