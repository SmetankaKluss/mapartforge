/**
 * Тест скрипт для проверки функции вставки из буфера обмена
 * Запуск: node test-paste.js
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function testPaste() {
  console.log('🚀 Запуск браузера...');
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    console.log('📂 Создание тестового изображения...');
    // Создаём простое тестовое изображение в base64
    const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==';

    console.log('🌐 Открываем http://localhost:5174/ ...');
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2' });

    // Делаем скриншот до вставки
    await page.screenshot({ path: 'test-before-paste.png' });
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

    // Загружаем тестовое изображение через обычный input
    console.log('📤 Загружаем тестовое изображение через input...');
    const fileInput = await page.$('input[type="file"]');

    if (!fileInput) {
      console.log('❌ Не найден input[type="file"]!');
      return;
    }

    // Создаём файл из base64
    const base64Data = testImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync('test-image.png', buffer);

    await fileInput.uploadFile('test-image.png');
    console.log('✅ Изображение загружено через input');

    // Ждём появления контента
    await page.waitForSelector('.canvas-area', { timeout: 5000 }).catch(() => {
      console.log('⚠️ Canvas не появился за 5 секунд');
    });

    // Делаем скриншот после загрузки
    await page.screenshot({ path: 'test-after-upload.png' });
    console.log('📸 Скриншот после загрузки сохранён: test-after-upload.png');

    console.log('\n✅ ТЕСТЫ ЗАВЕРШЕНЫ');
    console.log('📁 Проверьте файлы:');
    console.log('   - test-before-paste.png (до загрузки)');
    console.log('   - test-after-upload.png (после загрузки)');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
  } finally {
    console.log('\n🛑 Закрытие браузера...');
    await browser.close();
  }
}

testPaste().catch(console.error);
