const Base = require('./BasePlatform');

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
  }

  async login(page, { urlLogin, user, pass }) {
    // Ir a login
    await page.goto(urlLogin, { waitUntil: 'domcontentloaded' });

    // Esperar inputs
    await page.waitForSelector('input[formcontrolname="login"]');
    await page.waitForSelector('input[formcontrolname="password"]');

    // Forzar Angular binding en el input de usuario
    await page.evaluate((val) => {
      const el = document.querySelector('input[formcontrolname="login"]');
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, user);

    // Forzar Angular binding en el input de password
    await page.evaluate((val) => {
      const el = document.querySelector('input[formcontrolname="password"]');
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, pass);

    // Habilitar el botón si aún está disabled
    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (btn && btn.hasAttribute('disabled')) {
        btn.removeAttribute('disabled');
      }
    });

    // Click en el botón de login y esperar navegación/red
    const loginBtn = await page.$('button[type="submit"]');
    await Promise.all([
      loginBtn.click(),
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})
    ]);

    return true;
  }

  async isLogged(page) {
    // Detectar logout
    return !!(await page.$('.logoutimg, a[href*="logout"]'));
  }
}

module.exports = Playbet;
