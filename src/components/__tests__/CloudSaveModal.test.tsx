import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleContext } from '../../lib/localeContext';
import { CloudSaveModal } from '../CloudSaveModal';

describe('CloudSaveModal', () => {
  it('keeps the save form concise and does not mention a future gallery', () => {
    const markup = renderToStaticMarkup(
      <LocaleContext.Provider value={{ lang: 'ru', toggle: () => undefined, t: ru => ru }}>
        <CloudSaveModal
          defaultTitle="Русский арт"
          defaultPrivacy="unlisted"
          isUpdate={false}
          mapGrid={{ wide: 2, tall: 3 }}
          busy={false}
          onSave={() => undefined}
          onClose={() => undefined}
        />
      </LocaleContext.Provider>,
    );

    expect(markup).toContain('Русский арт');
    expect(markup).toContain('Сохранить');
    expect(markup).toContain('Отмена');
    expect(markup).not.toContain('галере');
    expect(markup).not.toContain('gallery');
  });
});
