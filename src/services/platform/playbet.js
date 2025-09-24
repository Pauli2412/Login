const Base = require('./BasePlatform');

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
  }

  async login(page, { urlLogin, user, pass }) {
    // Ir al login
    await page.goto(urlLogin, { waitUntil: 'networkidle2', timeout: 45000 });

    // Esperar hasta que Angular pinte los inputs
    await page.waitForFunction(() => {
      return document.querySelector('input[formcontrolname="login"]') &&
             document.querySelector('input[formcontrolname="password"]');
    }, { timeout: 20000 });

    // Forzar Angular binding en login
    await page.evaluate((val) => {
      const el = document.querySelector('input[formcontrolname="login"]');
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, user);

    // Forzar Angular binding en password
    await page.evaluate((val) => {
      const el = document.querySelector('input[formcontrolname="password"]');
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, pass);

    // Habilitar botón si Angular lo dejó disabled
    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (btn && btn.hasAttribute('disabled')) btn.removeAttribute('disabled');
    });

    // Click y esperar redirección
    const loginBtn = await page.$('button[type="submit"]');
    await Promise.all([
      loginBtn.click(),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);

    return true;
  }

  async isLogged(page) {
    // Buscar logout o panel principal
    return !!(await page.$('.logoutimg, a[href*="logout"], .main-dashboard'));
  }
}

module.exports = Playbet;
