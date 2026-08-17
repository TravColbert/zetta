import { join } from "path";
import { existsSync } from "fs";
import { timingSafeEqual } from "crypto";
import { log, withAccessLog } from "./lib/logger.js";
import { PORT, ROOT_DIR, TEMPLATE_DIR, getCustomDirs } from "./lib/config.js";
import {
  getTemplates,
  reloadTemplates,
  respond404,
  respond500,
} from "./lib/template-engine.js";
import {
  renderArticlePage,
  renderArticleList,
  renderTagListing,
} from "./lib/renderers.js";
import { serveFile, serveFileInDir } from "./lib/static-files.js";
import {
  getVisibleArticles,
  getArticleBySlug,
  reloadArticles,
} from "./lib/articles.js";
import { initSync, startPolling, syncNow } from "./lib/git-sync.js";
import { reloadAiConfig } from "./lib/ai.js";
import { handleChat } from "./lib/chat.js";

const HTML_HEADERS = {
  headers: { "Content-Type": "text/html; charset=utf-8" },
};

function secureCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA); // keep execution path uniform
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

const server = Bun.serve({
  port: PORT,
  fetch: withAccessLog(async function (req) {
    try {
      const url = new URL(req.url);
      const { pathname } = url;

      // GET /
      if (pathname === "/") {
        const visible = getVisibleArticles();
        if (visible.length === 0) return respond404();
        return Response.redirect(`/articles/${visible[0].slug}`, 302);
      }

      // GET /about
      if (pathname === "/about") {
        const about = getArticleBySlug("about");
        if (about) {
          const html = renderArticlePage(about, getTemplates());
          return new Response(html, HTML_HEADERS);
        }
      }

      // GET /tags
      if (pathname === "/tags") {
        const html = renderTagListing(getTemplates());
        return new Response(html, HTML_HEADERS);
      }

      // GET /articles
      if (pathname === "/articles") {
        const tag = url.searchParams.get("tag");
        let articles = getVisibleArticles();
        if (tag) {
          articles = articles.filter((a) =>
            (a.metadata.tags ?? []).includes(tag),
          );
        }
        const html = renderArticleList(articles, getTemplates());
        return new Response(html, HTML_HEADERS);
      }

      // GET /articles/:slug
      const articleMatch = pathname.match(/^\/articles\/([^/]+)$/);
      if (articleMatch) {
        const slug = articleMatch[1];
        const article = getArticleBySlug(slug);
        if (!article) return respond404();
        const html = renderArticlePage(article, getTemplates());
        return new Response(html, HTML_HEADERS);
      }

      // GET /images/:file
      const imageMatch = pathname.match(/^\/images\/(.+)$/);
      if (imageMatch) {
        const imagesDir = join(ROOT_DIR, "articles/public/images");
        return serveFileInDir(
          join(imagesDir, imageMatch[1]),
          imagesDir,
          respond404,
        );
      }

      // GET /css/:file
      const cssMatch = pathname.match(/^\/css\/(.+)$/);
      if (cssMatch) {
        const { CUSTOM_CSS_DIR } = getCustomDirs();
        if (CUSTOM_CSS_DIR) {
          const customResponse = await serveFileInDir(
            join(CUSTOM_CSS_DIR, cssMatch[1]),
            CUSTOM_CSS_DIR,
            respond404,
          );
          if (customResponse.status !== 404) return customResponse;
        }
        const cssDir = join(TEMPLATE_DIR, "css");
        return serveFileInDir(join(cssDir, cssMatch[1]), cssDir, respond404);
      }

      // GET /js/:file
      const jsMatch = pathname.match(/^\/js\/(.+)$/);
      if (jsMatch) {
        const { CUSTOM_JS_DIR } = getCustomDirs();
        if (CUSTOM_JS_DIR) {
          const customResponse = await serveFileInDir(
            join(CUSTOM_JS_DIR, jsMatch[1]),
            CUSTOM_JS_DIR,
            respond404,
          );
          if (customResponse.status !== 404) return customResponse;
        }
        const jsDir = join(ROOT_DIR, "articles/public/js");
        return serveFileInDir(join(jsDir, jsMatch[1]), jsDir, respond404);
      }

      // GET /favicon.ico
      if (pathname === "/favicon.ico") {
        return serveFile(
          join(ROOT_DIR, "articles/public/favicon.ico"),
          respond404,
        );
      }

      // GET /robots.txt
      if (pathname === "/robots.txt") {
        return serveFile(
          join(ROOT_DIR, "articles/public/robots.txt"),
          respond404,
        );
      }

      // AI CHAT
      if (pathname === "/api/chat") {
        return handleChat(req, server.requestIP(req)?.address);
      }

      // POST /webhook
      if (req.method === "POST" && pathname === "/webhook") {
        const webhookSecret = process.env.WEBHOOK_SECRET;
        if (!webhookSecret) {
          return new Response(
            JSON.stringify({ error: "webhook not configured" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (
          !secureCompare(
            req.headers.get("x-webhook-secret") ?? "",
            webhookSecret,
          )
        ) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        syncNow(handleSyncComplete);
        return new Response(JSON.stringify({ status: "sync triggered" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return respond404();
    } catch (err) {
      log.error("unhandled server error", {
        error: err.message,
        stack: err.stack,
      });
      return respond500();
    }
  }),
});

log.info("server started", { port: server.port });

function handleSyncComplete({ articlesChanged, templatesChanged }) {
  if (
    templatesChanged &&
    !process.env.LAYOUT_PATH &&
    process.env.TEMPLATES_REPO_URL
  ) {
    const customLayout = join(TEMPLATE_DIR, "layout.html");
    if (existsSync(customLayout)) {
      process.env.LAYOUT_PATH = customLayout;
      log.info("auto-set LAYOUT_PATH", { path: customLayout });
    }
  }
  if (articlesChanged) {
    reloadArticles();
    // The chat config ships in the articles repo, so it changes with them.
    reloadAiConfig();
  }
  if (templatesChanged) reloadTemplates();
}

if (process.env.ARTICLES_REPO_URL || process.env.TEMPLATES_REPO_URL) {
  initSync(handleSyncComplete).then(() => {
    startPolling(handleSyncComplete);
  });
}

export { server, reloadArticles };
