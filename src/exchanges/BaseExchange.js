const dns = require('dns').promises;
const https = require('https');

class BaseExchange {
    constructor(config) {
        this.name = 'Unknown';
        this.baseUrl = '';
        this.config = config;
        // 创建自定义的 HTTPS agent
        this.httpsAgent = new https.Agent({
            keepAlive: true,
            timeout: 30000,  // 30秒超时
            rejectUnauthorized: false  // 在开发环境可以设置为 false
        });
    }

    // 检查域名是否可访问
    async checkDomain(url) {
        try {
            const hostname = new URL(url).hostname;
            await dns.lookup(hostname);
            return true;
        } catch (error) {
            console.error(`DNS lookup failed for ${url}: ${error.message}`);
            return false;
        }
    }

    // 添加重试机制的请求方法
    async makeRequest(url, options = {}, maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                if (!await this.checkDomain(url)) {
                    throw new Error('DNS lookup failed');
                }

                const response = await axios({
                    ...options,
                    url,
                    httpsAgent: this.httpsAgent,
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        ...options.headers
                    }
                });
                return response.data;
            } catch (error) {
                lastError = error;
                console.error(`Attempt ${i + 1}/${maxRetries} failed: ${error.message}`);
                await this.sleep(2000 * (i + 1)); // 指数退避
            }
        }
        throw lastError;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchKlines(startTime, endTime) {
        throw new Error('Method not implemented');
    }

    formatData(data) {
        throw new Error('Method not implemented');
    }
}

module.exports = BaseExchange; 