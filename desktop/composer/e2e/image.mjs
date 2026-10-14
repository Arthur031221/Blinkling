import { PNG } from "pngjs";
const image = new PNG({ width: 32, height: 32 });
for (let i = 0; i < image.data.length; i += 4)
  image.data.set([235, 45, 40, 255], i);
export const png = PNG.sync.write(image).toString("base64");
