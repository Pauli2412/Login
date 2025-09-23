// Almacenamos cookies/tokens en memoria por plataforma
const store = new Map();

/**
 * session = { cookies: string, token: string, updatedAt: Date }
 */
function setSession(plataforma, session) {
  store.set(plataforma.toLowerCase(), { ...session, updatedAt: new Date() });
}
function getSession(plataforma) {
  return store.get(plataforma.toLowerCase()) || null;
}
function getAllSessions() {
  return Array.from(store.entries()).map(([k, v]) => ({ plataforma: k, ...v }));
}

module.exports = { setSession, getSession, getAllSessions };
