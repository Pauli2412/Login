// src/services/sessionStore.js

// Guardamos sesiones en memoria por plataforma
// Cada sesión puede contener cookies, token, etc.
const store = new Map();

/**
 * setSession
 * @param {string} plataforma - Nombre de la plataforma (ej: "Playbet")
 * @param {object} session - Datos de sesión { cookies, token, updatedAt }
 */
function setSession(plataforma, session) {
  store.set(plataforma.toLowerCase(), {
    ...session,
    updatedAt: new Date()
  });
}

/**
 * getSession
 * @param {string} plataforma - Nombre de la plataforma
 * @returns {object|null} Sesión guardada o null
 */
function getSession(plataforma) {
  return store.get(plataforma.toLowerCase()) || null;
}

/**
 * getAllSessions
 * @returns {Array} Lista de todas las sesiones activas
 */
function getAllSessions() {
  return Array.from(store.entries()).map(([k, v]) => ({
    plataforma: k,
    ...v
  }));
}

/**
 * clearSession
 * @param {string} plataforma - Nombre de la plataforma
 */
function clearSession(plataforma) {
  store.delete(plataforma.toLowerCase());
}

/**
 * clearAllSessions
 * Borra todas las sesiones guardadas
 */
function clearAllSessions() {
  store.clear();
}

module.exports = {
  setSession,
  getSession,
  getAllSessions,
  clearSession,
  clearAllSessions
};
