// Documentation illustration only; no game integration or runtime dependencies.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map(v => v * k);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => mul(a, 1 / Math.hypot(...a));
const target = [0, 0.7, 0], towardCamera = unit([6, 9, 12]);
const right = unit(cross([0, 1, 0], towardCamera));
const up = cross(towardCamera, right), distance = 13, scale = 69;
const eye = add(target, mul(towardCamera, distance));
const light = unit([-0.6, 1, 1]), faces = [];
const palette = { bone: '#DDD9CC', blue: '#91A9B8', sage: '#9BAF96', ochre: '#BEA56F' };

function project(p, perspective) {
  const q = sub(p, target), depth = distance - dot(q, towardCamera);
  assert(depth > 0, 'Study geometry must be in front of the camera');
  const k = scale * (perspective ? distance / depth : 1);
  const result = [195 + dot(q, right) * k, 386 - dot(q, up) * k];
  assert(result.every(Number.isFinite));
  return result;
}

function prism(a, b, radiusA, radiusB, color, sides = 5, aspect = 0.75) {
  const axis = unit(sub(b, a));
  const u = unit(cross(axis, Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]));
  const v = cross(axis, u);
  const ring = (center, radius) => Array.from({ length: sides }, (_, i) => {
    const angle = 2 * Math.PI * i / sides + Math.PI / 4;
    return add(center, add(mul(u, radius * Math.cos(angle)), mul(v, radius * aspect * Math.sin(angle))));
  });
  const bottom = ring(a, radiusA), top = ring(b, radiusB);
  faces.push({ points: [...bottom].reverse(), color }, { points: top, color });
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push({ points: [bottom[i], bottom[j], top[j], top[i]], color });
  }
}

const ground = (u, v) => [right[0]*u + right[2]*-v, 0, right[2]*u + right[0]*v];
function character(position, height, width, lean, armLength, color) {
  const p = (x, y, z = 0) => add(position, [x + lean*y, y*height, z]);
  const limb = (a, b, ra, rb, shade) => prism(p(...a), p(...b), ra, rb, shade, 4);
  limb([0, 0.43], [0, 0.74], width*0.9, width, color);
  limb([0, 0.76], [0, 0.99], width*0.70, width*0.45, palette.bone);
  for (const side of [-1, 1]) {
    const legX = side*width*0.48, shoulderX = side*width*0.93;
    limb([legX, 0.44], [legX*1.25, 0.23, side*0.035], width*0.26, width*0.19, color);
    limb([legX*1.25, 0.23, side*0.035], [legX*1.30, 0.03, 0.08], width*0.19, width*0.24, palette.bone);
    limb([shoulderX, 0.71], [shoulderX*1.3, 0.71-armLength/2, 0.035], width*0.19, width*0.14, color);
    limb([shoulderX*1.3, 0.71-armLength/2, 0.035], [shoulderX*1.6, 0.71-armLength, 0.10], width*0.14, width*0.18, palette.bone);
  }
}

const actors = [
  { name: 'ян', p: ground(-1.15, -1.8), shape: [2.20, 0.22, 0.02, 0.37, palette.sage] },
  { name: 'лев', p: ground(1.32, -0.60), shape: [1.42, 0.40, -0.02, 0.35, palette.ochre] },
  { name: 'мира', p: ground(0.38, 1.40), shape: [1.90, 0.29, 0.11, 0.53, palette.blue] },
];
actors.forEach(actor => character(actor.p, ...actor.shape));
const artifact = ground(-1.35, 2.65);
prism(add(artifact, [0, 0.04, 0]), add(artifact, [0, 0.16, 0]), 0.27, 0.18, palette.ochre, 4);
prism(add(artifact, [-0.10, 0.31, 0]), add(artifact, [0.01, 0.55, 0]), 0.18, 0.025, palette.bone, 4);
prism(add(artifact, [0.17, 0.69, 0.02]), add(artifact, [0.10, 0.87, 0.04]), 0.12, 0.025, palette.blue, 4);

const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const text = (x, y, label, size = 16, fill = '#DDD9CC', extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${escape(label)}</text>`;
function shade(hex, normal) {
  const amount = 0.43 + 0.57 * Math.max(0, dot(normal, light));
  return '#' + hex.slice(1).match(/../g).map(c => Math.round(parseInt(c,16)*amount).toString(16).padStart(2,'0')).join('');
}

function scene(perspective) {
  const visible = faces.map(face => {
    const center = mul(face.points.reduce(add, [0, 0, 0]), 1/face.points.length);
    const normal = unit(cross(sub(face.points[1], face.points[0]), sub(face.points[2], face.points[0])));
    return { ...face, center, normal };
  }).filter(face => dot(face.normal, perspective ? sub(eye, face.center) : towardCamera) > 0);
  // ponytail: painter ordering fits this fixed scene; use a depth buffer for arbitrary intersecting geometry.
  visible.sort((a, b) => dot(a.center, towardCamera)-dot(b.center, towardCamera));
  let result = visible.map(face => {
    const points = face.points.map(p => project(p, perspective).map(n => n.toFixed(2)).join(',')).join(' ');
    return `<polygon points="${points}" fill="${shade(face.color, face.normal)}"/>`;
  }).join('\n');
  for (const actor of actors) {
    const [x,y] = project(actor.p, perspective);
    result += text(x, y+23, actor.name, 14, '#A9ADB2', 'text-anchor="middle"');
  }
  const [x,y] = project(artifact, perspective);
  result += text(x, y+25, 'замысел', 14, '#91A9B8', 'text-anchor="middle"');
  return result;
}

function phone(perspective) {
  return `<rect width="390" height="844" fill="#000000"/>
    ${text(24, 40, 'мира')}
    <g>${scene(perspective)}</g>
    <path d="M24 635 H366" stroke="#252A30"/>
    ${text(24, 664, 'Мир ищет форму для встречи.', 16, '#91A9B8')}
    ${text(24, 697, 'Коснись замысла, чтобы прочитать.', 14, '#A9ADB2')}
    ${text(24, 744, 'лев: где будем встречаться?', 16)}
    <rect x="24" y="768" width="342" height="48" fill="#14171A" stroke="#39424A"/>
    ${text(44, 798, 'Разговор')}${text(344,798,'↗',20,'#91A9B8','text-anchor="end"')}`;
}

const svg = (width, height, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${escape(title)}</title><desc id="desc">Статичная визуальная гипотеза: три геометрические фигуры и предвестник изменения. Не скриншот игры; текстовые элементы не интерактивны.</desc>
<g font-family="DejaVu Sans Mono, monospace">${body}</g></svg>\n`;

// Small runnable check: equal reference scale, orthographic invariance, perspective foreshortening.
assert.deepEqual(project(target, false), [195, 386]);
assert.deepEqual(project(target, true), [195, 386]);
const projectedWidth = (offset, mode) => {
  const center = add(target, mul(towardCamera, offset));
  return project(add(center, right), mode)[0]-project(center, mode)[0];
};
assert(Math.abs(projectedWidth(2,false)-projectedWidth(-2,false)) < 1e-9);
assert(projectedWidth(2,true) > projectedWidth(-2,true));
assert(Math.abs(projectedWidth(0,true)-projectedWidth(0,false)) < 1e-9);

let board = `<rect width="1120" height="1160" fill="#0A0D10"/>`;
board += text(72, 52, 'Один мир · две камеры', 28);
board += text(72, 84, 'LOW-POLY / ВИЗУАЛЬНАЯ ПРОБА 01 / НЕ ИГРОВОЙ ЭКРАН', 14, '#A9ADB2');
for (const [x, perspective, title, filename] of [
  [110, false, 'A · Ортографическая', 'camera-orthographic.svg'],
  [620, true, 'B · Умеренная перспектива', 'camera-perspective.svg'],
]) {
  board += text(x, 132, title, 18);
  board += `<g transform="translate(${x} 158)">${phone(perspective)}<rect width="390" height="844" fill="none" stroke="#39424A"/></g>`;
  writeFileSync(new URL(filename, import.meta.url), svg(390,844,title,phone(perspective)));
}
board += text(110, 1043, 'Фигуры сохраняют размер', 16, '#A9ADB2');
board += text(110, 1068, 'при удалении от камеры.', 16, '#A9ADB2');
board += text(620, 1043, 'Ближние формы крупнее,', 16, '#A9ADB2');
board += text(620, 1068, 'дальние — компактнее.', 16, '#A9ADB2');
board += text(110, 1120, 'Одинаковые сцена, наклон, свет и UI. Различается только проекция.', 14, '#A9ADB2');
writeFileSync(new URL('camera-comparison.svg', import.meta.url), svg(1120,1160,'Сравнение камер low-poly мира',board));
console.log(`Generated 3 SVG studies from ${faces.length} shared geometric faces. Projection checks passed.`);
