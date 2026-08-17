module.exports = {
  metadata: {
    title: "Writing Articles",
    author: "Zetta",
    publishedAt: "2025-01-02 00:00:00 +00:00",
    tags: ["zetta", "documentation", "articles"],
    blurb: "How to create and organize articles in Zetta.",
    order: 2,
  },
  content: `
Each Zetta article is a \`.js\` file in the \`articles/\` directory that exports a \`metadata\` object and a \`content\` string.

## Article Format

\`\`\`js
module.exports = {
  metadata: {
    title: 'My First Post',
    author: 'Your Name',
    publishedAt: '2025-06-15 12:00:00 +00:00',
    tags: ['intro', 'blog'],
    blurb: 'A short description shown in article listings.',
    order: 1,
    hidden: false,
  },
  content: \\\`
# My First Post

Write your article content here using **Markdown**.
\\\`,
};
\`\`\`

## Metadata Fields

| Field | Required | Description |
|---|---|---|
| \`title\` | Yes | Article title |
| \`author\` | Yes | Author name |
| \`publishedAt\` | Yes | Publication date — articles without a valid date are skipped |
| \`tags\` | No | Array of tag strings |
| \`blurb\` | No | Short description for listings |
| \`order\` | No | Sort position, lowest first (default: \`0\`) |
| \`hidden\` | No | Set \`true\` to exclude from listings (still accessible by URL) |

## Ordering

Articles are sorted by \`order\` first, lowest number ahead of highest, and within the same \`order\` by publication date, newest first. An article with no \`order\` counts as \`0\`. This ordering decides the sidebar, the article listing, and which article \`/\` redirects to.

Hidden articles are left out of the listings and out of the \`/\` redirect, but they are not private: they still answer on their own URL, and the AI assistant can still find them with \`search_articles\` and read them with \`read_article\`.

## File Naming

The filename (minus \`.js\`) becomes the URL slug. For example:

- \`my-first-post.js\` → \`/articles/my-first-post\`
- \`about.js\` → \`/articles/about\` (also served at \`/about\`)

**Prefix a filename with \`!\` to ignore it entirely** (e.g., \`!draft-post.js\`).

One filename is reserved: \`ai.js\` is the AI assistant's configuration, not an article. It lives in \`articles/\` so it travels with your content, but it is never loaded as an article and has no URL. See [Configuring the AI Assistant](/articles/4-ai).

## Static Assets

Images and the two root files are served from \`articles/public/\`, so they travel with your content:

- \`articles/public/images/photo.jpg\` → \`/images/photo.jpg\`
- \`articles/public/favicon.ico\` → \`/favicon.ico\`
- \`articles/public/robots.txt\` → \`/robots.txt\`

Stylesheets and scripts are **not** served from here. \`/css/:file\` and \`/js/:file\` come from the active theme instead — see [Custom Templates](/articles/3-custom-templates).
`,
};
