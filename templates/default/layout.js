import { getVisibleArticles, getAllTags } from '../../articles.js';

export function renderLayout({ slug, title, keywords, description, body }) {
  const descTag = description
    ? `\n  <meta name="description" content="${description}">`
    : '';

  const articles = getVisibleArticles();
  const tags = getAllTags();

  const articleLinks = articles
    .map(a => {
      const active = a.slug === slug ? ' class="active"' : '';
      return `      <li><a href="/articles/${a.slug}"${active}>${a.metadata.title}</a></li>`;
    })
    .join('\n');

  const tagLinks = tags
    .map(t => `      <a href="/articles?tag=${encodeURIComponent(t)}" class="tag">${t}</a>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="keywords" content="${keywords ?? ''}">${descTag}
  <title>${title} — Zetta</title>
  <link rel="stylesheet" href="/css/reset.css">
  <link rel="icon" href="/favicon.ico">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #222; }
    .site-header { background: #1a1a2e; color: #fff; padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; }
    .site-header h1 { font-size: 1.25rem; }
    .site-header h1 a { color: #fff; text-decoration: none; }
    .site-header nav a { color: #ccc; text-decoration: none; margin-left: 1.5rem; font-size: 0.9rem; }
    .site-header nav a:hover { color: #fff; }
    .layout { display: flex; min-height: calc(100vh - 56px); }
    .sidebar { width: 260px; flex-shrink: 0; background: #f5f5f7; border-right: 1px solid #e0e0e0; padding: 1.5rem 1rem; font-size: 0.9rem; }
    .sidebar h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 0.5rem; }
    .sidebar ul { list-style: none; margin-bottom: 1.5rem; }
    .sidebar li { margin-bottom: 0.25rem; }
    .sidebar a { color: #333; text-decoration: none; }
    .sidebar a:hover { color: #0066cc; }
    .sidebar a.active { font-weight: 600; color: #0066cc; }
    .sidebar .tag-cloud { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.5rem; }
    .sidebar .tag { background: #e0e0e0; padding: 0.15rem 0.5rem; border-radius: 3px; font-size: 0.8rem; color: #444; text-decoration: none; }
    .sidebar .tag:hover { background: #d0d0d0; }
    main { flex: 1; padding: 2rem 3rem; max-width: 860px; }
    main h1 { margin-bottom: 0.5rem; }
    main .meta { color: #666; font-size: 0.9rem; margin-bottom: 1rem; }
    main .tags { margin-bottom: 1rem; }
    main .tags .tag { background: #e8e8e8; padding: 0.15rem 0.5rem; border-radius: 3px; font-size: 0.8rem; color: #444; text-decoration: none; }
    main a { color: #0066cc; }
    main pre { background: #f5f5f7; padding: 1rem; border-radius: 4px; overflow-x: auto; margin: 1rem 0; }
    main code { font-size: 0.9em; }
    main table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
    main th, main td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
    main th { background: #f5f5f7; }
    main ul, main ol { margin: 1rem 0 1rem 1.5rem; }
    main li { margin-bottom: 0.25rem; }
    .article-list { list-style: none; padding: 0; }
    .article-list-item { margin-bottom: 1.25rem; padding-bottom: 1.25rem; border-bottom: 1px solid #eee; }
    .article-list-item a { font-size: 1.1rem; font-weight: 600; }
    .article-list-item .date { color: #888; font-size: 0.85rem; margin-left: 0.5rem; }
    @media (max-width: 768px) {
      .layout { flex-direction: column; }
      .sidebar { width: 100%; border-right: none; border-bottom: 1px solid #e0e0e0; }
      main { padding: 1.5rem; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <h1><a href="/">Zetta</a></h1>
    <nav>
      <a href="/articles">Articles</a>
      <a href="/tags">Tags</a>
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
</body>
</html>`;
}
