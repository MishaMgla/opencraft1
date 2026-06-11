// Binary protocol mirror of internal/wire/wire.go. Little-endian, int16 positions.

const C_HELLO = 0x01;
const C_INPUT = 0x02;

const S_WELCOME = 0x81;
const S_SNAPSHOT = 0x82;
const S_ENTER = 0x83;
const S_LEAVE = 0x84;
const S_PONG = 0x85;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeHello(name) {
  const n = enc.encode(name.slice(0, 255));
  const b = new Uint8Array(2 + n.length);
  b[0] = C_HELLO;
  b[1] = n.length;
  b.set(n, 2);
  return b.buffer;
}

export function encodeInput(x, y) {
  const b = new ArrayBuffer(5);
  const v = new DataView(b);
  v.setUint8(0, C_INPUT);
  v.setInt16(1, x, true);
  v.setInt16(3, y, true);
  return b;
}

// view is a DataView over the received ArrayBuffer.
export function decodeServer(view) {
  const t = view.getUint8(0);
  switch (t) {
    case S_WELCOME:
      return {
        type: 'welcome',
        id: view.getUint32(1, true),
        minX: view.getInt16(5, true),
        minY: view.getInt16(7, true),
        maxX: view.getInt16(9, true),
        maxY: view.getInt16(11, true),
      };
    case S_SNAPSHOT: {
      const tick = view.getUint32(1, true);
      const count = view.getUint16(5, true);
      const ents = [];
      let off = 7;
      for (let i = 0; i < count; i++) {
        ents.push({
          id: view.getUint32(off, true),
          x: view.getInt16(off + 4, true),
          y: view.getInt16(off + 6, true),
        });
        off += 8;
      }
      return { type: 'snapshot', tick, ents };
    }
    case S_ENTER: {
      const id = view.getUint32(1, true);
      const x = view.getInt16(5, true);
      const y = view.getInt16(7, true);
      const color = view.getUint32(9, true);
      const nlen = view.getUint8(13);
      const bytes = new Uint8Array(view.buffer, view.byteOffset + 14, nlen);
      return { type: 'enter', id, x, y, color, name: dec.decode(bytes) };
    }
    case S_LEAVE:
      return { type: 'leave', id: view.getUint32(1, true) };
    case S_PONG:
      return { type: 'pong', t: view.getUint32(1, true) };
  }
  return { type: 'unknown' };
}
