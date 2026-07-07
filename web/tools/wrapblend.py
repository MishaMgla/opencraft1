"""Wrap-blend: cross-fade each edge band with its wrapped neighbor so opposite
edges converge — a deterministic seamless fix that preserves interior pixels.
Band B=4 on a 64px tile; at engine display scale the smear is sub-noticeable.
Writes the PNG in place (uncompressed-idat-free: reuses encoder from gen tools
via pure python zlib) and prints before/after seam scores.
"""
import sys, zlib, struct, pathlib
sys.path.insert(0, pathlib.Path(__file__).parent.as_posix())
from seamcheck import read_png_rgba, edge_diff

B = 4

def encode_png(w, h, px):
    stride = w * 4
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += px[y*stride:(y+1)*stride]
    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))

def blend(px, w, h):
    out = bytearray(px)
    # horizontal: columns x and w-1-x, ramp t: 0.5 at edge -> 0 at band interior
    for y in range(h):
        for x in range(B):
            t = 0.5 * (B - x) / B
            for c in range(4):
                a = (y*w + x)*4 + c
                b = (y*w + (w-1-x))*4 + c
                va, vb = px[a], px[b]
                out[a] = round(va*(1-t) + vb*t)
                out[b] = round(vb*(1-t) + va*t)
    px2 = bytes(out)
    # vertical
    for x in range(w):
        for y in range(B):
            t = 0.5 * (B - y) / B
            for c in range(4):
                a = (y*w + x)*4 + c
                b = ((h-1-y)*w + x)*4 + c
                va, vb = px2[a], px2[b]
                out[a] = round(va*(1-t) + vb*t)
                out[b] = round(vb*(1-t) + va*t)
    return bytes(out)

if __name__ == '__main__':
    for p in sys.argv[1:]:
        path = pathlib.Path(p)
        w, h, px = read_png_rgba(path)
        lr0, tb0 = edge_diff(w, h, px)
        fixed = blend(px, w, h)
        lr1, tb1 = edge_diff(w, h, fixed)
        path.write_bytes(encode_png(w, h, fixed))
        print(f'{path.name}: seam {max(lr0,tb0):.1f} -> {max(lr1,tb1):.1f}')
