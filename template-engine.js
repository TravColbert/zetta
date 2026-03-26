import { join, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';
import { log } from './logger.js';
import { renderLayout as builtinLayout } from './templates/default/layout.js';
import { BUILTIN_PARTIALS_DIR, getCustomDirs } from './config.js';

function resolvePartials(template, partialsDir) {
  return template.replace(/\{\{>\s*(\w+)\s*\}\}/g, (_, name) => {
    const partialPath = join(partialsDir, `${name}.html`);
    if (existsSync(partialPath)) return readFileSync(partialPath, 'utf8');
    log.warn('partial not found', { path: partialPath });
    return '';
  });
}

function loadLayout(customCssDir) {
  const customPath = process.env.LAYOUT_PATH;
  if (customPath && existsSync(customPath)) {
    const raw = readFileSync(customPath, 'utf8');
    const template = resolvePartials(raw, dirname(customPath));
    log.info('using custom layout', { path: customPath });
    if (customCssDir) log.info('custom CSS directory', { path: customCssDir });
    return ({ slug, title, keywords, description, body }) =>
      template
        .replace(/\{\{slug\}\}/g, slug ?? '')
        .replace(/\{\{title\}\}/g, title ?? '')
        .replace(/\{\{keywords\}\}/g, keywords ?? '')
        .replace(/\{\{description\}\}/g, description ?? '')
        .replace(/\{\{body\}\}/g, body ?? '');
  }
  return builtinLayout;
}

function load404() {
  const customPath = process.env.NOT_FOUND_PATH;
  if (customPath && existsSync(customPath)) {
    log.info('using custom 404 page', { path: customPath });
    const raw = readFileSync(customPath, 'utf8');
    return resolvePartials(raw, dirname(customPath));
  }
  return null;
}

function load500() {
  const customPath = process.env.SERVER_ERROR_PATH;
  if (customPath && existsSync(customPath)) {
    log.info('using custom 500 page', { path: customPath });
    const raw = readFileSync(customPath, 'utf8');
    return resolvePartials(raw, dirname(customPath));
  }
  return null;
}

function loadContentPartial(name, customPartialsDir) {
  const filename = `${name}.html`;
  if (customPartialsDir) {
    const custom = join(customPartialsDir, filename);
    if (existsSync(custom)) return readFileSync(custom, 'utf8');
  }
  const builtin = join(BUILTIN_PARTIALS_DIR, filename);
  if (existsSync(builtin)) return readFileSync(builtin, 'utf8');
  log.warn('content partial not found', { name });
  return '';
}

// Template state
let templates = {};

function loadAllTemplates() {
  const { CUSTOM_PARTIALS_DIR, CUSTOM_CSS_DIR } = getCustomDirs();

  const renderLayout = loadLayout(CUSTOM_CSS_DIR);
  const notFoundPartial = loadContentPartial('404', CUSTOM_PARTIALS_DIR);
  const serverErrorPartial = loadContentPartial('500', CUSTOM_PARTIALS_DIR);

  templates = {
    renderLayout,
    notFoundPage: load404() ?? renderLayout({ title: '404 — Not Found', keywords: '', body: notFoundPartial }),
    serverErrorPage: load500() ?? renderLayout({ title: '500 — Server Error', keywords: '', body: serverErrorPartial }),
    articleTmpl: loadContentPartial('article', CUSTOM_PARTIALS_DIR),
    articleTagTmpl: loadContentPartial('article-tag', CUSTOM_PARTIALS_DIR),
    articleListTmpl: loadContentPartial('article-list', CUSTOM_PARTIALS_DIR),
    articleListItemTmpl: loadContentPartial('article-list-item', CUSTOM_PARTIALS_DIR),
    listingTmpl: loadContentPartial('listing', CUSTOM_PARTIALS_DIR),
    tagListTmpl: loadContentPartial('tag-list', CUSTOM_PARTIALS_DIR),
    tagListItemTmpl: loadContentPartial('tag-list-item', CUSTOM_PARTIALS_DIR),
    listingItemTmpl: loadContentPartial('listing-item', CUSTOM_PARTIALS_DIR),
    listingItemBlurbTmpl: loadContentPartial('listing-item-blurb', CUSTOM_PARTIALS_DIR),
    clearFilterTmpl: loadContentPartial('clear-filter', CUSTOM_PARTIALS_DIR),
  };
}

// Initial load
loadAllTemplates();

export function getTemplates() {
  return templates;
}

export function reloadTemplates() {
  loadAllTemplates();
  log.info('templates reloaded');
}

export function respond404() {
  return new Response(templates.notFoundPage, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export function respond500() {
  return new Response(templates.serverErrorPage, {
    status: 500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
