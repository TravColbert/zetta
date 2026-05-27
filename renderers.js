import { getAllTags } from './articles.js';
import { escapeHtml } from './utils.js';

function formatDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function renderArticlePage(article, templates) {
  const { slug, metadata, renderedContent, publishedAt } = article;
  const { articleTagTmpl, articleTmpl, renderLayout } = templates;

  const tags = (metadata.tags ?? [])
    .map(t => articleTagTmpl
      .replaceAll('{{tag}}', escapeHtml(t))
      .replaceAll('{{url}}', encodeURIComponent(t)))
    .join(' ');

  const body = articleTmpl
    .replaceAll('{{title}}', escapeHtml(metadata.title ?? 'TITLE NOT SET'))
    .replaceAll('{{slug}}', escapeHtml(slug))
    .replaceAll('{{author}}', escapeHtml(metadata.author ?? 'AUTHOR NOT SET'))
    .replaceAll('{{date}}', formatDate(publishedAt))
    .replaceAll('{{tags}}', tags)
    .replaceAll('{{content}}', renderedContent);

  return renderLayout({
    slug,
    title: metadata.title ?? 'TITLE NOT SET',
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
        ? listingItemBlurbTmpl.replace('{{blurb}}', escapeHtml(metadata.blurb))
        : '';

      const articleTagList = (metadata.tags ?? [])
        .map(t => tagListItemTmpl
          .replaceAll('{{tag}}', escapeHtml(t))
          .replaceAll('{{url}}', encodeURIComponent(t)))
        .join(' ');

      return articleListItemTmpl
        .replaceAll('{{slug}}', escapeHtml(slug))
        .replaceAll('{{title}}', escapeHtml(metadata.title ?? 'TITLE NOT SET'))
        .replaceAll('{{date}}', formatDate(publishedAt))
        .replaceAll('{{blurb}}', blurb)
        .replaceAll('{{tags}}', articleTagList);
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
      .replaceAll('{{tag}}', escapeHtml(t))
      .replaceAll('{{url}}', encodeURIComponent(t)))
    .join(' ');

  const body = tagListTmpl
    .replace('{{items}}', tagList);

  return renderLayout({ title: 'Tags', keywords: allTags.join(', '), body });
}
