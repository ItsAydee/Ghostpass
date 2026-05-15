const https = require("https");
const http = require("http");
const { URL } = require("url");

export default async function handler(req, res) {
  // CORS headers so the frontend can call this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "No URL provided" });
  }

  // Add https:// if missing
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const targetRes = await fetchUrl(url);
    const contentType = targetRes.headers["content-type"] || "";

    // Only rewrite HTML pages
    if (contentType.includes("text/html")) {
      let body = await readBody(targetRes);

      // Rewrite absolute and relative URLs to route through our proxy
      const base = `${parsedUrl.protocol}//${parsedUrl.host}`;
      const proxyBase = `/api/proxy?url=`;

      body = body
        // Rewrite href="..." and src="..."
        .replace(/(href|src|action)="(\/[^"]*)"/g, (_, attr, path) => {
          return `${attr}="${proxyBase}${encodeURIComponent(base + path)}"`;
        })
        .replace(/(href|src|action)="(https?:\/\/[^"]*)"/g, (_, attr, absUrl) => {
          return `${attr}="${proxyBase}${encodeURIComponent(absUrl)}"`;
        })
        // Inject base tag for relative resource loading
        .replace(/<head([^>]*)>/i, `<head$1><base href="${base}/">`);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(body);
    }

    // For non-HTML (images, CSS, JS, etc.) — stream through directly
    res.setHeader("Content-Type", contentType);
    targetRes.pipe(res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch: " + err.message });
  }
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        timeout: 10000,
      },
      (res) => {
        // Follow redirects
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return resolve(fetchUrl(res.headers.location));
        }
        resolve(res);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

function readBody(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    res.on("data", (chunk) => chunks.push(chunk));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    res.on("error", reject);
  });
}
