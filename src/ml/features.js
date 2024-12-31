const Matrix = require('ml-matrix');

class FeatureExtractor {
    constructor() {
        this.WINDOW_SIZE = 270;  // 9个月
        this.TREND_THRESHOLD = 0.50;  // 50%的变化阈值
        this.MIN_TREND_DAYS = 30;  // 最小趋势持续天数
    }

    // 安全的除法操作
    safeDivide(a, b) {
        if (b === 0 || isNaN(b) || !isFinite(b)) return 0;
        const result = a / b;
        return isFinite(result) ? result : 0;
    }

    // 安全的价格变化率计算
    safeCalculateChange(start, end) {
        if (!start || !end || start === 0) return 0;
        return this.safeDivide(end - start, start);
    }

    createTrainingData(priceData, labeledPeriods) {
        const features = [];
        const labels = [];

        for (let i = this.WINDOW_SIZE; i < priceData.length; i++) {
            // 获取当前日期
            const currentDate = priceData[i].date;
            
            // 获取标签
            const period = this.findPeriod(currentDate, labeledPeriods);
            if (period) {
                // 提取特征
                const windowData = priceData.slice(i - this.WINDOW_SIZE, i);
                const extractedFeatures = this.extractFeatures(windowData);
                
                features.push(extractedFeatures);
                labels.push(period.type);
            }
        }

        return { features, labels };
    }

    extractFeatures(windowData) {
        try {
            const sortedData = windowData.sort((a, b) => new Date(a.date) - new Date(b.date));
            const prices = sortedData.map(d => d.exchanges.Binance?.close || 0).filter(p => p > 0);
            const volumes = sortedData.map(d => d.exchanges.Binance?.volume || 0).filter(v => v > 0);
            
            if (prices.length < this.MIN_TREND_DAYS) {
                console.warn('数据点不足:', prices.length);
                return Array(9).fill(0);
            }
            
            let features = [
                this.calculateLongTermChange(prices),
                this.calculateVolatility(prices),
                this.calculatePricePosition(prices),
                this.calculateTrendStrength(prices),
                this.calculateVolumeChange(volumes),
                this.calculateMomentum(prices),
                this.checkTrendContinuity(prices),
                this.calculateTrendConsistency(prices)
            ];
            
            const totalChange = this.safeCalculateChange(prices[0], prices[prices.length - 1]);
            features.push(Math.sign(totalChange));
            
            // 检查并修正无效值
            features = features.map(f => {
                if (isNaN(f) || !isFinite(f)) {
                    console.warn('检测到无效特征值:', f);
                    return 0;
                }
                return f;
            });
            
            return features;
        } catch (error) {
            console.error('特征提取错误:', error);
            return Array(9).fill(0);
        }
    }

    // 计算相对于3个月前的价格变化
    calculateLongTermChange(prices) {
        if (prices.length < this.WINDOW_SIZE) return 0;
        const startPrice = prices[0];
        const endPrice = prices[prices.length - 1];
        return this.safeCalculateChange(startPrice, endPrice);
    }

    // 计算相对于3个月均价的位置
    calculatePricePosition(prices) {
        if (prices.length === 0) return 0;
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        if (avg === 0) return 0;
        const currentPrice = prices[prices.length - 1];
        return this.safeDivide(currentPrice - avg, avg);
    }

    // 计算趋势强度
    calculateTrendStrength(prices) {
        if (prices.length < 90) return 0;  // 至少需要90天数据
        
        const monthSize = Math.floor(prices.length / 9);
        const monthlyChanges = [];
        
        // 计算每个月的变化率
        for (let i = 0; i < 9; i++) {
            const monthPrices = prices.slice(i * monthSize, (i + 1) * monthSize);
            if (monthPrices.length < 2) continue;
            
            const monthChange = this.safeCalculateChange(
                monthPrices[0],
                monthPrices[monthPrices.length - 1]
            );
            monthlyChanges.push(monthChange);
        }
        
        if (monthlyChanges.length === 0) return 0;
        
        let consecutiveUp = 0;
        let consecutiveDown = 0;
        let maxConsecutiveUp = 0;
        let maxConsecutiveDown = 0;
        
        monthlyChanges.forEach(change => {
            if (change > 0) {
                consecutiveUp++;
                consecutiveDown = 0;
                maxConsecutiveUp = Math.max(maxConsecutiveUp, consecutiveUp);
            } else if (change < 0) {
                consecutiveDown++;
                consecutiveUp = 0;
                maxConsecutiveDown = Math.max(maxConsecutiveDown, consecutiveDown);
            }
        });
        
        if (maxConsecutiveUp >= 3) return maxConsecutiveUp / 9;
        if (maxConsecutiveDown >= 3) return -maxConsecutiveDown / 9;
        return 0;
    }

    // 添加趋势持续性检查
    checkTrendContinuity(prices) {
        if (prices.length < 60) return 0;  // 至少需要60天数据
        
        const changes = [];
        for (let i = 30; i < prices.length; i += 30) {
            const monthChange = this.safeCalculateChange(prices[i-30], prices[i]);
            if (isFinite(monthChange)) {
                changes.push(monthChange);
            }
        }
        
        if (changes.length === 0) return 0;
        
        let continuityScore = 0;
        let previousTrend = null;
        let currentStreak = 0;
        
        changes.forEach(change => {
            const currentTrend = change > this.TREND_THRESHOLD ? 1 : 
                               change < -this.TREND_THRESHOLD ? -1 : 0;
            
            if (previousTrend === null) {
                previousTrend = currentTrend;
                currentStreak = 1;
            } else if (currentTrend === previousTrend) {
                currentStreak++;
            } else {
                if (currentStreak >= 3) {
                    continuityScore += currentStreak;
                }
                currentStreak = 1;
            }
            previousTrend = currentTrend;
        });
        
        return this.safeDivide(continuityScore, changes.length);
    }

    // 修改趋势一致性计算
    calculateTrendConsistency(prices) {
        const quarterSize = Math.floor(prices.length / 3);
        const quarters = Array.from({ length: 3 }, (_, i) => 
            prices.slice(i * quarterSize, (i + 1) * quarterSize)
        );
        
        const changes = quarters.map(quarter => {
            const startPrice = quarter[0];
            const endPrice = quarter[quarter.length - 1];
            return (endPrice - startPrice) / startPrice;
        });
        
        // 要求趋势的连续性
        const isConsistentUptrend = changes.every((c, i) => 
            c > this.TREND_THRESHOLD / 3 && 
            (i === 0 || changes[i-1] > this.TREND_THRESHOLD / 3)
        );
        
        const isConsistentDowntrend = changes.every((c, i) => 
            c < -this.TREND_THRESHOLD / 3 && 
            (i === 0 || changes[i-1] < -this.TREND_THRESHOLD / 3)
        );
        
        if (isConsistentUptrend) return 1;
        if (isConsistentDowntrend) return -1;
        return 0;
    }

    // 计算动量
    calculateMomentum(prices) {
        const monthlyChanges = [];
        for (let i = 30; i < prices.length; i += 30) {
            const monthChange = (prices[i] - prices[i-30]) / prices[i-30];
            monthlyChanges.push(monthChange);
        }
        
        // 计算动量（变化率的变化）
        return monthlyChanges.length > 1 ? 
            monthlyChanges[monthlyChanges.length - 1] - monthlyChanges[monthlyChanges.length - 2] : 
            0;
    }

    // 判断市场状态
    determinePeriodType(features) {
        const [longTermChange, volatility, pricePosition, trendStrength, volumeChange, momentum, consistency] = features;
        
        // 使用多个指标综合判断
        if (Math.abs(longTermChange) <= this.TREND_THRESHOLD && 
            Math.abs(pricePosition) <= this.TREND_THRESHOLD && 
            volatility <= 0.1) {
            return 3; // 平稳期
        }
        
        if (longTermChange > this.TREND_THRESHOLD && 
            trendStrength > 0 && 
            momentum >= 0) {
            return 1; // 上升期
        }
        
        if (longTermChange < -this.TREND_THRESHOLD && 
            trendStrength < 0 && 
            momentum <= 0) {
            return 2; // 下降期
        }
        
        return 3; // 默认为平稳期
    }

    // 计算波动率
    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const change = this.safeCalculateChange(prices[i-1], prices[i]);
            if (isFinite(change)) {
                returns.push(change);
            }
        }
        return this.standardDeviation(returns);
    }

    // 计算成交量变化
    calculateVolumeChange(volumes) {
        if (volumes.length < 2) return 0;
        return this.safeCalculateChange(volumes[0], volumes[volumes.length - 1]);
    }

    // 计算标准差
    standardDeviation(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(value => {
            const diff = value - mean;
            return isFinite(diff) ? Math.pow(diff, 2) : 0;
        });
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
        return Math.sqrt(avgSquareDiff);
    }

    // 查找日期所属的时期
    findPeriod(date, labeledPeriods) {
        return labeledPeriods.find(period => 
            date >= period.start && date <= period.end
        );
    }
}

module.exports = FeatureExtractor; 