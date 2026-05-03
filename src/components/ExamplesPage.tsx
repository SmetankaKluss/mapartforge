import { useEffect } from 'react';
import { EXAMPLES } from '../lib/examples';
import { applyPageMeta } from '../lib/meta';
import { useLocale } from '../lib/locale';

function downloadImage(url: string, filename: string): void {
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
}

export function ExamplesPage() {
  const { lang, toggle, t } = useLocale();

  useEffect(() => {
    applyPageMeta({
      title: 'Minecraft Map Art Examples | MapKluss',
      description: 'Browse Minecraft map art examples made with MapKluss. Compare original images, generated previews, Minecraft screenshots, modes, sizes, colors, and materials.',
      url: `${window.location.origin}/examples`,
    });
  }, []);

  return (
    <main className="examples-page">
      <header className="examples-topbar">
        <a className="examples-brand" href="/">
          <img src="/logo-opt.png" alt="MapKluss" />
          <span>
            <strong>MAPKLUSS</strong>
            <small>MINECRAFT MAP ART GENERATOR</small>
          </span>
        </a>
        <nav className="examples-nav">
          <a href="/">{t('Открыть редактор', 'Open Editor')}</a>
          <button onClick={toggle}>{lang === 'ru' ? 'EN' : 'RU'}</button>
        </nav>
      </header>

      <section className="examples-hero">
        <p className="examples-kicker">{t('Галерея', 'Gallery')}</p>
        <h1>{t('Примеры Minecraft мап-арта', 'Minecraft Map Art Examples')}</h1>
        <p>
          {t(
            'Посмотри, как MapKluss превращает исходные изображения в 2D и 3D Minecraft map art с Litematic, MAP.DAT, материалами и трекером постройки.',
            'See how MapKluss turns source images into 2D and 3D Minecraft map art with Litematic, MAP.DAT, materials, and build tracking.',
          )}
        </p>
        <div className="examples-hero-actions">
          <a href="/">{t('Открыть редактор', 'Open Editor')}</a>
          <a href="#examples-grid">{t('Смотреть примеры', 'Browse examples')}</a>
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

            <div className="example-triptych">
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

            <div className="example-materials">
              {example.materials.map(material => <span key={material}>{material}</span>)}
            </div>

            <div className="example-actions">
              <a href={`/?example=${encodeURIComponent(example.id)}`}>{t('Попробовать этот пример', 'Try this example')}</a>
              <button onClick={() => downloadImage(example.previewUrl, `mapkluss_${example.id}.png`)}>
                {t('Скачать preview', 'Download preview')}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
