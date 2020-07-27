const path = require('path');
const fs = require("fs");

async function recursiveFindAll(input, result = []) {
    const files = await fs.promises.readdir(input);
    await Promise.all(files.map(async (file) => {
        const fullPath = path.join(input, file);
        const stat = await fs.promises.lstat(fullPath);
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
