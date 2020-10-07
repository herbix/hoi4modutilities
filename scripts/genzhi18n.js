const arguments = process.argv.slice(2);
let name = 'zh-cn';
if (arguments.length > 0) {
    name = arguments[0];
}

const en = require('../out/i18n/en');
const zhCn = require('../out/i18n/' + name);
const fs = require("fs");

const result = { ...en, ...zhCn };

fs.writeFileSync('./scripts/' + name + '.ts',
    `import { __table } from './en';\r\n/*eslint sort-keys: "warn"*/\r\nconst table: Partial<typeof __table> = ` +
    JSON.stringify(result, Object.keys(result).sort(), 4) +
    `;\r\n\r\nexport = table;\r\n`
    );
