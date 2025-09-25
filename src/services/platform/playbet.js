// src/services/platform/playbet.js
const Base = require('./BasePlatform');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
  }

  async login(page, { urlLogin, user, pass }) {
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('BROWSER PAGEERROR:', err.message));

    // Mock básico
    await page.evaluateOnNewDocument(() => {
      window.localStorage = window.localStorage || {
        getItem: () => null, setItem: () => { }, removeItem: () => { }, clear: () => { }
      };
      window.sessionStorage = window.sessionStorage || {
        getItem: () => null, setItem: () => { }, removeItem: () => { }, clear: () => { }
      };
      navigator.permissions = { query: async () => ({ state: 'granted' }) };
    });

    console.log(`[Playbet] Navegando a: ${urlLogin}`);
    await page.goto(urlLogin, { waitUntil: 'domcontentloaded', timeout: 30000 });

    try {
      // 1. Esperar a que Angular monte el root
      await page.waitForSelector("app-root", { timeout: 30000 });

      // 2. Inyectar watcher para loguear cuando currentDomain aparezca
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(window, 'currentDomain', {
          set(v) {
            console.log("[WATCHER] currentDomain asignado:", v);
            this._currentDomain = v;
          },
          get() {
            return this._currentDomain;
          },
          configurable: true
        });
      });

      // 3. Polling manual hasta 30s
      let siteId = null;
      for (let i = 0; i < 30; i++) {
        siteId = await page.evaluate(() => window.currentDomain?.siteId || null);
        if (siteId) break;
        await sleep(1000);
      }

      if (siteId) {
        console.log("✅ siteId detectado:", siteId);
      } else {
        console.log("⚠️ siteId no apareció, seguimos con fallback...");
      }

      // 4. Recién después esperar al formulario
      await page.waitForSelector('form input[formcontrolname="login"]', {
        visible: true,
        timeout: 30000
      });
    } catch (err) {
      const html = await page.content();
      console.log("DEBUG HTML (first 1000 chars):", html.slice(0, 1000));
      const screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
      console.log("DEBUG SCREENSHOT (first 500 chars):", screenshot.slice(0, 500));
      throw err;
    }

    // Completar login
    const userInput = await page.$('input[formcontrolname="login"]');
    const passInput = await page.$('input[formcontrolname="password"]');
    await userInput.type(user, { delay: 50 });
    await passInput.type(pass, { delay: 50 });

    const loginBtn = await page.$('button[type="submit"]');
    await Promise.all([
      loginBtn.click(),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => { })
    ]);

    return true;
  }

  async isLogged(page) {
    return !!(await page.$('.logoutimg, a[href*="logout"], .main-dashboard'));
  }

  async depositar(page, usuario, monto) {
    // 1) Dump de ruta y frames
    console.log('[DEP] URL actual:', page.url());
    const frames = page.frames().map(f => ({ name: f.name(), url: f.url() }));
    console.log('[DEP] FRAMES:', frames);

    // 2) Si hay iframe de cashier, intentar enfocarlo
    const cashierFrame = page.frames().find(f => /cashier/i.test(f.url()) || /deposit/i.test(f.url()));
    const scope = cashierFrame || page;
    console.log('[DEP] Usando scope:', cashierFrame ? cashierFrame.url() : 'main');

    // 3) Listar inputs y botones candidatos
    const candidates = await scope.evaluate(() => {
      const toText = el => (el.innerText || el.value || el.getAttribute('placeholder') || '').trim();
      const all = [...document.querySelectorAll('input, button, [role="button"]')];
      return all.map(el => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        name: el.getAttribute('name'),
        fc: el.getAttribute('formcontrolname'),
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        text: toText(el),
        classes: el.className
      }));
    });
    console.log('[DEP] CANDIDATES:', JSON.stringify(candidates, null, 2).slice(0, 5000));

    // 4) Volcado de posibles inputs de usuario/monto/botón por heurística
    const pick = (arr, test) => arr.find(test);
    const userEl = pick(candidates, c =>
      /user|usuario|login|nick|player/i.test([c.id, c.name, c.fc, c.placeholder, c.text].join(' '))
    );
    const amountEl = pick(candidates, c =>
      /monto|amount|importe|value/i.test([c.id, c.name, c.fc, c.placeholder, c.text].join(' '))
    );
    const submitEl = pick(candidates, c =>
      /deposit|cargar|confirmar|continuar|enviar|pagar/i.test([c.id, c.name, c.fc, c.placeholder, c.text].join(' '))
      && (c.tag === 'button' || c.role === 'button' || c.type === 'submit')
    );
    console.log('[DEP] Heurística -> userEl:', userEl, 'amountEl:', amountEl, 'submitEl:', submitEl);

    // 5) Log de storage/keys útiles
    const storage = await scope.evaluate(() => ({
      token: localStorage.getItem('authToken') || sessionStorage.getItem('authToken'),
      keys: Object.keys(localStorage)
    }));
    console.log('[DEP] STORAGE:', storage);

    await page.goto(`${this.url}/deposit`, { waitUntil: "networkidle2" });
    await page.type("#user-input", usuario);
    await page.type("#amount-input", monto.toString());
    await page.click("#deposit-button");
    await page.waitForSelector(".success-message", { timeout: 10000 });

    return { usuario, monto, plataforma: "Playbet", status: "ok" };
  }

}

module.exports = Playbet;

