# API 文档

## 基础信息

- 基础URL: `http://localhost:3000/api`
- 所有请求都使用 HTTP GET 方法
- 响应格式: JSON

## 认证

部分 API 需要在 Header 中携带 token:

```bash
Authorization: Bearer <your_token>
```

## 接口列表

### 1. 获取 K 线数据

#### 请求

```http
GET /klines
```

#### 参数

| 参数 | 类型 | 必选 | 说明 | 示例 |
|------|------|------|------|------|
| exchange | string | 是 | 交易所名称 | binance |
| symbol | string | 是 | 交易对 | BTC/USDT |
| timeframe | string | 是 | 时间周期 | 1d |
| limit | number | 否 | 返回数量 | 100 |

#### 响应

```json
{
  "code": 0,
  "data": [
    {
      "timestamp": 1632960000000,
      "open": "41235.5",
      "high": "41521.8",
      "low": "40988.2",
      "close": "41126.3",
      "volume": "2145.8"
    }
    // ...
  ]
}
```

### 2. 获取预测结果

#### 请求

```http
GET /predict
```

#### 参数

| 参数 | 类型 | 必选 | 说明 | 示例 |
|------|------|------|------|------|
| symbol | string | 是 | 交易对 | BTC/USDT |
| timeframe | string | 否 | 预测周期 | 1d |

#### 响应

```json
{
  "code": 0,
  "data": {
    "prediction": "up",
    "probability": 0.75,
    "nextTarget": 42150.5,
    "timeframe": "24h"
  }
}
```

### 3. 获取市场分析

#### 请求

```http
GET /analysis
```

#### 参数

| 参数 | 类型 | 必选 | 说明 | 示例 |
|------|------|------|------|------|
| symbol | string | 是 | 交易对 | BTC/USDT |
| type | string | 否 | 分析类型 | trend |

#### 响应

```json
{
  "code": 0,
  "data": {
    "trend": "bullish",
    "strength": 0.8,
    "support": 40000,
    "resistance": 42000,
    "indicators": {
      "rsi": 65,
      "macd": "positive"
    }
  }
}
```

## 错误码说明

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 认证失败 |
| 2001 | 数据获取失败 |
| 2002 | 预测失败 |
| 5000 | 服务器内部错误 |

## 使用限制

- 每个 IP 每分钟最多 60 次请求
- WebSocket 连接数每个 IP 最多 5 个
- 历史数据最多获取近 90 天

## 示例代码

### Node.js

```javascript
const axios = require('axios');

async function getKlineData() {
  try {
    const response = await axios.get('http://localhost:3000/api/klines', {
      params: {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        timeframe: '1d'
      }
    });
    console.log(response.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

### Python

```python
import requests

def get_kline_data():
    try:
        response = requests.get(
            'http://localhost:3000/api/klines',
            params={
                'exchange': 'binance',
                'symbol': 'BTC/USDT',
                'timeframe': '1d'
            }
        )
        return response.json()
    except Exception as e:
        print(f'Error: {str(e)}')
```

## WebSocket API

### 连接

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
```

### 订阅实时数据

```javascript
ws.send(JSON.stringify({
  event: 'subscribe',
  channel: 'kline',
  symbol: 'BTC/USDT',
  timeframe: '1m'
}));
```

### 消息格式

```javascript
{
  event: 'kline',
  data: {
    symbol: 'BTC/USDT',
    timestamp: 1632960000000,
    price: 41235.5
  }
}
```

## 更新日志

### v1.0.0 (2024-12-31)
- 首次发布
- 支持基础 K 线数据获取
- 支持预测功能