/// <reference lib="dom" />
// Prepare a library portrait for a character PNG without changing its stored asset.
(() => {
  const pngFormat = () => (globalThis as unknown as {TAPng: {
    hasSignature(bytes: Uint8Array): boolean;
    portraitBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer>;
  }}).TAPng;

  function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
    const arrays = Uint8Array as Uint8ArrayConstructor & {fromBase64?(source: string): Uint8Array<ArrayBuffer>};
    if (arrays.fromBase64) return arrays.fromBase64(text);
    const binary = atob(text), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function sourceBytes(source: Blob | string) {
    if (typeof source !== 'string') return {bytes:new Uint8Array(await source.arrayBuffer()), type:source.type};
    const comma = source.indexOf(',');
    if (!/^data:/i.test(source) || comma < 5) throw new Error('Invalid image data URL');
    const header = source.slice(5,comma), type = header.split(';')[0]!.toLowerCase();
    if (/;base64$/i.test(header) && source.indexOf('%',comma+1) < 0) return {bytes:decodeBase64(source.slice(comma+1)),type};
    // Older libraries include percent-encoded SVGs. The browser also preserves raw
    // percent-encoded binary octets here, including values outside UTF-8.
    return {bytes:new Uint8Array(await (await fetch(source)).arrayBuffer()),type};
  }

  function imageType(bytes: Uint8Array, declared: string): string {
    if (pngFormat().hasSignature(bytes)) return 'image/png';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start,end));
    if (ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp';
    if (/^GIF8[79]a$/.test(ascii(0,6))) return 'image/gif';
    if (declared === 'image/svg+xml' || /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0,512)))) return 'image/svg+xml';
    // Let the image decoder recognize its remaining raster formats from the bytes.
    return '';
  }

  async function rasterize(image: CanvasImageSource, width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context || !width || !height) throw new Error('No image canvas');
    context.drawImage(image,0,0,width,height);
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve,'image/png'));
    if (!png) throw new Error('PNG encoding failed');
    return new Uint8Array(await png.arrayBuffer());
  }

  async function read(source: Blob | string) {
    try {
      const {bytes,type} = await sourceBytes(source);
      const mime = imageType(bytes,type), blob = new Blob([bytes],{type:mime});
      if (mime === 'image/svg+xml') {
        const image = new Image(), url = URL.createObjectURL(blob);
        try {
          image.src = url;
          await image.decode();
          const {naturalWidth:width,naturalHeight:height} = image;
          return {png:await rasterize(image,width,height),mime,width,height};
        } finally { URL.revokeObjectURL(url); }
      }
      // Decode even a native PNG: a valid signature and CRCs alone cannot prove
      // that its pixels are readable. Use the original image chunks on success.
      const image = await createImageBitmap(blob);
      try {
        const {width,height} = image;
        const png = mime === 'image/png' ? pngFormat().portraitBytes(bytes) : await rasterize(image,width,height);
        return {png,mime,width,height};
      } finally { image.close(); }
    } catch (cause) {
      throw Object.assign(new Error('card.localPortrait',{cause}),{code:'card.localPortrait'});
    }
  }
  Object.assign(globalThis,{TAPortraitImage:{read}});
})();
