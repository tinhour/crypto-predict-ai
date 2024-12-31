# Crypto Predict AI

[English](README_EN.md) | 简体中文

crypto-predict-ai 是一个比特币价格数据收集、分析和预测工具。使用机器学习模型分析比特币市场趋势，支持多交易所数据源。

![数据分析截图](https://github.com/tinhour/crypto-predict-ai/blob/master/screenshot/analysis.png?raw=true)

## ✨ 主要特性

- 📊 多交易所数据采集 (Binance、Huobi、OKX)
- 🤖 机器学习模型预测市场趋势
- 📈 交互式价格图表展示
- 🔄 自动数据同步和验证
- 📱 响应式 Web 界面
- 🛡️ 异常检测和数据验证

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 配置

复制配置模板并修改：

```bash
edit src/config.js
```

### 运行

```bash
# 全量数据获取
npm run fetch:full

# 增量更新,以增量模式获取比特币价格数据
npm run fetch:increment

# 启动 查看K线图服务器 Web 服务器
npm run start:web

# 启动调度器,定时获取比特币价格数据
npm run start:scheduler

# 训练模型:利用价格数据训练模型用于识别比特币价格阶段在上升期、下降期还是平稳期
npm run train

# 验证模型:验证模型识别的价格阶段结果在reports/market_analysis.html
npm run validate:exchanges  

```

## 📊 数据可视化

访问 `http://localhost:3000` 查看交互式图表：

- K线图表
- 成交量分析
- 趋势预测
- 多交易所对比

## 🛠️ 技术栈

- Node.js
- TensorFlow.js
- Express
- Plotly.js
- Winston
- Node-cron

## 📁 项目结构

```bash
crypto-predict-ai/
├── src/
│   ├── exchanges/    # 交易所接口
│   ├── ml/          # 机器学习模型
│   ├── utils/       # 工具函数
│   ├── config.js    # 配置文件
│   ├── server.js    # Web 服务
│   └── train.js     # 模型训练
├── data/            # 数据存储
├── models/          # 模型存储
├── public/          # 静态文件
└── reports/         # 分析报告
```

## 📈 功能特性

### 数据采集
- [x] 多交易所支持
- [x] 自动重试和故障转移
- [x] 增量更新
- [x] 数据验证

### 数据分析
- [x] 价格趋势分析
- [x] 交易量分析
- [x] 异常检测
- [x] 交易所对比

### 机器学习
- [x] 市场周期分类
- [x] 趋势预测
- [x] 模型训练可视化
- [x] 预测结果验证

### Web 界面
- [x] 实时价格图表
- [x] 技术指标显示
- [x] 预测结果展示
- [x] 响应式设计

## 📊 API 文档

### 获取 K 线数据
GET /api/klines?exchange=binance&timeframe=1D

### 获取预测结果

完整 API 文档请查看 [API.md](docs/API.md)

## ⚙️ 配置选项

| 参数 | 说明 | 默认值 |
|------|------|--------|
| API_ENDPOINTS | 交易所 API 端点 | [...] |
| INTERVAL | 数据时间间隔 | 1d |
| MAX_RETRIES | 最大重试次数 | 5 |

更多配置选项请查看 [config.js](src/config.js)

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📝 待办事项

- [ ] 添加更多交易所支持
- [ ] 优化预测模型
- [ ] 添加回测功能
- [ ] 实现实时预警
- [ ] WebSocket 支持

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 📧 联系方式

- 作者：[tinhour]
- 邮箱：[fangfeng335@gmail.com]

## 🙏 致谢

- TensorFlow.js 团队
- 各交易所的 API 支持