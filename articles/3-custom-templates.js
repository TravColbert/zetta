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
Zetta uses a simple Mustache-style template system with \`{{placeholder}}\` substitution. You can override the default templates to fully customize your blog's appearance.

## Template Sources

Templates can come from two places:

1. **Built-in defaults** in \`templates/default/\`
2. **Custom templates** via \`TEMPLATES_REPO_URL\` or \`LAYOUT_PATH\`

When \`TEMPLATES_REPO_URL\` is set, Zetta clones that repo into \`templates/custom/\` and auto-detects the layout.

## Layout Template

The layout wraps every page. It receives these placeholders:

| Placeholder | Description |
|---|---|
| \`{{title}}\` | Page title |
| \`{{slug}}\` | Article slug (on article pages) |
| \`{{keywords}}\` | Comma-separated tags |
| \`{{description}}\` | Article blurb |
| \`{{body}}\` | Page content |
| \`{{chatWidget}}\` | Chat widget script tag, or nothing when the assistant is off |

## Partials

Partials are reusable HTML fragments included via \`{{> name}}\` syntax. Place them in a \`partials/\` directory alongside your layout.

Key content partials that control page rendering:

- \`article.html\` — single article view
- \`article-list.html\` / \`article-list-item.html\` — article listing
- \`tag-list.html\` / \`tag-list-item.html\` — tag display
- \`listing-item.html\` / \`listing-item-blurb.html\` — listing items
- \`404.html\` / \`500.html\` — error pages

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
| \`--zai-accent\` | \`#7c6cf0\` | Focus ring and debug trace marker |
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

Match the widget's specificity when you do this. Most of its rules are a single class, so a single class of your own is enough. Two of them use a class plus an attribute — target those the same way:

\`\`\`css
.zai-msg[data-role="user"] { border-radius: 2px; }
\`\`\`

### Dark themes

The widget follows the visitor's system setting by default, and its panel background falls back to the browser's canvas color. If your theme is dark, say so once at the top of your stylesheet:

\`\`\`css
:root { color-scheme: dark; }
\`\`\`

That single line tells the browser your page is dark, which fixes the widget's background along with form controls and scrollbars across your whole site. Without it, a dark theme can end up pairing light text with a white panel.

### Replacing the widget entirely

If you want different markup or behavior rather than a different appearance, ship your own \`js/widget.js\` in your templates repo. It takes precedence over the built-in one, exactly like CSS files do. Your script receives the assistant's greeting and button text as \`data-greeting\` and \`data-label\` on its own script tag, and posts \`{ messages: [{ role, content }] }\` to \`/api/chat\`.

## Git-Synced Templates

Set \`TEMPLATES_REPO_URL\` to a Git repo containing your custom templates. Zetta will clone it and auto-set \`LAYOUT_PATH\` if it finds a \`layout.html\` in the repo root.

\`\`\`bash
TEMPLATES_REPO_URL=https://github.com/you/blog-theme.git
\`\`\`

## Webhook

Trigger an immediate sync (articles + templates) by sending a POST request:

\`\`\`bash
curl -X POST http://localhost:3000/webhook \\
  -H "x-webhook-secret: your_secret"
\`\`\`
`,
};
