// Self-contained chat widget. Drop it on a page with:
//   <script src="/widget.js" defer></script>
// Optional attributes: data-endpoint (default /api/chat), data-debug="true".
// Add ?debug=1 to the page URL to see which tools ran.
(() => {
  const script = document.currentScript;
  const ENDPOINT = script?.dataset.endpoint ?? '/api/chat';
  const DEBUG =
    new URLSearchParams(location.search).get('debug') === '1' ||
    script?.dataset.debug === 'true';

  const GREETING =
    'Ask me about Travis — his projects, his background, or booking him to speak.';

  const CSS = `
.zai-launcher {
  position: fixed; right: 20px; bottom: 20px; z-index: 9998;
  padding: 12px 18px; border: 0; border-radius: 999px;
  background: #1f2328; color: #fff; font: 500 15px/1 var(--zai-font);
  cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.18);
}
.zai-launcher:hover { background: #33383f; }
.zai-panel {
  position: fixed; right: 20px; bottom: 20px; z-index: 9999;
  display: none; flex-direction: column;
  width: min(380px, calc(100vw - 40px)); height: min(560px, calc(100vh - 40px));
  background: var(--zai-bg); color: var(--zai-fg);
  border: 1px solid var(--zai-border); border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,.22);
  font: 15px/1.5 var(--zai-font); overflow: hidden;
}
.zai-panel[data-open="true"] { display: flex; }
.zai-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--zai-border);
  font-weight: 600; font-size: 14px;
}
.zai-close {
  border: 0; background: none; color: var(--zai-muted);
  font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px;
}
.zai-log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.zai-msg { max-width: 85%; padding: 9px 12px; border-radius: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.zai-msg[data-role="user"] { align-self: flex-end; background: #1f2328; color: #fff; border-bottom-right-radius: 4px; }
.zai-msg[data-role="assistant"] { align-self: flex-start; background: var(--zai-bubble); border-bottom-left-radius: 4px; }
.zai-msg[data-role="error"] { align-self: flex-start; background: var(--zai-error-bg); color: var(--zai-error-fg); font-size: 14px; }
.zai-trace {
  align-self: flex-start; max-width: 95%; margin: -4px 0 0;
  padding: 8px 10px; border-left: 2px solid var(--zai-accent);
  background: var(--zai-bubble); border-radius: 0 6px 6px 0;
  font: 12px/1.5 var(--zai-mono); color: var(--zai-muted); white-space: pre-wrap; overflow-wrap: anywhere;
}
.zai-dots { align-self: flex-start; padding: 9px 12px; color: var(--zai-muted); }
.zai-form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--zai-border); }
.zai-input {
  flex: 1; padding: 9px 11px; border: 1px solid var(--zai-border); border-radius: 8px;
  background: var(--zai-bg); color: var(--zai-fg); font: inherit;
}
.zai-input:focus { outline: 2px solid var(--zai-accent); outline-offset: -1px; }
.zai-send { padding: 9px 15px; border: 0; border-radius: 8px; background: #1f2328; color: #fff; font: inherit; cursor: pointer; }
.zai-send:disabled, .zai-input:disabled { opacity: .5; cursor: not-allowed; }
:root {
  --zai-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --zai-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --zai-bg: #fff; --zai-fg: #1f2328; --zai-muted: #6b7280;
  --zai-border: #e3e6ea; --zai-bubble: #f3f4f6; --zai-accent: #7c6cf0;
  --zai-error-bg: #fdecec; --zai-error-fg: #8a1c1c;
}
@media (prefers-color-scheme: dark) {
  :root {
    --zai-bg: #16181c; --zai-fg: #e8eaed; --zai-muted: #9aa2ad;
    --zai-border: #2c3037; --zai-bubble: #23262c;
    --zai-error-bg: #3a1d1d; --zai-error-fg: #f4b8b8;
  }
  .zai-msg[data-role="user"], .zai-send, .zai-launcher { background: #3b4048; }
}`;

  const history = [];
  let busy = false;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  document.head.append(el('style', null, CSS));

  const launcher = el('button', 'zai-launcher', 'Ask about Travis');
  const panel = el('div', 'zai-panel');
  panel.dataset.open = 'false';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat about Travis');

  const head = el('div', 'zai-head');
  head.append(el('span', null, DEBUG ? 'Ask about Travis · debug' : 'Ask about Travis'));
  const close = el('button', 'zai-close', '×');
  close.setAttribute('aria-label', 'Close chat');
  head.append(close);

  const log = el('div', 'zai-log');
  log.setAttribute('aria-live', 'polite');

  const form = el('form', 'zai-form');
  const input = el('input', 'zai-input');
  input.placeholder = 'Ask a question…';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Your message');
  const send = el('button', 'zai-send', 'Send');
  form.append(input, send);

  panel.append(head, log, form);
  document.body.append(launcher, panel);

  function addMessage(role, text) {
    const node = el('div', 'zai-msg', text);
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
        .join(', ');
      const outcome = entry.isError ? 'ERROR' : `${entry.resultChars} chars`;
      return `${entry.round}. ${entry.tool}(${args}) → ${outcome}\n   ${entry.result.replace(/\s+/g, ' ').slice(0, 160)}`;
    });
    log.append(el('div', 'zai-trace', lines.join('\n')));
    log.scrollTop = log.scrollHeight;
  }

  function setBusy(state) {
    busy = state;
    input.disabled = state;
    send.disabled = state;
  }

  async function ask(question) {
    history.push({ role: 'user', content: question });
    addMessage('user', question);
    setBusy(true);

    const dots = el('div', 'zai-dots', 'thinking…');
    log.append(dots);
    log.scrollTop = log.scrollHeight;

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await response.json().catch(() => ({}));
      dots.remove();

      if (!response.ok) {
        // The user turn stays in the log but leaves the history, so a retry
        // does not send the same message twice.
        history.pop();
        addMessage('error', data.error ?? `Something went wrong (${response.status}).`);
        return;
      }

      history.push({ role: 'assistant', content: data.reply });
      addTrace(data.trace);
      addMessage('assistant', data.reply);
    } catch {
      dots.remove();
      history.pop();
      addMessage('error', 'Could not reach the assistant. Check your connection and try again.');
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    input.value = '';
    ask(question);
  });

  launcher.addEventListener('click', () => {
    panel.dataset.open = 'true';
    launcher.style.display = 'none';
    if (log.childElementCount === 0) addMessage('assistant', GREETING);
    input.focus();
  });

  close.addEventListener('click', () => {
    panel.dataset.open = 'false';
    launcher.style.display = '';
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.dataset.open === 'true') close.click();
  });
})();
