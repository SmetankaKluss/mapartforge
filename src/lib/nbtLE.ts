// Little-endian NBT writer for Bedrock Edition .mcstructure files.
// The wire format is identical to Java NBT except all multi-byte integers
// (i16, i32) are written in little-endian byte order.

export class NbtWriterLE {
  private chunks: Uint8Array[] = [];
  private _size = 0;

  private push(buf: Uint8Array) {
    this.chunks.push(buf);
    this._size += buf.byteLength;
  }

  // These are "private" but still accessible within the class
  u8(v: number) {
    const b = new Uint8Array(1);
    b[0] = v & 0xff;
    this.push(b);
  }

  i32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true /* little-endian */);
    this.push(b);
  }

  private i16(v: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, v, true);
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

  // ── Named tags ──────────────────────────────────────────────────────────

  tagByte(name: string, v: number)   { this.header(1, name); this.u8(v); }
  tagInt(name: string, v: number)    { this.header(3, name); this.i32(v); }
  tagString(name: string, v: string) { this.header(8, name); this.writeString(v); }

  tagCompoundStart(name: string) { this.header(10, name); }
  tagCompoundEnd()               { this.u8(0); }

  tagListStart(name: string, elementType: number, count: number) {
    this.header(9, name);
    this.u8(elementType);
    this.i32(count);
  }

  tagIntList(name: string, values: number[]) {
    this.tagListStart(name, 3, values.length);
    for (const v of values) this.i32(v);
  }

  tagEmptyList(name: string) {
    this.tagListStart(name, 0, 0);
  }

  /**
   * Write a TAG_List<int> payload WITHOUT a name header.
   * Used when writing a list-of-lists (elements of an outer TAG_List
   * have no tag-type or name prefix — just the payload).
   */
  inlineIntList(values: number[]) {
    this.u8(3 /* TAG_Int */);
    this.i32(values.length);
    for (const v of values) this.i32(v);
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this._size);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.byteLength; }
    return out;
  }
}
