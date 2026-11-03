declare module "opentype.js" {
  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  export interface PathOptions {
    kerning?: boolean;
  }

  export class Path {
    getBoundingBox(): BoundingBox;
    toPathData(decimalPlaces?: number): string;
  }

  export class Font {
    getPath(text: string, x: number, y: number, fontSize: number, options?: PathOptions): Path;
  }

  export function load(url: string): Promise<Font>;

  const opentype: {
    load: typeof load;
  };

  export default opentype;
}
