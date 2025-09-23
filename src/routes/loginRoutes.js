const express = require('express');
const router = express.Router();
const { doLoginOne, doLoginAll, getSessionFor, keepAlive } = require('../services/loginService');
const { listSheets, readConfPlataformas, testAuth } = require("../services/sheetsConfig"); 
const logger = require('../utils/logger');
const { launchBrowser } = require('../services/browser');  


router.get('/health', (_req, res) => res.json({ ok: true, service: 'ms-login' }));

// Forzar login de una o todas
router.post('/login', async (req, res, next) => {
  try {
    const { plataforma } = req.body || {};
    const result = plataforma ? await doLoginOne(plataforma, await require('../services/loginService').fetchConfig())
                              : await doLoginAll();
    res.json({ ok: true, result });
  } catch (e) { next(e); }
});

// Obtener sesión (cookies/token) para que ms-deposito use
router.get('/session', async (req, res, next) => {
  try {
    const { plataforma } = req.query;
    if (!plataforma) return res.status(400).json({ ok: false, error: 'plataforma requerida' });
    const s = await getSessionFor(plataforma);
    res.json(s);
  } catch (e) { next(e); }
});

// Mantener sesiones vivas (cron externo o manual)
router.post('/keepalive', async (req, res, next) => {
  try {
    const { plataforma } = req.body || {};
    const result = await keepAlive(plataforma);
    res.json({ ok: true, result });
  } catch (e) { next(e); }
});


// Test: listar pestañas
router.get("/test-sheets", async (req, res) => {
  try {
    const sheets = await listSheets();
    res.json({ ok: true, availableSheets: sheets });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Test: leer ConfPlataformas
router.get("/test-conf", async (req, res) => {
  try {
    const rows = await readConfPlataformas();
    res.json({ ok: true, rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/test-auth", async (req, res) => {
  try {
    const token = await require("../services/sheetsConfig").testAuth();
    res.json({ ok: true, token });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/test-ip", async (req, res) => {
  let browser;
  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;

    // Usa un servicio alternativo que devuelva JSON válido
    await page.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const data = await page.evaluate(() => document.body.innerText);

    res.json({ ok: true, ipInfo: JSON.parse(data) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

const { launchBrowser } = require('../services/browser');

router.get('/debug-proxy', async (_req, res) => {
  // leemos env ya “como llegan”
  const raw = {
    PROXY_PROTOCOL: process.env.PROXY_PROTOCOL,
    PROXY_HOST: process.env.PROXY_HOST,
    PROXY_PORT: process.env.PROXY_PORT,
    PROXY_USER: process.env.PROXY_USER,
    PROXY_PASS_len: (process.env.PROXY_PASS || '').length,
    PUPPETEER_ARGS: process.env.PUPPETEER_ARGS,
  };

  let browser;
  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;

    // chequeo real de IP saliente via proxy
    await page.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const txt = await page.evaluate(() => document.body.innerText);
    let ipJson;
    try {
      ipJson = JSON.parse(txt);
    } catch {
      ipJson = { raw: txt.slice(0, 400) };
    }

    res.json({ ok: true, envRaw: raw, ipInfo: ipJson });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, envRaw: raw });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});


module.exports = router;
