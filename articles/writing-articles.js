module.exports = {
  metadata: {
    title: 'Writing Articles',
    author: 'Zetta',
    publishedAt: '2025-01-02 00:00:00 +00:00',
    tags: ['zetta', 'documentation'],
    blurb: 'How to create and organize articles in Zetta.',
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
| \`hidden\` | No | Set \`true\` to exclude from listings (still accessible by URL) |

## File Naming

The filename (minus \`.js\`) becomes the URL slug. For example:

- \`my-first-post.js\` → \`/articles/my-first-post\`
- \`about.js\` → \`/articles/about\` (also served at \`/about\`)

**Prefix a filename with \`!\` to ignore it entirely** (e.g., \`!draft-post.js\`).

## Static Assets

Place images, CSS, and other files in \`articles/public/\`:

- \`articles/public/images/photo.jpg\` → \`/images/photo.jpg\`
- \`articles/public/css/custom.css\` → \`/css/custom.css\`
- \`articles/public/favicon.ico\` → \`/favicon.ico\`
`,
};
