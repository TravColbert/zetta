module.exports = {
  systemPrompt: 'You are a test assistant.',
  greeting: 'Ask me "anything" <here>.',
  label: 'Ask away',
  tools: [
    {
      tool: 'get_about',
      slug: 'about',
      description: 'Call this for the about document.',
    },
    {
      tool: 'check_topic_policy',
      file: 'topics.md',
      description: 'Call this for the topic policy.',
    },
  ],
};
