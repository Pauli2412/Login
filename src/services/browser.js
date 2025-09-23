// src/services/browser.js
const puppeteer = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');

puppeteer.use(Stealth());

function buildProxyArg() {
  const proto = (process.env.PROXY_PROTOCOL || '').trim();
  const host  = (process.env.PROXY_HOST || '').trim();
  const port  = (process.env.PROXY_PORT || '').trim();

  if (proto && host && port) {
    return `--proxy-server=${proto}://${host}:${port}`;
  }
  return null; // 👉 si falta algo, no usamos proxy
}

async function launchBrowser() {
  const baseArgs = (process.env.PUPPETEER_ARGS || '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);

  const proxyArg = buildProxyArg();
  const args = proxyArg ? [...baseArgs, proxyArg] : baseArgs;

  if (proxyArg) {
    console.log("🌐 Proxy detectado, lanzando con:", proxyArg);
  } else {
    console.log("🚀 Sin proxy, lanzando con conexión directa");
  }

  const browser = await puppeteer.launch({
    headless: String(process.env.PUPPETEER_HEADLESS).toLowerCase() !== 'false',
    args,
    defaultViewport: null,
  });

    const page = await newPage(browser);

  return { browser, page }; 
  

}

async function newPage(browser) {
  const page = await browser.newPage();

  // Proxy auth si aplica
  const user = (process.env.PROXY_USER || '').trim();
  const pass = (process.env.PROXY_PASS || '').trim();
  if (user && pass) {
    await page.authenticate({ username: user, password: pass });
  }

  // User-Agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36'
  );

  // Headers adicionales
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Upgrade-Insecure-Requests': '1',
  });

  // Configurar idioma para que parezca navegador real
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'es-ES' });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es'] });
  });

  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });

  // Bloquear recursos pesados
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const rtype = req.resourceType();
    if (rtype === 'image' || rtype === 'media' || rtype === 'font') return req.abort();
    req.continue();
  });

  return page;
}

module.exports = { launchBrowser, newPage };
