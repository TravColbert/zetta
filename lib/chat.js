import { ARTICLES_DIR } from "./config.js";
import { getToolDefinitions, dispatchTool } from "./tools.js";
import { runGuards } from "./guards.js";

function loadSystemPrompt() {
  let promptFile = join(ARTICLES_DIR, "prompt.js");

  if (!existsSync(promptFile)) {
    log.warn("no prompt file found");
    return "";
  }

  return require(promptFile);
}

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export const MAX_TOKENS = 2048;

// Thinking is on by default on Claude Opus 5 and is left that way. Disabling
// it is the documented cause of two failures that would bite here: the model
// writing a tool call into its visible text so the call never runs, and
// internal tags leaking into the reply. Cost and latency are controlled with
// a low effort level instead, which suits looking something up and relaying it.
const EFFORT = "low";

export async function callClaude(messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
      max_tokens: MAX_TOKENS,
      output_config: { effort: EFFORT },
      system: loadSystemPrompt(),
      // Rebuilt per request: an article published since startup becomes
      // usable without a restart.
      tools: getToolDefinitions(),
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Anthropic API ${response.status}: ${detail.slice(0, 300)}`,
    );
  }

  return response.json();
}

// Six rather than four: a search-then-read answer spends two rounds before the
// model has read anything, so a lower cap would cut off normal use rather than
// only runaway loops.
export const MAX_TOOL_ROUNDS = 6;

const TRACE_RESULT_CHARS = 300;

function textOf(message) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

// Runs the conversation until the model answers without calling a tool.
// Returns the reply plus a trace of every tool call, which the widget shows
// in debug mode.
export async function runToolLoop(messages) {
  const conversation = [...messages];
  const trace = [];

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await callClaude(conversation);

    if (response.stop_reason === "refusal") {
      return {
        reply:
          "Sorry — I can’t help with that one. Ask me about Travis’s work instead.",
        trace,
        stopReason: "refusal",
      };
    }

    // The whole content array goes back, not just the text: dropping the
    // thinking and tool_use blocks breaks the next turn.
    conversation.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block) => block.type === "tool_use",
    );
    if (toolUses.length === 0) {
      return {
        reply: textOf(response),
        trace,
        stopReason: response.stop_reason,
      };
    }

    // Every result goes in one user message. Splitting them across several
    // teaches the model to stop making parallel calls.
    const results = toolUses.map((block) => {
      const { content, isError } = dispatchTool(block.name, block.input);
      trace.push({
        round,
        tool: block.name,
        input: block.input,
        isError,
        result: content.slice(0, TRACE_RESULT_CHARS),
        resultChars: content.length,
      });
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content,
        is_error: isError,
      };
    });

    conversation.push({ role: "user", content: results });
  }

  return {
    reply:
      "Sorry — I got stuck looking that up. Could you ask again, or narrow it down?",
    trace,
    stopReason: "tool_round_cap",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Rebuilds the history from scratch rather than trusting what was posted.
// Without this a client could send content blocks of its own — a forged
// tool_result, say — straight into the model's context.
function cleanMessages(value) {
  if (!Array.isArray(value) || value.length === 0) return null;

  const messages = [];
  for (const message of value) {
    if (message?.role !== "user" && message?.role !== "assistant") return null;
    if (typeof message.content !== "string" || message.content.trim() === "")
      return null;
    messages.push({ role: message.role, content: message.content });
  }

  return messages.at(-1).role === "user" ? messages : null;
}

function clientIp(req, fallback) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || fallback || "unknown";
}

// The whole server-side contract. `ip` is optional — pass it when the host
// server knows the socket address, otherwise x-forwarded-for is used.
export async function handleChat(req, ip) {
  if (req.method !== "POST") {
    return json(405, { error: "Send a POST request." });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON." });
  }

  const messages = cleanMessages(body?.messages);
  if (!messages) {
    return json(400, {
      error:
        "Send { messages: [{ role, content }] } — roles are user or assistant, " +
        "content is a non-empty string, and the last message is from the user.",
    });
  }

  const rejection = runGuards({ messages, ip: clientIp(req, ip) });
  if (rejection) return rejection;

  try {
    const { reply, trace, stopReason } = await runToolLoop(messages);
    return json(200, { reply, trace, stopReason });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "chat_failed",
        error: error.message,
      }),
    );
    return json(502, { error: "The assistant is unavailable right now." });
  }
}
