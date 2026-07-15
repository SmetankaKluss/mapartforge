import { useEffect } from 'react';
import { buildTrackedHref } from '../lib/analytics';
import type { ExampleProject } from '../lib/examples';
import { useLocale } from '../lib/useLocale';
import { applyPageMeta } from '../lib/meta';
import { PublicSiteHeader } from './PublicSiteHeader';

interface Props {
  example: ExampleProject;
}

export function ExampleDetailPage({ example }: Props) {
  const { lang, toggle, t } = useLocale();
  const modeLabel = example.mode === '3d' ? '3D Stair' : '2D Flat';

  useEffect(() => {
    applyPageMeta({
      title: `${lang === 'ru' ? example.titleRu : example.titleEn} | MapKluss`,
      description: lang === 'ru'
        ? `${example.titleRu}: проверенное сравнение исходника и результата MapKluss. Размер ${example.size}, ${modeLabel}, дизеринг ${example.trySettings.dithering}.`
        : `${example.titleEn}: a verified source-to-MapKluss comparison at ${example.size}, ${modeLabel}, using ${example.trySettings.dithering} dithering.`,
      url: `${window.location.origin}/examples/${example.id}`,
      image: `${window.location.origin}${example.previewUrl}`,
      schema: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: lang === 'ru' ? example.titleRu : example.titleEn,
          description: lang === 'ru' ? example.descriptionRu : example.descriptionEn,
          image: `${window.location.origin}${example.previewUrl}`,
          mainEntityOfPage: `${window.location.origin}/examples/${example.id}`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'MapKluss', item: `${window.location.origin}/` },
            { '@type': 'ListItem', position: 2, name: 'Examples', item: `${window.location.origin}/examples` },
            { '@type': 'ListItem', position: 3, name: lang === 'ru' ? example.titleRu : example.titleEn, item: `${window.location.origin}/examples/${example.id}` },
          ],
        },
      ],
    });
  }, [example, lang, modeLabel]);

  return (
    <div className="public-shell">
      <PublicSiteHeader active="examples" lang={lang} onToggleLanguage={toggle} />
      <main className="examples-page public-content-page">
        <section className="examples-hero example-detail-hero">
          <nav className="public-breadcrumbs" aria-label={t('Навигационная цепочка', 'Breadcrumb')}>
            <a href={buildTrackedHref('/')}>MapKluss</a>
            <span className="public-breadcrumbs__separator" aria-hidden="true">/</span>
            <a href={buildTrackedHref('/examples')}>{t('Примеры', 'Examples')}</a>
            <span className="public-breadcrumbs__separator" aria-hidden="true">/</span>
            <span aria-current="page">{t(example.titleRu, example.titleEn)}</span>
          </nav>
          <div className="example-detail-intro">
            <div>
              <h1>{t(example.titleRu, example.titleEn)}</h1>
              <p>{t(example.descriptionRu, example.descriptionEn)}</p>
            </div>
            <div className="examples-hero-actions">
              <a href={buildTrackedHref(`/?example=${encodeURIComponent(example.id)}`)}>{t('Открыть сценарий', 'Open workflow')}</a>
              <a href={buildTrackedHref('/examples')}>{t('Все примеры', 'All examples')}</a>
            </div>
          </div>
        </section>

        <section className="examples-insight-section example-detail-workbench" aria-labelledby="example-comparison-title">
          <div className="examples-section-head">
            <h2 id="example-comparison-title">{t('Исходник и результат', 'Source and result')}</h2>
            <p>{t('Это настоящий PNG, экспортированный из текущей версии MapKluss с указанными ниже настройками.', 'This is a real PNG exported by the current MapKluss build with the settings shown below.')}</p>
          </div>
          <div className="example-comparison example-comparison--detail">
            <figure>
              <img src={example.originalUrl} alt={t(`${example.titleRu}: исходник`, `${example.titleEn}: source image`)} />
              <figcaption>{t('Исходник', 'Source')}</figcaption>
            </figure>
            <figure>
              <img src={example.previewUrl} alt={t(`${example.titleRu}: результат MapKluss`, `${example.titleEn}: MapKluss result`)} />
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
        </section>

        <section className="examples-insight-section example-detail-settings" aria-labelledby="example-settings-title">
          <div className="examples-section-head">
            <h2 id="example-settings-title">{t('Проверенные настройки', 'Verified settings')}</h2>
            <p>{t('Открой сценарий — редактор загрузит этот же исходник и применит значения автоматически.', 'Open the workflow and the editor will load the same source with these values applied automatically.')}</p>
          </div>
          <dl className="example-spec-table">
            <div><dt>{t('Сетка карт', 'Map grid')}</dt><dd>{example.size}</dd></div>
            <div><dt>{t('Режим', 'Mode')}</dt><dd>{modeLabel}</dd></div>
            <div><dt>{t('Доступных оттенков', 'Available shades')}</dt><dd>{example.colors}</dd></div>
            <div><dt>{t('Дизеринг', 'Dithering')}</dt><dd>{example.trySettings.dithering}</dd></div>
            <div><dt>{t('Интенсивность', 'Intensity')}</dt><dd>{example.trySettings.intensity}%</dd></div>
            <div><dt>{t('Лестницы', 'Staircase')}</dt><dd>{example.trySettings.staircaseMode}</dd></div>
          </dl>
          <div className="example-palette-guide">
            <strong>{t('Цветовой ориентир', 'Palette guide')}</strong>
            <div className="example-materials example-materials-detail">
              {example.paletteHints.map(material => <span key={material}>{material}</span>)}
            </div>
            <p>{t('Это ориентир по заметным семействам блоков, а не полный расчёт материалов. Точный список зависит от выбранных блоков палитры.', 'This is a guide to prominent block families, not a complete bill of materials. The exact list depends on your selected palette blocks.')}</p>
          </div>
        </section>

        <section className="examples-cta-band">
          <div>
            <h2>{t('Повтори настройки или замени исходник своим', 'Reuse the settings or replace the source')}</h2>
            <p>{t('Сценарий открывается сразу в рабочем редакторе — без регистрации и без загрузки изображения на сервер.', 'The workflow opens directly in the editor, with no account required and no server-side image upload.')}</p>
          </div>
          <div className="examples-cta-actions">
            <a href={buildTrackedHref(`/?example=${encodeURIComponent(example.id)}`)}>{t('Открыть в редакторе', 'Open in editor')}</a>
          </div>
        </section>
      </main>
    </div>
  );
}

export function ExampleDetailNotFound() {
  const { lang, toggle, t } = useLocale();

  useEffect(() => {
    applyPageMeta({
      title: t('Пример не найден | MapKluss', 'Example not found | MapKluss'),
      description: t('Запрошенный пример MapKluss не найден.', 'The requested MapKluss example could not be found.'),
      robots: 'noindex,nofollow',
    });
  }, [t]);

  return (
    <div className="public-shell">
      <PublicSiteHeader active="examples" lang={lang} onToggleLanguage={toggle} />
      <main className="public-not-found">
        <img src="/logo-opt.png" alt="" width="72" height="72" />
        <h1>{t('Такого примера нет', 'Example not found')}</h1>
        <p>{t('Возможно, ссылка устарела. Открой актуальный каталог или начни свой арт.', 'The link may be outdated. Open the current catalogue or start your own art.')}</p>
        <div className="public-action-row">
          <a className="public-action public-action--primary" href={buildTrackedHref('/examples')}>{t('Все примеры', 'All examples')}</a>
          <a className="public-action" href={buildTrackedHref('/')}>{t('Редактор', 'Editor')}</a>
        </div>
      </main>
    </div>
  );
}
