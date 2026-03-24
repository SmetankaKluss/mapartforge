/**
 * Быстрая проверка ошибок в консоли
 */
import puppeteer from 'puppeteer';

async function checkErrors() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  // Слушаем консольные ошибки
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    if (errors.length > 0) {
      console.log('❌ Ошибки в консоли:');
      errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    } else {
      console.log('✅ Ошибок нет');

      // Проверим кнопку на странице с загруженным изображением
      const result = await page.evaluate(() => {
        return {
          hasResetButton: !!document.querySelector('.tool-btn[title*="Reset view"]'),
          buttonTexts: Array.from(document.querySelectorAll('.tool-btn'))
            .map(b => b.textContent)
            .filter(t => t)
            .slice(0, 10)
        };
      });

      console.log('\n🔍 Кнопки на странице:');
      console.log('  Тексты кнопок:', result.buttonTexts);
      console.log('  Кнопка сброса view:', result.hasResetButton ? '✅' : '❌');
    }
  } catch (e) {
    console.log('❌ Ошибка:', e.message);
  } finally {
    await browser.close();
  }
}

checkErrors();
