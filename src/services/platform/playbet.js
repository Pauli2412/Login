const Base = require('./BasePlatform');

class Playbet extends Base {
  constructor() { super({ name: 'Playbet' }); }
  async login(page, { urlLogin, user, pass }) {
    await page.goto(urlLogin, { waitUntil: 'domcontentloaded' });
    await page.type('#username', user);
    await page.type('#password', pass);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);
    return true;
  }
  async isLogged(page) {
    return !!(await page.$('a[href*="/logout"]'));
  }
}

module.exports = Playbet;
