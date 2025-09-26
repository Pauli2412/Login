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

  /**
   * Buscar historial de depósitos en la vista de Depósito.
   * Solo usa elementos presentes en tu HTML.
   *
   * @param {Object} opts
   * @param {string} opts.usuario               - Mask/usuario a filtrar (formcontrolname="accountMask")
   * @param {string} [opts.estado='All']        - Uno de: All | Started | Approved | Pending | Locked | Failed
   * @param {Date|string} [opts.desde]          - Fecha inicio (Date o 'YYYY-MM-DD'); por defecto hoy-14d
   * @param {Date|string} [opts.hasta]          - Fecha fin (Date o 'YYYY-MM-DD'); por defecto hoy
   * @param {boolean} [opts.intentarParsear=true] - Si hay tabla, intentar extraerla (genérico)
   * @returns {Promise<{ filtros: any, rows?: any[], headers?: string[], rawHtml?: string }>}
   */
  async buscarDepositos(opts = {}) {
    const {
      usuario,
      estado = 'All',
      desde,
      hasta,
      intentarParsear = true,
    } = opts;

    if (!usuario) throw new Error('[Playbet][buscarDepositos] Falta "usuario".');

    const s = getSession(this.name);
    if (!s || !s.cookies) {
      throw new Error('No hay sesión guardada para Playbet. Logueate primero.');
    }

    // Rango por defecto: últimas 2 semanas
    const hoy = new Date();
    const defHasta = fmt(hoy);
    const d = new Date(hoy);
    d.setDate(d.getDate() - 14);
    const defDesde = fmt(d);

    const desdeStr = (desde instanceof Date) ? fmt(desde) : (desde || defDesde);
    const hastaStr = (hasta instanceof Date) ? fmt(hasta) : (hasta || defHasta);

    const { browser, page } = await launchBrowser({ forceProxy: false });
    try {
      await page.setCookie(...s.cookies);

      const urlDep = `${this.url}#/user/deposit`;
      console.log('[DEP][buscar] Navegando a', urlDep);
      await page.goto(urlDep, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Esperar contenedor del feature
      await page.waitForSelector('app-deposit', { timeout: 30000 });
      await page.waitForSelector('.repot_agen .form_sty', { timeout: 30000 });

      // Inputs presentes en el HTML:
      const SEL = {
        start: 'input[formcontrolname="start"]',
        end: 'input[formcontrolname="end"]',
        quickRange: 'app-deposit select.select_op',
        user: 'input[formcontrolname="accountMask"]',
        status: 'select[formcontrolname="cashoutStatus"]',
        submit: 'button.agent_sub',
      };

      // Asegurar que existen antes de usarlos
      await page.waitForSelector(SEL.start, { timeout: 10000 });
      await page.waitForSelector(SEL.end, { timeout: 10000 });
      await page.waitForSelector(SEL.user, { timeout: 10000 });
      await page.waitForSelector(SEL.status, { timeout: 10000 });
      await page.waitForSelector(SEL.submit, { timeout: 10000 });

      // (Opcional pero recomendado) Seleccionar "CustomMonth" en el dropdown rápido (si existe), para no pisar fechas.
      const hasQuick = await page.$(SEL.quickRange);
      if (hasQuick) {
        await page.select(SEL.quickRange, 'CustomMonth').catch(() => {});
        await sleep(100);
      }

      // Ajustar "max" si el input lo trae
      const maxEnd = await page.$eval(SEL.start, el => el.getAttribute('max') || null).catch(() => null);
      const endToUse = (maxEnd && hastaStr > maxEnd) ? maxEnd : hastaStr;

      // Setear fechas (YYYY-MM-DD)
      await setDateValue(page, SEL.start, desdeStr);
      await setDateValue(page, SEL.end, endToUse);

      // Usuario
      const userInput = await page.$(SEL.user);
      await userInput.click({ clickCount: 3 });
      await userInput.type(String(usuario), { delay: 15 });

      // Estado
      await page.select(SEL.status, estado).catch(() => {}); // usa el value tal cual está en el HTML

      // Enviar
      const btn = await page.$(SEL.submit);
      if (!btn) throw new Error('No encontré el botón Entregar.');
      await Promise.all([
        btn.click().catch(() => {}),
        // Esperar algo razonable: red o render
        page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {})
      ]);

      // Intentar extraer resultados si hay una tabla dentro de app-deposit (no asumimos columnas específicas)
      if (!intentarParsear) {
        const rawHtml = await page.$eval('app-deposit', el => el.innerHTML).catch(() => '');
        return {
          filtros: { usuario, estado, desde: desdeStr, hasta: endToUse },
          rawHtml
        };
      }

      const foundTable = await page.$('app-deposit table');
      if (!foundTable) {
        const rawHtml = await page.$eval('app-deposit', el => el.innerHTML).catch(() => '');
        return {
          filtros: { usuario, estado, desde: desdeStr, hasta: endToUse },
          rows: [],
          headers: [],
          rawHtml
        };
      }

      // Parseo genérico: headers (th) si existen, sino usa la primera fila como headers
      const data = await page.evaluate(() => {
        const scope = document.querySelector('app-deposit');
        const table = scope && scope.querySelector('table');
        if (!table) return { headers: [], rows: [] };

        const getText = (el) => (el.innerText || '').trim();

        const ths = Array.from(table.querySelectorAll('thead th'));
        let headers = ths.map(getText);

        const tbody = table.querySelector('tbody') || table;
        const trs = Array.from(tbody.querySelectorAll('tr'));
        const rowsRaw = trs.map(tr => Array.from(tr.querySelectorAll('td')).map(getText)).filter(r => r.length);

        if (!headers.length && rowsRaw.length) {
          headers = rowsRaw[0].map((_, i) => `col${i+1}`);
        }

        // Si cantidad coincide, mapear a objetos; si no, devolver arrays
        const rows = (headers.length && rowsRaw.length && rowsRaw[0].length === headers.length)
          ? rowsRaw.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
          : rowsRaw;

        return { headers, rows };
      });

      return {
        filtros: { usuario, estado, desde: desdeStr, hasta: endToUse },
        headers: data.headers,
        rows: data.rows
      };

    } catch (err) {
      err.message = `[Playbet][buscarDepositos] ${err.message}`;
      throw err;
    } finally {
      // Cerrar browser aunque falle
      try { await browser.close(); } catch (_) {}
    }
  }// src/services/platform/playbet.js

  /**
   * Depositar fichas en Playbet
   * Usa Axios -> fallback a Puppeteer si falla.
   */
  async depositar(usuario, monto) {
    if (!usuario || !monto) {
      throw new Error("[Playbet][depositar] Falta usuario o monto.");
    }
    if (monto < 1000) {
      throw new Error(
        `[Playbet][depositar] Monto inválido (${monto}). El mínimo es 1000.`
      );
    }
    if (!this.masterAgentName) {
      throw new Error("[Playbet][depositar] masterAgentName no configurado.");
    }

    const s = getSession(this.name);
    if (!s || !s.cookies) {
      throw new Error("No hay sesión guardada para Playbet. Logueate primero.");
    }

    // ---- 1. Axios (más estable) ----
    try {
      const cookieHeader = s.cookies
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");

      const client = axios.create({
        baseURL: this.url,
        headers: {
          Cookie: cookieHeader,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });

      // Ejecutar depósito
      const { data } = await client.post("/api/agentCashier/transfer", {
        userId: usuario,
        subUser: "player",
        amount: monto,
        frac: 0,
        id: null,
        fromTo: "to",
        currency: "ARS",
        creditOperation: "",
      });

      if (!data || data.status !== "success") {
        throw new Error(
          `[Playbet][depositar][axios] Respuesta inesperada: ${JSON.stringify(
            data
          )}`
        );
      }

      // Verificar saldo actualizado
      const saldo = await this.verificarSaldo(client, usuario);

      return {
        usuario,
        monto,
        plataforma: "Playbet",
        status: "ok",
        metodo: "axios",
        saldo,
      };
    } catch (err) {
      console.error("⚠️ [Playbet][depositar] Axios falló:", err.message);
    }

    // ---- 2. Puppeteer fallback ----
    console.log("🔄 Usando Puppeteer como fallback para depósito...");

    const { browser, page } = await launchBrowser({ forceProxy: false });
    try {
      await page.setCookie(...s.cookies);

      const urlDep = `${this.url}#/user/deposit`;
      await page.goto(urlDep, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      await page.waitForSelector("app-deposit", { timeout: 20000 });
      await page.waitForSelector(".repot_agen .form_sty", { timeout: 20000 });

      // Inputs
      const accountInput = await page.$(
        "input[formcontrolname='accountMask']"
      );
      if (!accountInput)
        throw new Error("No encontré input de usuario (accountMask).");

      await accountInput.click({ clickCount: 3 });
      await accountInput.type(String(usuario), { delay: 20 });

      const amountInput = await page.$("input[formcontrolname='amount']");
      if (!amountInput)
        throw new Error("No encontré input de monto en la vista de depósito.");

      await amountInput.click({ clickCount: 3 });
      await amountInput.type(String(monto), { delay: 20 });

      const btn =
        (await page.$("button.agent_sub")) ||
        (await page.$("button[type='submit']"));
      if (!btn) throw new Error("No encontré el botón de confirmar depósito.");
      await btn.click();

      await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 });

      return {
        usuario,
        monto,
        plataforma: "Playbet",
        status: "ok",
        metodo: "puppeteer",
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /**
   * Verificación automática de saldo post-depósito
   */
  async verificarSaldo(client, usuario) {
    const { data } = await client.post("/api/agentAccount/listreferredagents", {
      masterAgentName: this.masterAgentName,
      loginMask: usuario,
      role: 6,
    });
    if (!data || !data.data || !data.data.length) {
      return null;
    }
    return data.data[0].balance || data.data[0].credit || null;
  }
}

module.exports = Playbet;
