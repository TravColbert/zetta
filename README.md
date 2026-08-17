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
| `GET /css/:file`      | Serves the active theme's `css/:file`, falling back to the built-in theme's           |
| `GET /js/:file`       | Serves the active theme's `js/:file`, falling back to the built-in theme's            |
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
    publishedAt: "2024-01-15T00:00:00Z", // required — no date, no article
    tags: ["tag1", "tag2"], // optional
    blurb: "Short summary shown in listing", // optional
    order: 1, // optional — sort position, lowest first
    hidden: false, // optional — set true to hide from listing
  },
  content: `Your **Markdown** content here.`,
};
```

- Files prefixed with `!` (e.g. `!_new_article_template.js`) are ignored by the loader.
- `ai.js` is the chat configuration, not an article, and is never loaded as one.
- Articles without a valid `publishedAt` date are skipped.
- Order is `order` ascending — absent means `0` — then `publishedAt` descending within the same `order`. That decides the sidebar, the listings, and the `/` redirect.
- Hidden articles (`hidden: true`) are excluded from the listings and the `/` redirect, but are still served on their own URL and are still reachable by the assistant's `search_articles` and `read_article` tools.

## Themes

Everything about a site's appearance lives in one directory under `templates/`. Zetta ships one, `templates/default`, and a site picks a different one by name:

```
CUSTOM_THEME=my-theme      # renders from templates/my-theme
```

With `CUSTOM_THEME` unset, `templates/default` is used. The theme directory has a fixed shape, and every part of it is optional:

```
templates/my-theme/
├── layout.html         # the page wrapper
├── head.html           # partials that layout.html pulls in with {{> name}}
├── header.html
├── footer.html
├── partials/           # content partials — see the table below
│   ├── article.html
│   └── tag-list.html
├── css/                # served at /css/:file
│   └── app.css
└── js/                 # served at /js/:file
    └── widget.js
```

**A theme only has to ship what it wants to change.** Content partials, CSS files and JS files each fall through to `templates/default` file by file, so a theme with one `partials/article.html` and one `css/app.css` gets the rest of the pages, the reset stylesheet and the chat widget script from the built-in theme.

Note the two partial locations. `layout.html` resolves its `{{> name}}` tags against **the theme's own root directory**, which is where `head.html` and the like belong. The content partials that build the pages inside the layout are read from **`partials/`**. The distinction matters because only the second location falls through to the built-in theme.

### The layout

`layout.html` is the whole HTML document, with placeholders for the parts that change per page. A theme that has no `layout.html` — the built-in theme included — is rendered by `templates/default/layout.js` instead, which builds the same document in JS.

| Placeholder       | Value                                               |
| ----------------- | --------------------------------------------------- |
| `{{slug}}`        | Article slug (empty on non-article pages)           |
| `{{title}}`       | Article title or page name                          |
| `{{keywords}}`    | Comma-separated list of tags                        |
| `{{description}}` | Article blurb (empty if none)                       |
| `{{body}}`        | Rendered HTML content                               |
| `{{chatWidget}}`  | Chat widget script tag, or empty when chat is off   |
| `{{> name}}`      | Contents of `name.html` from the theme directory    |

`{{body}}` is inserted as-is, since it is already-rendered HTML. Everything else is HTML-escaped, because it lands in a `<title>` or an attribute value where a stray quote or angle bracket in an article's own metadata would otherwise break out of the tag.

The chat widget inherits the page's font and text color, and everything else
about its appearance is a `--zai-*` custom property you can set from your own
stylesheet. Its CSS is inserted ahead of yours in `<head>`, so your rules
override it on source order without `!important`. The full variable list is in
the [Custom Templates](articles/3-custom-templates.js) article.

### Custom 404 page

Set `NOT_FOUND_PATH` to the path of any HTML file to replace the built-in 404 page. `templates/default/partials/404.html` is the built-in page and serves as a starting point.

### Custom 500 page

Set `SERVER_ERROR_PATH` to the path of any HTML file to replace the built-in 500 page. `templates/default/partials/500.html` is the built-in page and serves as a starting point.

### How `{{> name}}` is resolved

A `{{> head}}` tag is replaced with the contents of `head.html`. Which directory that is read from depends on the file holding the tag:

- **`layout.html`** and the custom **404/500** pages read from their own directory. For a theme's layout that is the theme root; for a file named by `NOT_FOUND_PATH` or `SERVER_ERROR_PATH` it is wherever that file sits.
- **Content partials** read from the theme's `partials/`, then from `templates/default/partials/`.

Partials are resolved at startup — no runtime overhead. Partials themselves do not expand further `{{> ...}}` tags (single-level only). If a partial file is not found, a warning is logged and the tag resolves to an empty string.

### Content partials

The article and listing pages are assembled from the partial files below. Each is read from the active theme's `partials/` directory if it has one, and from `templates/default/partials/` otherwise.

| File                      | Used for                                              | Placeholders                                                                 |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `article.html`            | Article page wrapper                                  | `{{title}}`, `{{slug}}`, `{{author}}`, `{{date}}`, `{{tags}}`, `{{content}}` |
| `article-tag.html`        | Each tag link on an article page                      | `{{tag}}`, `{{url}}`                                                         |
| `article-list.html`       | Article list page wrapper                             | `{{items}}`                                                                  |
| `article-list-item.html`  | Each row in the article list                          | `{{slug}}`, `{{title}}`, `{{date}}`, `{{blurb}}`, `{{tags}}`                 |
| `tag-list.html`           | Tag listing page wrapper                              | `{{items}}`                                                                  |
| `tag-list-item.html`      | Each tag link, in the tag listing and on list rows    | `{{tag}}`, `{{url}}`                                                         |
| `listing-item-blurb.html` | Blurb paragraph in a list row (omitted when no blurb) | `{{blurb}}`                                                                  |
| `404.html` / `500.html`   | Error page bodies, wrapped in the layout              | _(none)_                                                                     |

`/articles?tag=name` is rendered with the same `article-list.html` and `article-list-item.html` as the unfiltered listing.

`templates/default/partials/` also holds four files no renderer reads: `listing.html`, `listing-item.html`, `tag-cloud-item.html` and `clear-filter.html`, left from an earlier tag-filtered view, plus `head.html`, which only a `layout.html` sitting in `templates/default/` itself could resolve. Overriding any of them in a theme has no effect.

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
no `systemPrompt`, the chat is disabled and the reason is logged — a bad commit in
your articles repo cannot take the blog down. It is re-read on every git sync.
A missing `ANTHROPIC_API_KEY` disables the chat without logging anything.

Fixed limits, enforced in `lib/guards.js`, `lib/chat.js` and `lib/tools.js`: 2,000
characters per message, 40 messages per conversation, 12 requests per minute per
address, 6 tool rounds per answer, 8 results per search, 4,096 output tokens per
answer. That last figure is `max_tokens`, which the model's thinking and its
reply text share — it is not a reply-length limit.

The widget is injected by the layout. The built-in layout does this for you;
a custom HTML layout places it with `{{chatWidget}}`, which renders the script
tag when chat is on and nothing when it is off.

## Environment Variables

| Variable                | Default  | Description                                                                                                                               |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                  | `3000`   | Port the server listens on                                                                                                                |
| `CUSTOM_THEME`          | _(none)_ | Name of a directory under `templates/` to render from. Unset means `templates/default`                                                     |
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
| `ANTHROPIC_MODEL`       | `claude-sonnet-5` | Model the assistant calls. `claude-opus-5` is stronger and slower; `claude-haiku-4-5` rejects the `effort` value sent in every request and will 400 |
| `RESERVATION_WEBHOOK_URL` | _(none)_ | Where completed booking and message actions are POSTed. Signed with `WEBHOOK_SECRET` when one is set                                    |
| `ARTICLES_DIR`          | `articles/` | Absolute path to render articles from. Only the tests set this                                                                          |
| `TEMPLATE_DIR`          | _(none)_ | Absolute path to a theme directory, taking precedence over `CUSTOM_THEME`. Only the tests set this                                        |

### Git-Based Content Syncing

Zetta can sync the articles directory and the active theme directory from separate git repos at runtime. Set `ARTICLES_REPO_URL` and/or `TEMPLATES_REPO_URL` to enable; either one works on its own. Content is cloned on startup (non-blocking) and kept in sync by polling. Push a webhook to trigger an immediate sync:

```bash
curl -X POST -H "X-Webhook-Secret: mysecret" http://localhost:3000/webhook
```

A repo is cloned over the directory it targets: `ARTICLES_REPO_URL` into `articles/`, and `TEMPLATES_REPO_URL` into `templates/<CUSTOM_THEME>/`. **A templates sync therefore needs `CUSTOM_THEME` set** — without a theme of its own the target would be `templates/default`, and the sync would clone over the templates that ship with Zetta. It is skipped with no error if `CUSTOM_THEME` is unset.

The first clone into a directory that already has content goes to a temporary directory and is swapped into place, so a failed clone leaves the running site with its current content rather than nothing to serve. After that, syncs are `git pull --ff-only`. Articles and templates are reloaded only when the pull actually moved `HEAD`; the chat configuration is re-read with the articles, since it ships alongside them.

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
CUSTOM_THEME=my-theme
```

Note that Bun loads `.env` for `bun test` as well as for the server. The test suite clears the settings that would otherwise change what it renders — see `tests/setup.js`.

## Project Structure

```
zetta/
├── articles/           # Article JS modules + public assets
│   ├── ai.js               # Chat assistant config (prompt + tools)
│   ├── topics.md           # Topic policy served to the assistant
│   └── public/
│       ├── images/
│       ├── favicon.ico
│       └── robots.txt
├── templates/
│   ├── default/                   # Built-in theme; every other theme falls back to it
│   │   ├── layout.js                  # Built-in layout (JS, used when a theme has no layout.html)
│   │   ├── css/
│   │   │   ├── reset.css
│   │   │   └── app.css
│   │   ├── js/
│   │   │   └── widget.js              # Chat widget
│   │   └── partials/
│   │       ├── article.html           # Article page structure
│   │       ├── article-tag.html       # Tag link on article page
│   │       ├── article-list.html      # Article list page structure
│   │       ├── article-list-item.html # Article list row
│   │       ├── tag-list.html          # Tag listing structure
│   │       ├── tag-list-item.html     # Tag link in the tag listing
│   │       ├── listing-item-blurb.html # Blurb paragraph in a list row
│   │       ├── 404.html               # Built-in 404 page
│   │       ├── 500.html               # Built-in 500 page
│   │       ├── head.html              # Unread — see "Content partials"
│   │       ├── listing.html           # Unread — left from an earlier listing view
│   │       ├── listing-item.html      # Unread
│   │       ├── tag-cloud-item.html    # Unread
│   │       └── clear-filter.html      # Unread
│   └── <CUSTOM_THEME>/            # The site's own theme (gitignored — its own repo)
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
├── tests/              # Test suite (bun test)
│   ├── setup.js            # Preload: scratch directories, and clears .env settings
│   └── fixtures/           # Fixture articles, chat configs and a partial theme
├── server.js           # HTTP server
├── bunfig.toml         # Registers the test preload
└── package.json
```

## Tests

```bash
bun test
```

The suite renders into scratch directories under `tests/.work/` rather than into `articles/` and `templates/`, so a run leaves the working tree alone — which matters because in a real deployment those directories hold content from another repo. `tests/setup.js` sets that up and clears the deployment settings Bun would otherwise load from `.env`.

The theme layer is decided when `lib/config.js` is first imported, and one `bun test` run shares a single process. `tests/theme.test.js` therefore starts a server in a subprocess to exercise a custom theme end to end.
