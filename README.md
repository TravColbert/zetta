# Zetta

A minimal blog engine built with [Bun](https://bun.sh). Articles are plain JS modules on disk; the server renders them to HTML with no database.

## Requirements

- [Bun](https://bun.sh) v1.0+

## Getting Started

```bash
bun install
bun run server.js
```

The server starts on port 3000 by default: `http://localhost:3000`

## Routes

| Route | Description |
|---|---|
| `GET /` | Redirects to the most recent visible article |
| `GET /about` | Renders the `about` article as a standalone page |
| `GET /tags` | Tag listing page showing all tags |
| `GET /articles` | Article listing, supports `?tag=` filter |
| `GET /articles/:slug` | Individual article page |
| `GET /images/:file` | Serves `articles/public/images/:file` |
| `GET /css/:file` | Serves custom CSS (if `LAYOUT_PATH` set) with fallback to `articles/public/css/:file` |
| `GET /favicon.ico` | Serves `articles/public/favicon.ico` |
| `GET /robots.txt` | Serves `articles/public/robots.txt` |
| `POST /webhook` | Triggers immediate git sync (requires `WEBHOOK_SECRET`) |

## Articles

Articles live in the `articles/` directory as CommonJS `.js` files. Each file exports a `metadata` object and a `content` string (Markdown).

```js
module.exports = {
  metadata: {
    title: 'My Article Title',
    author: 'Your Name',
    publishedAt: '2024-01-15T00:00:00Z',  // required — determines sort order
    tags: ['tag1', 'tag2'],               // optional
    blurb: 'Short summary shown in listing', // optional
    hidden: false,                         // optional — set true to hide from listing
  },
  content: `Your **Markdown** content here.`,
};
```

- Files prefixed with `!` (e.g. `!_new_article_template.js`) are ignored by the loader.
- Articles without a valid `publishedAt` date are skipped.
- Hidden articles (`hidden: true`) are excluded from the listing and the `/` redirect, but are still accessible by direct URL.

## Layout / Templating

The HTML wrapper is resolved at startup:

1. **Custom layout** — set `LAYOUT_PATH` to the path of an HTML file. The file must contain `{{title}}`, `{{keywords}}`, and `{{body}}` placeholders.
2. **Built-in fallback** — if `LAYOUT_PATH` is unset or the file doesn't exist, `templates/default/layout.js` is used.

`templates/default/layout.html` is a reference copy of the built-in layout in HTML form — copy it somewhere outside the repo and point `LAYOUT_PATH` at it to customize.

### Custom 404 page

Set `NOT_FOUND_PATH` to the path of any HTML file to replace the built-in 404 page. `templates/default/partials/404.html` is the built-in page and serves as a starting point.

### Custom 500 page

Set `SERVER_ERROR_PATH` to the path of any HTML file to replace the built-in 500 page. `templates/default/partials/500.html` is the built-in page and serves as a starting point.

### Partials

Templates support `{{> name}}` partial inclusion. When a template contains `{{> head}}`, the server replaces it with the contents of `head.html` from the partials directory for that template:

- **Built-in templates** (`layout.html`, `404.html`, `500.html`): partials are loaded from `templates/default/partials/`.
- **Custom templates** (set via env vars): layout partials are loaded from the **same directory as the custom template file**; content partials are loaded from a `partials/` subdirectory next to the layout file.

Partials are resolved at startup — no runtime overhead. Partials themselves do not expand further `{{> ...}}` tags (single-level only). If a partial file is not found, a warning is logged and the tag resolves to an empty string.

### Custom layout placeholders

| Placeholder | Value |
|---|---|
| `{{slug}}` | Article slug (empty on non-article pages) |
| `{{title}}` | Article title or page name |
| `{{keywords}}` | Comma-separated list of tags |
| `{{description}}` | Article blurb (empty if none) |
| `{{body}}` | Rendered HTML content |
| `{{> name}}` | Contents of `name.html` from the partials directory |

### Content partials

The article and listing pages are assembled from partial files in `templates/partials/`. When `LAYOUT_PATH` is set, custom content partials are loaded from a `partials/` subdirectory next to the layout file, with per-file fall-through to the built-in versions.

| File | Used for | Placeholders |
|---|---|---|
| `article.html` | Article page wrapper | `{{title}}`, `{{slug}}`, `{{author}}`, `{{date}}`, `{{tags}}`, `{{content}}` |
| `article-tag.html` | Each tag link on an article page | `{{tag}}`, `{{url}}` |
| `article-list.html` | Article list page wrapper | `{{items}}` |
| `article-list-item.html` | Each row in the article list | `{{slug}}`, `{{title}}`, `{{date}}`, `{{blurb}}`, `{{tags}}` |
| `tag-list.html` | Tag listing page wrapper | `{{items}}` |
| `tag-list-item.html` | Each tag link in the tag listing | `{{tag}}`, `{{url}}` |
| `listing.html` | Listing page wrapper (tag-filtered view) | `{{tag_cloud}}`, `{{clear_filter}}`, `{{items}}` |
| `listing-item.html` | Each row in the filtered listing | `{{slug}}`, `{{title}}`, `{{date}}`, `{{blurb}}` |
| `listing-item-blurb.html` | Blurb paragraph (omitted when no blurb) | `{{blurb}}` |
| `tag-cloud-item.html` | Each tag in the tag cloud on listing pages | `{{tag}}`, `{{url}}`, `{{active_class}}` |
| `clear-filter.html` | "Clear filter" link (shown when tag filter is active) | _(none)_ |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `LAYOUT_PATH` | _(none)_ | Path to a custom HTML layout file. Also enables custom partials (`partials/` subdir) and custom CSS (`css/` subdir) relative to this file |
| `NOT_FOUND_PATH` | _(none)_ | Path to a custom 404 HTML file |
| `SERVER_ERROR_PATH` | _(none)_ | Path to a custom 500 HTML file |
| `ARTICLES_REPO_URL` | _(none)_ | Git HTTPS URL for articles repo |
| `ARTICLES_REPO_BRANCH` | `main` | Branch to checkout for articles repo |
| `TEMPLATES_REPO_URL` | _(none)_ | Git HTTPS URL for custom templates repo |
| `TEMPLATES_REPO_BRANCH` | `main` | Branch to checkout for templates repo |
| `GIT_TOKEN` | _(none)_ | Personal access token for private repos |
| `SYNC_INTERVAL` | `300` | Polling interval in seconds for git sync |
| `WEBHOOK_SECRET` | _(none)_ | Shared secret for webhook validation |

When `LAYOUT_PATH` is set, content partials are loaded from a `partials/` subdirectory next to the layout file, with per-file fall-through to the built-in versions. CSS files are similarly resolved from a `css/` subdirectory before falling back to `articles/public/css/`.

### Git-Based Content Syncing

Zetta can sync `articles/` and `templates/custom/` from separate git repos at runtime. Set `ARTICLES_REPO_URL` and/or `TEMPLATES_REPO_URL` to enable. Content is cloned on startup (non-blocking) and kept in sync via polling. Push a webhook to trigger immediate sync:

```bash
curl -X POST -H "X-Webhook-Secret: mysecret" http://localhost:3000/webhook
```

When `TEMPLATES_REPO_URL` is set but `LAYOUT_PATH` is not, `LAYOUT_PATH` is auto-set to `templates/custom/layout.html` after the templates repo is cloned.

### Docker

```bash
docker build -t zetta .
docker run -p 8080:8080 -e ARTICLES_REPO_URL=https://github.com/you/articles.git zetta
```

Variables can be set in a `.env` file in the project root — Bun loads it automatically.

```
PORT=8080
LAYOUT_PATH=/path/to/my/layout.html
```

## Project Structure

```
zetta/
├── articles/           # Article JS modules + public assets
│   └── public/
│       ├── css/
│       ├── images/
│       ├── favicon.ico
│       └── robots.txt
├── templates/
│   ├── default/                   # Built-in templates
│   │   ├── partials/
│   │   │   ├── head.html              # Shared <head> fragment
│   │   │   ├── article.html           # Article page structure
│   │   │   ├── article-tag.html       # Tag link on article page
│   │   │   ├── listing.html           # Listing page structure (tag-filtered view)
│   │   │   ├── listing-item.html      # Listing row
│   │   │   ├── listing-item-blurb.html # Blurb paragraph
│   │   │   ├── tag-cloud-item.html    # Tag cloud link
│   │   │   ├── clear-filter.html      # Clear filter link
│   │   │   ├── 404.html              # Built-in 404 page
│   │   │   └── 500.html              # Built-in 500 page
│   │   ├── layout.js             # Built-in layout (JS)
│   │   └── layout.html           # Reference layout (HTML, for customization)
│   └── custom/                    # Custom templates (git-synced or manual, gitignored)
├── articles.js         # Article loader
├── server.js           # HTTP server
├── git-sync.js         # Git-based content syncing
├── robots.txt          # Robots.txt (fallback)
└── package.json
```
