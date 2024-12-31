module.exports = {
    // 使用多个备用API端点
    API_ENDPOINTS: [
        'https://api.binance.com',
        'https://api1.binance.com',
        'https://api2.binance.com',
        'https://api3.binance.com',
        // 添加币安的亚太区域API
        'https://api-apac.binance.com',
        // 添加币安的欧洲区域API
        'https://api-eu.binance.com'
    ],
    
    // 交易对
    SYMBOL: 'BTCUSDT',
    
    // 数据存储路径
    DATA_DIR: './data',
    
    // 时间间隔（1天的毫秒数）
    INTERVAL: '1d',
    
    // 每次请求的数据量限制
    LIMIT: 500,
    
    // 添加重试配置
    MAX_RETRIES: 5,
    RETRY_DELAY: 2000,  // 重试延迟（毫秒）
    
    // 添加代理配置（如果需要）
    PROXY: {
        host: 'your-proxy-host',  // 如果需要代理，填写代理地址
        port: 'your-proxy-port'   // 如果需要代理，填写代理端口
    }
}; 