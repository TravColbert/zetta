import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// This module lives in lib/, so the project root is one level up.

export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const ROOT_DIR = dirname(__dirname);
export const ROOT_ARTICLE_DIR = join(ROOT_DIR, "articles");
export const ROOT_TEMPLATE_DIR = join(ROOT_DIR, "templates");

export const BUILTIN_TEMPLATE_DIR = join(ROOT_TEMPLATE_DIR, "default");
export const BUILTIN_PARTIALS_DIR = join(BUILTIN_TEMPLATE_DIR, "partials");
export const BUILTIN_CSS_DIR = join(BUILTIN_TEMPLATE_DIR, "css");
export const BUILTIN_JS_DIR = join(BUILTIN_TEMPLATE_DIR, "js");

// ARTICLES_DIR and TEMPLATE_DIR can be pointed elsewhere by env var. Nothing in
// a deployment needs that — CUSTOM_THEME is how a site picks its theme — but the
// tests use it to run against scratch directories instead of the working tree.
export const ARTICLES_DIR = process.env.ARTICLES_DIR
  ? resolve(process.env.ARTICLES_DIR)
  : ROOT_ARTICLE_DIR;

export const TEMPLATE_DIR = process.env.TEMPLATE_DIR
  ? resolve(process.env.TEMPLATE_DIR)
  : process.env.CUSTOM_THEME
    ? join(ROOT_TEMPLATE_DIR, process.env.CUSTOM_THEME)
    : BUILTIN_TEMPLATE_DIR;

// The active theme's subdirectories. Each falls back to the built-in theme
// per file, so a theme only has to ship the parts it wants to change.
export const THEME_PARTIALS_DIR = join(TEMPLATE_DIR, "partials");
export const THEME_CSS_DIR = join(TEMPLATE_DIR, "css");
export const THEME_JS_DIR = join(TEMPLATE_DIR, "js");

export const USING_CUSTOM_THEME = TEMPLATE_DIR !== BUILTIN_TEMPLATE_DIR;
