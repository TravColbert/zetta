module.exports = {
  metadata: {
    title: '<script>alert(1)</script>XSS',
    author: '<img src=x onerror=alert(1)>',
    publishedAt: '2025-07-01 00:00:00 +00:00',
    tags: ['<b>tag</b>'],
    blurb: '<em>blurb</em>',
  },
  content: 'Safe content.',
};
