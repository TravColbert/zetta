module.exports = {
  metadata: {
    title: 'Getting Started with Zetta',
    author: 'Zetta',
    publishedAt: '2025-01-01 00:00:00 +00:00',
    tags: ['zetta', 'documentation'],
    blurb: 'Learn how to set up and run your Zetta blog engine.',
  },
  content: `
Zetta is a lightweight, file-based blog engine built on [Bun](https://bun.sh). It requires no database — articles are plain JavaScript files, and content syncs automatically from a Git repository.

## Quick Start

1. **Clone the repo** and install dependencies:

\`\`\`bash
git clone <your-zetta-repo>
cd zetta
bun install
\`\`\`

2. **Start the server:**

\`\`\`bash
bun run server.js
\`\`\`

Your blog is now running at \`http://localhost:3000\`.

## Configuration

Zetta is configured entirely through environment variables:

| Variable | Description |
|---|---|
| \`PORT\` | Server port (default: \`3000\`) |
| \`ARTICLES_REPO_URL\` | Git repo URL for articles content |
| \`TEMPLATES_REPO_URL\` | Git repo URL for custom templates |
| \`GIT_TOKEN\` | Access token for private repos |
| \`WEBHOOK_SECRET\` | Secret for the \`POST /webhook\` endpoint |
| \`SYNC_INTERVAL\` | Polling interval in seconds (default: \`300\`) |

## Docker

\`\`\`bash
docker build -t zetta .
docker run -p 8080:8080 \\
  -e ARTICLES_REPO_URL=https://github.com/you/blog-articles.git \\
  -e GIT_TOKEN=your_token \\
  zetta
\`\`\`

## What's Next?

- Read [Writing Articles](/articles/writing-articles) to learn the article format
- Read [Custom Templates](/articles/custom-templates) to customize your blog's look
`,
};
