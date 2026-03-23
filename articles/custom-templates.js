module.exports = {
  metadata: {
    title: 'Custom Templates',
    author: 'Zetta',
    publishedAt: '2025-01-03 00:00:00 +00:00',
    tags: ['zetta', 'documentation', 'templates'],
    blurb: 'Customize your blog appearance with templates and partials.',
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

## Partials

Partials are reusable HTML fragments included via \`{{> name}}\` syntax. Place them in a \`partials/\` directory alongside your layout.

Key content partials that control page rendering:

- \`article.html\` — single article view
- \`article-list.html\` / \`article-list-item.html\` — article listing
- \`tag-list.html\` / \`tag-list-item.html\` — tag display
- \`listing-item.html\` / \`listing-item-blurb.html\` — listing items
- \`404.html\` / \`500.html\` — error pages

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
