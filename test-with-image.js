/**
 * Проверка кнопки ⌖ с загруженным изображением
 */
import puppeteer from 'puppeteer';

async function testWithImage() {
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
    if (!fileInput) {
      console.log('❌ Не найден input[type="file"]');
      return;
    }

    // Используем тот же тестовый файл
    await fileInput.uploadFile('test-image.png');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Проверяем кнопку ⌖
    const result = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.tool-btn'));
      const resetViewBtn = buttons.find(b => b.textContent === '⌖');
      return {
        hasResetView: !!resetViewBtn,
        resetViewTitle: resetViewBtn?.getAttribute('title'),
        allButtonTexts: buttons.map(b => b.textContent).filter(t => t)
      };
    });

    console.log('🔍 После загрузки изображения:');
    console.log('  Кнопка ⌖:', result.hasResetView ? '✅' : '❌');
    if (result.resetViewTitle) {
      console.log('  Title:', result.resetViewTitle);
    }
    console.log('  Все кнопки:', result.allButtonTexts.join(', '));

  } catch (e) {
    console.log('❌ Ошибка:', e.message);
  } finally {
    await browser.close();
  }
}

testWithImage();
