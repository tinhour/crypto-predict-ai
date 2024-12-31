const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const apiService = require('./service');
const WebSocket = require('ws');

const app = express();
const port = 3000;

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// 使用 API 服务路由
app.use('/api', apiService);

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
    logger.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        error: {
            code: 'SERVER_ERROR',
            message: '服务器内部错误'
        }
    });
});

// 创建 HTTP 服务器
const server = app.listen(port, () => {
    logger.info(`Web服务器运行在 http://localhost:${port}`);
});

// 设置 WebSocket 服务器
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'subscribe' && data.channel === 'price') {
                handlePriceSubscription(ws, data.exchange);
            }
        } catch (error) {
            logger.error('WebSocket错误:', error);
        }
    });
});

module.exports = app; 