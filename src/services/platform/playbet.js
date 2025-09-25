// src/services/platform/playbet.js
const Base = require('./BasePlatform');
const { launchBrowser } = require('../browser');
const { getSession, setSession } = require('../sessionStore');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
    this.url = "https://agent.play.bet.ar";
  }

  async login(page, { urlLogin, user, pass }) {
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('BROWSER PAGEERROR:', err.message));

    // Mock para localStorage/sessionStorage
    await page.evaluateOnNewDocument(() => {
      try {
        window.localStorage = window.localStorage || {
          getItem: () => null, setItem: () => { }, removeItem: () => { }, clear: () => { }
        };
        window.sessionStorage = window.sessionStorage || {
          getItem: () => null, setItem: () => { }, removeItem: () => { }, clear: () => { }
        };
        navigator.permissions = { query: async () => ({ state: 'granted' }) };
      } catch (_) { }
    });

    console.log(`[Playbet] Navegando a: ${urlLogin}`);
    await page.goto(urlLogin, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const SEL = {
      root: 'app-root',
      user: 'input[formcontrolname="login"]',
      pass: 'input[formcontrolname="password"]',
      submit: 'button.dis_login[type="submit"]',
    };


    try {
      await page.waitForSelector(SEL.root, { timeout: 30000 });
      await page.waitForSelector(SEL.user, { visible: true, timeout: 30000 });
      await page.waitForSelector(SEL.pass, { visible: true, timeout: 30000 });
      await page.waitForSelector(SEL.submit, { timeout: 30000 });


      const userInput = await page.$(SEL.user);
      const passInput = await page.$(SEL.pass);

      await userInput.click({ clickCount: 3 });
      await userInput.type(user, { delay: 30 });

      await passInput.click({ clickCount: 3 });
      await passInput.type(pass, { delay: 30 });

      // Esperar a que el botón se habilite
      await page.waitForFunction(() => {
        const b = document.querySelector('app-login button.dis_login[type="submit"]');
        return b && !b.disabled && !b.classList.contains('disabled');
      }, { timeout: 10000 }).catch(() => { });

      const loginBtn = await page.$(SEL.submit);
      await page.evaluate(el => el.scrollIntoView({ block: 'center' }), loginBtn);
      await sleep(150);

      await Promise.all([
        loginBtn.click().catch(() => { }),
        Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { }),
          page.waitForSelector('.logoutimg, a[href*="logout"], .main-dashboard, app-dashboard', { timeout: 15000 }).catch(() => { })
        ])
      ]);

      const ok = await this.isLogged(page);
      if (!ok) throw new Error('Login aparentemente falló.');

      // 🔑 Guardamos cookies y token en sessionStore
      const cookies = await page.cookies();
      const token = await page.evaluate(() => localStorage.getItem('token') || '');
      setSession(this.name, { cookies, token });

      return true;

    } catch (err) {
      try {
        const html = await page.content();
        console.log("DEBUG HTML (first 1200 chars):", html.slice(0, 1200));
        const screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
        console.log("DEBUG SCREENSHOT (first 600 chars):", screenshot.slice(0, 600));
      } catch (_) { }
      err.message = `[Playbet][login] ${err.message}`;
      throw err;
    }
  }

  async isLogged(page) {
    return !!(await page.$('.logoutimg, a[href*="logout"], .main-dashboard, app-dashboard'));
  }

  async depositar(usuario, monto) {
    const s = getSession(this.name);
    if (!s || !s.cookies) {
      throw new Error('No hay sesión guardada para Playbet. Logueate primero.');
    }

    const { browser, page } = await launchBrowser({ forceProxy: false });
    try {
      await page.setCookie(...s.cookies);

      const urlDep = `${this.url}#/user/deposit`;
      console.log('[DEP] Navegando a', urlDep);
      await page.goto(urlDep, { waitUntil: 'domcontentloaded', timeout: 30000 });

      await page.waitForSelector('app-deposit', { timeout: 30000 }).catch(() => { });
      await page.waitForSelector('.repot_agen .form_sty', { timeout: 30000 });

      const accountInput = await page.$('input[formcontrolname="accountMask"]');
      if (!accountInput) throw new Error('No encontré el input de usuario (accountMask).');

      await accountInput.click({ clickCount: 3 });
      await accountInput.type(String(usuario), { delay: 20 });

      // Buscar input de monto directo
      const amountInput = await page.$('input[formcontrolname="amount"]');
      if (amountInput) {
        await amountInput.click({ clickCount: 3 });
        await amountInput.type(String(monto), { delay: 20 });
        const btn = await page.$('button.agent_sub') || await page.$('button[type="submit"]');
        if (btn) await btn.click();
        await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => { });
        return { usuario, monto, plataforma: 'Playbet', status: 'ok' };
      }

      throw new Error('No encontré input de monto en la vista de depósito.');

    } finally {
      await browser.close().catch(() => { });
    }
  }
}

module.exports = Playbet;

