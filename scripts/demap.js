var myArgs = process.argv.slice(2)[0].split(':');

var fs = require('fs');
var sourceMap = require('source-map');
var smc = new sourceMap.SourceMapConsumer(fs.readFileSync("./prod/" + myArgs[0] + ".map","utf8"));
var position = myArgs[1].split(':');
console.log(smc.originalPositionFor({line: parseInt(myArgs[1]), column: parseInt(myArgs[2])}));
