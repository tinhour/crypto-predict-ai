const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('./utils/logger');
const backup = require('./utils/backup');

class Scheduler {
    constructor() {
        // 每天凌晨2点运行增量更新
        this.dailyUpdateJob = cron.schedule('0 2 * * *', () => {
            this.runIncrementalUpdate();
        });

        // 每周日凌晨3点运行全量更新和验证
        this.weeklyValidationJob = cron.schedule('0 3 * * 0', () => {
            this.runFullUpdate();
        });

        // 每天凌晨4点运行备份
        this.backupJob = cron.schedule('0 4 * * *', () => {
            this.runBackup();
        });
    }

    async runIncrementalUpdate() {
        logger.info('开始执行增量更新');
        try {
            const result = await this.spawnProcess('fetch:increment');
            logger.info('增量更新完成', { result });
        } catch (error) {
            logger.error('增量更新失败', error);
        }
    }

    async runFullUpdate() {
        logger.info('开始执行全量更新');
        try {
            const result = await this.spawnProcess('fetch:full');
            logger.info('全量更新完成', { result });
        } catch (error) {
            logger.error('全量更新失败', error);
        }
    }

    async runBackup() {
        logger.info('开始执行数据备份');
        try {
            await backup.backup();
            logger.info('数据备份完成');
        } catch (error) {
            logger.error('数据备份失败', error);
        }
    }

    spawnProcess(script) {
        return new Promise((resolve, reject) => {
            const child = spawn('npm', ['run', script], {
                cwd: path.join(__dirname, '..'),
                stdio: 'pipe'
            });

            let output = '';

            child.stdout.on('data', (data) => {
                output += data;
                logger.debug(data.toString());
            });

            child.stderr.on('data', (data) => {
                logger.error(data.toString());
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });
        });
    }

    start() {
        this.dailyUpdateJob.start();
        this.weeklyValidationJob.start();
        this.backupJob.start();
        logger.info('调度器已启动');
    }

    stop() {
        this.dailyUpdateJob.stop();
        this.weeklyValidationJob.stop();
        this.backupJob.stop();
        logger.info('调度器已停止');
    }
}

module.exports = new Scheduler(); 