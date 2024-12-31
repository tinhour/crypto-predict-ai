const BTCPeriodClassifier = require('./ml/model');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');

// 定义标记的时期
const labeledPeriods = [
    { start: '2017-08-17', end: '2017-11-12', type: 3 }, // 平稳期
    { start: '2017-11-13', end: '2017-12-17', type: 1 }, // 上升期
    { start: '2017-12-18', end: '2018-02-06', type: 2 }, // 下降期
    { start: '2018-02-07', end: '2020-12-15', type: 3 }, // 平稳期
    { start: '2020-12-16', end: '2021-04-14', type: 1 }, // 上升期
    { start: '2021-04-15', end: '2021-07-21', type: 2 }, // 下降期
    { start: '2021-07-22', end: '2021-11-08', type: 1 }, // 上升期
    { start: '2021-11-09', end: '2022-06-18', type: 2 }, // 下降期
    { start: '2022-06-19', end: '2023-10-16', type: 3 }, // 平稳期
    { start: '2023-10-17', end: '2024-03-14', type: 1 }, // 上升期
    { start: '2024-03-15', end: '2024-11-06', type: 3 }, // 平稳期
    { start: '2024-11-07', end: '2024-12-20', type: 1 }  // 上升期
];

// 添加训练进度可视化
function drawProgressBar(progress, total, length = 50) {
    const filledLength = Math.round(length * progress / total);
    const empty = length - filledLength;
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(empty);
    return `[${progressBar}] ${Math.round((progress/total) * 100)}%`;
}

// 添加损失值和准确率图表
function drawChart(values, width = 50, height = 10) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const chart = Array(height).fill().map(() => Array(width).fill(' '));
    
    // 绘制数据点
    values.slice(-width).forEach((value, x) => {
        const y = Math.floor((height - 1) * (1 - (value - min) / range));
        chart[y][x] = '•';
    });
    
    // 添加边框
    return '┌' + '─'.repeat(width) + '┐\n' +
           chart.map(row => '│' + row.join('') + '│').join('\n') +
           '\n└' + '─'.repeat(width) + '┘';
}

async function trainModel() {
    try {
        // 读取数据
        const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        
        // 创建分类器
        const classifier = new BTCPeriodClassifier();
        
        // 存储训练历史
        const history = {
            loss: [],
            accuracy: [],
            val_loss: [],
            val_accuracy: []
        };
        
        // 训练配置
        const epochs = 100;
        console.log('\n=== 开始训练 ===\n');
        
        // 训练模型
        await classifier.train(data, labeledPeriods, epochs, {
            onEpochBegin: (epoch) => {
                process.stdout.write('\x1Bc');  // 清屏
                console.log(`Epoch ${epoch + 1}/${epochs}`);
                console.log(drawProgressBar(epoch + 1, epochs));
            },
            onEpochEnd: (epoch, logs) => {
                // 更新历史记录
                history.loss.push(logs.loss);
                history.accuracy.push(logs.acc);
                history.val_loss.push(logs.val_loss);
                history.val_accuracy.push(logs.val_acc);
                
                // 绘制损失值图表
                console.log('\n损失值趋势:');
                console.log(drawChart(history.loss));
                
                // 绘制准确率图表
                console.log('\n准确率趋势:');
                console.log(drawChart(history.accuracy));
                
                // 打印当前指标
                console.log(`\n损失值: ${logs.loss.toFixed(4)}`);
                console.log(`准确率: ${(logs.acc * 100).toFixed(2)}%`);
                console.log(`验证损失值: ${logs.val_loss.toFixed(4)}`);
                console.log(`验证准确率: ${(logs.val_acc * 100).toFixed(2)}%`);
                
                // 保存训练历史
                fs.writeFile(
                    path.join(__dirname, '../data/training_history.json'),
                    JSON.stringify(history, null, 2)
                ).catch(console.error);
            }
        });
        
        // 保存模型
        const modelPath = path.join(__dirname, '../models/btc_period_classifier');
        await fs.mkdir(modelPath, { recursive: true });
        await classifier.saveModel(modelPath);
        
        // 生成训练报告
        await generateTrainingReport(history);
        
        // 测试预测
        const latestData = data.slice(-30);
        const prediction = await classifier.predict(latestData);
        
        console.log('\n=== 训练完成 ===\n');
        console.log('当前市场状态预测:');
        console.log(`上升期概率: ${(prediction.uptrend * 100).toFixed(2)}%`);
        console.log(`下降期概率: ${(prediction.downtrend * 100).toFixed(2)}%`);
        console.log(`平稳期概率: ${(prediction.sideways * 100).toFixed(2)}%`);
        
    } catch (error) {
        logger.error('训练失败:', error);
    }
}

async function generateTrainingReport(history) {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>训练报告</title>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .chart { width: 100%; height: 400px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h1>模型训练报告</h1>
            
            <h2>损失值趋势</h2>
            <div id="lossChart" class="chart"></div>
            
            <h2>准确率趋势</h2>
            <div id="accuracyChart" class="chart"></div>
            
            <script>
                const history = ${JSON.stringify(history)};
                
                // 绘制损失值图表
                Plotly.newPlot('lossChart', [
                    {
                        y: history.loss,
                        name: '训练损失值',
                        type: 'scatter'
                    },
                    {
                        y: history.val_loss,
                        name: '验证损失值',
                        type: 'scatter'
                    }
                ], {
                    title: '损失值趋势',
                    xaxis: { title: 'Epoch' },
                    yaxis: { title: 'Loss' }
                });
                
                // 绘制准确率图表
                Plotly.newPlot('accuracyChart', [
                    {
                        y: history.accuracy,
                        name: '训练准确率',
                        type: 'scatter'
                    },
                    {
                        y: history.val_accuracy,
                        name: '验证准确率',
                        type: 'scatter'
                    }
                ], {
                    title: '准确率趋势',
                    xaxis: { title: 'Epoch' },
                    yaxis: { title: 'Accuracy' }
                });
            </script>
        </body>
        </html>
    `;
    
    const reportPath = path.join(__dirname, '../reports/training_report.html');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, html);
    logger.info(`训练报告已生成: ${reportPath}`);
}

trainModel(); 