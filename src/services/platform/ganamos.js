// src/services/platform/ganamos.js
const Base = require('./BasePlatform');
const fs = require('fs');

class Ganamos extends Base {
  constructor() {
    super({ name: 'Ganamos' });
  }

  async login(page, { urlLogin, user, pass }) {
    console.log("[Ganamos] Navegando a:", urlLogin);

    // Capturar respuestas para debug
    page.on('response', async (res) => {
      if (res.url().includes('ganamos')) {
        console.log(`[Ganamos][RESP] ${res.status()} ${res.url()}`);
      }
    });

    // Capturar requests fallidos
    page.on('requestfailed', (req) => {
      console.log(`[Ganamos][REQ FAIL] ${req.url()} → ${req.failure()?.errorText}`);
    });

    await page.goto(urlLogin, { waitUntil: 'domcontentloaded', timeout: 40000 });

    // 📌 Dump del HTML real que Puppeteer ve
    const html = await page.content();
    fs.writeFileSync('ganamos_loaded_debug.html', html);
    console.log("[Ganamos] HTML guardado en ganamos_loaded_debug.html (revisar contenido)");

    // Screenshot también
    await page.screenshot({ path: 'ganamos_loaded_debug.png', fullPage: true });

    // Ahora intentar el form
    try {
      await page.waitForSelector('input[type="text"]', { visible: true, timeout: 20000 });
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 20000 });
    } catch (err) {
      throw new Error("Ganamos: no apareció el formulario → revisar ganamos_loaded_debug.html/png");
    }

    console.log("[Ganamos] Formulario detectado ✅");
    await page.type('input[type="text"]', user, { delay: 50 });
    await page.type('input[type="password"]', pass, { delay: 50 });

    await page.evaluate(() => {
      const btn = document.querySelector('.auth__button button');
      if (btn) btn.disabled = false;
    });

    console.log("[Ganamos] Enviando formulario...");
    await Promise.all([
      page.click('.auth__button button'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);

    const errorMsg = await page.$eval('.notification__text', el => el.innerText).catch(() => null);
    if (errorMsg) {
      throw new Error(`Ganamos: backend rechazó login → ${errorMsg}`);
    }

    const loggedOk = await this.isLogged(page);
    if (!loggedOk) {
      await page.screenshot({ path: 'ganamos_login_error.png', fullPage: true }).catch(() => {});
      throw new Error('Ganamos: login fallido (formulario sigue visible o dashboard no cargó)');
    }

    console.log("[Ganamos] Login exitoso ✅");
    return true;
  }

  async isLogged(page) {
    const candidates = ['a[href*="logout"]', '.sidebar', '.dashboard', '.topbar'];
    for (const sel of candidates) {
      if (await page.$(sel)) return true;
    }
    return false;
  }
}

module.exports = Ganamos;
