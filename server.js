import { join } from 'path';
import { existsSync } from 'fs';
import { PORT, ROOT_DIR, TEMPLATES_CUSTOM_DIR, getCustomDirs } from './config.js';
import { getTemplates, reloadTemplates, respond404, respond500 } from './template-engine.js';
import { renderArticlePage, renderArticleList, renderTagListing } from './renderers.js';
import { serveFile } from './static-files.js';
import { getVisibleArticles, getArticleBySlug, reloadArticles } from './articles.js';
import { initSync, startPolling, syncNow } from './git-sync.js';

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
          const html = renderArticlePage(about, getTemplates());
          return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
      }

      // GET /tags
      if (pathname === '/tags') {
        const html = renderTagListing(getTemplates());
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // GET /articles
      if (pathname === '/articles') {
        const tag = url.searchParams.get('tag');
        let articles = getVisibleArticles();
        if (tag) {
          articles = articles.filter(a => (a.metadata.tags ?? []).includes(tag));
        }
        const html = renderArticleList(articles, getTemplates());
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // GET /articles/:slug
      const articleMatch = pathname.match(/^\/articles\/([^/]+)$/);
      if (articleMatch) {
        const slug = articleMatch[1];
        const article = getArticleBySlug(slug);
        if (!article) return respond404();
        const html = renderArticlePage(article, getTemplates());
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // GET /images/:file
      const imageMatch = pathname.match(/^\/images\/(.+)$/);
      if (imageMatch) {
        return serveFile(join(ROOT_DIR, 'articles/public/images', imageMatch[1]), respond404);
      }

      // GET /css/:file
      const cssMatch = pathname.match(/^\/css\/(.+)$/);
      if (cssMatch) {
        const { CUSTOM_CSS_DIR } = getCustomDirs();
        if (CUSTOM_CSS_DIR) {
          const customResponse = await serveFile(join(CUSTOM_CSS_DIR, cssMatch[1]), respond404);
          if (customResponse.status !== 404) return customResponse;
        }
        return serveFile(join(ROOT_DIR, 'articles/public/css', cssMatch[1]), respond404);
      }

      // GET /favicon.ico
      if (pathname === '/favicon.ico') {
        return serveFile(join(ROOT_DIR, 'articles/public/favicon.ico'), respond404);
      }

      // GET /robots.txt
      if (pathname === '/robots.txt') {
        return serveFile(join(ROOT_DIR, 'articles/public/robots.txt'), respond404);
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
