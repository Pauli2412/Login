const Base = require('./BasePlatform');

class Aguante extends Base {
  constructor() { super({ name: 'Aguante' }); }
  async login(page, { urlLogin, user, pass }) {
    await page.goto(urlLogin, { waitUntil: 'domcontentloaded' });
    // TODO: ajusta selectores del formulario
    await page.type('input[name="username"]', user);
    await page.type('input[name="password"]', pass);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);
    return true;
  }
  async isLogged(page) {
    // TODO: ajusta a un selector que solo exista logeado
    return !!(await page.$('nav .user-avatar'));
  }
}

module.exports = Aguante;
