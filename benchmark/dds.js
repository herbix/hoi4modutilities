// npm run test-compile
// node --prof dds.js

const dds = require("../out/src/util/image/dds/dds");
const fs = require("fs");

const repeatCount = process.argv.length > 2 ? parseInt(process.argv[2]) : 100;
const startTime = process.hrtime();

for (let i = 0; i < repeatCount; i++) {
    const file = fs.readFileSync("E:/Games/steamlib/steamapps/common/Hearts of Iron IV/gfx/loadingscreens/load_1.dds");
    const ddsFile = dds.DDS.parse(file.buffer);
    const fullRGBA = ddsFile.images[0].getFullRgba();

    console.log(fullRGBA.length, fullRGBA[fullRGBA.length - 1]);
}

const endTime = process.hrtime(startTime);
console.log("Repeat count: %d, Average time: %dms", repeatCount, (endTime[0] * 1000 + endTime[1] / 1000000) / repeatCount);
