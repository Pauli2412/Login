// src/services/platform/playbet.js
const Base = require('./BasePlatform');

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
  }

  async login(page, { urlLogin, user, pass }) {
    await page.goto(urlLogin, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 🚨 Debug 1: imprimir los primeros 1000 caracteres del HTML
    const html = await page.content();
    console.log("DEBUG HTML (first 1000 chars):", html.slice(0, 1000));

    // 🚨 Debug 2: listar scripts que se cargan
    const scripts = await page.$$eval("script", els =>
      els.map(e => e.src || e.innerText.slice(0, 80))
    );
    console.log("DEBUG SCRIPTS:", scripts);

    // 🚨 Debug 3: esperar un poco a que Angular monte
    await page.waitForTimeout(5000);

    // 🚨 Debug 4: verificar si existe el form
    const formExists = await page.$('form input[formcontrolname="login"]');
    console.log("DEBUG FORM EXISTS:", !!formExists);

    // Si no existe el form → salimos con error explícito
    if (!formExists) {
      throw new Error("Formulario de login no cargó (Angular bloqueado o no ejecutado)");
    }

    // Continuar con login si el form aparece
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
