declare module "heic-convert" {
  type HeicOutput = ArrayBuffer | Uint8Array | Buffer;

  type HeicConvertOptions = {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality?: number;
  };

  export default function heicConvert(options: HeicConvertOptions): Promise<HeicOutput>;
}
