const path = require('path');
const hoiparser = require("../out/src/hoiformat/hoiparser");
const common = require("../out/src/util/common");

async function recursiveFindAll(input, result = []) {
    const files = await common.readdir(input);
    await Promise.all(files.map(async (file) => {
        const fullPath = path.join(input, file);
        const stat = await common.lstat(fullPath);
        if (stat.isDirectory()) {
            await recursiveFindAll(fullPath, result);
        } else {
            if (fullPath.match(/\.(txt|gfx|gui)$/)) {
                result.push(fullPath);
            }
        }
    }));
    return result;
}

const schemas = {};
function fillInSchema(node) {
    if (node.value === null) {
        return;
    }

    let nodeName = node.name;
    if (!nodeName) {
        nodeName = '_root';
    }

    nodeName = nodeName.toLowerCase();

    let schemaEntry = schemas[nodeName];
    if (!schemaEntry) {
        schemaEntry = schemas[nodeName] = [{}];
    }

    if (Array.isArray(node.value)) {
        node.value.forEach(n => {
            schemaEntry[0][n.name.toLowerCase()] = "obj";
            fillInSchema(n);
        });
        return;
    }

    let value = node.value;
    if (typeof node.value === 'object') {
        value = 's_' + node.value.name;
    }

    if (!schemaEntry.includes(value)) {
        schemaEntry.push(value);
    }
}

const result = (async function() {
    const files = (await recursiveFindAll('E:/Games/steamlib/steamapps/common/Hearts of Iron IV/'))
        .filter(f => !f.includes('common\\countries') && !f.match(/Hearts of Iron IV\\[^\\]*\.txt$/));

    const results = await Promise.all(files.map(async (file) => {
        const content = await common.readFile(file);
        try {
            return hoiparser.parseHoi4File(content.toString(), 'In file ' + file + ':\n');
        } catch (e) {
            return { error: e };
        }
    }));

    const validResults = results.filter(r => !r.error);
    validResults.forEach(fillInSchema);

    for (const [name, schema] of Object.entries(schemas)) {
        if (Object.keys(schema[0]).length === 0) {
            if (schema.length > 1000) {
                delete schemas[name];
                for (const [_, schema] of Object.entries(schemas)) {
                    if (name in schema[0]) {
                        schema[0][name] = "var";
                    }
                }
            } else {
                for (const [_, schema] of Object.entries(schemas)) {
                    if (name in schema[0]) {
                        schema[0][name] = "enum";
                    }
                }
            }
        }
    }

    console.log(JSON.stringify(schemas, undefined, 2));
    // console.log(results.map(r => r.error).filter(r => r).map(r => r.message).join('\n'));
})();

console.log(result);
