module.exports = {
  metadata: {
    title: 'Configuring the AI Assistant',
    author: 'Zetta',
    publishedAt: '2026-08-11 00:00:00 +00:00',
    tags: ['zetta', 'documentation', 'ai'],
    blurb: 'Set up the built-in chat assistant and teach it about your site.',
    order: 4,
  },
  content: `
Zetta ships with an optional chat assistant. Visitors ask a question in a widget on your site, and the assistant answers using your published articles.

It is off until you turn it on, and everything about it is configured from a single file in your articles directory. That is deliberate: your articles already live in their own Git repository, so the assistant travels with your content instead of with the server.

## Turning it on

Two things have to be true before the widget appears.

First, set an API key:

\`\`\`bash
ANTHROPIC_API_KEY=sk-ant-...
\`\`\`

Second, create \`articles/ai.js\`. Without both, \`/api/chat\` returns 503 and no widget is rendered — a stock Zetta install is just a blog.

## The configuration file

\`articles/ai.js\` is a CommonJS module, like an article, but it is never published as one:

\`\`\`js
module.exports = {
  systemPrompt: \`You are the assistant on Ada's site.
Answer questions about her writing.\`,

  greeting: 'Ask me about this site.',
  label: 'Ask a question',

  tools: [
    { tool: 'get_about', slug: 'about', description: 'Call this when ...' },
  ],
};
\`\`\`

Only \`systemPrompt\` is required. It is the instruction the model receives on every request: who it is, what it should answer, and what it should refuse. Write it in the second person, and be specific about what the assistant must not do — a short prompt that says "answer only from tool results, never guess" is worth more than a long one describing your personality.

\`greeting\` is the first line the visitor sees in the panel. \`label\` is the text on the launcher button and the panel header. Both are optional and both are HTML-escaped before they reach the page.

## Teaching it about your site

The \`tools\` array is how the assistant learns what it is allowed to look up. Each entry takes one of three forms.

| Entry | What it does |
|---|---|
| \`{ tool, slug, description }\` | Serves one of your published articles |
| \`{ tool, file, description }\` | Serves a file from your articles directory |
| \`{ tool }\` | Enables one of the built-in action tools |

A \`slug\` entry is the common case. The slug is the article's filename without the \`.js\`, exactly as it appears in its URL:

\`\`\`js
tools: [
  {
    tool: 'get_speaking_info',
    slug: 'speaking',
    description:
      'Call this when the visitor asks about speaking at an event — ' +
      'topics, formats, availability, or fees.',
  },
]
\`\`\`

The \`description\` is the most important part of the entry, and the part people tend to write badly. The model reads it to decide whether to call the tool, so describe **when to call it**, not what it returns. "Speaking information" tells the model nothing. "Call this when the visitor asks about speaking at an event" tells it exactly when to reach for it.

If an entry names an article you have not published, or a file that is not there, Zetta drops that tool from the list and logs a warning. The assistant is never offered a lookup that cannot answer.

## Search is always available

You do not need to list every article. Two tools are always present:

- \`search_articles\` — matches a query against titles, tags, blurbs, and body text, and returns titles and summaries
- \`read_article\` — returns one article in full, by slug

Between them the assistant can answer from anything you publish. Curated tools in \`tools\` are for the handful of documents you want it to reach for by name, without searching first.

## Files as tools

A \`file\` entry serves a plain file from your articles directory. This is useful for material that guides the assistant but is not something you want published as an article.

The stock install uses this for \`topics.md\`, a policy document listing which subjects to answer and which to decline:

\`\`\`js
{
  tool: 'check_topic_policy',
  file: 'topics.md',
  description:
    'The fallback for any subject the other tools do not cover: small ' +
    'talk, opinions, current events, or anything off-topic. Call this ' +
    'before answering such a question.',
}
\`\`\`

Pair it with a line in your system prompt telling the assistant to call it before answering anything off-topic. The effect is that off-topic handling becomes something you edit in a Markdown file rather than something you renegotiate with the prompt.

## Action tools

Three action tools are built in, and each does something rather than returning a document:

- \`leave_message\` — records a message and an email address
- \`reserve_speaking_date\` — requests a speaking engagement
- \`reserve_consultation_meeting\` — requests a call

They only exist if you name them:

\`\`\`js
tools: [
  { tool: 'leave_message' },
]
\`\`\`

They take no \`slug\` or \`description\` — the input schema and the wording are built in, including validation of email addresses and dates. The assistant is told to collect the required fields before calling, and to ask the visitor for corrections when validation fails.

Zetta does not store submissions. Each one is logged and, if you set \`RESERVATION_WEBHOOK_URL\`, POSTed to that URL so you can forward it to email, a spreadsheet, or an issue tracker. Set \`WEBHOOK_SECRET\` as well and the request is signed with an \`x-zetta-signature\` header.

## When something is wrong

If \`articles/ai.js\` is missing, throws, or has no \`systemPrompt\`, the chat is disabled and the reason is written to the log. The rest of the site keeps serving.

This matters more than it first appears. Your articles repository is pulled automatically, so a bad commit could otherwise take the blog down at the next sync. It cannot — the worst case is a site whose chat widget has quietly switched off, which the log will tell you about:

\`\`\`json
{"level":"error","msg":"failed to load ai config, chat disabled","error":"systemPrompt must be a non-empty string"}
\`\`\`

## Changes take effect on sync

\`ai.js\` is re-read whenever your articles sync, on the polling interval or from a webhook. Editing your prompt, adding a tool, or publishing an article that a tool points at all take effect without a restart.

## The widget

The built-in layout injects the widget for you. If you use a custom HTML layout, place it with the \`{{chatWidget}}\` placeholder:

\`\`\`html
  {{chatWidget}}
</body>
\`\`\`

It renders a script tag when the assistant is configured and nothing at all when it is not, so the same layout works with the chat on or off.

To see what the assistant is actually doing, add \`?debug=1\` to any page URL. The panel then shows every tool call behind each answer: which tool ran, what arguments it was given, and how much text came back. If the assistant is answering vaguely, this usually shows it never called the tool you expected — which is a signal to rewrite that tool's description.

## Limits

A few limits are fixed, and are there to keep a single visitor from running up your API bill:

| Limit | Value |
|---|---|
| Message length | 2,000 characters |
| Conversation length | 40 messages |
| Requests per minute, per address | 12 |
| Tool calls per answer | 6 |

The last one is worth knowing about when you design tools. An answer that searches, then reads an article, has already used two rounds. If you find the assistant giving up, it is usually chaining too many lookups — which a better-targeted curated tool will fix.
`,
};
