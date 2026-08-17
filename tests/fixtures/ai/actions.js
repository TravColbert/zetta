module.exports = {
  systemPrompt: 'You are a test assistant.',
  tools: [
    { tool: 'get_about', slug: 'about', description: 'The about document.' },
    { tool: 'get_ghost', slug: 'not-published', description: 'Missing article.' },
    { tool: 'read_missing_file', file: 'absent.md', description: 'Missing file.' },
    { tool: 'leave_message' },
  ],
};
