module.exports = {
  metadata: {
    title: 'XSS Content Test',
    author: 'Tester',
    publishedAt: '2025-07-02 00:00:00 +00:00',
    tags: [],
  },
  content: '# Hello\n\n<script>alert("xss")</script>\n\nSome text.',
};
