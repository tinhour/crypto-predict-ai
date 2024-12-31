const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

// 确保目录存在
async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// 保存数据到文件
async function saveData(data, filename) {
    await ensureDir(config.DATA_DIR);
    const filePath = path.join(config.DATA_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`数据已保存到: ${filePath}`);
}

// 格式化时间戳
function formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString().split('T')[0];
}

module.exports = {
    ensureDir,
    saveData,
    formatTimestamp
}; 