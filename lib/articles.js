import { readdirSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { log } from './logger.js';
import { renderMarkdown } from './utils.js';
import { ARTICLES_DIR } from './config.js';

const require = createRequire(import.meta.url);

function parseDate(value) {
  if (!value) return null;
  // Handle "YYYY-MM-DD HH:mm.SSS +00:00" format (dots instead of colons in time)
  const normalized = String(value).replace(/(\d{2}:\d{2})\.(\d+)/, '$1:$2');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function loadArticles() {
  const articlesDir = ARTICLES_DIR;
  if (!existsSync(articlesDir)) {
    log.warn('articles directory not found');
    return [];
  }
  // ai.js is the chat configuration, not an article.
  const files = readdirSync(articlesDir).filter(
    f => f.endsWith('.js') && !f.startsWith('!') && f !== 'ai.js'
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
      articles.push({ slug, metadata, content, publishedAt, renderedContent: renderMarkdown(content) });
    } catch (err) {
      log.error('failed to load article', { file, error: err.message });
    }
  }

  articles.sort((a, b) => {
    const orderA = a.metadata.order ?? 0;
    const orderB = b.metadata.order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return b.publishedAt - a.publishedAt;
  });
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
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(ARTICLES_DIR)) {
      delete require.cache[key];
    }
  }
  articles = loadArticles();
  log.info('articles reloaded', { count: articles.length });
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
