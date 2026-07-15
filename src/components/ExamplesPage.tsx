import { useEffect, useMemo } from 'react';
import { EXAMPLES } from '../lib/examples';
import { applyPageMeta } from '../lib/meta';
import { useLocale } from '../lib/useLocale';
import { buildTrackedHref } from '../lib/analytics';
import { PublicSiteHeader } from './PublicSiteHeader';

function downloadImage(url: string, filename: string): void {
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
}

export function ExamplesPage() {
  const { lang, toggle, t } = useLocale();
  const exampleCount = EXAMPLES.length;

  const useCases = useMemo(() => ([
    {
      titleRu: 'Логотипы и серверные эмблемы',
      titleEn: 'Logos and server emblems',
      bodyRu: 'Обычно лучше заходят в 2D Flat с чистой палитрой и слабым дизерингом или вообще без него.',
      bodyEn: 'These usually work best in 2D Flat with a cleaner palette and lighter dithering or none at all.',
    },
    {
      titleRu: 'Иллюстрации, живопись и яркие арты',
      titleEn: 'Illustrations, paintings, and vivid artwork',
      bodyRu: 'Часто выигрывают от 3D Stair, потому что дополнительные оттенки помогают сохранить объём и мягкие переходы.',
      bodyEn: 'These often benefit from 3D Stair because the extra shades preserve volume and softer transitions.',
    },
    {
      titleRu: 'Первые проекты и survival-постройки',
      titleEn: 'First projects and survival builds',
      bodyRu: 'Если важны простота и предсказуемые материалы, начинай с 1x1 или 2x2 и смотри на материалы до экспорта.',
      bodyEn: 'If simplicity and predictable materials matter most, start with 1x1 or 2x2 and check materials before exporting.',
    },
  ]), []);

  const faqs = useMemo(() => ([
    {
      questionRu: 'Для чего нужна страница с примерами?',
      questionEn: 'Why does this examples page exist?',
      answerRu: 'Она помогает быстро понять, как разные типы изображений ведут себя в Minecraft: какие лучше смотрятся в 2D, какие выигрывают от 3D, и как сильно меняются материалы и итоговый вид в игре.',
      answerEn: 'It helps you quickly understand how different image types behave in Minecraft: which ones work better in 2D, which benefit from 3D, and how materials and in-game appearance change.',
    },
    {
      questionRu: 'Можно ли открыть любой пример прямо в редакторе?',
      questionEn: 'Can I open any example directly in the editor?',
      answerRu: 'Да. У каждой карточки есть кнопка, которая открывает этот пример в основном редакторе, чтобы ты мог сразу менять палитру, размер, дизеринг и экспорт.',
      answerEn: 'Yes. Every card links back to the main editor so you can immediately change palette, size, dithering, and export settings.',
    },
    {
      questionRu: 'Что смотреть в примерах в первую очередь?',
      questionEn: 'What should I focus on first in these examples?',
      answerRu: 'Сначала смотри на тип изображения, режим 2D/3D и размер. Потом сравни материалы и итог в Minecraft, потому что красивый preview и удобная постройка — не всегда одно и то же.',
      answerEn: 'First look at image type, 2D/3D mode, and size. Then compare materials and the final Minecraft result, because a pretty preview and an easy build are not always the same thing.',
    },
  ]), []);

  useEffect(() => {
    const itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: EXAMPLES.map((example, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: lang === 'ru' ? example.titleRu : example.titleEn,
        url: `${window.location.origin}/examples/${example.id}`,
        image: `${window.location.origin}${example.previewUrl}`,
      })),
    };

    applyPageMeta({
      title: 'Minecraft Map Art Examples | MapKluss',
      description: 'Browse Minecraft map art examples made with MapKluss. Compare original images, generated previews, Minecraft screenshots, modes, sizes, colors, and materials.',
      url: `${window.location.origin}/examples`,
      image: `${window.location.origin}/og-image.png`,
      schema: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Minecraft Map Art Examples',
          url: `${window.location.origin}/examples`,
          description: 'Examples of Minecraft map art created with MapKluss.',
        },
        itemList,
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.map(item => ({
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
  }, [faqs, lang]);

  return (
    <div className="public-shell">
      <PublicSiteHeader active="examples" lang={lang} onToggleLanguage={toggle} />
      <main className="examples-page public-content-page">

      <section className="examples-hero">
        <div className="examples-hero-layout">
          <div>
            <nav className="public-breadcrumbs" aria-label={t('Навигационная цепочка', 'Breadcrumb')}>
              <a href={buildTrackedHref('/')}>MapKluss</a>
              <span className="public-breadcrumbs__separator" aria-hidden="true">/</span>
              <span aria-current="page">{t('Примеры', 'Examples')}</span>
            </nav>
            <h1>{t('Примеры и рабочие сценарии', 'Examples and working patterns')}</h1>
            <p>
              {t(
                'Сравни режимы, размеры и настройки обработки, а затем открой подходящий сценарий прямо в редакторе MapKluss.',
                'Compare modes, sizes, and processing settings, then open the closest working pattern directly in the MapKluss editor.',
              )}
            </p>
            <p className="examples-hero-subline">
              {t(
                `Сейчас в каталоге ${exampleCount} демонстрационных сценариев. Галерея настоящих пользовательских построек будет добавлена отдельно после проверки исходников и Minecraft-скриншотов.`,
                `The catalogue currently contains ${exampleCount} demonstration workflows. A verified gallery of real user builds will be added separately once source files and Minecraft screenshots are checked.`,
              )}
            </p>
            <div className="examples-hero-actions">
              <a href={buildTrackedHref('/')}>{t('Открыть редактор', 'Open Editor')}</a>
              <a href="#examples-grid">{t('Смотреть сценарии', 'Browse workflows')}</a>
            </div>
          </div>
          <aside className="examples-flow-key" aria-label={t('Как читать сценарий', 'How to read a workflow')}>
            <strong>{t('Как читать сценарий', 'How to read a workflow')}</strong>
            <ol>
              <li>{t('Определи тип изображения и желаемый размер.', 'Identify the image type and target size.')}</li>
              <li>{t('Сравни 2D Flat и 3D Stair по сложности и оттенкам.', 'Compare 2D Flat and 3D Stair by complexity and shade range.')}</li>
              <li>{t('Открой сценарий в редакторе и замени изображение своим.', 'Open the workflow in the editor and replace the image with your own.')}</li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="examples-insight-section" aria-label={t('Подходы и use cases', 'Use cases and guidance')}>
        <div className="examples-section-head">
          <h2>{t('Какие примеры смотреть в первую очередь', 'What to look at first')}</h2>
          <p>
            {t(
              'Эта страница полезна не только как галерея. По ней можно быстро понять, какой режим и какой тип обработки стоит пробовать для твоего изображения.',
              'This page is useful as more than a gallery. It helps you quickly decide which mode and processing style to try for your own image.',
            )}
          </p>
        </div>
        <div className="examples-insight-grid">
          {useCases.map(item => (
            <article className="examples-insight-card" key={item.titleEn}>
              <h3>{t(item.titleRu, item.titleEn)}</h3>
              <p>{t(item.bodyRu, item.bodyEn)}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="examples-grid" className="examples-grid" aria-label={t('Примеры', 'Examples')}>
        {EXAMPLES.map(example => (
          <article className="example-card" key={example.id}>
            <div className="example-card-head">
              <div>
                <h2>{t(example.titleRu, example.titleEn)}</h2>
                <p>{t(example.descriptionRu, example.descriptionEn)}</p>
              </div>
              <span className={`example-mode example-mode--${example.mode}`}>
                {example.mode === '3d' ? '3D Stair' : '2D Flat'}
              </span>
            </div>

            <div className="example-comparison">
              <figure>
                <img src={example.originalUrl} alt={t(`${example.titleRu}: исходник`, `${example.titleEn}: original image`)} loading="lazy" />
                <figcaption>{t('Исходник', 'Original')}</figcaption>
              </figure>
              <figure>
                <img src={example.previewUrl} alt={t(`${example.titleRu}: результат MapKluss`, `${example.titleEn}: MapKluss result`)} loading="lazy" />
                <figcaption>{t('Результат MapKluss', 'MapKluss result')}</figcaption>
              </figure>
            </div>

            <p className="example-source-line">
              <span>{t('Источник:', 'Source:')} </span>
              {example.sourcePageUrl
                ? <a href={example.sourcePageUrl} target="_blank" rel="noopener noreferrer">{t(example.sourceNameRu, example.sourceNameEn)}</a>
                : <strong>{t(example.sourceNameRu, example.sourceNameEn)}</strong>}
              <span aria-hidden="true"> · </span>
              {example.licenseUrl
                ? <a href={example.licenseUrl} target="_blank" rel="noopener noreferrer">{t(example.licenseLabelRu, example.licenseLabelEn)}</a>
                : <span>{t(example.licenseLabelRu, example.licenseLabelEn)}</span>}
            </p>

            <dl className="example-meta">
              <div>
                <dt>{t('Размер', 'Size')}</dt>
                <dd>{example.size} {t('карт', 'maps')}</dd>
              </div>
              <div>
                <dt>{t('Цвета', 'Colors')}</dt>
                <dd>{example.colors}</dd>
              </div>
              <div>
                <dt>{t('Дизеринг', 'Dithering')}</dt>
                <dd>{example.trySettings.dithering}</dd>
              </div>
            </dl>

            <div className="example-materials" aria-label={t('Цветовой ориентир', 'Palette guide')}>
              {example.paletteHints.map(material => <span key={material}>{material}</span>)}
            </div>

            <div className="example-actions">
              <a href={buildTrackedHref(`/?example=${encodeURIComponent(example.id)}`)} aria-label={t(`Открыть сценарий «${example.titleRu}» в редакторе`, `Open “${example.titleEn}” workflow in the editor`)}>{t('Открыть в редакторе', 'Open in editor')}</a>
              <a href={buildTrackedHref(`/examples/${example.id}`)} aria-label={t(`Подробнее о сценарии «${example.titleRu}»`, `Read details about “${example.titleEn}”`)}>{t('Подробнее', 'Read details')}</a>
              <button onClick={() => downloadImage(example.previewUrl, `mapkluss_${example.id}.png`)}>
                {t('Скачать превью', 'Download preview')}
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="examples-insight-section">
        <div className="examples-section-head">
          <h2>{t('Что дают эти примеры на практике', 'What these examples help you decide')}</h2>
        </div>
        <div className="examples-checklist-grid">
          <article className="examples-check-card">
            <h3>{t('Размер и читаемость', 'Size and readability')}</h3>
            <p>{t('Сразу видно, где хватает 1x1, а где картинка начинает требовать 2x2 или 4x4.', 'You can quickly see where 1x1 is enough and where the image starts to demand 2x2 or 4x4.')}</p>
          </article>
          <article className="examples-check-card">
            <h3>{t('2D против 3D', '2D versus 3D')}</h3>
            <p>{t('На карточках легче заметить, когда 3D действительно улучшает результат, а когда только усложняет постройку.', 'The cards make it easier to notice when 3D genuinely improves the result and when it only adds build complexity.')}</p>
          </article>
          <article className="examples-check-card">
            <h3>{t('Материалы и реальная постройка', 'Materials and real build cost')}</h3>
            <p>{t('Примеры помогают не зацикливаться на красивом preview и сразу думать о блоках, ресурсе и удобстве постройки.', 'The examples keep you from focusing only on a pretty preview and push you to think about blocks, resource cost, and actual build convenience.')}</p>
          </article>
        </div>
      </section>

      <section className="examples-insight-section examples-faq-section">
        <div className="examples-section-head">
          <h2>{t('Частые вопросы', 'Frequently asked questions')}</h2>
        </div>
        <div className="examples-faq-list">
          {faqs.map((item, index) => (
            <details className="examples-faq-item" key={item.questionEn} open={index === 0}>
              <summary>{t(item.questionRu, item.questionEn)}</summary>
              <p>{t(item.answerRu, item.answerEn)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="examples-cta-band">
        <div>
          <h2>{t('Открой редактор и прогони свою картинку через те же режимы', 'Open the editor and run your own image through the same workflow')}</h2>
          <p>
            {t(
              'Примеры нужны, чтобы снять первый вопрос: что вообще можно получить на выходе. Дальше уже имеет смысл загружать свою картинку и подбирать палитру, размер и экспорт под реальную задачу.',
              'The examples are here to answer the first question: what kind of result is even possible. After that, it makes sense to upload your own image and tune palette, size, and export for the real job.',
            )}
          </p>
        </div>
        <div className="examples-cta-actions">
          <a href={buildTrackedHref('/')}>{t('Открыть редактор', 'Open Editor')}</a>
        </div>
      </section>
      </main>
    </div>
  );
}
