// src/routes/loginRoutes.js
const loginService = require('../services/loginService');
const express = require('express');
const router = express.Router();
const { doLoginOne, doLoginAll, getSessionFor, keepAlive, fetchConfig } = require('../services/loginService');
const { listSheets, readConfPlataformas, testAuth } = require("../services/sheetsConfig");
const logger = require('../utils/logger');
const { launchBrowser } = require('../services/browser');
const Playbet = require('../services/platform/playbet');

// Health check
router.get('/health', (_req, res) => res.json({ ok: true, service: 'ms-login' }));

// Forzar login de una o todas
router.post('/login', async (req, res, next) => {
  try {
    const { plataforma } = req.body || {};
    const conf = await fetchConfig();
    const result = plataforma
      ? await doLoginOne(plataforma, conf)
      : await doLoginAll();
    res.json({ ok: true, result });
  } catch (e) { next(e); }
});

// Obtener sesión (cookies/token) para que ms-deposito use
router.get('/session', async (req, res, next) => {
  try {
    const { plataforma } = req.query;
    if (!plataforma) {
      return res.status(400).json({ ok: false, error: 'plataforma requerida' });
    }
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
router.get("/test-sheets", async (_req, res) => {
  try {
    const sheets = await listSheets();
    res.json({ ok: true, availableSheets: sheets });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Test: leer ConfPlataformas (normalizado)
router.get("/test-conf", async (_req, res) => {
  try {
    const rows = await readConfPlataformas();
    const normalized = rows.map(r => {
      const obj = Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])
      );
      return {
        plataforma: obj.plataforma || '',
        urlLogin: obj.urllogin || '',
        user: obj.user || '',
        pass: obj.pass || '',
        usuario: obj.usuario || '' // 👈 masterAgentName / cajero
      };
    });
    res.json({ ok: true, rows, normalized });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/test-auth", async (_req, res) => {
  try {
    const token = await testAuth();
    res.json({ ok: true, token });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/test-ip", async (_req, res) => {
  let browser;
  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;

    await page.goto('https://api.myip.com', { waitUntil: 'domcontentloaded' });
    const body = await page.evaluate(() => document.body.innerText);
    res.json({ ok: true, ipInfo: JSON.parse(body) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

// Debug de proxy
router.get('/debug-proxy', async (_req, res) => {
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

    await page.goto('https://api.myip.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
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

// Recibir depósitos
router.post("/depositar", async (req, res) => {
  try {
    const { plataforma, usuario, monto } = req.body;
    if (!plataforma || !usuario || !monto) {
      return res.status(400).json({ ok: false, error: "Faltan parámetros" });
    }
    const result = await loginService.depositar(plataforma, usuario, monto);
    res.json({ ok: true, result });
  } catch (err) {
    console.error("❌ Error en /depositar:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Historial Playbet
router.get('/historial', async (req, res) => {
  const { usuario, desde, hasta, estado } = req.query;
  try {
    const conf = await fetchConfig();
    const creds = conf['playbet'];
    if (!creds) {
      return res.status(400).json({ ok: false, error: 'No hay configuración para Playbet' });
    }
    const service = new Playbet(creds);
    const data = await service.buscarDepositos({ usuario, desde, hasta, estado });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// src/routes/loginRoutes.js (agregar al final antes del module.exports)

// Test de depósito en Playbet
router.post("/depositar/playbet/test", async (_req, res) => {
  try {
    const conf = await fetchConfig();
    const creds = conf['playbet'];
    if (!creds) {
      return res.status(400).json({ ok: false, error: "No hay configuración de Playbet en Sheets" });
    }

    const Playbet = require("../services/platform/playbet");
    const service = new Playbet(creds);

    // 🔹 Usuario ficticio y monto fijo
    const testUser = "usuario_test";
    const testAmount = 1000.50; // válido: mínimo 1000 y acepta decimales

    const result = await service.depositar(testUser, testAmount);

    res.json({
      ok: true,
      msg: "Depósito de prueba ejecutado",
      masterAgentName: creds.user,
      usuario: testUser,
      monto: testAmount,
      result
    });
  } catch (err) {
    console.error("❌ Error en /depositar/playbet/test:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Test de depósito en Playbet con timeout seguro
router.post("/depositar/playbet/test", async (_req, res) => {
  try {
    const conf = await fetchConfig();
    const creds = conf['playbet'];
    if (!creds) {
      return res.status(400).json({ ok: false, error: "No hay configuración de Playbet en Sheets" });
    }

    const Playbet = require("../services/platform/playbet");
    const service = new Playbet(creds);

    const testUser = "usuario_test";
    const testAmount = 1000.50;

    const result = await Promise.race([
      service.depositar(testUser, testAmount),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout depósito test (20s)")), 20000))
    ]);

    res.json({
      ok: true,
      msg: "Depósito de prueba ejecutado",
      masterAgentName: creds.user,
      usuario: testUser,
      monto: testAmount,
      result
    });
  } catch (err) {
    console.error("❌ Error en /depositar/playbet/test:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


module.exports = router;

