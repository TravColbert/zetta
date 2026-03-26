const MIME_TYPES = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

export function mimeFor(filename) {
  const ext = filename.slice(filename.lastIndexOf('.'));
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export async function serveFile(filePath, respond404) {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return respond404();
  return new Response(file, { headers: { 'Content-Type': mimeFor(filePath) } });
}
