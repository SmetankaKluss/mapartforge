import { useEffect, useMemo } from 'react';
import { useLocale } from '../lib/useLocale';
import { applyPageMeta } from '../lib/meta';
import { EXAMPLES } from '../lib/examples';
import { buildTrackedHref } from '../lib/analytics';
import { getSeoPageByPath, type SeoPageDefinition } from '../lib/seoPages';
import { PublicSiteHeader } from './PublicSiteHeader';

interface Props {
  page: SeoPageDefinition;
}

export function SeoLandingPage({ page }: Props) {
  const { lang, toggle, t } = useLocale();
  const exampleProjects = useMemo(
    () => EXAMPLES.filter(example => page.exampleIds.includes(example.id)),
    [page.exampleIds],
  );
  const publishedRelatedLinks = useMemo(
    () => page.related.filter(link => !getSeoPageByPath(link.href)),
    [page.related],
  );

  useEffect(() => {
    applyPageMeta({
      title: page.title,
      description: page.description,
      url: `${window.location.origin}${page.path}`,
      image: `${window.location.origin}${exampleProjects[0]?.previewUrl ?? '/og-image.png'}`,
      schema: [
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'MapKluss',
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Web',
          url: `${window.location.origin}${page.path}`,
          description: page.description,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: page.faq.map(item => ({
            '@type': 'Question',
            name: lang === 'ru' ? item.questionRu : item.questionEn,
            acceptedAnswer: {
              '@type': 'Answer',
              text: lang === 'ru' ? item.answerRu : item.answerEn,
            },
          })),
        },
      ],
    });
  }, [exampleProjects, lang, page]);

  const sectionLinks = [
    { id: 'capabilities', ru: 'Возможности', en: 'Capabilities' },
    { id: 'workflow', ru: 'Как работать', en: 'Workflow' },
    ...(exampleProjects.length ? [{ id: 'examples', ru: 'Примеры', en: 'Examples' }] : []),
    { id: 'faq', ru: 'Вопросы', en: 'Questions' },
    ...(publishedRelatedLinks.length ? [{ id: 'related', ru: 'Дальше', en: 'Next' }] : []),
  ];

  return (
    <div className="public-shell">
      <PublicSiteHeader lang={lang} onToggleLanguage={toggle} />
      <main className="seo-page public-content-page">
        <section className="seo-hero">
          <nav className="public-breadcrumbs" aria-label={t('Навигационная цепочка', 'Breadcrumb')}>
            <a href={buildTrackedHref('/')}>MapKluss</a>
            <span className="public-breadcrumbs__separator" aria-hidden="true">/</span>
            <span>{t('Руководства', 'Guides')}</span>
            <span className="public-breadcrumbs__separator" aria-hidden="true">/</span>
            <span aria-current="page">{t(page.kickerRu, page.kickerEn)}</span>
          </nav>
          <div className="seo-hero-layout">
            <div>
              <span className="seo-topic-label">{t(page.kickerRu, page.kickerEn)}</span>
              <h1>{t(page.h1Ru, page.h1En)}</h1>
              <p className="seo-hero-lead">{t(page.introRu, page.introEn)}</p>
              <div className="examples-hero-actions">
                <a href={buildTrackedHref('/')}>{t('Открыть редактор', 'Open editor')}</a>
                <a href={buildTrackedHref('/examples')}>{t('Проверенные примеры', 'Verified examples')}</a>
              </div>
            </div>
            <p className="seo-hero-body">{t(page.bodyRu, page.bodyEn)}</p>
          </div>
        </section>

        <div className="seo-document-layout">
          <nav className="seo-document-nav" aria-label={t('Разделы руководства', 'Guide sections')}>
            <strong>{t('На этой странице', 'On this page')}</strong>
            {sectionLinks.map(link => <a key={link.id} href={`#${link.id}`}>{t(link.ru, link.en)}</a>)}
          </nav>

          <div className="seo-document-body">
            <section id="capabilities" className="seo-section">
              <div className="seo-section-head">
                <h2>{t('Что MapKluss даёт в этом сценарии', 'What MapKluss provides here')}</h2>
                <p>{t('Только функции, которые помогают получить пригодный для Minecraft результат.', 'Only the features that help produce a usable Minecraft result.')}</p>
              </div>
              <ul className="seo-capability-list">
                {(lang === 'ru' ? page.highlightsRu : page.highlightsEn).map(item => <li key={item}>{item}</li>)}
              </ul>
            </section>

            <section id="workflow" className="seo-section">
              <div className="seo-section-head">
                <h2>{t('Рабочий порядок', 'Working order')}</h2>
                <p>{t('Короткий путь от изображения до файла или плана постройки.', 'A short path from source image to export or build plan.')}</p>
              </div>
              <ol className="seo-workflow-list">
                {(lang === 'ru' ? page.workflowRu : page.workflowEn).map(step => <li key={step}>{step}</li>)}
              </ol>
            </section>

            {exampleProjects.length > 0 && (
              <section id="examples" className="seo-section">
                <div className="seo-section-head">
                  <h2>{t('Проверенные настройки на реальных изображениях', 'Verified settings on real images')}</h2>
                  <p>{t('Каждый результат экспортирован текущей версией MapKluss. Никаких подменённых Minecraft-скриншотов.', 'Every result was exported by the current MapKluss build. No substituted Minecraft screenshots.')}</p>
                </div>
                <div className="seo-doc-grid">
                  {exampleProjects.map(example => (
                    <article className="seo-doc-card" key={example.id}>
                      <a className="seo-doc-preview" href={buildTrackedHref(`/examples/${example.id}`)} aria-label={t(`Открыть пример «${example.titleRu}»`, `Open “${example.titleEn}” example`)}>
                        <img src={example.previewUrl} alt="" loading="lazy" />
                      </a>
                      <div className="seo-doc-content">
                        <div className="seo-doc-head">
                          <h3>{t(example.titleRu, example.titleEn)}</h3>
                          <span className={`example-mode example-mode--${example.mode}`}>{example.mode === '3d' ? '3D Stair' : '2D Flat'}</span>
                        </div>
                        <p className="seo-doc-body">{t(example.descriptionRu, example.descriptionEn)}</p>
                        <dl className="seo-doc-meta">
                          <div><dt>{t('Сетка', 'Grid')}</dt><dd>{example.size}</dd></div>
                          <div><dt>{t('Оттенки', 'Shades')}</dt><dd>{example.colors}</dd></div>
                          <div><dt>{t('Дизеринг', 'Dithering')}</dt><dd>{example.trySettings.dithering}</dd></div>
                        </dl>
                        <div className="seo-doc-actions">
                          <a href={buildTrackedHref(`/examples/${example.id}`)}>{t('Разобрать пример', 'Inspect example')}</a>
                          <a href={buildTrackedHref(`/?example=${encodeURIComponent(example.id)}`)}>{t('Открыть настройки', 'Open settings')}</a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section id="faq" className="seo-section">
              <div className="seo-section-head"><h2>{t('Частые вопросы', 'Frequently asked questions')}</h2></div>
              <div className="seo-faq-list">
                {page.faq.map((item, index) => (
                  <details className="seo-faq-item" key={item.questionEn} open={index === 0}>
                    <summary>{t(item.questionRu, item.questionEn)}</summary>
                    <p>{t(item.answerRu, item.answerEn)}</p>
                  </details>
                ))}
              </div>
            </section>

            {publishedRelatedLinks.length > 0 && (
              <section id="related" className="seo-section seo-section-last">
                <div className="seo-section-head"><h2>{t('Продолжить', 'Continue')}</h2></div>
                <div className="seo-related-links">
                  {publishedRelatedLinks.map(link => <a key={link.href} href={buildTrackedHref(link.href)}>{t(link.labelRu, link.labelEn)}</a>)}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
