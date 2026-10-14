// dist を静的配信する最小サーバー（依存ライブラリなし）
// Railway が注入する PORT 環境変数を使う。未設定なら 3000。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

if (!fs.existsSync(DIST)) {
  console.error('dist が見つかりません。先に npm run build を実行してください。');
  process.exit(1);
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = path.join(DIST, urlPath);
    // ディレクトリトラバーサル防止
    if (!filePath.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA なので存在しないパスは index.html を返す
      filePath = path.join(DIST, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const isAsset = urlPath.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      // ハッシュ付き assets は長期キャッシュ、それ以外は毎回確認
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`GOLDEN 配信中: http://localhost:${PORT}`);
  });
