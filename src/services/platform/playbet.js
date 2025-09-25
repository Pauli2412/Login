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
        getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}
      };
      window.sessionStorage = window.sessionStorage || {
        getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}
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
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})
    ]);

    return true;
  }

  async isLogged(page) {
    return !!(await page.$('.logoutimg, a[href*="logout"], .main-dashboard'));
  }

  // dentro de class Playbet extends Base
async depositar(usuario, monto) {
  const page = await this.getSessionPage();
  const urlDep = `${this.url}#/user/deposit`;

  const wait = (sel, t = 20000) => page.waitForSelector(sel, { visible: true, timeout: t });
  const textMatch = async (root, tag, regex) => {
    return await root.$x(`.//${tag}[normalize-space(text())][contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${regex.toLowerCase()}')]`);
  };

  // util: click por texto visible (button/a/div con role)
  const clickByText = async (scope, rx, tags = ['button','a','div','span']) => {
    for (const tag of tags) {
      const nodes = await scope.$x(`.//${tag}[normalize-space(text())]`);
      for (const n of nodes) {
        const s = (await page.evaluate(el => el.innerText || el.textContent || '', n)).trim().toLowerCase();
        if (rx.test(s)) { await n.click(); return true; }
      }
    }
    return false;
  };

  // 1) Ir a la vista de depósito
  console.log('[DEP] Navegando a', urlDep);
  await page.goto(urlDep, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Esperar a que Angular pinte app-deposit
  await page.waitForSelector('app-deposit', { timeout: 30000 }).catch(() => {});
  // Ciertas vistas cargan lento por Cloudflare/spinner → esperar contenedor del formulario
  await page.waitForSelector('.repot_agen .form_sty', { timeout: 30000 });

  // 2) Cargar usuario en el filtro (accountMask)
  const accountInput = await page.$('input[formcontrolname="accountMask"]');
  if (!accountInput) {
    throw new Error('No encontré el input de usuario (formcontrolname="accountMask").');
  }
  await accountInput.click({ clickCount: 3 });
  await accountInput.type(String(usuario), { delay: 20 });

  // 3) Intentar detectar un input de monto directo (escenario A)
  const amountSelectors = [
    'input[formcontrolname="amount"]',
    'input[name="amount"]',
    'input[type="number"]',
    'input[placeholder*="monto" i]',
    'input[placeholder*="importe" i]',
    'input[placeholder*="amount" i]',
  ];
  let amountInputHandle = null;
  for (const sel of amountSelectors) {
    amountInputHandle = await page.$(sel);
    if (amountInputHandle) break;
  }

  if (amountInputHandle) {
    console.log('[DEP] Modo directo: encontré input de monto');
    await amountInputHandle.click({ clickCount: 3 });
    await amountInputHandle.type(String(monto), { delay: 20 });

    // botón de confirmar (varias variantes de texto/clase)
    const confirmSelectors = [
      'button.agent_sub',
      'button[type="submit"]',
      'button.btn-primary',
    ];
    let clicked = false;
    for (const sel of confirmSelectors) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); clicked = true; break; }
    }
    if (!clicked) {
      // por texto
      const ok = await clickByText(page, /(entregar|depositar|confirmar|cargar)/i);
      if (!ok) throw new Error('No encontré el botón para confirmar depósito.');
    }

    // esperar resultado: red silenciosa o toast
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {});
    return { usuario, monto, plataforma: 'Playbet', status: 'ok' };
  }

  // 4) Si no hay monto directo → escenario B (2 pasos)
  console.log('[DEP] Modo 2-pasos: envío filtro con "Entregar"');
  const submitFilterBtn = (await page.$('button.agent_sub')) || null;
  if (submitFilterBtn) {
    await submitFilterBtn.click();
  } else {
    const ok = await clickByText(page, /(entregar|buscar|filtrar|continuar)/i);
    if (!ok) throw new Error('No encontré el botón para aplicar el filtro.');
  }

  // Esperar que aparezca una tabla/lista con el usuario
  // El layout de esta app usa tablas con clases tipo .tbl-content o una lista de tarjetas
  await page.waitForTimeout(1500);
  // Buscar una fila que contenga el usuario
  const rowXpath = `//*[self::tr or self::div][.//*[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${String(usuario).toLowerCase()}')] or contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${String(usuario).toLowerCase()}')]`;
  const rowCandidates = await page.$x(rowXpath);

  if (!rowCandidates.length) {
    console.warn('[DEP] No encontré filas visibles con el usuario, intento refrescar resultados...');
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 10000 }).catch(() => {});
  }

  // Reintento de filas
  const rows = (rowCandidates.length ? rowCandidates : await page.$x(rowXpath));
  if (!rows.length) {
    throw new Error(`No encontré resultados para el usuario "${usuario}" en la lista de depósito.`);
  }

  // 5) Dentro de la fila, localizar el botón "Depositar"/"Cargar"/"Acción"
  let clickedAction = false;
  for (const row of rows) {
    // Intentar botón por texto
    const btnOk = await (async () => {
      const btns = await row.$x('.//button|.//a|.//*[@role="button"]');
      for (const b of btns) {
        const t = (await page.evaluate(el => el.innerText || el.textContent || '', b)).trim().toLowerCase();
        if (/(depositar|cargar|acreditar|agregar|crédito)/.test(t)) {
          await b.click();
          return true;
        }
      }
      return false;
    })();
    if (btnOk) { clickedAction = true; break; }
  }

  if (!clickedAction) {
    // fallback: clic en el primer botón/ícono de acción de la primera fila
    const firstRow = rows[0];
    const anyBtn = await firstRow.$x('.//button|.//a|.//*[@role="button"]');
    if (!anyBtn.length) {
      throw new Error('No encontré acción para abrir el modal de depósito.');
    }
    await anyBtn[0].click();
  }

  // 6) Esperar modal/popup (la app usa clases .popup_1 o overlays custom)
  await page.waitForTimeout(800);
  const modal = (await page.$('.popup_1')) || (await page.$('.modal.show')) || page;

  // 7) Buscar input de monto dentro del modal
  let modalAmount = null;
  const modalScope = modal;
  const modalAmountSelectors = [
    'input[formcontrolname="amount"]',
    'input[name="amount"]',
    'input[type="number"]',
    'input[placeholder*="monto" i]',
    'input[placeholder*="importe" i]',
    'input[placeholder*="amount" i]',
  ];
  for (const sel of modalAmountSelectors) {
    modalAmount = await (modalScope === page ? page.$(sel) : modal.$(sel));
    if (modalAmount) break;
  }
  if (!modalAmount) {
    // fallback: el primero numérico
    const nums = await (modalScope === page
      ? page.$$('input[type="number"]')
      : modal.$$('input[type="number"]'));
    if (nums && nums.length) modalAmount = nums[0];
  }
  if (!modalAmount) throw new Error('No encontré el input de monto en el modal.');

  await modalAmount.click({ clickCount: 3 });
  await modalAmount.type(String(monto), { delay: 20 });

  // 8) Confirmar en el modal
  let confirmed = false;
  const modalOkSelectors = ['button.btn-primary', 'button[type="submit"]', 'button.agent_sub'];
  for (const sel of modalOkSelectors) {
    const btn = await (modalScope === page ? page.$(sel) : modal.$(sel));
    if (btn) { await btn.click(); confirmed = true; break; }
  }
  if (!confirmed) {
    const ok = await clickByText(modalScope === page ? page : modal, /(depositar|confirmar|aceptar|cargar|entregar)/i);
    if (!ok) throw new Error('No encontré el botón de confirmar en el modal.');
  }

  // 9) Esperar confirmación (red/idle o toast)
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => {});
  // opcional: verificar toast de éxito si existe
  // const toast = await page.$('.toast-success, .alert-success'); if (!toast) ...

  return { usuario, monto, plataforma: 'Playbet', status: 'ok' };
}


}

module.exports = Playbet;

