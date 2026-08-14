import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleContext } from '../../lib/localeContext';
import { ContinueInMinecraftPrompt } from '../ContinueInMinecraftPrompt';

function render(source: 'export' | 'cloud', minecraftVersion: '1.20' | '1.21.11' = '1.21.11') {
  return renderToStaticMarkup(
    <LocaleContext.Provider value={{ lang: 'ru', toggle: () => undefined, t: ru => ru }}>
      <ContinueInMinecraftPrompt
        minecraftVersion={minecraftVersion}
        source={source}
        onSaveToCloud={() => undefined}
        onClose={() => undefined}
      />
    </LocaleContext.Provider>,
  );
}

describe('ContinueInMinecraftPrompt', () => {
  it('offers Cloud save after a local export', () => {
    const markup = render('export');
    expect(markup).toContain('Продолжить в Minecraft');
    expect(markup).toContain('Сохранить в Cloud');
    expect(markup).not.toContain('Вход мода');
  });

  it('offers device login after a Cloud save', () => {
    const markup = render('cloud');
    expect(markup).toContain('Арт уже доступен в My Arts');
    expect(markup).toContain('Вход мода');
    expect(markup).toContain('Lens');
    expect(markup).toContain('Tracker');
  });

  it('explains the fallback for editor versions older than Companion', () => {
    const markup = render('export', '1.20');
    expect(markup).toContain('Companion начинается с Minecraft 1.21.4');
    expect(markup).toContain('value="1.21.4" selected=""');
  });
});
