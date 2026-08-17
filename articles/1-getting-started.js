module.exports = {
  metadata: {
    title: "Getting Started with Zetta",
    author: "Zetta",
    publishedAt: "2025-01-01 00:00:00 +00:00",
    tags: ["zetta", "documentation"],
    blurb: "Learn how to set up and run your Zetta blog engine.",
    order: 1,
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

3. **Optional — turn on the AI assistant.** A stock install is just a blog. If you want the chat widget, set an API key and add an \`articles/ai.js\` config file, both described in [Configuring the AI Assistant](/articles/4-ai).

## Configuration

Zetta is configured entirely through environment variables:

| Variable | Description |
|---|---|
| \`PORT\` | Server port (default: \`3000\`) |
| \`CUSTOM_THEME\` | Name of a directory under \`templates/\` to render from. Unset means \`templates/default\` |
| \`NOT_FOUND_PATH\` | Path to an HTML file replacing the built-in 404 page |
| \`SERVER_ERROR_PATH\` | Path to an HTML file replacing the built-in 500 page |
| \`ARTICLES_REPO_URL\` | Git repo URL for articles content |
| \`ARTICLES_REPO_BRANCH\` | Branch to check out for that repo (default: \`main\`) |
| \`TEMPLATES_REPO_URL\` | Git repo URL for your theme. Needs \`CUSTOM_THEME\` set — see below |
| \`TEMPLATES_REPO_BRANCH\` | Branch to check out for that repo (default: \`main\`) |
| \`GIT_TOKEN\` | Access token for private repos |
| \`WEBHOOK_SECRET\` | Secret for the \`POST /webhook\` endpoint |
| \`SYNC_INTERVAL\` | Polling interval in seconds (default: \`300\`) |

A theme sync clones over the whole theme directory, so \`TEMPLATES_REPO_URL\` needs a theme of its own to clone into. With \`CUSTOM_THEME\` unset the target would be \`templates/default\` — the templates that ship with Zetta — so the templates half of the sync is skipped instead. The articles half works on its own either way.

Bun loads a \`.env\` file from the project root, so these can live there rather than in your shell:

\`\`\`
PORT=8080
CUSTOM_THEME=my-theme
\`\`\`

### AI assistant

These are all optional. Leave them unset and the chat assistant stays off, with no widget on the page and a 503 from \`POST /api/chat\`.

| Variable | Description |
|---|---|
| \`ANTHROPIC_API_KEY\` | Your Anthropic API key. Required to enable the assistant — without it the widget is never rendered |
| \`ANTHROPIC_MODEL\` | Model the assistant calls (default: \`claude-sonnet-5\`). Not \`claude-haiku-4-5\` — see the AI article |
| \`RESERVATION_WEBHOOK_URL\` | Where completed messages and booking requests are POSTed. Signed with \`WEBHOOK_SECRET\` when one is set |

The key on its own is not enough: the assistant also needs \`articles/ai.js\`, which holds its system prompt and the list of things it is allowed to look up. Both halves are covered in [Configuring the AI Assistant](/articles/4-ai).

## Docker

\`\`\`bash
docker build -t zetta .
docker run -p 8080:8080 \\
  -e ARTICLES_REPO_URL=https://github.com/you/blog-articles.git \\
  -e GIT_TOKEN=your_token \\
  -e ANTHROPIC_API_KEY=sk-ant-... \\
  zetta
\`\`\`

Drop the \`ANTHROPIC_API_KEY\` line to run without the assistant.

## Default Routes

The following routes are baked right into Zetta:

| HTTP Method | Path | Result |
|---|---|---|
| GET | / (root) | Shows the latest article |
| GET | /about   | Shows the article named \`about.js\` |
| GET | /tags    | Shows a list of all tags for all public articles |
| GET | /articles | Shows a list of all public articles. \`?tag=name\` filters it |
| GET | /articles/:slug | Shows one article |
| GET | /css/:file | Serves the active theme's \`css/:file\`, falling back to the built-in theme's |
| GET | /js/:file | Serves the active theme's \`js/:file\`, falling back to the built-in theme's |
| GET | /images/:file | Serves \`articles/public/images/:file\` |
| GET | /favicon.ico | Serves \`articles/public/favicon.ico\` |
| GET | /robots.txt | Serves \`articles/public/robots.txt\` |
| POST | /api/chat | The AI assistant's endpoint. Answers 503 until the assistant is configured |
| POST | /webhook | Triggers a re-sync and reread of the document repository |

## What's Next?

- Read [Writing Articles](/articles/2-writing-articles) to learn the article format
- Read [Custom Templates](/articles/3-custom-templates) to customize your blog's look
- Read [Configuring the AI Assistant](/articles/4-ai) to turn on the chat widget and teach it about your site
`,
};
