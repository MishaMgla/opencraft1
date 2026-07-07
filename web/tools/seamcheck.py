"""Seam check: mean |RGB| difference between opposite edges of each tile.

A perfectly seamless texture has left column ~= right column and top row ~=
bottom row of the NEXT copy — i.e. wrap-around continuity. We measure the
mean absolute channel difference between edge pixel pairs (0 = identical,
255 = worst). Values under ~25 read as stitch-free at game scale; report both
axes per tile.
"""
import struct, sys, zlib, pathlib

def read_png_rgba(path):
    data = pathlib.Path(path).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w, h = 8, b'', 0, 0
    while pos < len(data):
        ln = int.from_bytes(data[pos:pos+4], 'big')
        typ = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+ln]
        pos += 12 + ln
        if typ == b'IHDR':
            w, h = struct.unpack('>II', chunk[:8])
            bit, color = chunk[8], chunk[9]
            assert bit == 8 and color == 6, f'unsupported png {bit}/{color}'
        elif typ == b'IDAT':
            idat += chunk
        elif typ == b'IEND':
            break
    raw = zlib.decompress(idat)
    stride = w * 4
    px = bytearray(w * h * 4)
    src = 0
    for y in range(h):
        f = raw[src]; src += 1
        row_off = y * stride
        prev_off = (y - 1) * stride
        for x in range(stride):
            a = px[row_off + x - 4] if x >= 4 else 0
            b = px[prev_off + x] if y else 0
            c = px[prev_off + x - 4] if (y and x >= 4) else 0
            v = raw[src]; src += 1
            if f == 0: r = v
            elif f == 1: r = (v + a) & 0xff
            elif f == 2: r = (v + b) & 0xff
            elif f == 3: r = (v + (a + b) // 2) & 0xff
            else:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                r = (v + pr) & 0xff
            px[row_off + x] = r
    return w, h, px

def edge_diff(w, h, px):
    lr = tb = 0
    for y in range(h):
        l = (y * w) * 4; r = (y * w + w - 1) * 4
        lr += sum(abs(px[l+i] - px[r+i]) for i in range(3))
    for x in range(w):
        t = x * 4; b = ((h - 1) * w + x) * 4
        tb += sum(abs(px[t+i] - px[b+i]) for i in range(3))
    return lr / (h * 3), tb / (w * 3)

if __name__ == '__main__':
    for p in sys.argv[1:]:
        w, h, px = read_png_rgba(p)
        lr, tb = edge_diff(w, h, px)
        flag = 'ok' if max(lr, tb) < 25 else ('soft' if max(lr, tb) < 45 else 'SEAM')
        print(f'{pathlib.Path(p).name:42s} L/R {lr:6.1f}  T/B {tb:6.1f}  {flag}')
