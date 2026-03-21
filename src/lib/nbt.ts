// Minimal NBT serializer for Minecraft map formats (big-endian, Java Edition)

export class NbtWriter {
  private chunks: Uint8Array[] = [];
  private _size = 0;

  private push(buf: Uint8Array) {
    this.chunks.push(buf);
    this._size += buf.byteLength;
  }

  private u8(v: number) {
    const b = new Uint8Array(1);
    b[0] = v & 0xff;
    this.push(b);
  }

  private i16(v: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, v, false);
    this.push(b);
  }

  private i32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, false);
    this.push(b);
  }

  private writeString(s: string) {
    const enc = new TextEncoder().encode(s);
    this.i16(enc.byteLength);
    this.push(enc);
  }

  private header(type: number, name: string) {
    this.u8(type);
    this.writeString(name);
  }

  // ── Named tags ───────────────────────────────────────────────────────────

  tagByte(name: string, v: number)    { this.header(1, name); this.u8(v); }
  tagShort(name: string, v: number)   { this.header(2, name); this.i16(v); }
  tagInt(name: string, v: number)     { this.header(3, name); this.i32(v); }

  tagLong(name: string, value: bigint) {
    this.header(4, name);
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigInt64(0, value, false);
    this.push(b);
  }

  tagString(name: string, v: string)  { this.header(8, name); this.writeString(v); }

  tagByteArray(name: string, data: Uint8Array) {
    this.header(7, name);
    this.i32(data.length);
    this.push(data);
  }

  tagLongArray(name: string, data: BigInt64Array) {
    this.header(12, name);
    this.i32(data.length);
    const b = new Uint8Array(data.length * 8);
    const dv = new DataView(b.buffer);
    for (let i = 0; i < data.length; i++) dv.setBigInt64(i * 8, data[i], false);
    this.push(b);
  }

  tagCompoundStart(name: string) { this.header(10, name); }
  tagCompoundEnd()               { this.u8(0); }

  /**
   * TAG_List header. elementType: 0=end,1=byte,3=int,8=string,9=list,10=compound
   * After this call, write exactly `count` payloads of the matching type.
   * For empty lists (count=0), nothing needs to follow.
   */
  tagListStart(name: string, elementType: number, count: number) {
    this.header(9, name);
    this.u8(elementType);
    this.i32(count);
  }

  /** Convenience: write a complete TAG_List of TAG_Int. */
  tagIntList(name: string, values: number[]) {
    this.tagListStart(name, 3, values.length);
    for (const v of values) this.i32(v);
  }

  /** Write an empty TAG_List (element type = TAG_End = 0). */
  tagEmptyList(name: string) {
    this.tagListStart(name, 0, 0);
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this._size);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.byteLength; }
    return out;
  }
}

export async function gzipBytes(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new Uint8Array(data));
  writer.close();

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}
