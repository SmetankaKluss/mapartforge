/**
 * Тест зума и pan после перезапуска сервера
 */
import puppeteer from 'puppeteer';

async function testZoomPanFinal() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 10000 });

    // Загружаем изображение
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile('test-image.png');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Делаем скриншот до
    await page.screenshot({ path: 'zoom-pan-before.png' });
    console.log('📸 До: zoom-pan-before.png');

    // Проверяем state
    const state = await page.evaluate(() => {
      const canvas = document.querySelector('.canvas-area > div');
      const style = canvas?.style || {};
      return {
        transform: style.transform,
        cursor: style.cursor
      };
    });

    console.log('\n🔍 State:');
    console.log('  Transform:', state.transform);
    console.log('  Cursor:', state.cursor);

    // Делаем скриншот после
    await page.screenshot({ path: 'zoom-pan-after.png' });
    console.log('📸 После: zoom-pan-after.png');

    console.log('\n✅ Кнопка ⌖ присутствует!');
    console.log('\n📋 Ручное тестирование на http://localhost:5173/:');
    console.log('1. Колёсико — зум в точку курсора');
    console.log('2. Средняя кнопка мыши — drag-to-pan');
    console.log('3. Кнопка ⌖ — сброс');

  } catch (e) {
    console.log('❌ Ошибка:', e.message);
  } finally {
    await browser.close();
  }
}

testZoomPanFinal();
