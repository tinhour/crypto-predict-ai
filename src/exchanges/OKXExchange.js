const axios = require('axios');
const BaseExchange = require('./BaseExchange');
const moment = require('moment');

class OKXExchange extends BaseExchange {
    constructor(config) {
        super(config);
        this.name = 'OKX';
        this.baseUrl = 'https://www.okx.com';
        this.backupUrls = [
            'https://aws.okx.com',     // AWS服务器
            'https://okx.com',         // 主域名
            'https://www.okex.com'     // 备用域名
        ];
        this.currentUrlIndex = 0;
    }

    switchEndpoint() {
        this.currentUrlIndex = (this.currentUrlIndex + 1) % (this.backupUrls.length + 1);
        this.baseUrl = this.currentUrlIndex === 0 ? 
            'https://www.okx.com' : 
            this.backupUrls[this.currentUrlIndex - 1];
        console.log(`切换到OKX API端点: ${this.baseUrl}`);
    }

    async fetchKlines(startTime, endTime) {
        let failureCount = 0;
        const MAX_FAILURES = 5;

        while (failureCount < MAX_FAILURES) {
            try {
                const response = await axios.get(`${this.baseUrl}/api/v5/market/history-candles`, {
                    params: {
                        instId: 'BTC-USDT',
                        bar: '1D',
                        before: moment(endTime).unix(),
                        after: moment(startTime).unix(),
                        limit: 100
                    },
                    timeout: 10000,  // 增加超时时间到10秒
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'OK-ACCESS-PASSPHRASE': ''  // 如果需要认证
                    },
                    // 添加代理配置（如果需要）
                    // proxy: {
                    //     host: 'your-proxy-host',
                    //     port: 'your-proxy-port'
                    // }
                });

                if (response.data && response.data.data) {
                    return this.formatData(response.data.data);
                }
                throw new Error('Invalid response format');
            } catch (error) {
                console.error(`OKX API error (attempt ${failureCount + 1}/${MAX_FAILURES}):`, error.message);
                failureCount++;
                
                if (failureCount >= MAX_FAILURES) {
                    throw new Error(`OKX API failed after ${MAX_FAILURES} attempts`);
                }
                
                this.switchEndpoint();
                await this.sleep(2000);
            }
        }
    }

    formatData(data) {
        return data.map(item => ({
            date: moment(parseInt(item[0])).format('YYYY-MM-DD'),
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
            volume: parseFloat(item[5]),
            quoteVolume: parseFloat(item[6])
        }));
    }
}

module.exports = OKXExchange; 