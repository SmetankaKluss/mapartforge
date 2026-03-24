/**
 * Тест зума и панорамирования (Photoshop-style)
 * Запуск: node test-zoom-pan.js
 */

import puppeteer from 'puppeteer';

async function testZoomPan() {
  console.log('🚀 Запуск браузера...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  try {
    console.log('🌐 Открываем http://localhost:5173/ ...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Делаем начальный скриншот
    await page.screenshot({ path: 'test-zoom-start.png', fullPage: true });
    console.log('📸 Начальный скриншот: test-zoom-start.png');

    // Проверяем наличие кнопки сброса view (⌖)
    const resetViewBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.tool-btn'));
      const resetBtn = buttons.find(btn => btn.textContent === '⌖');
      return resetBtn ? resetBtn.getAttribute('title') : null;
    });

    if (resetViewBtn) {
      console.log('✅ Кнопка сброса view найдена:', resetViewBtn);
    } else {
      console.log('❌ Кнопка сброса view НЕ найдена!');
    }

    // Проверяем наличие слайдера зума
    const zoomSlider = await page.evaluate(() => {
      const slider = document.querySelector('.zoom-slider');
      return slider ? slider.getAttribute('title') : null;
    });

    if (zoomSlider) {
      console.log('✅ Слайдер зума найден:', zoomSlider);
    } else {
      console.log('❌ Слайдер зума НЕ найден!');
    }

    console.log('\n✅ ТЕСТЫ ЗАВЕРШЕНЫ');
    console.log('\n📋 Ручное тестирование:');
    console.log('1. Открой http://localhost:5173/');
    console.log('2. Загрузите изображение');
    console.log('3. Попробуйте:');
    console.log('   - Колёсико мыши — зум в точку курсора');
    console.log('   - Ctrl+колёсико — зум по центру (старый стиль)');
    console.log('   - Средняя кнопка мыши — перетаскивание (pan)');
    console.log('   - Кнопка ⌖ — сброс зума и панорамирования');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
  } finally {
    console.log('\n🛑 Закрытие браузера...');
    await browser.close();
  }
}

testZoomPan().catch(console.error);
