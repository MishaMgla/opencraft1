// Binary protocol mirror of internal/wire/wire.go. Little-endian, int16 positions.

const C_HELLO = 0x01;
const C_INPUT = 0x02;
const C_PAINT = 0x04;

const S_WELCOME = 0x81;
const S_SNAPSHOT = 0x82;
const S_ENTER = 0x83;
const S_LEAVE = 0x84;
const S_PONG = 0x85;
const S_PAINT = 0x86;
const S_SHAKE = 0x87;

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface Welcome {
  type: 'welcome';
  id: number;
  x: number;
  y: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface SnapshotEnt {
  id: number;
  x: number;
  y: number;
}
export interface Snapshot {
  type: 'snapshot';
  tick: number;
  ents: SnapshotEnt[];
}
export interface Enter {
  type: 'enter';
  id: number;
  x: number;
  y: number;
  color: number;
  name: string;
}
export interface Leave {
  type: 'leave';
  id: number;
}
export interface Pong {
  type: 'pong';
  t: number;
}
export interface Paint {
  type: 'paint';
  x: number;
  y: number;
  color: number;
  ownerId: number;
}
export interface Shake {
  type: 'shake';
  id: number;
}
export interface Unknown {
  type: 'unknown';
}
export type ServerMsg = Welcome | Snapshot | Enter | Leave | Pong | Paint | Shake | Unknown;

export function encodeHello(name: string): ArrayBuffer {
  const n = enc.encode(name.slice(0, 255));
  const b = new Uint8Array(2 + n.length);
  b[0] = C_HELLO;
  b[1] = n.length;
  b.set(n, 2);
  return b.buffer;
}

export function encodeInput(x: number, y: number): ArrayBuffer {
  const b = new ArrayBuffer(5);
  const v = new DataView(b);
  v.setUint8(0, C_INPUT);
  v.setInt16(1, x, true);
  v.setInt16(3, y, true);
  return b;
}

export function encodePaint(): ArrayBuffer {
  const b = new Uint8Array(1);
  b[0] = C_PAINT;
  return b.buffer;
}

// view is a DataView over the received ArrayBuffer.
export function decodeServer(view: DataView): ServerMsg {
  const t = view.getUint8(0);
  switch (t) {
    case S_WELCOME:
      return {
        type: 'welcome',
        id: view.getUint32(1, true),
        x: view.getInt16(5, true),
        y: view.getInt16(7, true),
        minX: view.getInt16(9, true),
        minY: view.getInt16(11, true),
        maxX: view.getInt16(13, true),
        maxY: view.getInt16(15, true),
      };
    case S_SNAPSHOT: {
      const tick = view.getUint32(1, true);
      const count = view.getUint16(5, true);
      const ents: SnapshotEnt[] = [];
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
    case S_PAINT:
      return {
        type: 'paint',
        x: view.getInt16(1, true),
        y: view.getInt16(3, true),
        color: view.getUint32(5, true),
        ownerId: view.getUint32(9, true),
      };
    case S_SHAKE:
      return { type: 'shake', id: view.getUint32(1, true) };
  }
  return { type: 'unknown' };
}
