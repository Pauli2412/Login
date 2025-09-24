const Base = require('./BasePlatform');

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
  }

  // src/services/platform/playbet.js
async login(page, { urlLogin, user, pass }) {
  await page.goto(urlLogin, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 🚨 Debug: imprimir el HTML real que Render ve
  const html = await page.content();
  console.log("DEBUG HTML:", html.slice(0, 1000)); // primeras 1000 chars

  // Ahora intentamos buscar directamente el input
  const userInput = await page.waitForSelector('input[formcontrolname="login"]', { visible: true, timeout: 30000 });
  const passInput = await page.waitForSelector('input[formcontrolname="password"]', { visible: true, timeout: 30000 });

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
    // Buscar logout o panel principal
    return !!(await page.$('.logoutimg, a[href*="logout"], .main-dashboard'));
  }
}

module.exports = Playbet;
