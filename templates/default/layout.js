export function renderLayout({ title, keywords, description, body }) {
  const descTag = description
    ? `\n  <meta name="description" content="${description}">`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="keywords" content="${keywords ?? ''}">${descTag}
  <title>${title} — Zetta</title>
  <link rel="stylesheet" href="/css/reset.css">
  <link rel="icon" href="/favicon.ico">
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>`;
}
