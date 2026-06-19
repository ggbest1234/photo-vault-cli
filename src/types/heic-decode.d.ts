declare module 'heic-decode' {
  export interface HeicDecodeOptions {
    buffer: ArrayBuffer | Uint8Array | Buffer;
  }
  export interface HeicDecodeResult {
    width: number;
    height: number;
    data: Uint8Array;
  }
  export default function decodeHeic(options: HeicDecodeOptions): Promise<HeicDecodeResult>;
}
