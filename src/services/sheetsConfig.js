const { google } = require("googleapis");

// Aseguramos que la clave existe
let rawKey = process.env.GOOGLE_PRIVATE_KEY;

if (!rawKey) {
  console.error("❌ GOOGLE_PRIVATE_KEY no está en el .env");
  throw new Error("GOOGLE_PRIVATE_KEY missing");
}

// Normalizamos: si tiene comillas las quitamos, y si tiene \n escapados los convertimos
rawKey = rawKey.replace(/^"|"$/g, ""); // quita comillas al inicio/fin si las hubiera
const privateKey = rawKey.replace(/\\n/g, "\n");

console.log(">>> Clave cargada OK, longitud:", privateKey.length);

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  privateKey,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

async function testAuth() {
  const token = await auth.authorize();
  console.log("✅ Token obtenido:", !!token.access_token);
  return token;
}

async function listSheets() {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
  });
  return res.data.sheets.map((s) => s.properties.title);
}

function getSheetsClient() {
  const jwt = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );
  return google.sheets({ version: 'v4', auth: jwt });
}


async function readConfPlataformas() {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const range = `${process.env.CONF_SHEET_NAME || 'ConfPlataformas'}!A:Z`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  const header = rows[0];
  const data = rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] || '').trim()])));

  const COL_P = process.env.CONF_COL_PLATAFORMA || 'PLATAFORMA';
  const COL_URL = process.env.CONF_COL_URL || 'URL';
  const COL_USER = process.env.CONF_COL_USER || 'USUARIO';
  const COL_PASS = process.env.CONF_COL_PASS || 'CONTRASEÑA';

  return data
    .map(d => ({
      plataforma: d[COL_P],
      urlLogin: d[COL_URL],
      user: d[COL_USER],
      pass: d[COL_PASS]
    }))
    .filter(x => x.plataforma && x.urlLogin);
}

module.exports = { testAuth, listSheets, readConfPlataformas };
