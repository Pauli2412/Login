// Añadir a tus rutas (require('net') y 'tls' ya están en Node)
const net = require('net');

router.get('/proxy-connect-test', async (req, res) => {
  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = Number(process.env.PROXY_PORT || 0);
  const proxyUser = (process.env.PROXY_USER || '').trim();
  const proxyPass = (process.env.PROXY_PASS || '').trim();
  const targetHost = 'agents.ganamos.io';
  const targetPort = 443;
  const timeoutMs = 10000;

  if (!proxyHost || !proxyPort) {
    return res.status(400).json({ ok: false, error: 'PROXY_HOST / PROXY_PORT no configurados' });
  }

  // Abrimos socket al proxy y enviamos un CONNECT
  const socket = net.connect({ host: proxyHost, port: proxyPort });

  let done = false;
  const cleanup = (code, detail) => {
    if (done) return;
    done = true;
    socket.destroy();
    res.json({ ok: false, code, detail });
  };

  const headers = [`CONNECT ${targetHost}:${targetPort} HTTP/1.1`, `Host: ${targetHost}:${targetPort}`];
  if (proxyUser && proxyPass) {
    const auth = Buffer.from(`${proxyUser}:${proxyPass}`).toString('base64');
    headers.push(`Proxy-Authorization: Basic ${auth}`);
  }
  headers.push('', ''); // blank line end
  const payload = headers.join('\r\n');

  socket.setTimeout(timeoutMs, () => cleanup('timeout', `No response in ${timeoutMs}ms`));

  socket.on('connect', () => {
    socket.write(payload);
  });

  let acc = '';
  socket.on('data', (chunk) => {
    acc += chunk.toString();
    // Si recibimos header completo, analizamos
    if (acc.includes('\r\n\r\n')) {
      // ejemplo de respuesta esperada: "HTTP/1.1 200 Connection established"
      const firstLine = acc.split('\r\n')[0] || '';
      if (/200/.test(firstLine)) {
        // OK: proxy permite CONNECT
        socket.end();
        done = true;
        return res.json({ ok: true, msg: 'CONNECT ok', proxyResponse: firstLine });
      } else {
        socket.end();
        done = true;
        return res.status(502).json({ ok: false, msg: 'Proxy refused CONNECT', proxyResponse: firstLine, full: acc.slice(0,1000) });
      }
    }
  });

  socket.on('error', (err) => {
    if (!done) cleanup('error', err.message);
  });

  socket.on('end', () => {
    if (!done) cleanup('end', 'socket ended before full response');
  });
});
