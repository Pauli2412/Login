class BasePlatform {
  constructor({ name }) { this.name = name; }
  async login(_page, _creds) { throw new Error('login() not implemented'); }
  async isLogged(_page) { return false; }
  async cookiesToHeader(cookies) {
    // Devuelve string tipo "cookie1=val; cookie2=val"
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }
}
module.exports = BasePlatform;
