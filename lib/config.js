import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// This module lives in lib/, so the project root is one level up.

export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const ROOT_DIR = dirname(__dirname);
export const ROOT_ARTICLE_DIR = join(ROOT_DIR, "articles");
export const ROOT_TEMPLATE_DIR = join(ROOT_DIR, "templates");
export const ARTICLES_DIR = ROOT_ARTICLE_DIR;
export const TEMPLATE_DIR = process.env.CUSTOM_THEME
  ? join(ROOT_TEMPLATE_DIR, process.env.CUSTOM_THEME)
  : join(ROOT_TEMPLATE_DIR, "default");
export const BUILTIN_TEMPLATE_DIR = join(ROOT_TEMPLATE_DIR, "default");
export const BUILTIN_PARTIALS_DIR = join(BUILTIN_TEMPLATE_DIR, "partials");

export const SYNC_CUSTOM_TEMPLATES =
  presentAndSet("CUSTOM_THEME") && presentAndSet("TEMPLATES_REPO_URL");

export const SYNC_CUSTOM_ARTICLES = presentAndSet("ARTICLES_REPO_URL");

export function getCustomDirs() {
  return {
    CUSTOM_TEMPLATES_DIR: TEMPLATE_DIR,
    CUSTOM_PARTIALS_DIR: join(TEMPLATE_DIR, "partials"),
    CUSTOM_CSS_DIR: join(TEMPLATE_DIR, "css"),
    CUSTOM_JS_DIR: join(TEMPLATE_DIR, "js"),
  };
}

function presentAndSet(processEnvVariable) {
  return (
    !!process.env[processEnvVariable] &&
    process.env[processEnvVariable] != "" &&
    process.env[processEnvVariable] != null
  );
}
