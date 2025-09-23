const Base = require('./BasePlatform');

class Buffalo extends Base {
  constructor() { super({ name: 'Buffalo' }); }
  async login(page, { urlLogin, user, pass }) {
    await page.goto(urlLogin, { waitUntil: 'domcontentloaded' });
    await page.type('input[type="text"]', user);
    await page.type('input[type="password"]', pass);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);
    return true;
  }
  async isLogged(page) {
    return !!(await page.$('header .username, .topbar .user'));
  }
}

module.exports = Buffalo;
