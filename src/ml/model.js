const tf = require('@tensorflow/tfjs-node');
const FeatureExtractor = require('./features');

class BTCPeriodClassifier {
    constructor() {
        this.featureExtractor = new FeatureExtractor();
        this.model = null;
    }

    // 创建模型
    createModel(inputShape) {
        const model = tf.sequential();
        
        // 使用更复杂的架构来处理更多特征
        model.add(tf.layers.dense({
            units: 16,
            activation: 'relu',
            inputShape: [inputShape],  // 动态设置输入维度
            kernelInitializer: 'heNormal',
            biasInitializer: 'zeros'
        }));
        
        model.add(tf.layers.dropout(0.2));  // 添加 dropout 防止过拟合
        
        model.add(tf.layers.dense({
            units: 8,
            activation: 'relu',
            kernelInitializer: 'heNormal',
            biasInitializer: 'zeros'
        }));
        
        // 输出层
        model.add(tf.layers.dense({
            units: 3,
            activation: 'softmax',
            kernelInitializer: 'heNormal',
            biasInitializer: 'zeros'
        }));
        
        // 使用 Adam 优化器
        const optimizer = tf.train.adam(0.001);
        
        model.compile({
            optimizer: optimizer,
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        
        this.model = model;
        return model;
    }

    // 训练模型
    async train(priceData, labeledPeriods, epochs = 100) {
        const { features, labels } = this.featureExtractor.createTrainingData(
            priceData,
            labeledPeriods
        );
        
        // 获取特征维度
        const inputShape = features[0].length;
        console.log('特征维度:', inputShape);
        
        // 确保所有特征数组长度一致
        const normalizedFeatures = features.map(feature => {
            if (feature.length < inputShape) {
                // 如果特征数量不足，补充 0
                return [...feature, ...Array(inputShape - feature.length).fill(0)];
            }
            if (feature.length > inputShape) {
                // 如果特征数量过多，截断
                return feature.slice(0, inputShape);
            }
            return feature;
        });
        
        // 打印特征和标签的形状
        console.log('特征数量:', normalizedFeatures.length);
        console.log('标签数量:', labels.length);
        console.log('特征示例:', normalizedFeatures[0]);
        
        if (!this.model) {
            this.createModel(inputShape);
        }
        
        // 将特征转换为张量
        const xs = tf.tensor2d(normalizedFeatures);
        const ys = tf.oneHot(tf.tensor1d(labels.map(l => l - 1), 'int32'), 3);
        
        // 打印张量形状
        console.log('特征张量形状:', xs.shape);
        console.log('标签张量形状:', ys.shape);
        
        try {
            // 训练模型
            const history = await this.model.fit(xs, ys, {
                epochs,
                batchSize: 32,
                validationSplit: 0.2,
                shuffle: true,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        console.log(
                            `Epoch ${epoch + 1}: ` +
                            `loss = ${logs.loss.toFixed(4)}, ` +
                            `accuracy = ${logs.acc.toFixed(4)}, ` +
                            `val_loss = ${logs.val_loss.toFixed(4)}, ` +
                            `val_accuracy = ${logs.val_acc.toFixed(4)}`
                        );
                    }
                }
            });
            
            // 清理内存
            xs.dispose();
            ys.dispose();
            
            return history;
        } catch (error) {
            // 清理内存
            xs.dispose();
            ys.dispose();
            throw error;
        }
    }

    // 预测
    async predict(windowData) {
        if (!this.model) {
            throw new Error('模型未训练');
        }
        
        try {
            // 提取特征
            const features = this.featureExtractor.extractFeatures(windowData);
            
            // 确保特征维度正确
            const inputShape = this.model.inputs[0].shape[1];
            if (features.length !== inputShape) {
                while (features.length < inputShape) {
                    features.push(0);
                }
                if (features.length > inputShape) {
                    features.length = inputShape;
                }
            }
            
            // 检查特征是否包含无效值
            if (features.some(f => isNaN(f) || !isFinite(f))) {
                console.warn('特征包含无效值:', features);
                return {
                    uptrend: 0.33,
                    downtrend: 0.33,
                    sideways: 0.34
                };
            }
            
            // 转换为张量并预测
            const xs = tf.tensor2d([features]);
            const prediction = this.model.predict(xs);
            const probabilities = await prediction.data();
            
            // 添加趋势平滑逻辑
            const trendStrength = features[3];  // 趋势强度特征
            const continuityScore = features[6];  // 趋势持续性特征
            
            let smoothedPrediction = {
                uptrend: Math.max(0.001, probabilities[0]),    // 确保不为零
                downtrend: Math.max(0.001, probabilities[1]),  // 确保不为零
                sideways: Math.max(0.001, probabilities[2])    // 确保不为零
            };
            
            // 如果有强趋势，增强主导趋势的概率
            if (!isNaN(trendStrength) && !isNaN(continuityScore) && 
                Math.abs(trendStrength) > 0.5 && continuityScore > 0.6) {
                if (trendStrength > 0) {
                    smoothedPrediction.uptrend = Math.max(smoothedPrediction.uptrend, 0.8);
                    smoothedPrediction.downtrend = Math.min(smoothedPrediction.downtrend * 0.2, 0.1);
                    smoothedPrediction.sideways = Math.min(smoothedPrediction.sideways * 0.2, 0.1);
                } else {
                    smoothedPrediction.downtrend = Math.max(smoothedPrediction.downtrend, 0.8);
                    smoothedPrediction.uptrend = Math.min(smoothedPrediction.uptrend * 0.2, 0.1);
                    smoothedPrediction.sideways = Math.min(smoothedPrediction.sideways * 0.2, 0.1);
                }
            }
            
            // 归一化概率，确保不会出现除以零的情况
            const total = Object.values(smoothedPrediction).reduce((a, b) => a + b, 0);
            if (total > 0) {
                Object.keys(smoothedPrediction).forEach(key => {
                    smoothedPrediction[key] = smoothedPrediction[key] / total;
                });
            } else {
                // 如果总和为0，返回平均分布
                smoothedPrediction = {
                    uptrend: 0.33,
                    downtrend: 0.33,
                    sideways: 0.34
                };
            }
            
            // 释放内存
            xs.dispose();
            prediction.dispose();
            
            // 检查最终结果是否有效
            if (Object.values(smoothedPrediction).some(v => isNaN(v) || !isFinite(v))) {
                console.warn('预测结果无效，使用默认值');
                return {
                    uptrend: 0.33,
                    downtrend: 0.33,
                    sideways: 0.34
                };
            }
            
            return smoothedPrediction;
        } catch (error) {
            console.error('预测过程出错:', error);
            return {
                uptrend: 0.33,
                downtrend: 0.33,
                sideways: 0.34
            };
        }
    }

    // 保存模型
    async saveModel(path) {
        if (!this.model) {
            throw new Error('模型未训练');
        }
        await this.model.save(`file://${path}`);
    }

    // 加载模型
    async loadModel(path) {
        this.model = await tf.loadLayersModel(`file://${path}`);
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
    }
}

module.exports = BTCPeriodClassifier; 