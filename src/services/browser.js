// src/services/browser.js
const puppeteer = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');

puppeteer.use(Stealth());

function unquote(v) {
  if (!v) return '';
  const s = String(v).trim();
  // quita comillas simples o dobles que Render puede “mostrar/inyectar”
  return s.replace(/^['"]|['"]$/g, '');
}

function getEnv(key, def = '') {
  return unquote(process.env[key] ?? def);
}

function buildProxyArg() {
  const host = getEnv('PROXY_HOST');       // ej: gate.decodo.com
  const port = getEnv('PROXY_PORT');       // ej: 10001

  if (host && port) {
    return `--proxy-server=https://${host}:${port}`;

  }
  return null;
}



async function launchBrowser() {
  const baseArgs = getEnv('PUPPETEER_ARGS')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);

  const proxyArg = buildProxyArg();
  const args = proxyArg ? [...baseArgs, proxyArg] : baseArgs;

  if (proxyArg) {
    console.log('🌐 Proxy detectado:', proxyArg);
  } else {
    console.log('🚀 Sin proxy (conexión directa)');
  }

  const browser = await puppeteer.launch({
    headless: getEnv('PUPPETEER_HEADLESS').toLowerCase() !== 'false',
    args,
    defaultViewport: null,
    ignoreHTTPSErrors: true,   // 👈 esto
  });

  const page = await newPage(browser);
  return { browser, page };
}

async function newPage(browser) {
  const page = await browser.newPage();

  // Auth del proxy (sanitizada)
  const user = getEnv('PROXY_USER'); // ej: user-...-asn-7303
  const pass = getEnv('PROXY_PASS'); // ¡sin comillas!
  if (user && pass) {
    await page.authenticate({ username: user, password: pass });
  }

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36'
  );

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Upgrade-Insecure-Requests': '1',
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'es-ES' });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es'] });
  });

  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const rtype = req.resourceType();
    if (rtype === 'image' || rtype === 'media' || rtype === 'font') return req.abort();
    req.continue();
  });

  return page;
}

module.exports = { launchBrowser, newPage };
