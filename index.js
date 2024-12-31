const BinanceExchange = require('./src/exchanges/BinanceExchange');
const OKXExchange = require('./src/exchanges/OKXExchange');
const HuobiExchange = require('./src/exchanges/HuobiExchange');
const { saveData } = require('./src/utils');
const moment = require('moment');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const fs = require('fs').promises;
const path = require('path');

async function fetchExchangeData(exchange, startTime, endTime) {
    console.log(`\n开始获取 ${exchange.name} 的比特币历史数据...`);
    const data = await exchange.fetchKlines(startTime, endTime);
    
    // 保存数据
    const filename = `btc_price_${exchange.name.toLowerCase()}_${moment(startTime).format('YYYYMMDD')}_${moment(endTime).format('YYYYMMDD')}.json`;
    await saveData(data, filename);
    
    console.log(`${exchange.name} 数据获取完成，共 ${data.length} 条记录`);
    // 返回时添加交易所信息
    return {
        name: exchange.name,
        data: data
    };
}

function mergeExchangeData(results) {
    const mergedMap = new Map();
    
    results.forEach(result => {
        if (!result || !result.data) return;
        
        // 使用 result.data 而不是直接使用 result
        result.data.forEach(dayData => {
            if (!mergedMap.has(dayData.date)) {
                mergedMap.set(dayData.date, {
                    date: dayData.date,
                    exchanges: {}
                });
            }
            // 使用 result.name 作为交易所名称
            mergedMap.get(dayData.date).exchanges[result.name] = dayData;
        });
    });
    
    // 将结果转换为数组并按日期排序
    return Array.from(mergedMap.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// 添加数据验证函数
function validateData(mergedData) {
    const validationResults = {
        valid: [],
        anomalies: {
            priceDiff: [],      // 价格差异异常
            volumeSpikes: [],    // 交易量异常
            dataMissing: [],     // 数据缺失
            priceGaps: []        // 价格跳跃
        },
        stats: {
            totalDays: 0,
            validDays: 0,
            exchangeCoverage: {}
        }
    };

    // 遍历每一天的数据
    mergedData.forEach((dayData, index) => {
        const exchanges = Object.keys(dayData.exchanges);
        let isValidDay = true;
        
        // 1. 基础数据完整性检查
        const dataCompleteness = exchanges.every(exchange => {
            const data = dayData.exchanges[exchange];
            return data && 
                   !isNaN(data.open) && 
                   !isNaN(data.high) && 
                   !isNaN(data.low) && 
                   !isNaN(data.close) && 
                   !isNaN(data.volume);
        });

        if (!dataCompleteness) {
            validationResults.anomalies.dataMissing.push({
                date: dayData.date,
                exchanges: exchanges
            });
            isValidDay = false;
        }

        // 2. 价格异常检查
        if (exchanges.length > 1) {
            const prices = exchanges.map(e => dayData.exchanges[e].close);
            const avgPrice = prices.reduce((a, b) => a + b) / prices.length;
            const maxDiff = Math.max(...prices) - Math.min(...prices);
            const diffPercent = (maxDiff / avgPrice) * 100;

            // 如果交易所间价格差异超过1%
            if (diffPercent > 1) {
                validationResults.anomalies.priceDiff.push({
                    date: dayData.date,
                    diffPercent: diffPercent.toFixed(2) + '%',
                    prices: exchanges.reduce((obj, e) => {
                        obj[e] = dayData.exchanges[e].close;
                        return obj;
                    }, {})
                });
            }
        }

        // 3. 交易量异常检查
        exchanges.forEach(exchange => {
            const data = dayData.exchanges[exchange];
            if (index > 0 && index < mergedData.length - 1) {
                const prevDay = mergedData[index - 1].exchanges[exchange];
                const nextDay = mergedData[index + 1].exchanges[exchange];
                
                if (prevDay && nextDay) {
                    const avgVolume = (prevDay.volume + nextDay.volume) / 2;
                    const volumeChange = Math.abs(data.volume - avgVolume) / avgVolume;
                    
                    // 如果交易量突变超过200%
                    if (volumeChange > 2) {
                        validationResults.anomalies.volumeSpikes.push({
                            date: dayData.date,
                            exchange,
                            change: (volumeChange * 100).toFixed(2) + '%'
                        });
                    }
                }
            }
        });

        // 4. 价格连续性检查
        exchanges.forEach(exchange => {
            const data = dayData.exchanges[exchange];
            if (index > 0) {
                const prevDay = mergedData[index - 1].exchanges[exchange];
                if (prevDay) {
                    const priceChange = Math.abs(data.close - prevDay.close) / prevDay.close;
                    
                    // 如果价格跳跃超过20%
                    if (priceChange > 0.2) {
                        validationResults.anomalies.priceGaps.push({
                            date: dayData.date,
                            exchange,
                            change: (priceChange * 100).toFixed(2) + '%'
                        });
                    }
                }
            }
        });

        // 更新统计信息
        validationResults.stats.totalDays++;
        if (isValidDay) {
            validationResults.stats.validDays++;
            validationResults.valid.push(dayData);
        }
        
        // 统计每个交易所的数据覆盖率
        exchanges.forEach(exchange => {
            validationResults.stats.exchangeCoverage[exchange] = 
                (validationResults.stats.exchangeCoverage[exchange] || 0) + 1;
        });
    });

    return validationResults;
}

// 添加统计分析函数
function analyzeData(mergedData) {
    const analysis = {
        price: {
            highest: { value: 0, date: '', exchange: '' },
            lowest: { value: Infinity, date: '', exchange: '' },
            averages: {},  // 每个交易所的平均价格
            volatility: {} // 每个交易所的价格波动率
        },
        volume: {
            highest: { value: 0, date: '', exchange: '' },
            daily: {},     // 每个交易所的日均交易量
            total: {},     // 每个交易所的总交易量
            marketShare: {} // 每个交易所的市场份额
        },
        trends: {
            upDays: {},    // 上涨天数
            downDays: {},  // 下跌天数
            flatDays: {},  // 平盘天数
            maxUpStreak: {},   // 最长连续上涨���数
            maxDownStreak: {}  // 最长连续下跌天数
        },
        timeStats: {
            byYear: {},    // 年度统计
            byMonth: {},   // 月度统计
            byWeekday: {}  // 周度统计
        }
    };

    // 遍历数据进行统计
    mergedData.forEach((dayData, index) => {
        const exchanges = Object.keys(dayData.exchanges);
        
        exchanges.forEach(exchange => {
            const data = dayData.exchanges[exchange];
            
            // 1. 价格统计
            if (data.close > analysis.price.highest.value) {
                analysis.price.highest = {
                    value: data.close,
                    date: dayData.date,
                    exchange
                };
            }
            if (data.close < analysis.price.lowest.value) {
                analysis.price.lowest = {
                    value: data.close,
                    date: dayData.date,
                    exchange
                };
            }
            
            // 计算每个交易所的价格数据
            if (!analysis.price.averages[exchange]) {
                analysis.price.averages[exchange] = {
                    sum: 0,
                    count: 0,
                    prices: [] // 用于计算波动率
                };
            }
            analysis.price.averages[exchange].sum += data.close;
            analysis.price.averages[exchange].count++;
            analysis.price.averages[exchange].prices.push(data.close);

            // 2. 交易量统计
            if (!analysis.volume.daily[exchange]) {
                analysis.volume.daily[exchange] = {
                    sum: 0,
                    count: 0
                };
            }
            analysis.volume.daily[exchange].sum += data.volume;
            analysis.volume.daily[exchange].count++;
            
            if (data.volume > analysis.volume.highest.value) {
                analysis.volume.highest = {
                    value: data.volume,
                    date: dayData.date,
                    exchange
                };
            }

            // 3. 趋势统计
            if (!analysis.trends.upDays[exchange]) {
                analysis.trends.upDays[exchange] = 0;
                analysis.trends.downDays[exchange] = 0;
                analysis.trends.flatDays[exchange] = 0;
                analysis.trends.maxUpStreak[exchange] = 0;
                analysis.trends.maxDownStreak[exchange] = 0;
            }

            if (index > 0) {
                const prevDay = mergedData[index - 1].exchanges[exchange];
                if (prevDay) {
                    const priceChange = data.close - prevDay.close;
                    if (priceChange > 0) analysis.trends.upDays[exchange]++;
                    else if (priceChange < 0) analysis.trends.downDays[exchange]++;
                    else analysis.trends.flatDays[exchange]++;
                }
            }

            // 4. 时间维度统计
            const date = moment(dayData.date);
            const year = date.format('YYYY');
            const month = date.format('YYYY-MM');
            const weekday = date.format('dddd');

            // 年度统计
            if (!analysis.timeStats.byYear[year]) {
                analysis.timeStats.byYear[year] = {
                    avgPrice: { sum: 0, count: 0 },
                    totalVolume: 0,
                    volatility: []
                };
            }
            analysis.timeStats.byYear[year].avgPrice.sum += data.close;
            analysis.timeStats.byYear[year].avgPrice.count++;
            analysis.timeStats.byYear[year].totalVolume += data.volume;
            analysis.timeStats.byYear[year].volatility.push(data.close);

            // 月度统计
            if (!analysis.timeStats.byMonth[month]) {
                analysis.timeStats.byMonth[month] = {
                    avgPrice: { sum: 0, count: 0 },
                    totalVolume: 0
                };
            }
            analysis.timeStats.byMonth[month].avgPrice.sum += data.close;
            analysis.timeStats.byMonth[month].avgPrice.count++;
            analysis.timeStats.byMonth[month].totalVolume += data.volume;

            // 周度统计
            if (!analysis.timeStats.byWeekday[weekday]) {
                analysis.timeStats.byWeekday[weekday] = {
                    avgPrice: { sum: 0, count: 0 },
                    totalVolume: 0
                };
            }
            analysis.timeStats.byWeekday[weekday].avgPrice.sum += data.close;
            analysis.timeStats.byWeekday[weekday].avgPrice.count++;
            analysis.timeStats.byWeekday[weekday].totalVolume += data.volume;
        });
    });

    // 计算最终统计结果
    // 1. 计算波动率
    Object.keys(analysis.price.averages).forEach(exchange => {
        const prices = analysis.price.averages[exchange].prices;
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push(Math.log(prices[i] / prices[i-1]));
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        analysis.price.volatility[exchange] = Math.sqrt(variance * 252) * 100; // 年化波动率
    });

    // 2. 计算市场份额
    const totalVolume = Object.values(analysis.volume.daily).reduce((sum, data) => sum + data.sum, 0);
    Object.keys(analysis.volume.daily).forEach(exchange => {
        analysis.volume.marketShare[exchange] = (analysis.volume.daily[exchange].sum / totalVolume * 100).toFixed(2) + '%';
    });

    return analysis;
}

// 添加获取最新数据日期的函数
async function getLatestDataDate() {
    try {
        // 读取验证后的数据文件
        const validatedPath = path.join(__dirname, 'data', 'btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(validatedPath, 'utf8'));
        
        if (data && data.length > 0) {
            // 返回最后一条数据的日期
            return moment(data[data.length - 1].date);
        }
    } catch (error) {
        console.log('未找到现有数据，将进行全量获取');
    }
    return null;
}

// 添加数据合并函数
async function mergeWithExistingData(newData) {
    try {
        const validatedPath = path.join(__dirname, 'data', 'btc_price_validated.json');
        const existingData = JSON.parse(await fs.readFile(validatedPath, 'utf8'));
        
        // 创建日期索引
        const dateIndex = new Map(existingData.map(item => [item.date, item]));
        
        // 合并新数据
        newData.forEach(item => {
            dateIndex.set(item.date, item);
        });
        
        // 转换回数组并排序
        return Array.from(dateIndex.values())
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
        console.log('未找到现有数据，返回新数据');
        return newData;
    }
}

async function main() {
    try {
        // 解析命令行参数
        const argv = yargs(hideBin(process.argv))
            .option('mode', {
                alias: 'm',
                type: 'string',
                description: '获取模式：full或increment',
                default: 'full'
            })
            .argv;

        const endTime = new Date().getTime();
        let startTime;

        if (argv.mode === 'increment') {
            // 获取最新数据日期
            const latestDate = await getLatestDataDate();
            if (latestDate) {
                startTime = latestDate.add(1, 'day').valueOf();
                console.log(`增量获取数据，开始日期: ${moment(startTime).format('YYYY-MM-DD')}`);
            } else {
                startTime = moment('2017-07-01').valueOf();
                console.log('未找到现有数据，将进行全量获取');
            }
        } else {
            startTime = moment('2017-07-01').valueOf();
            console.log('执行全量数据获取');
        }

        const exchanges = [
            new BinanceExchange(),
            new OKXExchange(),
            new HuobiExchange()
        ];

        // 获取数据
        const results = await Promise.all(
            exchanges.map(exchange => 
                fetchExchangeData(exchange, startTime, endTime)
                    .catch(error => {
                        console.error(`${exchange.name} 数据获取失败:`, error.message);
                        return null;
                    })
            )
        );

        const validResults = results.filter(result => result !== null);
        if (validResults.length > 0) {
            const mergedData = mergeExchangeData(validResults);
            const validation = validateData(mergedData);
            const analysis = analyzeData(mergedData);

            if (argv.mode === 'increment') {
                // 合并新旧数据
                validation.valid = await mergeWithExistingData(validation.valid);
                console.log(`合并后总数据条数: ${validation.valid.length}`);
            }

            // 保存数据
            await saveData(validation.valid, 'btc_price_validated.json');
            await saveData(validation.anomalies, 'btc_price_anomalies.json');
            await saveData(analysis, 'btc_price_analysis.json');

            // 打印验证统计
            console.log('\n数据验证统计:');
            console.log(`总天数: ${validation.stats.totalDays}`);
            console.log(`有效天数: ${validation.stats.validDays}`);
            console.log(`数据完整率: ${((validation.stats.validDays / validation.stats.totalDays) * 100).toFixed(2)}%`);
            
            console.log('\n交易所数据覆盖率:');
            Object.entries(validation.stats.exchangeCoverage).forEach(([exchange, days]) => {
                console.log(`${exchange}: ${((days / validation.stats.totalDays) * 100).toFixed(2)}%`);
            });
            
            console.log('\n异常统计:');
            console.log(`价格差异异常: ${validation.anomalies.priceDiff.length}条`);
            console.log(`交易量异常: ${validation.anomalies.volumeSpikes.length}条`);
            console.log(`数据缺失: ${validation.anomalies.dataMissing.length}条`);
            console.log(`价格跳跃: ${validation.anomalies.priceGaps.length}条`);
            
            console.log('\n价格统计:');
            console.log(`历史最高: $${analysis.price.highest.value} (${analysis.price.highest.date} on ${analysis.price.highest.exchange})`);
            console.log(`历史最低: $${analysis.price.lowest.value} (${analysis.price.lowest.date} on ${analysis.price.lowest.exchange})`);
            
            console.log('\n波动率统计:');
            Object.entries(analysis.price.volatility).forEach(([exchange, volatility]) => {
                console.log(`${exchange}: ${volatility.toFixed(2)}%`);
            });
            
            console.log('\n市场份额:');
            Object.entries(analysis.volume.marketShare).forEach(([exchange, share]) => {
                console.log(`${exchange}: ${share}`);
            });
            
            console.log('\n趋势统计:');
            Object.keys(analysis.trends.upDays).forEach(exchange => {
                const total = analysis.trends.upDays[exchange] + 
                            analysis.trends.downDays[exchange] + 
                            analysis.trends.flatDays[exchange];
                console.log(`\n${exchange}:`);
                console.log(`上涨天数: ${analysis.trends.upDays[exchange]} (${(analysis.trends.upDays[exchange]/total*100).toFixed(2)}%)`);
                console.log(`下跌天数: ${analysis.trends.downDays[exchange]} (${(analysis.trends.downDays[exchange]/total*100).toFixed(2)}%)`);
                console.log(`平盘天数: ${analysis.trends.flatDays[exchange]} (${(analysis.trends.flatDays[exchange]/total*100).toFixed(2)}%)`);
            });
        }
    } catch (error) {
        console.error('程序执行失败:', error.message);
        process.exit(1);
    }
}

function printComparison(results) {
    console.log('\n交易所数据比较:');
    results.forEach(result => {
        if (result && result.data) {
            console.log(`\n${result.name}:`);
            console.log(`数据条数: ${result.data.length}`);
            console.log(`日期范围: ${result.data[0].date} 到 ${result.data[result.data.length-1].date}`);
            
            // 计算平均成交量
            const avgVolume = result.data.reduce((sum, d) => sum + d.volume, 0) / result.data.length;
            console.log(`平均成交量: ${avgVolume.toFixed(2)} BTC`);
        }
    });
}

main(); 