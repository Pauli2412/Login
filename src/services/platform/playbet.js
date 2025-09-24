const Base = require('./BasePlatform');

class Playbet extends Base {
  constructor() {
    super({ name: 'Playbet' });
  }

  async login(page, { urlLogin, user, pass }) {
  await page.goto(urlLogin, { waitUntil: 'domcontentloaded' });

  await page.waitForSelector('app-login form', { timeout: 30000 });

  // Ahora sí: esperar los inputs
  const userInput = await page.waitForSelector('input[formcontrolname="login"]', { visible: true });
  const passInput = await page.waitForSelector('input[formcontrolname="password"]', { visible: true });

  // Escribir valores con "type" para simular usuario real
  await userInput.type(user, { delay: 50 });
  await passInput.type(pass, { delay: 50 });

  // Click en el botón de login
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
