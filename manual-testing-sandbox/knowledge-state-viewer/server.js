const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 4179;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
};

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function safeResolve(baseDir, requestPath) {
  const normalizedPath = requestPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const relative = normalizedPath.replace(/^\/+/, "");
  const absolute = path.resolve(baseDir, relative);
  if (!absolute.startsWith(baseDir)) {
    return null;
  }
  return absolute;
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";
    send(res, 200, data, mimeType);
  });
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    send(res, 400, "Bad Request");
    return;
  }

  const [pathname] = req.url.split("?");

  if (pathname === "/" || pathname === "/index.html") {
    serveFile(path.join(PUBLIC_DIR, "index.html"), res);
    return;
  }

  if (pathname.startsWith("/public/")) {
    const target = safeResolve(PUBLIC_DIR, pathname.replace(/^\/public\//, ""));
    if (!target) {
      send(res, 403, "Forbidden");
      return;
    }
    serveFile(target, res);
    return;
  }

  if (pathname.startsWith("/data/")) {
    const target = safeResolve(DATA_DIR, pathname.replace(/^\/data\//, ""));
    if (!target) {
      send(res, 403, "Forbidden");
      return;
    }
    serveFile(target, res);
    return;
  }

  send(res, 404, "Not Found");
});

server.listen(PORT, () => {
  console.log(`Knowledge State Viewer is running at http://localhost:${PORT}`);
  console.log("Copy exported JSON files to ./data and refresh the page.");
});
