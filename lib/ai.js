import { existsSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { log } from './logger.js';
import { escapeHtml } from './utils.js';
import { ARTICLES_DIR } from './config.js';

const require = createRequire(import.meta.url);

const CONFIG_PATH = join(ARTICLES_DIR, 'ai.js');

// The config ships in the articles repo and arrives by unattended git pull, so
// a missing or broken file disables the chat instead of stopping the server.
function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    log.info('no ai config, chat disabled', { path: CONFIG_PATH });
    return null;
  }

  try {
    const { systemPrompt, greeting, label, tools } = require(CONFIG_PATH);

    if (typeof systemPrompt !== 'string' || systemPrompt.trim() === '') {
      throw new Error('systemPrompt must be a non-empty string');
    }
    if (tools !== undefined && !Array.isArray(tools)) {
      throw new Error('tools must be an array');
    }

    return { systemPrompt, greeting, label, tools: tools ?? [] };
  } catch (err) {
    log.error('failed to load ai config, chat disabled', {
      path: CONFIG_PATH,
      error: err.message,
    });
    return null;
  }
}

let config = loadConfig();

export function getAiConfig() {
  return config;
}

export function isChatEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY && config);
}

// Built per render rather than cached alongside the templates: the greeting
// ships in the articles repo, so it can change on a sync that never touches
// them. Layouts place it with {{chatWidget}}.
export function chatWidgetTag() {
  if (!isChatEnabled()) return '';

  const attrs = ['greeting', 'label']
    .filter((name) => config[name])
    .map((name) => ` data-${name}="${escapeHtml(config[name])}"`)
    .join('');
  return `<script src="/js/widget.js"${attrs} defer></script>`;
}

export function reloadAiConfig() {
  delete require.cache[CONFIG_PATH];
  config = loadConfig();
  log.info('ai config reloaded', { enabled: config !== null });
}
