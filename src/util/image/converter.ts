import { DDS } from "./dds";
import { PNG } from "pngjs";

export function ddsToPng(dds: DDS): PNG {
    const img = dds.images[0];

    const png = new PNG({ width: img.width, height: img.height });
    const imgbuffer = img.getFullRgba();
    png.data = Buffer.from(imgbuffer);

    return png;
}
