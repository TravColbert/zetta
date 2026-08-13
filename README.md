# Zetta

A minimal, AI-powered, blog engine built with [Bun](https://bun.sh). Articles are plain JS modules on disk; the server renders them to HTML with no database.

## Requirements

- [Bun](https://bun.sh) v1.0+

## Getting Started

```bash
bun install
bun run server.js
```

The server starts on port 3000 by default: `http://localhost:3000`

## Routes

| Route                 | Description                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- |
| `GET /`               | Redirects to the most recent visible article                                          |
| `GET /about`          | Renders the `about` article as a standalone page                                      |
| `GET /tags`           | Tag listing page showing all tags                                                     |
| `GET /articles`       | Article listing, supports `?tag=` filter                                              |
| `GET /articles/:slug` | Individual article page                                                               |
| `GET /images/:file`   | Serves `articles/public/images/:file`                                                 |
| `GET /css/:file`      | Serves custom CSS (if `LAYOUT_PATH` set) with fallback to `articles/public/css/:file` |
| `GET /favicon.ico`    | Serves `articles/public/favicon.ico`                                                  |
| `GET /robots.txt`     | Serves `articles/public/robots.txt`                                                   |
| `POST /api/chat`      | Chat assistant (503 unless chat is configured — see below)                            |
| `POST /webhook`       | Triggers immediate git sync (requires `WEBHOOK_SECRET`)                               |

## Articles

Articles live in the `articles/` directory as CommonJS `.js` files. Each file exports a `metadata` object and a `content` string (Markdown).

```js
module.exports = {
  metadata: {
    title: "My Article Title",
    author: "Your Name",
    publishedAt: "2024-01-15T00:00:00Z", // required — determines sort order
    tags: ["tag1", "tag2"], // optional
    blurb: "Short summary shown in listing", // optional
    hidden: false, // optional — set true to hide from listing
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

### Custom 404 page

Set `NOT_FOUND_PATH` to the path of any HTML file to replace the built-in 404 page. `templates/default/partials/404.html` is the built-in page and serves as a starting point.

### Custom 500 page

Set `SERVER_ERROR_PATH` to the path of any HTML file to replace the built-in 500 page. `templates/default/partials/500.html` is the built-in page and serves as a starting point.

### Partials

Templates support `{{> name}}` partial inclusion. When a template contains `{{> head}}`, the server replaces it with the contents of `head.html` from the partials directory for that template:

- **Built-in templates** (`404.html`, `500.html`): partials are loaded from `templates/default/partials/`.
- **Custom templates** (set via env vars): layout partials are loaded from the **same directory as the custom template file**; content partials are loaded from a `partials/` subdirectory next to the layout file.

Partials are resolved at startup — no runtime overhead. Partials themselves do not expand further `{{> ...}}` tags (single-level only). If a partial file is not found, a warning is logged and the tag resolves to an empty string.

### Custom layout placeholders

| Placeholder       | Value                                               |
| ----------------- | --------------------------------------------------- |
| `{{slug}}`        | Article slug (empty on non-article pages)           |
| `{{title}}`       | Article title or page name                          |
| `{{keywords}}`    | Comma-separated list of tags                        |
| `{{description}}` | Article blurb (empty if none)                       |
| `{{body}}`        | Rendered HTML content                               |
| `{{chatWidget}}`  | Chat widget script tag, or empty when chat is off   |
| `{{> name}}`      | Contents of `name.html` from the partials directory |

The chat widget inherits the page's font and text color, and everything else
about its appearance is a `--zai-*` custom property you can set from your own
stylesheet. Its CSS is inserted ahead of yours in `<head>`, so your rules
override it on source order without `!important`. The full variable list is in
the [Custom Templates](articles/3-custom-templates.js) article.

### Content partials

The article and listing pages are assembled from partial files in `templates/partials/`. When `LAYOUT_PATH` is set, custom content partials are loaded from a `partials/` subdirectory next to the layout file, with per-file fall-through to the built-in versions.

| File                      | Used for                                              | Placeholders                                                                 |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `article.html`            | Article page wrapper                                  | `{{title}}`, `{{slug}}`, `{{author}}`, `{{date}}`, `{{tags}}`, `{{content}}` |
| `article-tag.html`        | Each tag link on an article page                      | `{{tag}}`, `{{url}}`                                                         |
| `article-list.html`       | Article list page wrapper                             | `{{items}}`                                                                  |
| `article-list-item.html`  | Each row in the article list                          | `{{slug}}`, `{{title}}`, `{{date}}`, `{{blurb}}`, `{{tags}}`                 |
| `tag-list.html`           | Tag listing page wrapper                              | `{{items}}`                                                                  |
| `tag-list-item.html`      | Each tag link in the tag listing                      | `{{tag}}`, `{{url}}`                                                         |
| `listing.html`            | Listing page wrapper (tag-filtered view)              | `{{tag_cloud}}`, `{{clear_filter}}`, `{{items}}`                             |
| `listing-item.html`       | Each row in the filtered listing                      | `{{slug}}`, `{{title}}`, `{{date}}`, `{{blurb}}`                             |
| `listing-item-blurb.html` | Blurb paragraph (omitted when no blurb)               | `{{blurb}}`                                                                  |
| `tag-cloud-item.html`     | Each tag in the tag cloud on listing pages            | `{{tag}}`, `{{url}}`, `{{active_class}}`                                     |
| `clear-filter.html`       | "Clear filter" link (shown when tag filter is active) | _(none)_                                                                     |

## Chat Assistant

Zetta ships an optional chat widget that answers questions about your site from
your published articles. It is off until you set `ANTHROPIC_API_KEY`. Its
configuration lives in `articles/ai.js`, so it travels with your articles repo
rather than with the server.

```js
module.exports = {
  // Required. Without it the chat stays off.
  systemPrompt: `You are the assistant on ...`,

  // Optional widget text.
  greeting: 'Ask me about this site.',
  label: 'Ask a question',

  // Optional. Each entry is one of the three forms below.
  tools: [
    { tool: 'get_about', slug: 'about', description: 'Call this when ...' },
    { tool: 'check_topic_policy', file: 'topics.md', description: 'Call this when ...' },
    { tool: 'leave_message' },
  ],
};
```

| Entry form                     | Behavior                                             |
| ------------------------------ | ---------------------------------------------------- |
| `{ tool, slug, description }`  | Serves that published article to the model            |
| `{ tool, file, description }`  | Serves that file from the articles directory          |
| `{ tool }`                     | Enables one of the built-in action tools              |

`search_articles` and `read_article` are always available, so the assistant can
answer from anything you publish without listing it here. An entry whose article
is unpublished or whose file is missing is dropped from the tool list with a
warning rather than offered to the model.

The built-in action tools are `leave_message`, `reserve_speaking_date`, and
`reserve_consultation_meeting`. They appear only when `tools` names them.
Completed actions are logged and POSTed to `RESERVATION_WEBHOOK_URL` if set;
nothing is stored by Zetta itself.

`articles/ai.js` is never loaded as an article. If it is missing, throws, or has
no `systemPrompt`, the chat is disabled and the error is logged — a bad commit in
your articles repo cannot take the blog down. It is re-read on every git sync.

The widget is injected by the layout. The built-in layout does this for you;
a custom HTML layout places it with `{{chatWidget}}`, which renders the script
tag when chat is on and nothing when it is off.

## Environment Variables

| Variable                | Default  | Description                                                                                                                               |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                  | `3000`   | Port the server listens on                                                                                                                |
| `LAYOUT_PATH`           | _(none)_ | Path to a custom HTML layout file. Also enables custom partials (`partials/` subdir) and custom CSS (`css/` subdir) relative to this file |
| `NOT_FOUND_PATH`        | _(none)_ | Path to a custom 404 HTML file                                                                                                            |
| `SERVER_ERROR_PATH`     | _(none)_ | Path to a custom 500 HTML file                                                                                                            |
| `ARTICLES_REPO_URL`     | _(none)_ | Git HTTPS URL for articles repo                                                                                                           |
| `ARTICLES_REPO_BRANCH`  | `main`   | Branch to checkout for articles repo                                                                                                      |
| `TEMPLATES_REPO_URL`    | _(none)_ | Git HTTPS URL for custom templates repo                                                                                                   |
| `TEMPLATES_REPO_BRANCH` | `main`   | Branch to checkout for templates repo                                                                                                     |
| `GIT_TOKEN`             | _(none)_ | Personal access token for private repos                                                                                                   |
| `SYNC_INTERVAL`         | `300`    | Polling interval in seconds for git sync                                                                                                  |
| `WEBHOOK_SECRET`        | _(none)_ | Shared secret for webhook validation                                                                                                      |
| `ANTHROPIC_API_KEY`     | _(none)_ | Enables the chat assistant. Without it there is no widget and `/api/chat` answers 503                                                     |
| `ANTHROPIC_MODEL`       | `claude-opus-5` | Model the assistant calls                                                                                                          |
| `RESERVATION_WEBHOOK_URL` | _(none)_ | Where completed booking and message actions are POSTed. Signed with `WEBHOOK_SECRET` when one is set                                    |

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
## or: For a container that does not stick around after you exit:
docker run --rm -it --init -p 8080:8080 -e ARTICLES_REPO_URL=https://github.com/you/articles.git zetta
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
│   ├── ai.js               # Chat assistant config (prompt + tools)
│   ├── topics.md           # Topic policy served to the assistant
│   └── public/
│       ├── css/
│       ├── js/
│       │   └── widget.js       # Chat widget
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
│   │   └── layout.js             # Built-in layout (JS)
│   └── custom/                    # Custom templates (git-synced or manual, gitignored)
├── lib/                # Application modules
│   ├── config.js           # Paths and env-derived settings
│   ├── articles.js         # Article loader
│   ├── renderers.js        # Page rendering
│   ├── template-engine.js  # Template/partial loading
│   ├── static-files.js     # Static file serving
│   ├── git-sync.js         # Git-based content syncing
│   ├── ai.js               # Chat config loader + widget tag
│   ├── chat.js             # /api/chat handler and tool loop
│   ├── tools.js            # Tool definitions and dispatch
│   ├── guards.js           # Request size and rate limits
│   ├── webhook.js          # Outbound action webhook
│   ├── logger.js           # NDJSON logging
│   └── utils.js            # Markdown and HTML escaping helpers
├── server.js           # HTTP server
├── robots.txt          # Robots.txt (fallback)
└── package.json
```
