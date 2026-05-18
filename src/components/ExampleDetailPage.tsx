import { useEffect } from 'react';
import { buildTrackedHref } from '../lib/analytics';
import { getExampleById, EXAMPLES, type ExampleProject } from '../lib/examples';
import { useLocale } from '../lib/locale';
import { applyPageMeta } from '../lib/meta';

interface Props {
  example: ExampleProject;
}

export function ExampleDetailPage({ example }: Props) {
  const { lang, toggle, t } = useLocale();

  useEffect(() => {
    applyPageMeta({
      title: `${lang === 'ru' ? example.titleRu : example.titleEn} | Minecraft Map Art Example | MapKluss`,
      description: lang === 'ru'
        ? `${example.titleRu} — пример Minecraft map art в MapKluss. Размер ${example.size}, режим ${example.mode === '3d' ? '3D Stair' : '2D Flat'}, ${example.colors} цветов и настройки для повторения результата.`
        : `${example.titleEn} is a Minecraft map art example made with MapKluss. ${example.size} size, ${example.mode === '3d' ? '3D Stair' : '2D Flat'} mode, ${example.colors} colors, and repeatable settings.`,
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
  }, [example, lang]);

  const modeLabel = example.mode === '3d' ? '3D Stair' : '2D Flat';
  const bestUseRu = example.mode === '3d'
    ? 'лучше подходит для иллюстраций, фото и сцен, где важны дополнительные оттенки и более мягкие переходы.'
    : 'лучше подходит для логотипов, пиксель-арта и чистых форм, где важны простота и предсказуемые материалы.';
  const bestUseEn = example.mode === '3d'
    ? 'works best for illustrations, photos, and scenes where extra shades and smoother transitions matter.'
    : 'works best for logos, pixel art, and cleaner shapes where simplicity and predictable materials matter most.';

  return (
    <main className="examples-page">
      <header className="examples-topbar">
        <a className="examples-brand" href={buildTrackedHref('/')}>
          <img src="/logo-opt.png" alt="MapKluss" />
          <span>
            <strong>MAPKLUSS</strong>
            <small>MINECRAFT MAP ART GENERATOR</small>
          </span>
        </a>
        <nav className="examples-nav">
          <a href={buildTrackedHref('/examples')}>{t('Все примеры', 'All examples')}</a>
          <a href={buildTrackedHref('/')}>{t('Открыть редактор', 'Open Editor')}</a>
          <button onClick={toggle}>{lang === 'ru' ? 'EN' : 'RU'}</button>
        </nav>
      </header>

      <section className="examples-hero">
        <p className="examples-kicker">{t('Пример', 'Example')}</p>
        <h1>{t(example.titleRu, example.titleEn)}</h1>
        <p>{t(example.descriptionRu, example.descriptionEn)}</p>
        <div className="examples-hero-actions">
          <a href={buildTrackedHref(`/?example=${encodeURIComponent(example.id)}`)}>{t('Открыть в редакторе', 'Open in editor')}</a>
          <a href={buildTrackedHref('/examples')}>{t('Назад к галерее', 'Back to gallery')}</a>
        </div>
      </section>

      <section className="examples-insight-section">
        <div className="examples-section-head">
          <h2>{t('Что это за пример', 'What this example shows')}</h2>
          <p>
            {t(
              `${t(example.titleRu, example.titleEn)} — это кейс, который ${bestUseRu}`,
              `${t(example.titleRu, example.titleEn)} is a case that ${bestUseEn}`,
            )}
          </p>
        </div>
        <div className="example-triptych example-triptych-detail">
          <figure>
            <img src={example.originalUrl} alt={t(`${example.titleRu}: исходник`, `${example.titleEn}: original image`)} loading="lazy" />
            <figcaption>{t('Исходник', 'Original')}</figcaption>
          </figure>
          <figure>
            <img src={example.previewUrl} alt={t(`${example.titleRu}: результат MapKluss`, `${example.titleEn}: MapKluss result`)} loading="lazy" />
            <figcaption>{t('MapKluss', 'MapKluss')}</figcaption>
          </figure>
          <figure>
            <img src={example.minecraftUrl} alt={t(`${example.titleRu}: скрин в Minecraft`, `${example.titleEn}: Minecraft screenshot`)} loading="lazy" />
            <figcaption>{t('Minecraft', 'Minecraft')}</figcaption>
          </figure>
        </div>
      </section>

      <section className="examples-insight-section">
        <div className="examples-section-head">
          <h2>{t('Настройки и характеристики', 'Settings and characteristics')}</h2>
        </div>
        <div className="examples-checklist-grid">
          <article className="examples-check-card">
            <h3>{t('Режим', 'Mode')}</h3>
            <p>{modeLabel}</p>
          </article>
          <article className="examples-check-card">
            <h3>{t('Размер', 'Size')}</h3>
            <p>{example.size} {t('карт', 'maps')}</p>
          </article>
          <article className="examples-check-card">
            <h3>{t('Цвета', 'Colors')}</h3>
            <p>{example.colors}</p>
          </article>
          <article className="examples-check-card">
            <h3>{t('Дизеринг', 'Dithering')}</h3>
            <p>{example.trySettings.dithering}</p>
          </article>
          <article className="examples-check-card">
            <h3>{t('Интенсивность', 'Intensity')}</h3>
            <p>{example.trySettings.intensity}%</p>
          </article>
          <article className="examples-check-card">
            <h3>{t('Лестницы', 'Staircase')}</h3>
            <p>{example.trySettings.staircaseMode}</p>
          </article>
        </div>
      </section>

      <section className="examples-insight-section">
        <div className="examples-section-head">
          <h2>{t('Основные материалы', 'Main materials')}</h2>
          <p>{t('Это не полный расчёт, а быстрый ориентир по ключевым блокам в этом примере.', 'This is not the full bill of materials, just a quick orientation around the main blocks used in this example.')}</p>
        </div>
        <div className="example-materials example-materials-detail">
          {example.materials.map(material => <span key={material}>{material}</span>)}
        </div>
      </section>

      <section className="examples-cta-band">
        <div>
          <p className="examples-kicker">{t('Повторить результат', 'Recreate this result')}</p>
          <h2>{t('Открой пример в редакторе и меняй палитру, размер и экспорт под свою задачу', 'Open the example in the editor and adapt palette, size, and export to your own goal')}</h2>
        </div>
        <div className="examples-cta-actions">
          <a href={buildTrackedHref(`/?example=${encodeURIComponent(example.id)}`)}>{t('Открыть в редакторе', 'Open in editor')}</a>
          <a href={buildTrackedHref('/minecraft-map-art-generator')}>{t('Читать про генератор', 'Read about the generator')}</a>
        </div>
      </section>
    </main>
  );
}

export function ExampleDetailNotFound() {
  const fallback = getExampleById(EXAMPLES[0]?.id ?? null);
  if (!fallback) return null;
  return <ExampleDetailPage example={fallback} />;
}
