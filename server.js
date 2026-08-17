const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 8788;

// 提供靜態檔案
app.use(express.static(__dirname));
app.use(express.json());

// 權限驗證 Middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    if (req.headers['x-admin-token'] !== 'polakuma2025') {
      return res.status(403).json({ error: '密碼驗證失敗，拒絕存取' });
    }
  }
  next();
});

// API：建立資料夾
app.post('/api/create-folder', (req, res) => {
  const { folderName } = req.body;
  const targetPath = path.join(__dirname, 'gallery-omakase', folderName);
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
  res.json({ success: true });
});

// API：上傳檔案 (包含中文檔名解碼)
app.post('/api/upload', (req, res) => {
  const rawFilename = req.headers['x-filename'];
  if (!rawFilename) return res.status(400).json({ error: '缺少檔案名稱' });

  const filename = decodeURIComponent(rawFilename);
  const targetPath = path.join(__dirname, 'gallery-omakase', filename);

  const fileStream = fs.createWriteStream(targetPath);
  req.pipe(fileStream);

  req.on('end', () => res.json({ success: true }));
  req.on('error', err => res.status(500).json({ error: err.message }));
});

// API：刪除作品資料夾 (非同步安全升級版，防止伺服器崩潰)
app.post('/api/delete-folder', async (req, res) => {
  const { folderName } = req.body;

  // 防呆：避免未傳入檔名時刪除整個根目錄
  if (!folderName || folderName.trim() === '') {
    return res.status(400).json({ error: '無效的資料夾名稱' });
  }

  const targetPath = path.join(__dirname, 'gallery-omakase', folderName);

  try {
    if (fs.existsSync(targetPath)) {
      // 改用非同步的 fs.promises.rm 並加入重試機制
      await fs.promises.rm(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 5,       // 如果檔案被系統鎖定，自動重試 5 次
        retryDelay: 200      // 每次重試間隔 0.2 秒，等待系統解鎖
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('刪除發生錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// API：重新產生 JSON
app.post('/api/rebuild', (req, res) => {
  exec('node build-gallery-data.js', (error, stdout, stderr) => {
    if (error) {
      console.error('Rebuild error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  });
});

// 啟動伺服器並保持監聽 (這是讓伺服器活著的關鍵！)
app.listen(PORT, () => {
  console.log(`🚀 PolaKuma Admin Server @ http://localhost:${PORT}`);
  console.log(`Gallery: http://localhost:${PORT}/gallery.html`);
  console.log(`Admin:   http://localhost:${PORT}/admin.html`);
  console.log(`Password: polakuma2025`);
});