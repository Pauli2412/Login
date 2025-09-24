const Base = require('./BasePlatform');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
  }

  async login(page, { urlLogin, user, pass }) {
    // Log de errores de consola para debug Angular
    page.on('console', msg => {
      console.log('BROWSER CONSOLE:', msg.type(), msg.text());
    });

    await page.goto(urlLogin, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 🚨 Debug HTML y scripts
    const html = await page.content();
    console.log("DEBUG HTML (first 1000 chars):", html.slice(0, 1000));

    const scripts = await page.$$eval("script", els =>
      els.map(e => e.src || e.innerText.slice(0, 80))
    );
    console.log("DEBUG SCRIPTS:", scripts);

    // Esperar un poco para que Angular monte
    await sleep(8000);

    // Verificar si existe el form
    const formExists = await page.$('form input[formcontrolname="login"]');
    console.log("DEBUG FORM EXISTS:", !!formExists);

    if (!formExists) {
      throw new Error("Formulario de login no cargó (Angular no montó o está bloqueado)");
    }

    // Login normal
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
