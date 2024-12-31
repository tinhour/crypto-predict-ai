const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./utils/logger');
const BTCPeriodClassifier = require('./ml/model');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');

// 创建路由实例
const router = express.Router();

// 设置速率限制
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    headers: true,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: '请求频率超限'
        }
    }
});

// 应用速率限制
router.use(limiter);

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
    logger.error('API错误:', err);
    res.status(500).json({
        success: false,
        error: {
            code: 'SERVER_ERROR',
            message: '服务器内部错误'
        }
    });
};

// 1. K线数据接口
router.get('/klines', async (req, res, next) => {
    try {
        const { exchange, timeframe, start, end, limit } = req.query;
        
        // 验证交易所参数
        const normalizedExchange = exchange?.toLowerCase();
        if (!['binance', 'huobi', 'okx'].includes(normalizedExchange)) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_EXCHANGE',
                    message: '无效的交易所名称'
                }
            });
        }

        // 读取验证后的数据
        const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
        
        // 检查文件是否存在
        try {
            await fs.access(dataPath);
        } catch (error) {
            logger.error('数据文件不存在:', dataPath);
            return res.status(500).json({
                success: false,
                error: {
                    code: 'DATA_FILE_NOT_FOUND',
                    message: '数据文件不存在'
                }
            });
        }

        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        
        // 检查数据是否为空
        if (!data || !Array.isArray(data) || data.length === 0) {
            logger.error('数据文件为空或格式错误');
            return res.status(500).json({
                success: false,
                error: {
                    code: 'INVALID_DATA',
                    message: '数据文件为空或格式错误'
                }
            });
        }

        // 首先转换数据格式
        let processedData = data.map(d => {
            const exchangeData = d.exchanges[normalizedExchange] || 
                               d.exchanges[normalizedExchange.charAt(0).toUpperCase() + normalizedExchange.slice(1)];
            if (!exchangeData) return null;
            
            return {
                date: d.date,
                open: parseFloat(exchangeData.open),
                high: parseFloat(exchangeData.high),
                low: parseFloat(exchangeData.low),
                close: parseFloat(exchangeData.close),
                volume: parseFloat(exchangeData.volume),
                trades: exchangeData.trades
            };
        }).filter(Boolean);

        // 时间范围过滤
        if (start) {
            processedData = processedData.filter(d => new Date(d.date) >= new Date(Number(start)));
        }
        if (end) {
            processedData = processedData.filter(d => new Date(d.date) <= new Date(Number(end)));
        }
        
        // 处理时间周期
        if (timeframe && timeframe !== '1D') {
            processedData = processTimeframe(processedData, timeframe);
        }
        
        // 限制返回数量
        if (limit) {
            processedData = processedData.slice(-Number(limit));
        }

        if (processedData.length === 0) {
            logger.warn(`未找到交易所 ${exchange} 的数据`);
            return res.json({
                success: true,
                data: [],
                warning: `未找到交易所 ${exchange} 的数据`
            });
        }

        res.json({
            success: true,
            data: processedData
        });
    } catch (error) {
        logger.error('处理K线数据时出错:', error);
        next(error);
    }
});

// 2. 市场预测接口
router.get('/predict', async (req, res) => {
    try {
        const { exchange, days = 7 } = req.query;
        
        // 验证参数
        if (!exchange) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PARAMS',
                    message: '缺少交易所参数'
                }
            });
        }

        // 加载模型
        const classifier = new BTCPeriodClassifier();
        await classifier.loadModel(path.join(__dirname, '../models/btc_period_classifier'));
        
        // 获取最近数据进行预测
        const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        const recentData = data.slice(-270); // 使用最近270天数据
        
        // 进行预测
        const prediction = await classifier.predict(recentData);
        
        res.json({
            success: true,
            data: {
                date: new Date().toISOString().split('T')[0],
                prediction,
                confidence: calculateConfidence(prediction)
            }
        });
    } catch (error) {
        next(error);
    }
});

// 3. 交易所数据对比接口
router.get('/compare', async (req, res) => {
    try {
        const { exchanges, date } = req.query;
        
        if (!exchanges) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PARAMS',
                    message: '缺少交易所参数'
                }
            });
        }

        const exchangeList = exchanges.split(',');
        const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        
        // 获取指定日期或最新数据
        const targetDate = date || data[data.length - 1].date;
        const targetData = data.find(d => d.date === targetDate);
        
        if (!targetData) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'DATA_NOT_FOUND',
                    message: '未找到指定日期的数据'
                }
            });
        }
        
        // 计算比较数据
        const comparisons = {};
        let volumeTotal = 0;
        
        exchangeList.forEach(exchange => {
            const exchangeData = targetData.exchanges[exchange];
            if (exchangeData) {
                volumeTotal += exchangeData.volume;
                comparisons[exchange] = {
                    price: exchangeData.close,
                    volume: exchangeData.volume,
                    marketShare: 0 // 稍后计算
                };
            }
        });
        
        // 计算市场份额
        Object.keys(comparisons).forEach(exchange => {
            comparisons[exchange].marketShare = comparisons[exchange].volume / volumeTotal;
        });
        
        // 计算价格偏差
        const prices = Object.values(comparisons).map(c => c.price);
        const priceDeviation = calculatePriceDeviation(prices);
        
        res.json({
            success: true,
            data: {
                date: targetDate,
                comparisons,
                priceDeviation,
                volumeTotal
            }
        });
    } catch (error) {
        next(error);
    }
});

// 4. 历史数据统计接口
router.get('/stats', async (req, res) => {
    try {
        const { exchange, period = '1M' } = req.query;
        
        if (!exchange) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PARAMS',
                    message: '缺少交易所参数'
                }
            });
        }

        const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        
        // 根据周期筛选数据
        const periodData = filterDataByPeriod(data, period);
        const exchangeData = periodData.map(d => d.exchanges[exchange]).filter(Boolean);
        
        // 计算统计数据
        const stats = calculateStats(exchangeData);
        
        res.json({
            success: true,
            data: {
                period,
                stats
            }
        });
    } catch (error) {
        next(error);
    }
});

// WebSocket 服务器设置移到 server.js 中

// 辅助函数
function processTimeframe(data, timeframe) {
    if (!['1D', '1W', '1M'].includes(timeframe)) {
        throw new Error('无效的时间周期');
    }

    const groupedData = {};
    
    data.forEach(item => {
        let key;
        const date = new Date(item.date);
        
        switch(timeframe) {
            case '1W':
                // 获取周的第一天
                const firstDay = new Date(date);
                firstDay.setDate(date.getDate() - date.getDay());
                key = firstDay.toISOString().split('T')[0];
                break;
            case '1M':
                // 获取月的第一天
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
                break;
            default:
                key = item.date;
        }
        
        if (!groupedData[key]) {
            groupedData[key] = {
                date: key,
                open: item.open,  // 第一个价格作为开盘价
                high: item.high,
                low: item.low,
                close: item.close,
                volume: item.volume || 0,
                trades: item.trades || 0
            };
        } else {
            // 更新最高价和最低价
            groupedData[key].high = Math.max(groupedData[key].high, item.high);
            groupedData[key].low = Math.min(groupedData[key].low, item.low);
            // 最后一个价格作为收盘价
            groupedData[key].close = item.close;
            // 累加成交量和成交笔数
            groupedData[key].volume += (item.volume || 0);
            groupedData[key].trades += (item.trades || 0);
        }
    });

    // 按时间排序
    return Object.values(groupedData).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calculateConfidence(prediction) {
    // 计算预测置信度
    // 1. 检查预测值的分布
    // 2. 计算主导趋势的强度
    const values = [prediction.uptrend, prediction.downtrend, prediction.sideways];
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    
    // 主导趋势的占比越高，置信度越高
    const dominance = max / sum;
    
    // 其他趋势的分散程度也影响置信度
    const others = values.filter(v => v !== max);
    const variance = others.reduce((acc, val) => acc + Math.pow(val - (sum - max) / 2, 2), 0) / others.length;
    
    // 综合计算置信度 (0-1之间)
    const confidence = (dominance * 0.7 + (1 - Math.sqrt(variance)) * 0.3);
    
    return Math.min(Math.max(confidence, 0), 1);
}

function calculatePriceDeviation(prices) {
    if (prices.length < 2) return 0;
    
    // 计算平均价格
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    // 计算标准差
    const variance = prices.reduce((acc, price) => {
        return acc + Math.pow(price - avgPrice, 2);
    }, 0) / prices.length;
    
    const stdDev = Math.sqrt(variance);
    
    // 返回相对标准差（变异系数）
    return stdDev / avgPrice;
}

function filterDataByPeriod(data, period) {
    const now = new Date();
    let startDate;
    
    switch(period) {
        case '1M':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
        case '3M':
            startDate = new Date(now.setMonth(now.getMonth() - 3));
            break;
        case '6M':
            startDate = new Date(now.setMonth(now.getMonth() - 6));
            break;
        case '1Y':
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
        default:
            throw new Error('无效的时间周期');
    }
    
    return data.filter(item => new Date(item.date) >= startDate);
}

function calculateStats(data) {
    if (!data.length) {
        return {
            highest: 0,
            lowest: 0,
            average: 0,
            volatility: 0,
            volumeAvg: 0,
            trendsCount: {
                uptrend: 0,
                downtrend: 0,
                sideways: 0
            }
        };
    }
    
    // 计算基本统计数据
    const highest = Math.max(...data.map(d => d.high));
    const lowest = Math.min(...data.map(d => d.low));
    const closes = data.map(d => d.close);
    const average = closes.reduce((a, b) => a + b, 0) / closes.length;
    
    // 计算波动率（使用收盘价的标准差）
    const variance = closes.reduce((acc, price) => {
        return acc + Math.pow(price - average, 2);
    }, 0) / closes.length;
    const volatility = Math.sqrt(variance) / average;
    
    // 计算平均成交量
    const volumeAvg = data.reduce((acc, d) => acc + d.volume, 0) / data.length;
    
    // 计算趋势统计
    const trendsCount = {
        uptrend: 0,
        downtrend: 0,
        sideways: 0
    };
    
    // 使用收盘价变化判断趋势
    for (let i = 1; i < data.length; i++) {
        const priceChange = (data[i].close - data[i-1].close) / data[i-1].close;
        if (priceChange > 0.01) { // 涨幅超过1%
            trendsCount.uptrend++;
        } else if (priceChange < -0.01) { // 跌幅超过1%
            trendsCount.downtrend++;
        } else {
            trendsCount.sideways++;
        }
    }
    
    return {
        highest,
        lowest,
        average,
        volatility,
        volumeAvg,
        trendsCount
    };
}

function handlePriceSubscription(ws, exchange) {
    if (!['binance', 'huobi', 'okx'].includes(exchange?.toLowerCase())) {
        ws.send(JSON.stringify({
            type: 'error',
            message: '无效的交易所名称'
        }));
        return;
    }
    
    // 设置心跳检测
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);
    
    // 模拟价格更新
    const priceInterval = setInterval(async () => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                // 读取最新数据
                const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
                const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
                const latestData = data[data.length - 1].exchanges[exchange];
                
                ws.send(JSON.stringify({
                    type: 'price',
                    exchange,
                    data: {
                        price: latestData.close,
                        timestamp: Date.now()
                    }
                }));
            } catch (error) {
                logger.error('WebSocket数据发送错误:', error);
            }
        }
    }, 1000);
    
    // 清理资源
    ws.on('close', () => {
        clearInterval(pingInterval);
        clearInterval(priceInterval);
    });
}

// 应用错误处理中间件
router.use(errorHandler);

// 导出路由而不是应用
module.exports = router; 