import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const highfiDir = path.join(root, "prototypes", "ui-rebuild");
const shotDir = path.join(root, "artifacts", "ui-screenshots");

const sourceFile = "index.html";
const artboards = [
  "welcome",
  "template-center",
  "workbench",
  "file-editor",
  "orchestration",
  "role-creator",
  "settings",
  "draft-orchestration",
];

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};

await fs.mkdir(shotDir, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    const requestPath = decodeURIComponent(req.url === "/" ? `/${sourceFile}` : req.url || `/${sourceFile}`);
    const filePath = path.join(highfiDir, requestPath);
    const normalized = path.normalize(filePath);
    if (!normalized.startsWith(path.normalize(highfiDir))) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const content = await fs.readFile(normalized);
    const ext = path.extname(normalized).toLowerCase();
    res.writeHead(200, { "content-type": mime[ext] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((resolve) => server.listen(4180, "127.0.0.1", resolve));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1100 },
  deviceScaleFactor: 2,
});

await page.goto(`http://127.0.0.1:4180/${sourceFile}`, { waitUntil: "networkidle" });

for (const slug of artboards) {
  const locator = page.locator(`[data-shot="${slug}"]`);
  await locator.waitFor();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`missing artboard: ${slug}`);
  }
  await page.screenshot({
    path: path.join(shotDir, `${slug}.png`),
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: box.width,
      height: box.height,
    },
  });
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

console.log(`rendered ${artboards.length} screenshots from ${sourceFile}`);
