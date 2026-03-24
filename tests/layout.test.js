import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { cpSync, rmSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'articles');
const BACKUP_DIR = join(ROOT, 'articles.bak-layout-test');
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

let renderLayout;
let reloadArticles;

beforeAll(async () => {
  backupArticles();
  loadFixtures(['valid-article.js', 'hidden-article.js', 'tagless-article.js']);
  const articles = await import('../articles.js');
  reloadArticles = articles.reloadArticles;
  reloadArticles();
  const layout = await import('../templates/default/layout.js');
  renderLayout = layout.renderLayout;
});

afterAll(() => {
  restoreArticles();
});

describe('renderLayout', () => {
  test('returns valid HTML document with DOCTYPE', () => {
    const html = renderLayout({ title: 'Test', keywords: '', body: '<p>hi</p>' });
    expect(html).toStartWith('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  test('includes title in <title> tag', () => {
    const html = renderLayout({ title: 'My Page', keywords: '', body: '' });
    expect(html).toContain('<title>My Page — Zetta</title>');
  });

  test('includes keywords in meta tag', () => {
    const html = renderLayout({ title: 'Test', keywords: 'foo, bar', body: '' });
    expect(html).toContain('<meta name="keywords" content="foo, bar">');
  });

  test('includes description meta tag when provided', () => {
    const html = renderLayout({ title: 'Test', keywords: '', description: 'A description', body: '' });
    expect(html).toContain('<meta name="description" content="A description">');
  });

  test('omits description meta tag when not provided', () => {
    const html = renderLayout({ title: 'Test', keywords: '', body: '' });
    expect(html).not.toContain('meta name="description"');
  });

  test('renders body content in <main>', () => {
    const html = renderLayout({ title: 'Test', keywords: '', body: '<p>Body content here</p>' });
    expect(html).toContain('<main>');
    expect(html).toContain('<p>Body content here</p>');
    expect(html).toContain('</main>');
  });

  test('renders article sidebar links from visible articles', () => {
    const html = renderLayout({ title: 'Test', keywords: '', body: '' });
    // valid-article and tagless-article are visible; hidden-article is not
    expect(html).toContain('/articles/valid-article');
    expect(html).toContain('Valid Test Article');
    expect(html).toContain('/articles/tagless-article');
    expect(html).not.toContain('/articles/hidden-article');
  });

  test('marks active article with class="active"', () => {
    const html = renderLayout({ slug: 'valid-article', title: 'Test', keywords: '', body: '' });
    expect(html).toContain('href="/articles/valid-article" class="active"');
  });

  test('does not mark non-active articles with active class', () => {
    const html = renderLayout({ slug: 'valid-article', title: 'Test', keywords: '', body: '' });
    expect(html).not.toContain('href="/articles/tagless-article" class="active"');
  });

  test('renders tag cloud in sidebar', () => {
    const html = renderLayout({ title: 'Test', keywords: '', body: '' });
    // Tags from visible articles: fixtures, testing (from valid-article); tagless has none
    expect(html).toContain('tag=fixtures');
    expect(html).toContain('tag=testing');
    // hidden-tag from hidden-article should not appear
    expect(html).not.toContain('tag=hidden-tag');
  });

  test('includes nav links', () => {
    const html = renderLayout({ title: 'Test', keywords: '', body: '' });
    expect(html).toContain('href="/articles"');
    expect(html).toContain('href="/tags"');
  });
});
