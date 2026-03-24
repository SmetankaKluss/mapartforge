/**
 * Проверка что есть на странице
 */
import puppeteer from 'puppeteer';

async function checkDOM() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await page.evaluate(() => {
      return {
        canvasArea: !!document.querySelector('.canvas-area'),
        uploadZone: !!document.querySelector('.upload-zone'),
        toolbar: !!document.querySelector('.toolbar'),
        allButtons: document.querySelectorAll('.tool-btn').length,
        toolbarHTML: document.querySelector('.toolbar')?.innerHTML?.substring(0, 500)
      };
    });

    console.log('🔍 Страница:');
    console.log('  Canvas area:', result.canvasArea ? '✅' : '❌');
    console.log('  Upload zone:', result.uploadZone ? '✅' : '❌');
    console.log('  Toolbar:', result.toolbar ? '✅' : '❌');
    console.log('  Всего кнопок:', result.allButtons);
    console.log('\nToolbar HTML (первые 500 символов):');
    console.log(result.toolbarHTML);

  } catch (e) {
    console.log('❌ Ошибка:', e.message);
  } finally {
    await browser.close();
  }
}

checkDOM();
