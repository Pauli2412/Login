// src/services/platform/playbet.js
const Base = require('./BasePlatform');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
  }

  async login(page, { urlLogin, user, pass }) {
    // Logs de consola y errores
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('BROWSER PAGEERROR:', err.message));

    // Mock básico de localStorage/sessionStorage
    await page.evaluateOnNewDocument(() => {
      window.localStorage = window.localStorage || {
        getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}
      };
      window.sessionStorage = window.sessionStorage || {
        getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}
      };
      navigator.permissions = {
        query: async () => ({ state: 'granted' })
      };
    });

    console.log(`[Playbet] Navegando a: ${urlLogin}`);
    await page.goto(urlLogin, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Debug inicial
    const html = await page.content();
    console.log("DEBUG HTML (first 1000 chars):", html.slice(0, 1000));

    const scripts = await page.$$eval("script", els =>
      els.map(e => e.src || e.innerText.slice(0, 80))
    );
    console.log("DEBUG SCRIPTS:", scripts);

    // Espera larga para Angular
    await sleep(12000);

    const formExists = await page.$('form input[formcontrolname="login"]');
    console.log("DEBUG FORM EXISTS:", !!formExists);

    if (!formExists) {
      const screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
      console.log("DEBUG SCREENSHOT (base64, first 500 chars):", screenshot.slice(0, 500));
      throw new Error("Formulario de login no cargó (Angular no montó o está bloqueado)");
    }

    // Completar login
    const userInput = await page.$('input[formcontrolname="login"]');
    const passInput = await page.$('input[formcontrolname="password"]');

    await userInput.type(user, { delay: 50 });
    await passInput.type(pass, { delay: 50 });

    const loginBtn = await page.$('button[type="submit"]');
    await Promise.all([
      loginBtn.click(),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})
    ]);

    return true;
  }

  async isLogged(page) {
    return !!(await page.$('.logoutimg, a[href*="logout"], .main-dashboard'));
  }
}

module.exports = Playbet;
