import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { cpSync, rmSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'articles');
const BACKUP_DIR = join(ROOT, 'articles.bak-server-test');
const FIXTURES_DIR = join(__dirname, 'fixtures', 'articles');
const PUBLIC_FIXTURES = join(__dirname, 'fixtures', 'public');

// Mock git-sync before importing server
mock.module('../git-sync.js', () => ({
  initSync: mock(() => Promise.resolve()),
  startPolling: mock(() => {}),
  stopPolling: mock(() => {}),
  syncNow: mock((cb) => {
    cb({ articlesChanged: false, templatesChanged: false });
    return Promise.resolve({ articlesChanged: false, templatesChanged: false });
  }),
}));

function backupArticles() {
  if (existsSync(ARTICLES_DIR)) {
    cpSync(ARTICLES_DIR, BACKUP_DIR, { recursive: true });
  }
}

function restoreArticles() {
  if (existsSync(ARTICLES_DIR)) {
    rmSync(ARTICLES_DIR, { recursive: true, force: true });
  }
  if (existsSync(BACKUP_DIR)) {
    cpSync(BACKUP_DIR, ARTICLES_DIR, { recursive: true });
    rmSync(BACKUP_DIR, { recursive: true, force: true });
  }
}

function loadFixtures(names) {
  if (existsSync(ARTICLES_DIR)) {
    for (const f of readdirSync(ARTICLES_DIR)) {
      if (f === 'public') continue;
      rmSync(join(ARTICLES_DIR, f), { recursive: true, force: true });
    }
  } else {
    mkdirSync(ARTICLES_DIR, { recursive: true });
  }
  // Ensure public dir with test assets
  const publicDir = join(ARTICLES_DIR, 'public');
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }
  cpSync(PUBLIC_FIXTURES, publicDir, { recursive: true });

  for (const name of names) {
    cpSync(join(FIXTURES_DIR, name), join(ARTICLES_DIR, name));
  }
}

let BASE;
let server;
let reloadArticles;

// Set port to 0 for random available port
process.env.PORT = '0';
process.env.ARTICLES_REPO_URL = '';
process.env.TEMPLATES_REPO_URL = '';

beforeAll(async () => {
  backupArticles();
  loadFixtures([
    'valid-article.js',
    'hidden-article.js',
    'tagless-article.js',
    'about.js',
  ]);

  const serverMod = await import('../server.js');
  server = serverMod.server;
  reloadArticles = serverMod.reloadArticles;
  reloadArticles();
  BASE = `http://localhost:${server.port}`;
});

afterAll(() => {
  if (server) server.stop();
  restoreArticles();
});

describe('GET /', () => {
  test('redirects 302 to first visible article', async () => {
    const res = await fetch(`${BASE}/`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('/articles/');
  });

  test('returns 404 when no visible articles exist', async () => {
    // Swap to only hidden articles
    loadFixtures(['hidden-article.js']);
    reloadArticles();
    try {
      const res = await fetch(`${BASE}/`, { redirect: 'manual' });
      expect(res.status).toBe(404);
    } finally {
      // Always restore
      loadFixtures(['valid-article.js', 'hidden-article.js', 'tagless-article.js', 'about.js']);
      reloadArticles();
    }
  });
});

describe('GET /about', () => {
  test('renders about page when about.js article exists', async () => {
    const res = await fetch(`${BASE}/about`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('About This Blog');
  });
});

describe('GET /tags', () => {
  test('returns 200 with tag listing HTML', async () => {
    const res = await fetch(`${BASE}/tags`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('testing');
    expect(html).toContain('fixtures');
  });
});

describe('GET /articles', () => {
  test('returns 200 with visible articles listed', async () => {
    const res = await fetch(`${BASE}/articles`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Valid Test Article');
    expect(html).toContain('Tagless Article');
    // Hidden articles should not be in the listing
    expect(html).not.toContain('Hidden Article');
  });

  test('filters by ?tag= query parameter', async () => {
    const res = await fetch(`${BASE}/articles?tag=testing`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // Extract just the main content (sidebar has all articles)
    const main = html.split('<main>')[1].split('</main>')[0];
    expect(main).toContain('Valid Test Article');
    expect(main).not.toContain('Tagless Article');
  });

  test('returns empty list for non-existent tag', async () => {
    const res = await fetch(`${BASE}/articles?tag=nonexistent`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const main = html.split('<main>')[1].split('</main>')[0];
    expect(main).not.toContain('Valid Test Article');
  });
});

describe('GET /articles/:slug', () => {
  test('returns 200 with rendered article HTML', async () => {
    const res = await fetch(`${BASE}/articles/valid-article`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Valid Test Article');
    expect(html).toContain('Tester');
  });

  test('returns 404 for non-existent slug', async () => {
    const res = await fetch(`${BASE}/articles/does-not-exist`);
    expect(res.status).toBe(404);
  });

  test('renders markdown content to HTML', async () => {
    const res = await fetch(`${BASE}/articles/valid-article`);
    const html = await res.text();
    // The content is "# Hello\n\nThis is test content." which becomes <h1>Hello</h1>
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('This is test content.');
  });

  test('includes article tags in output', async () => {
    const res = await fetch(`${BASE}/articles/valid-article`);
    const html = await res.text();
    expect(html).toContain('testing');
    expect(html).toContain('fixtures');
  });
});

describe('GET /images/:file', () => {
  test('serves image file with correct MIME type', async () => {
    const res = await fetch(`${BASE}/images/test.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  test('returns 404 for non-existent image', async () => {
    const res = await fetch(`${BASE}/images/nope.png`);
    expect(res.status).toBe(404);
  });
});

describe('GET /css/:file', () => {
  test('serves CSS file', async () => {
    const res = await fetch(`${BASE}/css/style.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/css');
    const text = await res.text();
    expect(text).toContain('margin');
  });

  test('returns 404 for non-existent CSS file', async () => {
    const res = await fetch(`${BASE}/css/nope.css`);
    expect(res.status).toBe(404);
  });
});

describe('GET /favicon.ico', () => {
  test('serves favicon file', async () => {
    const res = await fetch(`${BASE}/favicon.ico`);
    expect(res.status).toBe(200);
  });
});

describe('GET /robots.txt', () => {
  test('serves robots.txt file', async () => {
    const res = await fetch(`${BASE}/robots.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('test');
  });
});

describe('POST /webhook', () => {
  test('returns 503 when WEBHOOK_SECRET not configured', async () => {
    const prev = process.env.WEBHOOK_SECRET;
    process.env.WEBHOOK_SECRET = '';
    const res = await fetch(`${BASE}/webhook`, { method: 'POST' });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('webhook not configured');
    process.env.WEBHOOK_SECRET = prev;
  });

  test('returns 401 when x-webhook-secret header is wrong', async () => {
    process.env.WEBHOOK_SECRET = 'correct-secret';
    const res = await fetch(`${BASE}/webhook`, {
      method: 'POST',
      headers: { 'x-webhook-secret': 'wrong-secret' },
    });
    expect(res.status).toBe(401);
    process.env.WEBHOOK_SECRET = '';
  });

  test('returns 200 with correct secret', async () => {
    process.env.WEBHOOK_SECRET = 'correct-secret';
    const res = await fetch(`${BASE}/webhook`, {
      method: 'POST',
      headers: { 'x-webhook-secret': 'correct-secret' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('sync triggered');
    process.env.WEBHOOK_SECRET = '';
  });
});

describe('unknown routes', () => {
  test('returns 404 for unknown paths', async () => {
    const res = await fetch(`${BASE}/nonexistent/path`);
    expect(res.status).toBe(404);
  });
});
