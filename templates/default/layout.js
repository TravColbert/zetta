import { getVisibleArticles, getAllTags } from "../../lib/articles.js";
import { escapeHtml } from "../../lib/utils.js";

export function renderLayout({ slug, title, keywords, description, body }) {
  const descTag = description
    ? `\n  <meta name="description" content="${escapeHtml(description)}">`
    : "";

  const articles = getVisibleArticles();
  const tags = getAllTags();

  const articleLinks = articles
    .map((a) => {
      const active = a.slug === slug ? ' class="active"' : "";
      return `      <li><a href="/articles/${a.slug}"${active}>${escapeHtml(a.metadata.title ?? 'TITLE NOT SET')}</a></li>`;
    })
    .join("\n");

  const tagLinks = tags
    .map(
      (t) =>
        `      <a href="/articles?tag=${encodeURIComponent(t)}" class="tag">${escapeHtml(t)}</a>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="keywords" content="${escapeHtml(keywords)}">${descTag}
  <title>${escapeHtml(title)} — Zetta</title>
  <link rel="stylesheet" href="/css/zetta.css">
  <link rel="icon" href="/favicon.ico">
</head>
<body>
  <header class="site-header">
    <h1><a href="/">Zetta</a></h1>
    <nav>
      <a href="/articles">Articles</a>
      <a href="/tags">Tags</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <h2>Articles</h2>
      <ul>
${articleLinks}
      </ul>
      <h2>Tags</h2>
      <div class="tag-cloud">
${tagLinks}
      </div>
    </aside>
    <main>
      ${body}
    </main>
  </div>
  <script src="/js/widget.js" defer></script>
</body>
</html>`;
}
