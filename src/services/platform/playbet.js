// src/services/platform/playbet.js
const Base = require('./BasePlatform');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
  }

  async login(page, { urlLogin, user, pass }) {
    // Logs del navegador para diagnóstico
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('BROWSER PAGEERROR:', err.message));

    // Mock básico para entornos restringidos
    await page.evaluateOnNewDocument(() => {
      try {
        window.localStorage = window.localStorage || {
          getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}
        };
        window.sessionStorage = window.sessionStorage || {
          getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}
        };
        navigator.permissions = { query: async () => ({ state: 'granted' }) };
      } catch (_) {}
    });

    console.log(`[Playbet] Navegando a: ${urlLogin}`);
    await page.goto(urlLogin, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Selectores correctos (no usar name="username"/"password")
    const SEL = {
      root: 'app-root',
      loginComp: 'app-login',
      user: 'app-login input[formcontrolname="login"]',
      pass: 'app-login input[formcontrolname="password"]',
      submit: 'app-login button.dis_login[type="submit"]',
    };

    try {
      // Asegurar que Angular montó y la vista de login está presente
      await page.waitForSelector(SEL.root, { timeout: 30000 });
      await page.waitForSelector(SEL.loginComp, { timeout: 30000 });

      // Esperar inputs visibles
      await page.waitForSelector(SEL.user, { visible: true, timeout: 30000 });
      await page.waitForSelector(SEL.pass, { visible: true, timeout: 30000 });
      await page.waitForSelector(SEL.submit, { timeout: 30000 }); // puede venir disabled

      // Completar credenciales
      const userInput = await page.$(SEL.user);
      const passInput = await page.$(SEL.pass);

      await userInput.click({ clickCount: 3 });
      await userInput.type(user, { delay: 30 });

      await passInput.click({ clickCount: 3 });
      await passInput.type(pass, { delay: 30 });

      // Esperar a que el botón se habilite (algunas apps lo activan con validación reactiva)
      await page.waitForFunction(() => {
        const b = document.querySelector('app-login button.dis_login[type="submit"]');
        return b && !b.disabled && !b.classList.contains('disabled');
      }, { timeout: 10000 }).catch(() => {}); // si no cambia, igualmente intentaremos click

      // Asegurar visibilidad y click
      const loginBtn = await page.$(SEL.submit);
      await page.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }), loginBtn);
      await sleep(150); // micro-pausa por animaciones/css
      await Promise.all([
        loginBtn.click().catch(() => {}),
        // La app puede no navegar; aceptar cualquiera de estas señales
        Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
          page.waitForSelector('.logoutimg, a[href*="logout"], .main-dashboard, app-dashboard', { timeout: 15000 }).catch(() => {})
        ])
      ]);

      // Verificación final
      const ok = await this.isLogged(page);
      if (!ok) {
        throw new Error('Login aparentemente falló (no se detectaron indicadores de sesión iniciada).');
      }
      return true;

    } catch (err) {
      // Diagnóstico útil
      try {
        const html = await page.content();
        console.log("DEBUG HTML (first 1200 chars):", html.slice(0, 1200));
        const screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
        console.log("DEBUG SCREENSHOT (first 600 chars):", screenshot.slice(0, 600));
      } catch (_) {}
      // Re-lanzar con contexto
      err.message = `[Playbet][login] ${err.message}`;
      throw err;
    }
  }

  async isLogged(page) {
    // Señales típicas post-login
    return !!(await page.$('.logoutimg, a[href*="logout"], .main-dashboard, app-dashboard'));
  }

  // -------- Depositar (sin cambios funcionales) --------
  async depositar(usuario, monto) {
    const page = await this.getSessionPage();
    const urlDep = `${this.url}#/user/deposit`;

    const wait = (sel, t = 20000) => page.waitForSelector(sel, { visible: true, timeout: t });

    // util: click por texto visible (button/a/div con role)
    const clickByText = async (scope, rx, tags = ['button', 'a', 'div', 'span']) => {
      for (const tag of tags) {
        const nodes = await scope.$x(`.//${tag}[normalize-space(text())]`);
        for (const n of nodes) {
          const s = (await page.evaluate(el => el.innerText || el.textContent || '', n)).trim().toLowerCase();
          if (rx.test(s)) { await n.click(); return true; }
        }
      }
      return false;
    };

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
    await page.waitForTimeout(1500);
    const rowXpath = `//*[self::tr or self::div][.//*[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${String(usuario).toLowerCase()}')] or contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${String(usuario).toLowerCase()}')]`;
    const rowCandidates = await page.$x(rowXpath);

    if (!rowCandidates.length) {
      console.warn('[DEP] No encontré filas visibles con el usuario, intento refrescar resultados...');
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 10000 }).catch(() => {});
    }

    const rows = (rowCandidates.length ? rowCandidates : await page.$x(rowXpath));
    if (!rows.length) {
      throw new Error(`No encontré resultados para el usuario "${usuario}" en la lista de depósito.`);
    }

    // 5) Dentro de la fila, localizar el botón "Depositar"/"Cargar"/"Acción"
    let clickedAction = false;
    for (const row of rows) {
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
      // fallback: primer botón/ícono de acción
      const firstRow = rows[0];
      const anyBtn = await firstRow.$x('.//button|.//a|.//*[@role="button"]');
      if (!anyBtn.length) {
        throw new Error('No encontré acción para abrir el modal de depósito.');
      }
      await anyBtn[0].click();
    }

    // 6) Esperar modal/popup (usa clases .popup_1 o Bootstrap)
    await page.waitForTimeout(800);
    const modal = (await page.$('.popup_1')) || (await page.$('.modal.show')) || page;

    // 7) Buscar input de monto dentro del modal
    let modalAmount = null;
    const modalAmountSelectors = [
      'input[formcontrolname="amount"]',
      'input[name="amount"]',
      'input[type="number"]',
      'input[placeholder*="monto" i]',
      'input[placeholder*="importe" i]',
      'input[placeholder*="amount" i]',
    ];
    for (const sel of modalAmountSelectors) {
      modalAmount = await (modal === page ? page.$(sel) : modal.$(sel));
      if (modalAmount) break;
    }
    if (!modalAmount) {
      const nums = await (modal === page ? page.$$('input[type="number"]') : modal.$$('input[type="number"]'));
      if (nums && nums.length) modalAmount = nums[0];
    }
    if (!modalAmount) throw new Error('No encontré el input de monto en el modal.');

    await modalAmount.click({ clickCount: 3 });
    await modalAmount.type(String(monto), { delay: 20 });

    // 8) Confirmar en el modal
    let confirmed = false;
    const modalOkSelectors = ['button.btn-primary', 'button[type="submit"]', 'button.agent_sub'];
    for (const sel of modalOkSelectors) {
      const btn = await (modal === page ? page.$(sel) : modal.$(sel));
      if (btn) { await btn.click(); confirmed = true; break; }
    }
    if (!confirmed) {
      const ok = await (modal === page
        ? clickByText(page, /(depositar|confirmar|aceptar|cargar|entregar)/i)
        : clickByText(modal, /(depositar|confirmar|aceptar|cargar|entregar)/i));
      if (!ok) throw new Error('No encontré el botón de confirmar en el modal.');
    }

    // 9) Esperar confirmación
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => {});
    return { usuario, monto, plataforma: 'Playbet', status: 'ok' };
  }
}

module.exports = Playbet;
