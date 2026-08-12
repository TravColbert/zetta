module.exports = {
  metadata: {
    title: "About Zetta",
    author: "Zetta",
    publishedAt: "2025-05-21 00:00:00 +00:00",
    tags: ["zetta", "documentation", "about"],
    blurb: "Why Zetta?",
    order: 4,
  },
  content: `
Zetta is an AI-empowered, ultra-lightweight, no magic, low-ceremony personal blogging platform. Here's why we built it:

## Your Content is Yours

We wanted something that didn't hide our content in a database or walled garden. There's no *process* to extract your data out of the system... there's no *system*. Each article is a plain Javascript file that you can edit how you wish.

Your content can be tracked in **git** independant of Zetta. Publishing is just \`git push\`.

Redeploying is just a webhook.

## Low Attack Surface, Runs Anywhere

As of this writing Zetta has exactly ONE dependency: the **[marked](https://github.com/markedjs/marked)** Markdown renderer.

Everything else is just vanilla **[Bun](https://bun.com/)**.

There's no ORM, no bundler.

Our goal was that you should be able to run Zetta anywhere. In a container. On a host. In a box. On a boat...

## Comprehensible and Transparent

We describe Zetta as "light weight" and "no magic." Our goal was to build a presentation platform that you could pretty much understand in one sitting.

There's nothing *new* to learn. Do you know *HTML*? *Markdown*? *Git*? That's pretty much all you need.

## Conclusion

Much of our work is still in progress. But, at this point, we have a workable solution that we're happy to use as the foundations of our own blogs.

Thanks for looking into it!
`,
};
