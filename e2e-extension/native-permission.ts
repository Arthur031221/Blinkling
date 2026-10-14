import { execFileSync } from "node:child_process";

type NativeControl = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
};

// Chrome's browser-owned dialog is outside the page tree. Identify the native
// Allow and focused Deny controls in a light or dark desktop capture.
// Connected components avoid assuming a dialog location or screen dimensions.
const nativeControlsScript = `import json,sys,subprocess
ppm=subprocess.check_output(['ffmpeg','-loglevel','error','-i',sys.argv[1],'-frames:v','1','-f','image2pipe','-vcodec','ppm','-'])
magic,size,maximum,data=ppm.split(b'\\n',3)
width,height=map(int,size.split())
assert magic==b'P6' and maximum==b'255' and len(data)==width*height*3
rows=[]
groups=json.loads(sys.argv[2])
bounds=json.loads(sys.argv[3])
left,top,right,bottom=bounds or [0,0,width,height]
for name,colors in groups:
 colors=[bytes(color) for color in colors]
 points={(x,y) for y in range(max(0,top),min(height,bottom)) for x in range(max(0,left),min(width,right)) if data[3*(y*width+x):3*(y*width+x)+3] in colors}
 largest=[]
 while points:
  seed=points.pop();queue=[seed];component=[seed]
  while queue:
   x,y=queue.pop()
   for p in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
    if p in points: points.remove(p);queue.append(p);component.append(p)
  if len(component)>500:
   xs,ys=zip(*component);w=max(xs)-min(xs)+1;h=max(ys)-min(ys)+1
   if 40<=w<=150 and 20<=h<=80 and len(component)>len(largest): largest=component
 if len(largest)>500:
  xs,ys=zip(*largest);x=min(xs);y=min(ys);w=max(xs)-x+1;h=max(ys)-y+1
  if 40<=w<=150 and 20<=h<=80:
   rows.append(dict(name=name,x=x,y=y,width=w,height=h,pixels=len(largest)))
print(json.dumps(rows))`;

export function nativeControls(
  path: string,
  kind: "permission" | "picker" = "permission",
  bounds?: [number, number, number, number],
): NativeControl[] {
  const groups =
    kind === "permission"
      ? [
          [
            "Allow",
            [
              [211, 227, 253],
              [200, 215, 240],
              [0, 74, 119],
            ],
          ],
          [
            "Deny",
            [
              [13, 80, 187],
              [11, 87, 208],
              [175, 202, 247],
            ],
          ],
        ]
      : [
          [
            "Cancel",
            [
              [211, 227, 253],
              [200, 215, 240],
              [0, 74, 119],
            ],
          ],
          ["Share", [[11, 87, 208]]],
        ];
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        nativeControlsScript,
        path,
        JSON.stringify(groups),
        JSON.stringify(bounds || null),
      ],
      { timeout: 15_000 },
    ).toString(),
  );
}
