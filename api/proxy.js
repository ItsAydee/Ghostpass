const https = require("https");
const http = require("http");
const { URL } = require("url");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") return res.status(200).end();

  let { url } = req.query;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;

  try {
    const targetRes = await fetchUrl(url);
    const contentType = targetRes.headers["content-type"] || "";

    if (!contentType.includes("text/html")) {
      const safe = ["content-type", "content-length", "cache-control"];
      safe.forEach(h => { if (targetRes.headers[h]) res.setHeader(h, targetRes.headers[h]); });
      return targetRes.pipe(res);
    }

    let body = await readBody(targetRes);

    const inject = `
<script>
(function(){
  var P = '/api/proxy?url=';
  var O = '${origin}';
  var proto = '${parsedUrl.protocol}';

  function rw(u) {
    if (!u || u.startsWith('javascript:') || u.startsWith('mailto:') || u.startsWith('data:') || u.startsWith('#') || u.startsWith('/api/proxy')) return u;
    if (u.startsWith('//')) u = proto + u;
    else if (u.startsWith('/')) u = O + u;
    else if (!u.startsWith('http')) u = O + '/' + u;
    return P + encodeURIComponent(u);
  }

  function rewriteEl(el) {
    ['href','src','action'].forEach(function(a){
      if (el.hasAttribute(a)) {
        var v = el.getAttribute(a);
        if (v) el.setAttribute(a, rw(v));
      }
    });
    if (el.tagName === 'FORM') el.setAttribute('target', '_self');
  }

  function rewriteAll(root) {
    (root || document).querySelectorAll('[href],[src],[action]').forEach(rewriteEl);
  }

  document.addEventListener('DOMContentLoaded', function(){ rewriteAll(document); });

  new MutationObserver(function(ms){
    ms.forEach(function(m){
      m.addedNodes.forEach(function(n){
        if (n.nodeType===1) {
          rewriteEl(n);
          rewriteAll(n);
        }
      });
    });
  }).observe(document.documentElement, {childList:true, subtree:true});

  document.addEventListener('click', function(e){
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    e.preventDefault();
    var full;
    if (href.startsWith('http')) full = href;
    else if (href.startsWith('//')) full = proto + href;
    else if (href.startsWith('/')) full = O + href;
    else full = O + '/' + href;
    window.location.href = P + encodeURIComponent(full);
  }, true);
})();
</script>`;

    body = body
      .replace(/(href|src|action)=["'](\/\/[^"'\s>]+)["']/g, (_, a, u) =>
        `${a}="/api/proxy?url=${encodeURIComponent(parsedUrl.protocol + u)}"`)
      .replace(/(href|src|action)=["'](\/[^"'\s>]+)["']/g, (_, a, u) =>
        `${a}="/api/proxy?url=${encodeURIComponent(origin + u)}"`)
      .replace(/(href|src|action)=["'](https?:\/\/[^"'\s>]+)["']/g, (_, a, u) =>
        `${a}="/api/proxy?url=${encodeURIComponent(u)}"`)
      .replace(/<head([^>]*)>/i, `<head$1><base href="${origin}/">${inject}`);

    res.removeHeader("X-Frame-Options");
    res.removeHeader("Content-Security-Policy");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(body);

  } catch (err) {
    return res.status(500).send(`
      <html>
      <head><style>
        body { font-family: monospace; background: #0a0a0f; color: #e8e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; flex-direction: column; gap: 1rem; }
        h2 { color: #f87171; }
        a { color: #7c3aed; }
        p { color: #6b6b8a; font-size: 0.85rem; }
      </style></head>
      <body>
        <h2>Could not load this site</h2>
        <p>This site may be blocking proxy access.</p>
        <a href="javascript:history.back()">Go back</a>
      </body>
      </html>
    `);
  }
}

function fetchUrl(url, redirects = 0) {
  if (redirects > 8) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
        "Upgrade-Insecure-Requests": "1",
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith("/")) {
          const u = new URL(url);
          loc = `${u.protocol}//${u.host}${loc}`;
        }
        return resolve(fetchUrl(loc, redirects + 1));
      }
      resolve(res);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
  });
}

function readBody(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    res.on("data", c => chunks.push(c));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    res.on("error", reject);
  });
}
