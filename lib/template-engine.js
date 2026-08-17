import { join, dirname } from "path";
import { readFileSync, existsSync } from "fs";
import { log } from "./logger.js";
import { renderLayout as builtinLayout } from "../templates/default/layout.js";
import {
  BUILTIN_PARTIALS_DIR,
  TEMPLATE_DIR,
  THEME_PARTIALS_DIR,
  THEME_CSS_DIR,
} from "./config.js";
import { chatWidgetTag } from "./ai.js";
import { escapeHtml } from "./utils.js";

function resolvePartials(template, partialsDir) {
  return template.replace(/\{\{>\s*(\w+)\s*\}\}/g, (_, name) => {
    const partialPath = join(partialsDir, `${name}.html`);
    if (existsSync(partialPath)) return readFileSync(partialPath, "utf8");
    log.warn("partial not found", { path: partialPath });
    return "";
  });
}

// A theme supplies its layout as layout.html. A theme without one — the
// built-in theme included — gets the JS layout in templates/default/layout.js.
function loadLayout(themeCssDir) {
  const customPath = join(TEMPLATE_DIR, "layout.html");
  if (existsSync(customPath)) {
    const raw = readFileSync(customPath, "utf8");
    const template = resolvePartials(raw, dirname(customPath));
    log.info("using custom layout", { path: customPath });
    log.info("theme CSS directory", { path: themeCssDir });
    // Everything but {{body}} is escaped. The body arrives as rendered HTML,
    // but the rest lands in a <title> or an attribute value, where an unescaped
    // quote or angle bracket in an article's own metadata would break the page
    // out of the tag it was meant to fill. The JS layout escapes the same set.
    return ({ slug, title, keywords, description, body }) =>
      template
        .replace(/\{\{slug\}\}/g, escapeHtml(slug))
        .replace(/\{\{title\}\}/g, escapeHtml(title))
        .replace(/\{\{keywords\}\}/g, escapeHtml(keywords))
        .replace(/\{\{description\}\}/g, escapeHtml(description))
        .replace(/\{\{chatWidget\}\}/g, chatWidgetTag())
        .replace(/\{\{body\}\}/g, body ?? "");
  }
  return builtinLayout;
}

function load404() {
  const customPath = process.env.NOT_FOUND_PATH;
  if (customPath && existsSync(customPath)) {
    log.info("using custom 404 page", { path: customPath });
    const raw = readFileSync(customPath, "utf8");
    return resolvePartials(raw, dirname(customPath));
  }
  return null;
}

function load500() {
  const customPath = process.env.SERVER_ERROR_PATH;
  if (customPath && existsSync(customPath)) {
    log.info("using custom 500 page", { path: customPath });
    const raw = readFileSync(customPath, "utf8");
    return resolvePartials(raw, dirname(customPath));
  }
  return null;
}

function loadContentPartial(name, themePartialsDir) {
  const filename = `${name}.html`;
  if (themePartialsDir !== BUILTIN_PARTIALS_DIR) {
    const custom = join(themePartialsDir, filename);
    if (existsSync(custom)) return readFileSync(custom, "utf8");
  }
  const builtin = join(BUILTIN_PARTIALS_DIR, filename);
  if (existsSync(builtin)) return readFileSync(builtin, "utf8");
  log.warn("content partial not found", { name });
  return "";
}

// Template state
let templates = {};

function loadAllTemplates() {
  const renderLayout = loadLayout(THEME_CSS_DIR);
  const notFoundPartial = loadContentPartial("404", THEME_PARTIALS_DIR);
  const serverErrorPartial = loadContentPartial("500", THEME_PARTIALS_DIR);

  templates = {
    renderLayout,
    notFoundPage:
      load404() ??
      renderLayout({
        title: "404 — Not Found",
        keywords: "",
        body: notFoundPartial,
      }),
    serverErrorPage:
      load500() ??
      renderLayout({
        title: "500 — Server Error",
        keywords: "",
        body: serverErrorPartial,
      }),
    articleTmpl: loadContentPartial("article", THEME_PARTIALS_DIR),
    articleTagTmpl: loadContentPartial("article-tag", THEME_PARTIALS_DIR),
    articleListTmpl: loadContentPartial("article-list", THEME_PARTIALS_DIR),
    articleListItemTmpl: loadContentPartial(
      "article-list-item",
      THEME_PARTIALS_DIR,
    ),
    listingTmpl: loadContentPartial("listing", THEME_PARTIALS_DIR),
    tagListTmpl: loadContentPartial("tag-list", THEME_PARTIALS_DIR),
    tagListItemTmpl: loadContentPartial("tag-list-item", THEME_PARTIALS_DIR),
    listingItemTmpl: loadContentPartial("listing-item", THEME_PARTIALS_DIR),
    listingItemBlurbTmpl: loadContentPartial(
      "listing-item-blurb",
      THEME_PARTIALS_DIR,
    ),
    clearFilterTmpl: loadContentPartial("clear-filter", THEME_PARTIALS_DIR),
  };
}

// Initial load
loadAllTemplates();

export function getTemplates() {
  return templates;
}

export function reloadTemplates() {
  loadAllTemplates();
  log.info("templates reloaded");
}

export function respond404() {
  return new Response(templates.notFoundPage, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function respond500() {
  return new Response(templates.serverErrorPage, {
    status: 500,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
