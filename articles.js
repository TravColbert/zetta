import { readdirSync } from 'fs';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function parseDate(value) {
  if (!value) return null;
  // Handle "YYYY-MM-DD HH:mm.SSS +00:00" format (dots instead of colons in time)
  const normalized = String(value).replace(/(\d{2}:\d{2})\.(\d+)/, '$1:$2');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function loadArticles() {
  const articlesDir = join(__dirname, 'articles');
  const files = readdirSync(articlesDir).filter(
    f => f.endsWith('.js') && !f.startsWith('!')
  );

  const articles = [];
  for (const file of files) {
    try {
      const mod = require(join(articlesDir, file));
      const { metadata, content } = mod;
      if (!metadata) continue;

      const publishedAt = parseDate(metadata.publishedAt);
      if (!publishedAt) continue;

      const slug = file.replace(/\.js$/, '');
      articles.push({ slug, metadata, content, publishedAt });
    } catch (err) {
      console.error(`Failed to load article ${file}:`, err.message);
    }
  }

  articles.sort((a, b) => b.publishedAt - a.publishedAt);
  return articles;
}

let articles = loadArticles();

export function getAllArticles() {
  return articles;
}

export function getVisibleArticles() {
  return articles.filter(a => a.metadata.hidden !== true);
}

export function getArticleBySlug(slug) {
  return articles.find(a => a.slug === slug) ?? null;
}

export function reloadArticles() {
  // Clear require cache for all article files
  const articlesDir = join(__dirname, 'articles');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(articlesDir)) {
      delete require.cache[key];
    }
  }
  articles = loadArticles();
  console.log(`Reloaded ${articles.length} articles`);
}

export function getAllTags() {
  const tagSet = new Set();
  for (const article of getVisibleArticles()) {
    for (const tag of article.metadata.tags ?? []) {
      tagSet.add(tag);
    }
  }
  return [...tagSet].sort();
}
