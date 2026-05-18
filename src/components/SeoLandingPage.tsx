import { useEffect, useMemo } from 'react';
import { useLocale } from '../lib/locale';
import { applyPageMeta } from '../lib/meta';
import { EXAMPLES } from '../lib/examples';
import type { SeoPageDefinition } from '../lib/seoPages';

interface Props {
  page: SeoPageDefinition;
}

export function SeoLandingPage({ page }: Props) {
  const { lang, toggle, t } = useLocale();

  const exampleProjects = useMemo(
    () => EXAMPLES.filter(example => page.exampleIds.includes(example.id)),
    [page.exampleIds],
  );

  useEffect(() => {
    const schema = [
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'MapKluss',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        url: `${window.location.origin}${page.path}`,
        image: `${window.location.origin}/og-image.png`,
        description: page.description,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
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
    ];

    applyPageMeta({
      title: page.title,
      description: page.description,
      url: `${window.location.origin}${page.path}`,
      image: `${window.location.origin}/og-image.png`,
      schema,
    });
  }, [lang, page]);

  return (
    <main className="seo-page">
      <header className="examples-topbar seo-topbar">
        <a className="examples-brand" href="/">
          <img src="/logo-opt.png" alt="MapKluss" />
          <span>
            <strong>MAPKLUSS</strong>
            <small>MINECRAFT MAP ART GENERATOR</small>
          </span>
        </a>
        <nav className="examples-nav">
          <a href="/">{t('Открыть редактор', 'Open Editor')}</a>
          <a href="/examples">{t('Примеры', 'Examples')}</a>
          <button onClick={toggle}>{lang === 'ru' ? 'EN' : 'RU'}</button>
        </nav>
      </header>

      <section className="seo-hero">
        <p className="examples-kicker">{t(page.kickerRu, page.kickerEn)}</p>
        <h1>{t(page.h1Ru, page.h1En)}</h1>
        <p className="seo-hero-lead">{t(page.introRu, page.introEn)}</p>
        <p className="seo-hero-body">{t(page.bodyRu, page.bodyEn)}</p>
        <div className="examples-hero-actions">
          <a href="/">{t('Открыть редактор', 'Open Editor')}</a>
          <a href="/examples">{t('Смотреть примеры', 'Browse examples')}</a>
        </div>
      </section>

      <section className="seo-section">
        <div className="seo-section-head">
          <h2>{t('Почему строители выбирают MapKluss', 'Why builders use MapKluss')}</h2>
          <p>{t('Коротко о том, чем этот workflow отличается от старых конвертеров картинок.', 'A quick summary of what makes this workflow different from older image-to-map converters.')}</p>
        </div>
        <div className="seo-card-grid">
          {(lang === 'ru' ? page.highlightsRu : page.highlightsEn).map(item => (
            <article className="seo-mini-card" key={item}>
              <h3>{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="seo-section">
        <div className="seo-section-head">
          <h2>{t('Как это работает', 'How it works')}</h2>
          <p>{t('Путь от исходной картинки до Minecraft-ready результата.', 'The path from source image to a Minecraft-ready result.')}</p>
        </div>
        <ol className="seo-workflow-list">
          {(lang === 'ru' ? page.workflowRu : page.workflowEn).map(step => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      {exampleProjects.length > 0 && (
        <section className="seo-section">
          <div className="seo-section-head">
            <h2>{t('Примеры результата', 'Result examples')}</h2>
            <p>{t('Реальные примеры, которые можно открыть в редакторе и попробовать самому.', 'Real examples you can open in the editor and try yourself.')}</p>
          </div>
          <div className="seo-example-grid">
            {exampleProjects.map(example => (
              <article className="seo-example-card" key={example.id}>
                <img src={example.previewUrl} alt={t(`${example.titleRu}: результат MapKluss`, `${example.titleEn}: MapKluss result`)} loading="lazy" />
                <div className="seo-example-card-body">
                  <h3>{t(example.titleRu, example.titleEn)}</h3>
                  <p>{t(example.descriptionRu, example.descriptionEn)}</p>
                  <div className="seo-example-actions">
                    <a href={`/?example=${encodeURIComponent(example.id)}`}>{t('Попробовать', 'Try this example')}</a>
                    <a href="/examples">{t('Все примеры', 'All examples')}</a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="seo-section">
        <div className="seo-section-head">
          <h2>{t('Частые вопросы', 'Frequently asked questions')}</h2>
        </div>
        <div className="seo-faq-list">
          {page.faq.map(item => (
            <article className="seo-faq-item" key={item.questionEn}>
              <h3>{t(item.questionRu, item.questionEn)}</h3>
              <p>{t(item.answerRu, item.answerEn)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="seo-section seo-section-last">
        <div className="seo-section-head">
          <h2>{t('Полезные страницы', 'Related pages')}</h2>
        </div>
        <div className="seo-related-links">
          {page.related.map(link => (
            <a key={link.href} href={link.href}>{t(link.labelRu, link.labelEn)}</a>
          ))}
        </div>
      </section>
    </main>
  );
}
