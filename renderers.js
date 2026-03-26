import { marked } from 'marked';
import { getAllTags } from './articles.js';

function formatDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function renderArticlePage(article, templates) {
  const { slug, metadata, content, publishedAt } = article;
  const { articleTagTmpl, articleTmpl, renderLayout } = templates;

  const tags = (metadata.tags ?? [])
    .map(t => articleTagTmpl
      .replace('{{tag}}', t)
      .replace('{{url}}', encodeURIComponent(t)))
    .join(' ');

  const body = articleTmpl
    .replace('{{title}}', metadata.title)
    .replace('{{slug}}', slug)
    .replace('{{author}}', metadata.author)
    .replace('{{date}}', formatDate(publishedAt))
    .replace('{{tags}}', tags)
    .replace('{{content}}', marked(content));

  return renderLayout({
    slug,
    title: metadata.title,
    keywords: (metadata.tags ?? []).join(', '),
    description: metadata.blurb ?? '',
    body,
  });
}

export function renderArticleList(articles, templates) {
  const { articleListItemTmpl, tagListItemTmpl, listingItemBlurbTmpl, articleListTmpl, renderLayout } = templates;

  const items = articles
    .map(({ metadata, publishedAt, slug }) => {
      const blurb = metadata.blurb
        ? listingItemBlurbTmpl.replace('{{blurb}}', metadata.blurb)
        : '';

      const articleTagList = (metadata.tags ?? [])
        .map(t => tagListItemTmpl
          .replaceAll('{{tag}}', t)
          .replaceAll('{{url}}', encodeURIComponent(t)))
        .join(' ');

      return articleListItemTmpl
        .replaceAll('{{slug}}', slug)
        .replace('{{title}}', metadata.title)
        .replace('{{date}}', formatDate(publishedAt))
        .replace('{{blurb}}', blurb)
        .replace('{{tags}}', articleTagList);
    })
    .join('\n');

  const body = articleListTmpl
    .replace('{{items}}', items);

  return renderLayout({ title: 'Articles', keywords: '', body });
}

export function renderTagListing(templates) {
  const { tagListItemTmpl, tagListTmpl, renderLayout } = templates;
  const allTags = getAllTags();

  const tagList = allTags
    .map(t => tagListItemTmpl
      .replaceAll('{{tag}}', t)
      .replaceAll('{{url}}', encodeURIComponent(t)))
    .join(' ');

  const body = tagListTmpl
    .replace('{{items}}', tagList);

  return renderLayout({ title: 'Articles', keywords: allTags.join(', '), body });
}
