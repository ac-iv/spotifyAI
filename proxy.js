const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 8765;

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const target = parsed.query.url;

  /* CORS preflight */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (!target) {
    res.writeHead(400); res.end('Missing ?url= parameter'); return;
  }

  let targetURL;
  try { targetURL = new URL(target); } catch {
    res.writeHead(400); res.end('Invalid URL'); return;
  }

  const lib = targetURL.protocol === 'https:' ? https : http;
  const options = {
    hostname: targetURL.hostname,
    port: targetURL.port || (targetURL.protocol === 'https:' ? 443 : 80),
    path: targetURL.pathname + targetURL.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xhtml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'identity',
      'Host': targetURL.hostname,
    }
  };

  const proxyReq = lib.request(options, proxyRes => {
    /* strip the blocking headers */
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    delete headers['strict-transport-security'];
    /* keep content-type so browser renders correctly */
    headers['access-control-allow-origin'] = '*';

    /* rewrite absolute URLs in Location redirects */
    if (headers['location']) {
      try {
        const loc = new URL(headers['location'], target);
        headers['location'] = `http://localhost:${PORT}/?url=${encodeURIComponent(loc.href)}`;
      } catch {}
    }

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', err => {
    res.writeHead(502);
    res.end(`Proxy error: ${err.message}`);
  });

  proxyReq.setTimeout(10000, () => {
    proxyReq.destroy();
    res.writeHead(504);
    res.end('Request timed out');
  });

  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`\n✅ Device Preview Proxy running at http://localhost:${PORT}`);
  console.log(`   Open device-preview.html in your browser and start previewing.\n`);
  console.log(`   Press Ctrl+C to stop.\n`);
});
