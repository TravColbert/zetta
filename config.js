import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PORT = parseInt(process.env.PORT ?? '3000', 10);
export const ROOT_DIR = __dirname;
export const TEMPLATES_DIR = join(__dirname, 'templates');
export const TEMPLATES_DEFAULT_DIR = join(TEMPLATES_DIR, 'default');
export const TEMPLATES_CUSTOM_DIR = join(TEMPLATES_DIR, 'custom');
export const BUILTIN_PARTIALS_DIR = join(TEMPLATES_DEFAULT_DIR, 'partials');

export function getCustomDirs() {
  const customTemplatesDir = process.env.LAYOUT_PATH ? dirname(process.env.LAYOUT_PATH) : null;
  return {
    CUSTOM_TEMPLATES_DIR: customTemplatesDir,
    CUSTOM_PARTIALS_DIR: customTemplatesDir ? join(customTemplatesDir, 'partials') : null,
    CUSTOM_CSS_DIR: customTemplatesDir ? join(customTemplatesDir, 'css') : null,
  };
}
