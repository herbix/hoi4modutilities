const path = require('path');
const common = require("../out/src/util/common");

async function recursiveFindAll(input, result = []) {
    const files = await common.readdir(input);
    await Promise.all(files.map(async (file) => {
        const fullPath = path.join(input, file);
        const stat = await common.lstat(fullPath);
        if (stat.isDirectory()) {
            await recursiveFindAll(fullPath, result);
        } else {
            result.push(fullPath);
        }
    }));
    return result;
};

module.exports = {
    recursiveFindAll
};
