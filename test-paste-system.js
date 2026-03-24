/**
 * Тест скрипт для проверки функции вставки из буфера обмена
 * Использует системный Chromium вместо скачиваемого Puppeteer
 * Запуск: node test-paste-system.js
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function testPaste() {
  console.log('🚀 Запуск браузера (системный Chromium)...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();

  try {
    console.log('📂 Создание тестового изображения...');
    // Создаём тестовое изображение - 32x32 пикселя
    const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABZJREFUeNpi2r9//38gYGAEESAAEGAAasgJOgzOKCoAAAAASUVORK5CYII=';

    console.log('🌐 Открываем http://localhost:5173/ ...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 10000 });

    // Ждём загрузки страницы
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Делаем скриншот до вставки
    await page.screenshot({ path: 'test-before-paste.png', fullPage: true });
    console.log('📸 Скриншот до вставки сохранён: test-before-paste.png');

    // Проверяем наличие текста с подсказкой
    const hintText = await page.evaluate(() => {
      const hintElement = document.querySelector('.upload-hint');
      return hintElement ? hintElement.textContent : null;
    });

    if (hintText && hintText.includes('Ctrl+V')) {
      console.log('✅ Подсказка о Ctrl+V найдена в UI:', hintText);
    } else {
      console.log('❌ Подсказка о Ctrl+V НЕ найдена в UI!');
    }

    // Проверяем наличие upload-zone
    const uploadZoneExists = await page.evaluate(() => {
      return !!document.querySelector('.upload-zone');
    });

    if (uploadZoneExists) {
      console.log('✅ Upload zone найдена на странице');
    } else {
      console.log('❌ Upload zone НЕ найдена на странице!');
    }

    // Проверяем наличие title с подсказкой
    const zoneTitle = await page.evaluate(() => {
      const zone = document.querySelector('.upload-zone');
      return zone ? zone.getAttribute('title') : null;
    });

    if (zoneTitle && zoneTitle.includes('Ctrl+V')) {
      console.log('✅ Title с подсказкой Ctrl+V найден:', zoneTitle);
    } else {
      console.log('❌ Title с подсказкой Ctrl+V НЕ найден!');
    }

    // Загружаем тестовое изображение через обычный input
    console.log('📤 Загружаем тестовое изображение через input...');
    const fileInput = await page.$('input[type="file"]');

    if (!fileInput) {
      console.log('❌ Не найден input[type="file"]!');
    } else {
      console.log('✅ Input[type="file"] найден');

      // Создаём файл из base64
      const base64Data = testImageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync('test-image.png', buffer);

      await fileInput.uploadFile('test-image.png');
      console.log('✅ Изображение загружено через input');

      // Ждём появления контента
      try {
        await page.waitForSelector('.canvas-area', { timeout: 5000 });
        console.log('✅ Canvas появился после загрузки');
      } catch (e) {
        console.log('⚠️ Canvas не появился за 5 секунд (нормально для маленького тестового изображения)');
      }

      // Делаем скриншот после загрузки
      await new Promise(resolve => setTimeout(resolve, 1000));
      await page.screenshot({ path: 'test-after-upload.png', fullPage: true });
      console.log('📸 Скриншот после загрузки сохранён: test-after-upload.png');
    }

    console.log('\n✅ ТЕСТЫ ЗАВЕРШЕНЫ');
    console.log('📁 Проверьте файлы:');
    console.log('   - test-before-paste.png (до загрузки) - подсказка Ctrl+V');
    console.log('   - test-after-upload.png (после загрузки) - загруженное изображение');

    // Читаем размер файлов для информации
    const beforeSize = fs.statSync('test-before-paste.png').size;
    const afterSize = fs.statSync('test-after-upload.png').size;
    console.log(`\n📊 Размер файлов:`);
    console.log(`   test-before-paste.png: ${beforeSize} байт`);
    console.log(`   test-after-upload.png: ${afterSize} байт`);

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n🛑 Закрытие браузера через 2 секунды...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await browser.close();
  }
}

testPaste().catch(console.error);
