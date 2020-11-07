import { EventEmitter, asEvent, Subscriber } from "../util/event";
import { FEWorldMap } from "./loader";
import { Zone, Point } from "./definitions";
import { bboxCenter } from "./graphutils";

export class ViewPoint extends Subscriber {
    private onChangedEmitter = new EventEmitter<void>();
    public onChanged = this.onChangedEmitter.event;
    public x: number;
    public y: number;
    public scale: number;

    constructor(
        private canvas: HTMLCanvasElement,
        private loader: { worldMap: FEWorldMap | undefined },
        private topBarHeight: number,
        viewPointObj: { x: number; y: number; scale: number; },
    ) {
        super();
        this.x = viewPointObj.x;
        this.y = viewPointObj.y;
        this.scale = viewPointObj.scale;
        this.enableDragger();
    }

    public convertX(x: number) {
        return Math.round((x - this.x) * this.scale);
    }
    
    public convertY(y: number) {
        return Math.round((y - this.y) * this.scale);
    }
    
    public convertBackX(x: number) {
        return Math.floor(x / this.scale + this.x);
    }
    
    public convertBackY(y: number) {
        return Math.floor(y / this.scale + this.y);
    }

    public bboxInView(bbox: Zone, xoffset: number) {
        const r = this.x + this.canvas.width / this.scale;
        const b = this.y + this.canvas.height / this.scale;
        const br = bbox.x + bbox.w;
        const bb = bbox.y + bbox.h;
        return r > bbox.x + xoffset && br + xoffset > this.x && b > bbox.y && bb > this.y;
    }

    public lineInView(start: Point, end: Point, xoffset: number) {
        const r = this.x + this.canvas.width / this.scale;
        const b = this.y + this.canvas.height / this.scale;
        if (start.x > end.x) {
            const t = start;
            start = end;
            end = t;
        }

        if (start.x >= r || end.x <= this.x) {
            return false;
        }

        const k = (end.y - start.y) / (end.x - start.x);
        const y1 = k * (this.x - start.x - xoffset) + start.y;
        const y2 = k * (r - start.x - xoffset) + start.y;
        return (y1 > this.y && y1 < b) || (y2 > this.y && y2 < b) ||
            (y1 < b && y2 > this.y) || (y1 > this.y && y2 < b);
    }

    public centerZone(zone: Zone) {
        const expectedScale = Math.min(this.canvas.width / zone.w / 2, this.canvas.height / zone.h / 2);
        if (expectedScale < 1) {
            this.scale = Math.pow(2, Math.max(-2, Math.round(Math.log2(expectedScale))));
        } else {
            this.scale = Math.round(Math.min(12, expectedScale));
        }
        this.centerPoint(bboxCenter(zone));
    }

    public centerPoint(point: Point) {
        this.x = point.x - this.canvas.width / 2 / this.scale;
        this.y = point.y - this.canvas.height / 2 / this.scale;
        this.alignViewPointXY();
        this.onChangedEmitter.fire();
    }

    public toJson() {
        return {
            x: this.x,
            y: this.y,
            scale: this.scale,
        };
    }

    private enableDragger() {
        let mdx = -1;
        let mdy = -1;
        let pressed = false;
        let vpx = -1;
        let vpy = -1;
    
        this.subscriptions.push(asEvent(this.canvas, 'mousedown')((e) => {
            if (!this.loader.worldMap || !(e.buttons & 2)) {
                return;
            }
    
            mdx = e.pageX;
            mdy = e.pageY;
            vpx = this.x;
            vpy = this.y;
            pressed = true;
        }));
    
        this.subscriptions.push(asEvent(document.body, 'mousemove')((e) => {
            if (!this.loader.worldMap) {
                pressed = false;
            }
    
            if (pressed) {
                this.x = vpx - (e.pageX - mdx) / this.scale;
                this.y = vpy - (e.pageY - mdy) / this.scale;
                this.alignViewPointXY();
                this.onChangedEmitter.fire();
            }
        }));
    
        this.subscriptions.push(asEvent(document.body, 'mouseup')(function() {
            pressed = false;
        }));
    
        this.subscriptions.push(asEvent(document.body, 'mouseenter')(function(e) {
            if (pressed && (e.buttons & 2) !== 2) {
                pressed = false;
            }
        }));
    
        this.subscriptions.push(asEvent(this.canvas, 'wheel')((e) => {
            this.x += e.pageX / this.scale;
            this.y += e.pageY / this.scale;
    
            if (e.deltaY > 0) {
                if (this.scale <= 1) {
                    if (this.scale > 0.25) {
                        this.scale /= 2;
                    }
                } else {
                    this.scale = Math.max(1, this.scale - 1);
                }
            } else if (e.deltaY < 0) {
                if (this.scale < 1) {
                    this.scale *= 2;
                } else {
                    this.scale = Math.min(16, Math.floor(this.scale + 1));
                }
            }
    
            this.x -= e.pageX / this.scale;
            this.y -= e.pageY / this.scale;
    
            this.alignViewPointXY();
            this.onChangedEmitter.fire();
        }));
    }

    private alignViewPointXY() {
        if (!this.loader.worldMap) {
            return;
        }

        if (this.loader.worldMap.width === 0) {
            this.x = 0;
        } else {
            while (this.x < 0) {
                this.x += this.loader.worldMap.width;
            }
            while (this.x > this.loader.worldMap.width) {
                this.x -= this.loader.worldMap.width;
            }
        }

        const minY = -this.topBarHeight / this.scale;
        const maxY = this.loader.worldMap.height - this.canvas.height / this.scale;
        if (maxY < minY || this.y < minY) {
            this.y = minY;
        } else if (this.y > maxY) {
            this.y = maxY;
        }
    }
}
