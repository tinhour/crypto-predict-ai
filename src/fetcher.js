const axios = require('axios');
const dns = require('dns').promises;
const config = require('./config');
const { formatTimestamp } = require('./utils');
const moment = require('moment');

class PriceFetcher {
    constructor() {
        this.currentEndpointIndex = 0;
        this.baseURL = config.API_ENDPOINTS[0];
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 切换到下一个API端点
    switchEndpoint() {
        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % config.API_ENDPOINTS.length;
        this.baseURL = config.API_ENDPOINTS[this.currentEndpointIndex];
        console.log(`切换到API端点: ${this.baseURL}`);
    }

    // 检查域名是否可以解析
    async checkDNS(hostname) {
        try {
            const domain = hostname.replace('https://', '').replace('http://', '');
            await dns.lookup(domain);
            return true;
        } catch (error) {
            console.error(`DNS解析失败: ${hostname}`, error.message);
            return false;
        }
    }

    // 获取K线数据
    async fetchKlines(startTime = null, endTime = null) {
        return this.makeRequest('/api/v3/klines', {
            symbol: config.SYMBOL,
            interval: config.INTERVAL,
            limit: config.LIMIT,
            startTime,
            endTime
        });
    }

    // 获取24小时价格统计
    async fetch24hrStats() {
        return this.makeRequest('/api/v3/ticker/24hr', {
            symbol: config.SYMBOL
        });
    }

    // 获取最新价格
    async fetchCurrentPrice() {
        return this.makeRequest('/api/v3/ticker/price', {
            symbol: config.SYMBOL
        });
    }

    // 获取交易深度
    async fetchOrderBook(limit = 100) {
        return this.makeRequest('/api/v3/depth', {
            symbol: config.SYMBOL,
            limit
        });
    }

    // 通用请求方法
    async makeRequest(endpoint, params) {
        for (let attempt = 0; attempt < config.MAX_RETRIES; attempt++) {
            try {
                // 检查当前端点是否可用
                const isAvailable = await this.checkDNS(this.baseURL);
                if (!isAvailable) {
                    this.switchEndpoint();
                    continue;
                }

                const response = await axios.get(`${this.baseURL}${endpoint}`, {
                    params,
                    timeout: 5000,  // 设置超时时间
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                return response.data;
            } catch (error) {
                console.error(`尝试 ${attempt + 1}/${config.MAX_RETRIES} 失败:`, error.message);
                
                if (attempt === config.MAX_RETRIES - 1) {
                    throw new Error(`在 ${config.MAX_RETRIES} 次尝试后获取数据失败`);
                }

                this.switchEndpoint();
                await this.sleep(config.RETRY_DELAY);
            }
        }
    }

    // 获取指定时间范围的所有数据
    async fetchAllData(startTime, endTime) {
        let allData = [];
        let currentStartTime = startTime;
        let failureCount = 0;
        const MAX_FAILURES = 10;  // 最大连续失败次数

        while (currentStartTime < endTime) {
            try {
                const data = await this.fetchKlines(currentStartTime, endTime);
                if (!data || data.length === 0) {
                    console.log('没有更多数据了');
                    break;
                }

                allData = allData.concat(data);
                currentStartTime = new Date(data[data.length - 1][6]).getTime() + 1;
                
                // 重置失败计数
                failureCount = 0;
                
                // 计算和显示进度
                const progress = ((currentStartTime - startTime) / (endTime - startTime) * 100).toFixed(2);
                const currentDate = moment(currentStartTime).format('YYYY-MM-DD');
                console.log(`进度: ${progress}% (当前日期: ${currentDate})`);
                
                // 增加延迟以避免触发频率限制
                await this.sleep(300);  // 降低延迟以加快获取速度
                
                // 每获取100条数据后增加额外延迟
                if (allData.length % 100 === 0) {
                    console.log('正在进行请求限制保护延迟...');
                    await this.sleep(2000);
                }
            } catch (error) {
                console.error('获取数据块失败:', error.message);
                failureCount++;
                
                if (failureCount >= MAX_FAILURES) {
                    console.error('连续失败次数过多，终止获取');
                    break;
                }
                
                // 如果失败，增加重试延迟
                await this.sleep(5000);
                
                // 尝试切换端点
                this.switchEndpoint();
            }
        }

        return allData;
    }
}

module.exports = PriceFetcher; 