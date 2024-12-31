const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const logger = require('./logger');

class BackupService {
    constructor() {
        this.backupDir = path.join(__dirname, '../../backups');
    }

    async backup() {
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const backupPath = path.join(this.backupDir, timestamp);
        
        try {
            // 创建备份目录
            await fs.mkdir(backupPath, { recursive: true });
            
            // 备份数据文件
            const dataDir = path.join(__dirname, '../../data');
            const files = await fs.readdir(dataDir);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const sourcePath = path.join(dataDir, file);
                    const destPath = path.join(backupPath, file);
                    await fs.copyFile(sourcePath, destPath);
                }
            }
            
            logger.info(`数据备份完成: ${backupPath}`);
            
            // 清理旧备份（保留最近7天）
            await this.cleanOldBackups();
        } catch (error) {
            logger.error('数据备份失败:', error);
            throw error;
        }
    }

    async cleanOldBackups() {
        const backups = await fs.readdir(this.backupDir);
        const oldDate = moment().subtract(7, 'days');
        
        for (const backup of backups) {
            const backupDate = moment(backup.split('_')[0], 'YYYYMMDD');
            if (backupDate.isBefore(oldDate)) {
                await fs.rmdir(path.join(this.backupDir, backup), { recursive: true });
                logger.info(`清理旧备份: ${backup}`);
            }
        }
    }
}

module.exports = new BackupService(); 