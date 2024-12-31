const winston = require('winston');
const path = require('path');
const moment = require('moment');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        // 错误日志
        new winston.transports.File({ 
            filename: path.join(__dirname, '../../logs/error.log'), 
            level: 'error' 
        }),
        // 普通日志
        new winston.transports.File({ 
            filename: path.join(__dirname, '../../logs/combined.log')
        }),
        // 控制台输出
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

module.exports = logger; 