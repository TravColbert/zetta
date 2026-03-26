import { marked } from 'marked';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { renderLayout as builtinLayout } from './templates/default/layout.js';
import { getVisibleArticles, getArticleBySlug, getAllTags, reloadArticles } from './articles.js';
import { initSync, startPolling, syncNow } from './git-sync.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');
const TEMPLATES_DEFAULT_DIR = join(TEMPLATES_DIR, 'default');
const TEMPLATES_CUSTOM_DIR = join(TEMPLATES_DIR, 'custom');
const BUILTIN_PARTIALS_DIR = join(TEMPLATES_DEFAULT_DIR, 'partials');
let CUSTOM_TEMPLATES_DIR = process.env.LAYOUT_PATH ? dirname(process.env.LAYOUT_PATH) : null;
let CUSTOM_PARTIALS_DIR = CUSTOM_TEMPLATES_DIR ? join(CUSTOM_TEMPLATES_DIR, 'partials') : null;
let CUSTOM_CSS_DIR = CUSTOM_TEMPLATES_DIR ? join(CUSTOM_TEMPLATES_DIR, 'css') : null;

const MIME_TYPES = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function resolvePartials(template, partialsDir) {
  return template.replace(/\{\{>\s*(\w+)\s*\}\}/g, (_, name) => {
    const partialPath = join(partialsDir, `${name}.html`);
    if (existsSync(partialPath)) return readFileSync(partialPath, 'utf8');
    console.warn(`Partial not found: ${partialPath}`);
    return '';
  });
}

function loadLayout() {
  const customPath = process.env.LAYOUT_PATH;
  if (customPath && existsSync(customPath)) {
    const raw = readFileSync(customPath, 'utf8');
    const template = resolvePartials(raw, dirname(customPath));
    console.log(`Using custom layout: ${customPath}`);
    if (CUSTOM_CSS_DIR) console.log(`Custom CSS directory: ${CUSTOM_CSS_DIR}`);
    return ({ slug, title, keywords, description, body }) =>
      template
        .replace(/\{\{slug\}\}/g, slug ?? '')
        .replace(/\{\{title\}\}/g, title ?? '')
        .replace(/\{\{keywords\}\}/g, keywords ?? '')
        .replace(/\{\{description\}\}/g, description ?? '')
        .replace(/\{\{body\}\}/g, body ?? '');
  }
  return builtinLayout;
}

function load404() {
  const customPath = process.env.NOT_FOUND_PATH;
  if (customPath && existsSync(customPath)) {
    console.log(`Using custom 404 page: ${customPath}`);
    const raw = readFileSync(customPath, 'utf8');
    return resolvePartials(raw, dirname(customPath));
  }
  return null;
}

function load500() {
  const customPath = process.env.SERVER_ERROR_PATH;
  if (customPath && existsSync(customPath)) {
    console.log(`Using custom 500 page: ${customPath}`);
    const raw = readFileSync(customPath, 'utf8');
    return resolvePartials(raw, dirname(customPath));
  }
  return null;
}

function loadContentPartial(name, customDir = CUSTOM_PARTIALS_DIR) {
  const filename = `${name}.html`;
  if (customDir) {
    const custom = join(customDir, filename);
    if (existsSync(custom)) return readFileSync(custom, 'utf8');
  }
  const builtin = join(BUILTIN_PARTIALS_DIR, filename);
  if (existsSync(builtin)) return readFileSync(builtin, 'utf8');
  console.warn(`Content partial not found: ${name}`);
  return '';
}

let renderLayout = loadLayout();
let notFoundPartial = loadContentPartial('404');
let serverErrorPartial = loadContentPartial('500');
let notFoundPage = load404() ?? renderLayout({ title: '404 — Not Found', keywords: '', body: notFoundPartial });
let serverErrorPage = load500() ?? renderLayout({ title: '500 — Server Error', keywords: '', body: serverErrorPartial });

let articleTmpl = loadContentPartial('article');
let articleTagTmpl = loadContentPartial('article-tag');
let articleListTmpl = loadContentPartial('article-list');
let articleListItemTmpl = loadContentPartial('article-list-item');
let listingTmpl = loadContentPartial('listing');
let tagListTmpl = loadContentPartial('tag-list');
let tagListItemTmpl = loadContentPartial('tag-list-item');
let listingItemTmpl = loadContentPartial('listing-item');
let listingItemBlurbTmpl = loadContentPartial('listing-item-blurb');
let clearFilterTmpl = loadContentPartial('clear-filter');

function reloadTemplates() {
  // Recompute custom dirs — LAYOUT_PATH may have been auto-set
  CUSTOM_TEMPLATES_DIR = process.env.LAYOUT_PATH ? dirname(process.env.LAYOUT_PATH) : null;
  CUSTOM_PARTIALS_DIR = CUSTOM_TEMPLATES_DIR ? join(CUSTOM_TEMPLATES_DIR, 'partials') : null;
  CUSTOM_CSS_DIR = CUSTOM_TEMPLATES_DIR ? join(CUSTOM_TEMPLATES_DIR, 'css') : null;

  renderLayout = loadLayout();
  notFoundPartial = loadContentPartial('404');
  serverErrorPartial = loadContentPartial('500');
  notFoundPage = load404() ?? renderLayout({ title: '404 — Not Found', keywords: '', body: notFoundPartial });
  serverErrorPage = load500() ?? renderLayout({ title: '500 — Server Error', keywords: '', body: serverErrorPartial });

  articleTmpl = loadContentPartial('article');
  articleTagTmpl = loadContentPartial('article-tag');
  articleListTmpl = loadContentPartial('article-list');
  articleListItemTmpl = loadContentPartial('article-list-item');
  listingTmpl = loadContentPartial('listing');
  tagListTmpl = loadContentPartial('tag-list');
  tagListItemTmpl = loadContentPartial('tag-list-item');
  listingItemTmpl = loadContentPartial('listing-item');
  listingItemBlurbTmpl = loadContentPartial('listing-item-blurb');
  clearFilterTmpl = loadContentPartial('clear-filter');
  console.log('Templates reloaded');
}

function respond404() {
  return new Response(notFoundPage, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function respond500() {
  return new Response(serverErrorPage, {
    status: 500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function mimeFor(filename) {
  const ext = filename.slice(filename.lastIndexOf('.'));
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

async function serveFile(filePath) {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return respond404();
  return new Response(file, { headers: { 'Content-Type': mimeFor(filePath) } });
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderArticlePage(article) {
  const { slug, metadata, content, publishedAt } = article;

  const tags = (metadata.tags ?? [])
    .map(t => articleTagTmpl
      .replace('{{tag}}', t)
      .replace('{{url}}', encodeURIComponent(t)))
    .join(' ');

  const body = articleTmpl
    .replace('{{title}}', metadata.title)
    .replace('{{slug}}', slug)
    .replace('{{author}}', metadata.author)
    .replace('{{date}}', formatDate(publishedAt))
    .replace('{{tags}}', tags)
    .replace('{{content}}', marked(content));

  return renderLayout({
    slug,
    title: metadata.title,
    keywords: (metadata.tags ?? []).join(', '),
    description: metadata.blurb ?? '',
    body,
  });
}

function renderArticleList(articles) {
  const items = articles
    .map(({ metadata, publishedAt, slug }) => {
      const blurb = metadata.blurb
        ? listingItemBlurbTmpl.replace('{{blurb}}', metadata.blurb)
        : '';

      const articleTagList = (metadata.tags ?? [])
        .map(t => tagListItemTmpl
          .replaceAll('{{tag}}', t)
          .replaceAll('{{url}}', encodeURIComponent(t)))
        .join(' ');

      return articleListItemTmpl
        .replaceAll('{{slug}}', slug)
        .replace('{{title}}', metadata.title)
        .replace('{{date}}', formatDate(publishedAt))
        .replace('{{blurb}}', blurb)
        .replace('{{tags}}', articleTagList);
    })
    .join('\n');

  const body = articleListTmpl
    .replace('{{items}}', items);

  return renderLayout({ title: 'Articles', keywords: '', body });
}

function renderTagListing() {
  const allTags = getAllTags();

  const tagList = allTags
    .map(t => tagListItemTmpl
      .replaceAll('{{tag}}', t)
      .replaceAll('{{url}}', encodeURIComponent(t)))
    .join(' ');

  const body = tagListTmpl
    .replace('{{items}}', tagList);

  return renderLayout({ title: 'Articles', keywords: allTags.join(', '), body });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    try {
      const url = new URL(req.url);
      const { pathname } = url;

      // GET /
      if (pathname === '/') {
        const visible = getVisibleArticles();
        if (visible.length === 0) return respond404();
        return Response.redirect(`/articles/${visible[0].slug}`, 302);
      }

      // GET /about
      if (pathname === '/about') {
        const about = getArticleBySlug('about');
        if (about) {
          const html = renderArticlePage(about);
          return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
      }

      // GET /tags
      if (pathname === '/tags') {
        const html = renderTagListing();
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // GET /articles
      if (pathname === '/articles') {
        const tag = url.searchParams.get('tag');
        let articles = getVisibleArticles();
        if (tag) {
          articles = articles.filter(a => (a.metadata.tags ?? []).includes(tag));
        }
        const html = renderArticleList(articles);
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // GET /articles/:slug
      const articleMatch = pathname.match(/^\/articles\/([^/]+)$/);
      if (articleMatch) {
        const slug = articleMatch[1];
        const article = getArticleBySlug(slug);
        if (!article) return respond404();
        const html = renderArticlePage(article);
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // GET /images/:file
      const imageMatch = pathname.match(/^\/images\/(.+)$/);
      if (imageMatch) {
        return serveFile(join(__dirname, 'articles/public/images', imageMatch[1]));
      }

      // GET /css/:file
      const cssMatch = pathname.match(/^\/css\/(.+)$/);
      if (cssMatch) {
        if (CUSTOM_CSS_DIR) {
          const customResponse = await serveFile(join(CUSTOM_CSS_DIR, cssMatch[1]));
          if (customResponse.status !== 404) return customResponse;
        }
        return serveFile(join(__dirname, 'articles/public/css', cssMatch[1]));
      }

      // GET /favicon.ico
      if (pathname === '/favicon.ico') {
        return serveFile(join(__dirname, 'articles/public/favicon.ico'));
      }

      // GET /robots.txt
      if (pathname === '/robots.txt') {
        return serveFile(join(__dirname, 'articles/public/robots.txt'));
      }

      // POST /webhook
      if (req.method === 'POST' && pathname === '/webhook') {
        const webhookSecret = process.env.WEBHOOK_SECRET;
        if (!webhookSecret) {
          return new Response(JSON.stringify({ error: 'webhook not configured' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (req.headers.get('x-webhook-secret') !== webhookSecret) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        syncNow(handleSyncComplete);
        return new Response(JSON.stringify({ status: 'sync triggered' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return respond404();
    } catch (err) {
      console.error('Server error:', err);
      return respond500();
    }
  },
});

console.log(`Zetta running at http://localhost:${server.port}`);

function handleSyncComplete({ articlesChanged, templatesChanged }) {
  if (templatesChanged && !process.env.LAYOUT_PATH && process.env.TEMPLATES_REPO_URL) {
    const customLayout = join(TEMPLATES_CUSTOM_DIR, 'layout.html');
    if (existsSync(customLayout)) {
      process.env.LAYOUT_PATH = customLayout;
      console.log(`Auto-set LAYOUT_PATH to ${customLayout}`);
    }
  }
  if (articlesChanged) reloadArticles();
  if (templatesChanged) reloadTemplates();
}

if (process.env.ARTICLES_REPO_URL || process.env.TEMPLATES_REPO_URL) {
  initSync(handleSyncComplete).then(() => {
    startPolling(handleSyncComplete);
  });
}

export { server, reloadArticles };
