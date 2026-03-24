import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { cpSync, rmSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'articles');
const BACKUP_DIR = join(ROOT, 'articles.bak-articles-test');
const FIXTURES_DIR = join(__dirname, 'fixtures', 'articles');

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
  // Clear articles dir but keep public/
  if (existsSync(ARTICLES_DIR)) {
    for (const f of readdirSync(ARTICLES_DIR)) {
      if (f === 'public') continue;
      rmSync(join(ARTICLES_DIR, f), { recursive: true, force: true });
    }
  } else {
    mkdirSync(ARTICLES_DIR, { recursive: true });
  }
  for (const name of names) {
    cpSync(join(FIXTURES_DIR, name), join(ARTICLES_DIR, name));
  }
}

let mod;

beforeAll(async () => {
  backupArticles();
  mod = await import('../articles.js');
});

afterAll(() => {
  restoreArticles();
});

describe('loadArticles', () => {
  test('loads valid articles', () => {
    loadFixtures(['valid-article.js']);
    mod.reloadArticles();
    const all = mod.getAllArticles();
    expect(all.length).toBe(1);
    expect(all[0].slug).toBe('valid-article');
    expect(all[0].metadata.title).toBe('Valid Test Article');
    expect(all[0].content).toContain('Hello');
  });

  test('ignores files prefixed with !', () => {
    loadFixtures(['valid-article.js', '!ignored-article.js']);
    mod.reloadArticles();
    const slugs = mod.getAllArticles().map(a => a.slug);
    expect(slugs).toContain('valid-article');
    expect(slugs).not.toContain('!ignored-article');
  });

  test('skips articles without metadata', () => {
    loadFixtures(['valid-article.js', 'no-metadata.js']);
    mod.reloadArticles();
    const slugs = mod.getAllArticles().map(a => a.slug);
    expect(slugs).toContain('valid-article');
    expect(slugs).not.toContain('no-metadata');
  });

  test('skips articles without publishedAt', () => {
    loadFixtures(['valid-article.js', 'no-date.js']);
    mod.reloadArticles();
    const slugs = mod.getAllArticles().map(a => a.slug);
    expect(slugs).not.toContain('no-date');
  });

  test('skips articles with unparseable publishedAt', () => {
    loadFixtures(['valid-article.js', 'invalid-date.js']);
    mod.reloadArticles();
    const slugs = mod.getAllArticles().map(a => a.slug);
    expect(slugs).not.toContain('invalid-date');
  });

  test('handles dot-format time in publishedAt', () => {
    loadFixtures(['dot-time-format.js']);
    mod.reloadArticles();
    const all = mod.getAllArticles();
    expect(all.length).toBe(1);
    expect(all[0].slug).toBe('dot-time-format');
    expect(all[0].publishedAt).toBeInstanceOf(Date);
  });

  test('returns empty array when articles/ directory is missing', () => {
    rmSync(ARTICLES_DIR, { recursive: true, force: true });
    mod.reloadArticles();
    expect(mod.getAllArticles()).toEqual([]);
    // Recreate so other tests work
    mkdirSync(ARTICLES_DIR, { recursive: true });
  });
});

describe('sorting', () => {
  test('sorts by order ascending as primary key', () => {
    loadFixtures(['ordered-low.js', 'ordered-high.js', 'valid-article.js']);
    mod.reloadArticles();
    const slugs = mod.getAllArticles().map(a => a.slug);
    expect(slugs[0]).toBe('ordered-low');
    expect(slugs[slugs.length - 1]).toBe('ordered-high');
  });

  test('sorts by publishedAt descending when order is equal', () => {
    loadFixtures(['valid-article.js', 'tagless-article.js']);
    mod.reloadArticles();
    const all = mod.getAllArticles();
    // Both have default order=0; valid-article is 2025-06-15, tagless is 2025-04-01
    expect(all[0].slug).toBe('valid-article');
    expect(all[1].slug).toBe('tagless-article');
  });

  test('articles without order default to 0', () => {
    loadFixtures(['ordered-low.js', 'valid-article.js']);
    mod.reloadArticles();
    const all = mod.getAllArticles();
    // ordered-low has order:-1, valid-article has no order (defaults to 0)
    expect(all[0].slug).toBe('ordered-low');
    expect(all[1].slug).toBe('valid-article');
  });
});

describe('getVisibleArticles', () => {
  test('excludes articles with hidden: true', () => {
    loadFixtures(['valid-article.js', 'hidden-article.js']);
    mod.reloadArticles();
    const visible = mod.getVisibleArticles();
    const slugs = visible.map(a => a.slug);
    expect(slugs).toContain('valid-article');
    expect(slugs).not.toContain('hidden-article');
  });

  test('includes articles without hidden field', () => {
    loadFixtures(['valid-article.js', 'tagless-article.js']);
    mod.reloadArticles();
    expect(mod.getVisibleArticles().length).toBe(2);
  });

  test('returns empty array when all articles are hidden', () => {
    loadFixtures(['hidden-article.js']);
    mod.reloadArticles();
    expect(mod.getVisibleArticles()).toEqual([]);
  });
});

describe('getArticleBySlug', () => {
  test('returns article matching slug', () => {
    loadFixtures(['valid-article.js']);
    mod.reloadArticles();
    const article = mod.getArticleBySlug('valid-article');
    expect(article).not.toBeNull();
    expect(article.metadata.title).toBe('Valid Test Article');
  });

  test('returns null for non-existent slug', () => {
    loadFixtures(['valid-article.js']);
    mod.reloadArticles();
    expect(mod.getArticleBySlug('does-not-exist')).toBeNull();
  });
});

describe('getAllTags', () => {
  test('returns sorted unique tags from visible articles', () => {
    loadFixtures(['valid-article.js']);
    mod.reloadArticles();
    expect(mod.getAllTags()).toEqual(['fixtures', 'testing']);
  });

  test('excludes tags from hidden articles', () => {
    loadFixtures(['valid-article.js', 'hidden-article.js']);
    mod.reloadArticles();
    const tags = mod.getAllTags();
    expect(tags).not.toContain('hidden-tag');
  });

  test('returns empty array when no articles have tags', () => {
    loadFixtures(['tagless-article.js']);
    mod.reloadArticles();
    expect(mod.getAllTags()).toEqual([]);
  });

  test('handles articles with no tags array', () => {
    loadFixtures(['valid-article.js', 'tagless-article.js']);
    mod.reloadArticles();
    // Should not throw, tagless article just contributes nothing
    expect(mod.getAllTags()).toEqual(['fixtures', 'testing']);
  });
});

describe('reloadArticles', () => {
  test('picks up newly added article files', () => {
    loadFixtures(['valid-article.js']);
    mod.reloadArticles();
    expect(mod.getAllArticles().length).toBe(1);

    // Add another fixture
    cpSync(join(FIXTURES_DIR, 'tagless-article.js'), join(ARTICLES_DIR, 'tagless-article.js'));
    mod.reloadArticles();
    expect(mod.getAllArticles().length).toBe(2);
  });

  test('reflects removed article files', () => {
    loadFixtures(['valid-article.js', 'tagless-article.js']);
    mod.reloadArticles();
    expect(mod.getAllArticles().length).toBe(2);

    rmSync(join(ARTICLES_DIR, 'tagless-article.js'));
    mod.reloadArticles();
    expect(mod.getAllArticles().length).toBe(1);
  });
});
