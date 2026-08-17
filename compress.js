const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 目標根目錄：gallery-omakase
const TARGET_DIR = path.join(__dirname, 'gallery-omakase');

// 支援的原始圖檔副檔名
const SUPPORTED_EXTS = ['.jpg', '.jpeg', '.png'];

async function processImage(filePath) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);

    // 如果已經是 webp 則略過
    if (ext.toLowerCase() === '.webp') return;

    // 輸出的 WebP 路徑
    const outputPath = path.join(dir, `${baseName}.webp`);

    try {
        const image = sharp(filePath);
        const metadata = await image.metadata();

        // 判斷是否為預覽縮圖 (T.JPEG / T.jpg 等)
        if (baseName.toUpperCase() === 'T') {
            await image
                .resize({ width: 800, withoutEnlargement: true }) // 水晶球縮圖寬度上限 800px
                .webp({ quality: 80 })
                .toFile(outputPath);
            console.log(`✅ [水晶球縮圖] 轉換完成: ${path.relative(__dirname, outputPath)}`);
        } else {
            // 一般相片牆大圖：長邊限制 2048px
            await image
                .resize({
                    width: metadata.width > metadata.height ? 2048 : null,
                    height: metadata.height >= metadata.width ? 2048 : null,
                    withoutEnlargement: true
                })
                .webp({ quality: 82 })
                .toFile(outputPath);
            console.log(`✨ [相片牆大圖] 轉換完成: ${path.relative(__dirname, outputPath)}`);
        }

        // 轉換成功後，自動刪除肥大的原始檔案，節省空間
        fs.unlinkSync(filePath);
        console.log(`🗑️  [自動清理] 已刪除原始檔: ${path.basename(filePath)}`);

    } catch (err) {
        console.error(`❌ 壓縮失敗，保留原始檔: ${filePath}`, err.message);
    }
}

// 遞迴掃描資料夾
async function scanDirectory(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`⚠️ 目錄不存在: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            await scanDirectory(fullPath);
        } else if (SUPPORTED_EXTS.includes(path.extname(file).toLowerCase())) {
            await processImage(fullPath);
        }
    }
}

(async () => {
    console.log('🚀 開始掃描並壓縮 gallery-omakase 內的圖檔...');
    await scanDirectory(TARGET_DIR);
    console.log('🎉 所有圖片已轉換為 WebP 並清理原始檔完畢！');
})();