module.exports = {
  metadata: {
    title: 'Custom Templates',
    author: 'Zetta',
    publishedAt: '2025-01-03 00:00:00 +00:00',
    tags: ['zetta', 'documentation', 'templates'],
    blurb: 'Customize your blog appearance with templates and partials.',
    order: 3
  },
  content: `
Zetta uses a simple Mustache-style template system with \`{{placeholder}}\` substitution. Everything about your site's appearance lives in one theme directory, and you override as much or as little of the built-in theme as you like.

## Themes

A theme is a directory under \`templates/\`. Zetta ships one, \`templates/default\`, and a site picks a different one by name:

\`\`\`bash
CUSTOM_THEME=my-theme      # renders from templates/my-theme
\`\`\`

With \`CUSTOM_THEME\` unset, \`templates/default\` is used. The directory has a fixed shape, and every part of it is optional:

\`\`\`
templates/my-theme/
├── layout.html         # the page wrapper
├── head.html           # partials that layout.html pulls in with {{> name}}
├── partials/           # content partials — see the table below
│   ├── article.html
│   └── tag-list.html
├── css/                # served at /css/:file
│   └── app.css
└── js/                 # served at /js/:file
    └── widget.js
\`\`\`

**A theme only has to ship what it wants to change.** Content partials, CSS files and JS files each fall through to \`templates/default\` file by file. A theme with nothing but its own \`partials/article.html\` and \`css/app.css\` still gets every other page, the reset stylesheet, and the chat widget script from the built-in theme.

## The layout

\`layout.html\` is the whole HTML document, with placeholders for the parts that change per page. A theme with no \`layout.html\` — the built-in theme included — is rendered by \`templates/default/layout.js\`, which builds the same document in JS.

| Placeholder | Description |
|---|---|
| \`{{title}}\` | Article title or page name |
| \`{{slug}}\` | Article slug (empty on non-article pages) |
| \`{{keywords}}\` | Comma-separated tags |
| \`{{description}}\` | Article blurb (empty if none) |
| \`{{body}}\` | Rendered page content |
| \`{{chatWidget}}\` | Chat widget script tag, or nothing when the assistant is off |
| \`{{> name}}\` | Contents of \`name.html\` from the theme's root directory |

\`{{body}}\` is inserted as-is, since it is already rendered HTML. Everything else is HTML-escaped, because it lands in a \`<title>\` or an attribute value where a stray quote or angle bracket in an article's own metadata would break out of the tag.

## Partials

Partials are reusable HTML fragments included with \`{{> name}}\`. There are two locations, and the difference matters:

- \`layout.html\` resolves its \`{{> name}}\` tags against **the theme's own root directory**. That is where \`head.html\` and the like belong. This location does not fall through — a tag whose file is missing logs a warning and renders as nothing.
- **Content partials**, the fragments that build the pages inside the layout, are read from **\`partials/\`**, falling back to \`templates/default/partials/\` file by file.

Partials are resolved at startup, so there is no runtime cost. They are single-level: a partial's own \`{{> ...}}\` tags are not expanded.

### Content partials

| File | Used for | Placeholders |
|---|---|---|
| \`article.html\` | Article page wrapper | \`{{title}}\`, \`{{slug}}\`, \`{{author}}\`, \`{{date}}\`, \`{{tags}}\`, \`{{content}}\` |
| \`article-tag.html\` | Each tag link on an article page | \`{{tag}}\`, \`{{url}}\` |
| \`article-list.html\` | Article list wrapper, including the tag-filtered view | \`{{items}}\` |
| \`article-list-item.html\` | Each row in the article list | \`{{slug}}\`, \`{{title}}\`, \`{{date}}\`, \`{{blurb}}\`, \`{{tags}}\` |
| \`listing-item-blurb.html\` | Blurb paragraph in a list row, omitted when an article has no blurb | \`{{blurb}}\` |
| \`tag-list.html\` | Tag listing page wrapper | \`{{items}}\` |
| \`tag-list-item.html\` | Each tag link, in the tag listing and on list rows | \`{{tag}}\`, \`{{url}}\` |
| \`404.html\` / \`500.html\` | Error page bodies, wrapped in the layout | _(none)_ |

\`/articles?tag=name\` is rendered with the same \`article-list.html\` and \`article-list-item.html\` as the unfiltered listing.

## Custom error pages

Set \`NOT_FOUND_PATH\` or \`SERVER_ERROR_PATH\` to the path of an HTML file to replace the built-in 404 or 500 page entirely, layout and all. Those two files resolve \`{{> name}}\` tags against their own directory. Leave them unset and the theme's \`partials/404.html\` and \`partials/500.html\` are used inside the normal layout instead.

## Stylesheets and scripts

\`/css/:file\` and \`/js/:file\` are served from the active theme's \`css/\` and \`js/\` directories, each file falling back to the built-in theme's. The built-in theme ships \`css/reset.css\`, \`css/app.css\`, and \`js/widget.js\`; the layout links \`/css/app.css\`.

Images, \`favicon.ico\`, and \`robots.txt\` are not part of a theme — they come from \`articles/public/\`, alongside your content.

## Styling the Chat Widget

If you have enabled the [AI assistant](/articles/4-ai), place its widget in your layout with \`{{chatWidget}}\`, just before the closing \`</body>\` tag:

\`\`\`html
  {{chatWidget}}
</body>
\`\`\`

The placeholder renders a script tag when the assistant is configured and nothing at all when it is not, so the same layout works either way.

Out of the box the widget inherits your page's font and text color, and mixes its own borders and message bubbles from that text color. On most themes it will already look like it belongs. Everything else is a CSS custom property you can set from your own stylesheet:

| Variable | Default | Controls |
|---|---|---|
| \`--zai-accent-bg\` | \`#1f2328\` | Launcher, send button, and visitor's message bubbles |
| \`--zai-accent-fg\` | \`#fff\` | Text on those |
| \`--zai-accent-bg-hover\` | \`#33383f\` | Launcher hover |
| \`--zai-accent\` | \`var(--z-link-color)\` | Focus ring and debug trace marker |
| \`--zai-bg\` | \`Canvas\` | Panel background |
| \`--zai-fg\` | \`inherit\` | Panel text |
| \`--zai-bubble\` | mixed from text color | Assistant's message bubbles |
| \`--zai-border\` | mixed from text color | Panel, header, and input borders |
| \`--zai-muted\` | mixed from text color | Secondary text |
| \`--zai-error-bg\` / \`--zai-error-fg\` | light red | Error messages |
| \`--zai-font\` / \`--zai-mono\` | \`inherit\` / system mono | Typefaces |
| \`--zai-font-size\` | \`15px\` | Base size |
| \`--zai-width\` / \`--zai-height\` | \`380px\` / \`560px\` | Panel size |
| \`--zai-pad\` | \`14px\` | Breathing room inside the header, log, and input row |
| \`--zai-offset\` | \`20px\` | Distance from the corner |
| \`--zai-radius\` / \`--zai-radius-sm\` | \`12px\` / \`8px\` | Corner rounding |
| \`--zai-shadow\` / \`--zai-shadow-sm\` | soft drop shadows | Panel and launcher elevation |
| \`--zai-z\` | \`9998\` | Stacking order |

Set them in your own CSS the ordinary way:

\`\`\`css
:root {
  --zai-accent-bg: #1a1a2e;
  --zai-accent-bg-hover: #2a2a4e;
  --zai-radius: 4px;
  --zai-offset: 32px;
}
\`\`\`

You do not need \`!important\`. The widget inserts its stylesheet at the very top of \`<head>\`, before your own, so your rules win on source order. The same applies to the widget's class names, so you can go further than recoloring:

\`\`\`css
.zai-launcher { text-transform: uppercase; letter-spacing: 0.05em; }
.zai-panel { border-width: 2px; }
\`\`\`

The class names are \`zai-launcher\`, \`zai-panel\`, \`zai-head\`, \`zai-close\`, \`zai-log\`, \`zai-msg\`, \`zai-trace\`, \`zai-dots\`, \`zai-form\`, \`zai-input\`, and \`zai-send\`.

Match the widget's specificity when you do this. Most of its rules are a single class, so a single class of your own is enough. A few pair a class with a state attribute — \`.zai-panel[data-open="true"]\` and \`.zai-msg[data-role="user" | "assistant" | "error"]\` — so target those the same way:

\`\`\`css
.zai-msg[data-role="user"] { border-radius: 2px; }
\`\`\`

### Dark themes

The widget carries its own \`prefers-color-scheme: dark\` block, so it follows the visitor's system setting on its own, and in light mode its panel background is the browser's canvas color. The built-in theme goes further and points every \`--zai-*\` neutral at one of its own \`--z-*\` palette tokens, so the widget tracks the theme in both schemes.

Your own theme can do the same. If it is dark regardless of the system setting, say so once at the top of your stylesheet:

\`\`\`css
:root { color-scheme: dark; }
\`\`\`

That single line tells the browser your page is dark, which fixes the widget's background along with form controls and scrollbars across your whole site. Without it, a dark theme can end up pairing light text with a white panel.

### Replacing the widget entirely

If you want different markup or behavior rather than a different appearance, ship your own \`js/widget.js\` in your theme. It takes precedence over the built-in one, exactly like CSS files do. Your script receives the assistant's greeting and button text as \`data-greeting\` and \`data-label\` on its own script tag, and posts \`{ messages: [{ role, content }] }\` to \`/api/chat\`.

The built-in widget also reads two attributes of its own if you place the script tag yourself: \`data-endpoint\` to post somewhere other than \`/api/chat\`, and \`data-debug="true"\` to show the tool trace without \`?debug=1\` in the URL.

## Git-synced themes

Set \`TEMPLATES_REPO_URL\` to a Git repo holding your theme, and \`CUSTOM_THEME\` to the directory it should be cloned into:

\`\`\`bash
CUSTOM_THEME=my-theme
TEMPLATES_REPO_URL=https://github.com/you/blog-theme.git
TEMPLATES_REPO_BRANCH=main
\`\`\`

The repo's contents become \`templates/my-theme/\`, so \`layout.html\`, \`partials/\`, \`css/\` and \`js/\` sit at the root of the repo.

**\`CUSTOM_THEME\` is required for this.** The sync clones over the whole target directory, and with no theme named the target would be \`templates/default\` — the templates that ship with Zetta. Rather than overwrite those, Zetta skips the templates half of the sync and logs nothing about it. The articles half is unaffected.

Templates are reloaded only when a pull actually moves \`HEAD\`, and the first clone into a directory that already has content is staged in a temporary directory and swapped in, so a failed clone leaves the running site serving what it already had.

## Webhook

Trigger an immediate sync (articles + templates) by sending a POST request:

\`\`\`bash
curl -X POST http://localhost:3000/webhook \\
  -H "x-webhook-secret: your_secret"
\`\`\`
`,
};
