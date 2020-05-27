const en = require('../out/i18n/en');
const zhCn = require('../out/i18n/zh-cn');
const fs = require("fs");

const result = { ...en, ...zhCn };

fs.writeFileSync('./scripts/zh-cn.json', JSON.stringify(result, Object.keys(result).sort(), 4));
