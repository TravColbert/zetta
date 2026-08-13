// Self-contained chat widget. Drop it on a page with:
//   <script src="/widget.js" defer></script>
// Optional attributes: data-endpoint (default /api/chat), data-debug="true",
// data-greeting and data-label, both of which Zetta fills in from articles/ai.js.
// Add ?debug=1 to the page URL to see which tools ran.
(() => {
  const script = document.currentScript;
  const ENDPOINT = script?.dataset.endpoint ?? "/api/chat";
  const DEBUG =
    new URLSearchParams(location.search).get("debug") === "1" ||
    script?.dataset.debug === "true";

  const GREETING = script?.dataset.greeting ?? "Ask me about this site.";
  const LABEL = script?.dataset.label ?? "Ask a question";

  // This block is inserted at the top of <head>, before the page's own
  // stylesheet, so a blog overrides any of it by source order alone — no
  // !important, no specificity tricks. A cascade layer would do the same for
  // variables but would also put these rules below a reset like
  // `* { padding: 0 }`, which would strip the widget's spacing.
  //
  // Neutrals default to the page rather than to fixed greys — the font and
  // text colour are inherited, and the tints are mixed from whatever text
  // colour the blog supplies, so an untouched widget already resembles its
  // surroundings.
  const CSS = `
:root {
  --zai-font: inherit;
  --zai-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --zai-font-size: 15px;
  --zai-bg: Canvas;
  --zai-fg: inherit;
  --zai-muted: color-mix(in srgb, currentColor 60%, transparent);
  --zai-border: color-mix(in srgb, currentColor 18%, transparent);
  --zai-bubble: color-mix(in srgb, currentColor 8%, transparent);
  --zai-accent: var(--z-link-color);
  --zai-accent-bg: #1f2328;
  --zai-accent-bg-hover: #33383f;
  --zai-accent-fg: #fff;
  --zai-error-bg: #fdecec; --zai-error-fg: #8a1c1c;
  --zai-pad: 14px;
  --zai-offset: 20px;
  --zai-width: 380px;
  --zai-height: 560px;
  --zai-radius: 12px;
  --zai-radius-sm: 8px;
  --zai-shadow: 0 10px 40px rgba(0,0,0,.22);
  --zai-shadow-sm: 0 4px 14px rgba(0,0,0,.18);
  --zai-z: 9998;
}
@media (prefers-color-scheme: dark) {
  :root {
    --zai-bg: #16181c; --zai-fg: #e8eaed; --zai-muted: #9aa2ad;
    --zai-border: #2c3037; --zai-bubble: #23262c;
    --zai-error-bg: #3a1d1d; --zai-error-fg: #f4b8b8;
    --zai-accent-bg: #3b4048; --zai-accent-bg-hover: #4a505a;
  }
}
.zai-launcher {
  position: fixed; right: var(--zai-offset); bottom: var(--zai-offset);
  z-index: var(--zai-z);
  padding: 12px 18px; border: 0; border-radius: 999px;
  background: var(--zai-accent-bg); color: var(--zai-accent-fg);
  font-family: var(--zai-font); font-size: var(--zai-font-size);
  font-weight: 500; line-height: 1;
  cursor: pointer; box-shadow: var(--zai-shadow-sm);
}
.zai-launcher:hover { background: var(--zai-accent-bg-hover); }
.zai-panel {
  position: fixed; right: var(--zai-offset); bottom: var(--zai-offset);
  z-index: calc(var(--zai-z) + 1);
  display: none; flex-direction: column;
  width: min(var(--zai-width), calc(100vw - var(--zai-offset) * 2));
  height: min(var(--zai-height), calc(100vh - var(--zai-offset) * 2));
  background: var(--zai-bg); color: var(--zai-fg);
  border: 1px solid var(--zai-border); border-radius: var(--zai-radius);
  box-shadow: var(--zai-shadow);
  font-family: var(--zai-font); font-size: var(--zai-font-size);
  line-height: 1.5; overflow: hidden;
}
.zai-panel[data-open="true"] { display: flex; }
.zai-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px var(--zai-pad); border-bottom: 1px solid var(--zai-border);
  font-weight: 600; font-size: 14px;
}
.zai-close {
  border: 0; background: none; color: var(--zai-muted);
  font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px;
}
.zai-log { flex: 1; overflow-y: auto; padding: var(--zai-pad); display: flex; flex-direction: column; gap: 12px; }
.zai-msg { max-width: 85%; padding: 9px 12px; border-radius: var(--zai-radius); white-space: pre-wrap; overflow-wrap: anywhere; }
.zai-msg[data-role="user"] { align-self: flex-end; background: var(--zai-accent-bg); color: var(--zai-accent-fg); border-bottom-right-radius: 4px; }
.zai-msg[data-role="assistant"] { align-self: flex-start; background: var(--zai-bubble); border-bottom-left-radius: 4px; }
.zai-msg[data-role="error"] { align-self: flex-start; background: var(--zai-error-bg); color: var(--zai-error-fg); font-size: 14px; }
.zai-trace {
  align-self: flex-start; max-width: 95%; margin: -4px 0 0;
  padding: 8px 10px; border-left: 2px solid var(--zai-accent);
  background: var(--zai-bubble); border-radius: 0 6px 6px 0;
  font: 12px/1.5 var(--zai-mono); color: var(--zai-muted); white-space: pre-wrap; overflow-wrap: anywhere;
}
.zai-dots { align-self: flex-start; padding: 9px 12px; color: var(--zai-muted); }
.zai-form { display: flex; gap: 8px; padding: 12px var(--zai-pad); border-top: 1px solid var(--zai-border); }
.zai-input {
  flex: 1; padding: 9px 11px; border: 1px solid var(--zai-border);
  border-radius: var(--zai-radius-sm);
  background: var(--zai-bg); color: var(--zai-fg); font: inherit;
}
.zai-input:focus { outline: 2px solid var(--zai-accent); outline-offset: -1px; }
.zai-send {
  padding: 9px 15px; border: 0; border-radius: var(--zai-radius-sm);
  background: var(--zai-accent-bg); color: var(--zai-accent-fg);
  font: inherit; cursor: pointer;
}
.zai-send:disabled, .zai-input:disabled { opacity: .5; cursor: not-allowed; }`;

  const history = [];
  let busy = false;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Prepended, not appended: the page's stylesheet must come after this one
  // for a blog's own rules to win.
  document.head.prepend(el("style", null, CSS));

  const launcher = el("button", "zai-launcher", LABEL);
  const panel = el("div", "zai-panel");
  panel.dataset.open = "false";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", LABEL);

  const head = el("div", "zai-head");
  head.append(el("span", null, DEBUG ? `${LABEL} · debug` : LABEL));
  const close = el("button", "zai-close", "×");
  close.setAttribute("aria-label", "Close chat");
  head.append(close);

  const log = el("div", "zai-log");
  log.setAttribute("aria-live", "polite");

  const form = el("form", "zai-form");
  const input = el("input", "zai-input");
  input.placeholder = "Ask a question…";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Your message");
  const send = el("button", "zai-send", "Send");
  form.append(input, send);

  panel.append(head, log, form);
  document.body.append(launcher, panel);

  function addMessage(role, text) {
    const node = el("div", "zai-msg", text);
    node.dataset.role = role;
    log.append(node);
    log.scrollTop = log.scrollHeight;
    return node;
  }

  function addTrace(trace) {
    if (!DEBUG || !trace?.length) return;
    const lines = trace.map((entry) => {
      const args = Object.entries(entry.input ?? {})
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(", ");
      const outcome = entry.isError ? "ERROR" : `${entry.resultChars} chars`;
      return `${entry.round}. ${entry.tool}(${args}) → ${outcome}\n   ${entry.result.replace(/\s+/g, " ").slice(0, 160)}`;
    });
    log.append(el("div", "zai-trace", lines.join("\n")));
    log.scrollTop = log.scrollHeight;
  }

  function setBusy(state) {
    busy = state;
    input.disabled = state;
    send.disabled = state;
  }

  async function ask(question) {
    history.push({ role: "user", content: question });
    addMessage("user", question);
    setBusy(true);

    const dots = el("div", "zai-dots", "thinking…");
    log.append(dots);
    log.scrollTop = log.scrollHeight;

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await response.json().catch(() => ({}));
      dots.remove();

      if (!response.ok) {
        // The user turn stays in the log but leaves the history, so a retry
        // does not send the same message twice.
        history.pop();
        addMessage(
          "error",
          data.error ?? `Something went wrong (${response.status}).`,
        );
        return;
      }

      history.push({ role: "assistant", content: data.reply });
      addTrace(data.trace);
      addMessage("assistant", data.reply);
    } catch {
      dots.remove();
      history.pop();
      addMessage(
        "error",
        "Could not reach the assistant. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    input.value = "";
    ask(question);
  });

  launcher.addEventListener("click", () => {
    panel.dataset.open = "true";
    launcher.style.display = "none";
    if (log.childElementCount === 0) addMessage("assistant", GREETING);
    input.focus();
  });

  close.addEventListener("click", () => {
    panel.dataset.open = "false";
    launcher.style.display = "";
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.dataset.open === "true") close.click();
  });
})();
