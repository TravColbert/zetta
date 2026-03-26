import { join, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';
import { renderLayout as builtinLayout } from './templates/default/layout.js';
import { BUILTIN_PARTIALS_DIR, getCustomDirs } from './config.js';

function resolvePartials(template, partialsDir) {
  return template.replace(/\{\{>\s*(\w+)\s*\}\}/g, (_, name) => {
    const partialPath = join(partialsDir, `${name}.html`);
    if (existsSync(partialPath)) return readFileSync(partialPath, 'utf8');
    console.warn(`Partial not found: ${partialPath}`);
    return '';
  });
}

function loadLayout(customCssDir) {
  const customPath = process.env.LAYOUT_PATH;
  if (customPath && existsSync(customPath)) {
    const raw = readFileSync(customPath, 'utf8');
    const template = resolvePartials(raw, dirname(customPath));
    console.log(`Using custom layout: ${customPath}`);
    if (customCssDir) console.log(`Custom CSS directory: ${customCssDir}`);
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
    console.log(`Using custom 404 page: ${customPath}`);
    const raw = readFileSync(customPath, 'utf8');
    return resolvePartials(raw, dirname(customPath));
  }
  return null;
}

function load500() {
  const customPath = process.env.SERVER_ERROR_PATH;
  if (customPath && existsSync(customPath)) {
    console.log(`Using custom 500 page: ${customPath}`);
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
  console.warn(`Content partial not found: ${name}`);
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
  console.log('Templates reloaded');
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
