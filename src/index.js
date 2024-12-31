const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const yargs = require('yargs');
const logger = require('./utils/logger');

// 确保 axios 可用
if (!axios) {
    throw new Error('axios not loaded');
}

// ... 其他代码

module.exports = {
    axios,  // 确保导出 axios
    // ... 其他导出
};