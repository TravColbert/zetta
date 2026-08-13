import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { log } from "./logger.js";
import { ARTICLES_DIR } from "./config.js";
import { getAiConfig } from "./ai.js";
import { sendReservationWebhook } from "./webhook.js";
import { getArticleBySlug, getAllArticles } from "./articles.js";

// `focus` is not used to filter — the whole document comes back regardless.
// It is there so the model states what it is looking for, which shows up in
// the debug trace and makes the retrieval step legible.
const FOCUS_SCHEMA = {
  type: "object",
  properties: {
    focus: {
      type: "string",
      description:
        "What you are looking for in this document, in a few words. The " +
        "entire document is returned either way.",
    },
  },
};

// The curated tools come from articles/ai.js, so a site retargets the
// assistant by editing its own articles repo. An entry names either a
// published article by slug or a file in ARTICLES_DIR.
function configuredTools() {
  return getAiConfig()?.tools ?? [];
}

function documentEntry(toolName) {
  return configuredTools().find(
    (entry) => entry.tool === toolName && (entry.slug || entry.file),
  );
}

// Articles carry their title in metadata rather than in the body, so it is
// restored here — the model should see what it is reading.
function withTitle(article) {
  return `# ${article.metadata.title}\n\n${article.content.trim()}\n`;
}

// Read at call time rather than at import: the file lives in ARTICLES_DIR and
// can arrive, change, or vanish with a git sync while the server is running.
export function getDocument(toolName) {
  const entry = documentEntry(toolName);
  if (!entry) return undefined;

  if (entry.slug) {
    const article = getArticleBySlug(entry.slug);
    return article ? withTitle(article) : undefined;
  }

  try {
    return readFileSync(join(ARTICLES_DIR, entry.file), "utf8");
  } catch (err) {
    log.warn("tool document unreadable", {
      tool: entry.tool,
      file: entry.file,
      error: err.message,
    });
    return undefined;
  }
}

const warnedMissing = new Set();

// A curated tool whose article or file is missing is left out of the tool
// list, so the model is never offered a lookup that cannot answer.
function availableEntries() {
  return configuredTools().filter((entry) => {
    if (!entry.slug && !entry.file) return false;

    const available = entry.slug
      ? Boolean(getArticleBySlug(entry.slug))
      : existsSync(join(ARTICLES_DIR, entry.file));

    if (!available && !warnedMissing.has(entry.tool)) {
      warnedMissing.add(entry.tool);
      log.warn("tool document missing", {
        tool: entry.tool,
        slug: entry.slug,
        file: entry.file,
      });
    }
    return available;
  });
}

function toDefinition({ tool, description }) {
  return { name: tool, description, input_schema: FOCUS_SCHEMA };
}

export const MAX_SEARCH_RESULTS = 8;

// Two steps rather than one: search returns titles and summaries only, so a
// large archive costs a small, fixed number of tokens until the model commits
// to reading something.
const searchToolDefinitions = [
  {
    name: "search_articles",
    description:
      "Search this site’s published articles by keyword. Use this when a " +
      "question is about something written here and no other tool covers it. " +
      "Returns matching titles and summaries — call read_article to read one " +
      "in full.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keywords to match against titles, tags, summaries and article " +
            "text. Use the distinctive words from the question.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_article",
    description:
      "Read one published article in full, using a slug returned by " +
      "search_articles. Call this before answering from an article — search " +
      "results are summaries and are not enough to answer from.",
    input_schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "The slug of the article, exactly as search_articles gave it.",
        },
      },
      required: ["slug"],
    },
  },
];

// Action tools are built in but opt-in: one appears only when articles/ai.js
// names it, so a stock site never advertises a booking nobody receives.
function isActionEnabled(toolName) {
  return configuredTools().some((entry) => entry.tool === toolName);
}

export function getToolDefinitions() {
  return [
    ...availableEntries().map(toDefinition),
    ...searchToolDefinitions,
    ...actionToolDefinitions.filter((tool) => isActionEnabled(tool.name)),
  ];
}

function scoreArticle(article, terms) {
  const weighted = [
    [(article.metadata.title ?? "").toLowerCase(), 3],
    [(article.metadata.tags ?? []).join(" ").toLowerCase(), 2],
    [(article.metadata.blurb ?? "").toLowerCase(), 2],
    [(article.content ?? "").toLowerCase(), 1],
  ];

  let score = 0;
  for (const term of terms) {
    for (const [text, weight] of weighted) {
      if (text.includes(term)) score += weight;
    }
  }
  return score;
}

export function searchArticles(query) {
  const terms = (
    String(query ?? "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  ).filter((term) => term.length >= 2);
  if (terms.length === 0) return [];

  return getAllArticles()
    .map((article) => ({ article, score: scoreArticle(article, terms) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.article.publishedAt - a.article.publishedAt,
    )
    .slice(0, MAX_SEARCH_RESULTS)
    .map(({ article }) => ({
      slug: article.slug,
      title: article.metadata.title,
      blurb: article.metadata.blurb ?? "",
      publishedAt: article.publishedAt.toISOString().slice(0, 10),
      tags: article.metadata.tags ?? [],
    }));
}

const CONTACT_NAME = {
  type: "string",
  description: "The visitor’s full name, as they gave it.",
};

const CONTACT_EMAIL = {
  type: "string",
  description: "The visitor’s email address, as they gave it.",
};

export const actionToolDefinitions = [
  {
    name: "reserve_speaking_date",
    description:
      "Reserve a speaking date with the author of this site. Call this only " +
      "once the visitor " +
      "has given you every required field — ask for whatever is missing " +
      "first. Never supply a value the visitor did not give you.",
    input_schema: {
      type: "object",
      properties: {
        event: {
          type: "string",
          description: "Name of the conference, meetup, or event.",
        },
        date: {
          type: "string",
          description:
            "Date of the event as YYYY-MM-DD. Must be in the future.",
        },
        location: {
          type: "string",
          description:
            'City and country for an in-person event, or "remote" for a ' +
            "virtual one.",
        },
        name: CONTACT_NAME,
        email: CONTACT_EMAIL,
        notes: {
          type: "string",
          description:
            "Anything else worth passing on: talk length, audience size, " +
            "whether the event is commercial or community-run. Optional.",
        },
      },
      required: ["event", "date", "location", "name", "email"],
    },
  },
  {
    name: "reserve_consultation_meeting",
    description:
      "Book a consultation call with the author of this site about hiring, " +
      "consulting, or " +
      "contract work. Call this only once the visitor has given you every " +
      "required field — ask for whatever is missing first. Never supply a " +
      "value the visitor did not give you.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Requested date as YYYY-MM-DD. Must be in the future.",
        },
        time: {
          type: "string",
          description: "Requested start time as HH:MM in 24-hour form.",
        },
        timezone: {
          type: "string",
          description:
            "Timezone for the requested time, as the visitor gave it — an " +
            "IANA name like Europe/Madrid or an abbreviation like CET. " +
            "Optional, but ask for it if the visitor has not said.",
        },
        topic: {
          type: "string",
          description: "What the visitor wants to discuss, in a sentence.",
        },
        name: CONTACT_NAME,
        email: CONTACT_EMAIL,
      },
      required: ["date", "time", "topic", "name", "email"],
    },
  },
  {
    name: "leave_message",
    description:
      "Record a message for the author of this site and have them follow up by " +
      "email. Use this when the visitor wants to get in touch about something " +
      "the other tools do not cover, or when you could not answer their " +
      "question.",
    input_schema: {
      type: "object",
      properties: {
        name: CONTACT_NAME,
        email: CONTACT_EMAIL,
        message: {
          type: "string",
          description: "What the visitor wants to say, in their own words.",
        },
      },
      required: ["name", "email", "message"],
    },
  },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Rejects 2026-02-30 and friends, which the pattern alone lets through.
function isRealDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const requiredFields = new Map(
  actionToolDefinitions.map((t) => [t.name, t.input_schema.required]),
);

// Errors are written for the model to relay to the visitor, so each one names
// the field, quotes what arrived, and says what would be acceptable.
export function validateToolInput(toolName, input = {}) {
  const required = requiredFields.get(toolName);
  if (!required) return [];

  const errors = [];
  const value = (field) =>
    typeof input[field] === "string" ? input[field].trim() : input[field];

  for (const field of required) {
    if (!value(field))
      errors.push(`${field} is required but was not provided.`);
  }

  const email = value("email");
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.push(`email "${email}" is not a valid email address.`);
  }

  const date = value("date");
  if (date) {
    if (!DATE_PATTERN.test(date) || !isRealDate(date)) {
      errors.push(`date "${date}" must be a real date in YYYY-MM-DD form.`);
    } else if (date < today()) {
      errors.push(`date "${date}" is in the past.`);
    }
  }

  const time = value("time");
  if (time && !TIME_PATTERN.test(time)) {
    errors.push(`time "${time}" must be in 24-hour HH:MM form.`);
  }

  return errors;
}

const REFERENCE_PREFIXES = {
  reserve_speaking_date: "spk",
  reserve_consultation_meeting: "con",
  leave_message: "msg",
};

// Nothing is stored. The attempt is logged as NDJSON and acknowledged with a
// reference, which is enough to demonstrate the flow and to see in the logs
// that the model filled the arguments in correctly.
export function runAction(toolName, input) {
  const record = {
    reference: `${REFERENCE_PREFIXES[toolName]}_${randomUUID().slice(0, 8)}`,
    tool: toolName,
    received_at: new Date().toISOString(),
    ...input,
  };

  // Nested rather than spread: tool arguments are model-supplied and would
  // otherwise collide with the envelope's own keys (reserve_speaking_date
  // has an `event` argument).
  log.info("action", { action: record });

  return {
    result: {
      ok: true,
      reference: record.reference,
      status:
        toolName === "leave_message"
          ? "Message received. You will get a reply by email."
          : "Request received. You will get a confirmation by email — this is not yet a confirmed booking.",
    },
    record,
  };
}

// Returns the string that becomes the tool_result content, plus `isError` for
// the block's is_error flag and, on a successful action, the `record` the
// webhook sender needs.
//
// A validation rejection is not an error: the call worked and answered "no".
// Marking it is_error makes the model apologise and give up rather than ask
// the visitor for the missing field. Only a genuine fault sets isError.
export function dispatchTool(toolName, input = {}) {
  const document = getDocument(toolName);
  if (document !== undefined) {
    return { content: document, isError: false };
  }

  if (toolName === "search_articles") {
    return {
      content: JSON.stringify({ results: searchArticles(input.query) }),
      isError: false,
    };
  }

  if (toolName === "read_article") {
    const articles = getAllArticles();
    const article = articles.find((item) => item.slug === input.slug);
    if (!article) {
      return {
        content: JSON.stringify({
          ok: false,
          error: `No published article with slug "${input.slug}".`,
          try_instead: articles.slice(0, 10).map((item) => item.slug),
        }),
        isError: false,
      };
    }
    return { content: withTitle(article), isError: false };
  }

  if (REFERENCE_PREFIXES[toolName] && isActionEnabled(toolName)) {
    const errors = validateToolInput(toolName, input);
    if (errors.length > 0) {
      return { content: JSON.stringify({ ok: false, errors }), isError: false };
    }
    const { result, record } = runAction(toolName, input);
    sendReservationWebhook(record);
    return { content: JSON.stringify(result), isError: false, record };
  }

  return { content: `Unknown tool "${toolName}".`, isError: true };
}
