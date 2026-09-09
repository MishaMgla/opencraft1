import * as THREE from 'three';

const PALETTE = [0x9baf96, 0xbea56f, 0x91a9b8, 0xaaa1b0];
const UNIT = 64;
const CENTER = 2048;

export function createScene(canvas: HTMLCanvasElement, labels: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000);
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 180);
  const focus = new THREE.Vector3(0, .85, 0);
  const offset = new THREE.Vector3(6, 9, 12).normalize().multiplyScalar(13);
  const right = new THREE.Vector3(offset.z, 0, -offset.x).normalize();
  const forward = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
  world.add(new THREE.HemisphereLight(0xe5e4d7, 0x394338, 2));
  const light = new THREE.DirectionalLight(0xffeed3, 2.4);
  light.position.set(-4, 9, 6);
  world.add(light);

  const box = new THREE.BoxGeometry(1, 1, 1);
  const bodyGeometry = new THREE.CylinderGeometry(.7, 1, 1, 5);
  const crystal = new THREE.OctahedronGeometry(1, 0);
  const materials = PALETTE.map(color => new THREE.MeshLambertMaterial({ color, flatShading: true }));
  const bone = new THREE.MeshLambertMaterial({ color: 0xddd9cc, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x263025 });
  const point = new THREE.Vector3();

  function makeAvatar(seed: number, name: string, version = 2) {
    if (version !== 1 && version !== 2) throw new Error('Unknown avatar recipe; reload required');
    const root = new THREE.Group();
    const torso = new THREE.Group();
    root.add(torso);
    const color = materials[seed % materials.length]!;
    let height = 1.55 + ((seed >>> 4) % 7) * .09;
    const width = .34 + ((seed >>> 8) % 5) * .035;
    const kind = version === 1 ? -1 : seed % 5;
    const limbs: THREE.Group[] = [];
    const floating: { part: THREE.Mesh; y: number }[] = [];
    function part(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, scale: [number, number, number], position: [number, number, number]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(...scale);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    }
    // Version 1 is intentionally frozen: a saved seed must keep its old body.
    if (version === 1) {
    part(torso, bodyGeometry, color, [width, height * .38, width * .7], [0, height * .59, 0]);
    const head = part(torso, box, bone, [width * .95, height * .2, width * .85], [0, height * .92, 0]);
    head.rotation.z = (((seed >>> 12) % 5) - 2) * .045;
    part(torso, box, dark, [width * .65, .055, .02], [0, height * .95, width * .43]);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * width * .48, height * .39, 0);
      torso.add(leg);
      part(leg, box, color, [width * .32, height * .32, width * .36], [0, -height * .16, 0]);
      part(leg, box, bone, [width * .43, .09, width * .68], [0, -height * .36, width * .12]);
      limbs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(side * width * .88, height * .74, 0);
      arm.rotation.z = side * .14;
      torso.add(arm);
      part(arm, box, bone, [width * .25, height * .3, width * .26], [0, -height * .16, 0]);
      limbs.push(arm);
    }
    } else {
      const variation = .9 + ((seed >>> 5) % 7) * .035;
      function leg(x: number, z: number, length: number, thickness: number) {
        const joint = new THREE.Group();
        joint.position.set(x, length + .1, z);
        torso.add(joint);
        part(joint, box, color, [thickness, length, thickness], [0, -length / 2, 0]);
        part(joint, box, bone, [thickness * 1.6, .1, thickness * 2], [0, -length, .04]);
        limbs.push(joint);
      }
      switch (kind) {
        case 0: // A narrow, long-legged tripod with a crosswise head.
          height = 2.45 * variation;
          part(torso, crystal, color, [.27, .5, .28], [0, height - .65, 0]);
          part(torso, box, color, [.65, .18, .52], [0, height - .94, -.08]);
          part(torso, box, bone, [.85, .22, .25], [0, height - .12, 0]);
          part(torso, box, dark, [.55, .06, .03], [0, height - .1, .14]);
          leg(-.28, .12, height - 1, .09); leg(.28, .12, height - 1, .09); leg(0, -.3, height - 1, .09);
          break;
        case 1: // A low, broad six-legged shell.
          height = 1.05 * variation;
          part(torso, bodyGeometry, color, [.95, .6, .68], [0, .62, 0]);
          part(torso, box, color, [1.62, .18, .94], [0, .43, 0]);
          part(torso, box, bone, [.48, .24, .3], [0, .66, .63]);
          for (const x of [-.76, .76]) for (const z of [-.4, 0, .4]) leg(x, z, .33, .13);
          part(torso, box, dark, [.32, .06, .03], [0, .71, .8]);
          break;
        case 2: // A suspended diamond; no arms or legs, no gameplay flight.
          height = 1.9 * variation;
          part(torso, crystal, color, [.62, .82 * variation, .62], [0, 1.1, 0]);
          part(torso, crystal, bone, [.2, .2, .2], [0, 1.22, .55]);
          part(torso, box, dark, [.09, .09, .03], [0, 1.24, .70]);
          break;
        case 3: // Three separated stones and two small orbiting fragments.
          height = 2.2 * variation;
          for (let i = 0; i < 3; i++) {
            const y = .45 + i * .65;
            const mesh = part(torso, crystal, i === 2 ? bone : color,
              [.55 - i * .12, .28, .48 - i * .09], [i % 2 ? .13 : -.1, y, 0]);
            floating.push({ part: mesh, y });
          }
          for (const x of [-.73, .73]) {
            const mesh = part(torso, crystal, color, [.13, .2, .13], [x, 1, 0]);
            floating.push({ part: mesh, y: 1 });
          }
          break;
        case 4: // An offset body carried by a large claw and one foot.
          height = 1.65 * variation;
          part(torso, bodyGeometry, color, [.4, .85, .36], [-.13, 1, 0]);
          part(torso, box, color, [.2, .32, .2], [-.3, 1.4, .06]);
          part(torso, crystal, bone, [.32, .32, .3], [-.3, 1.65, .06]);
          leg(-.35, 0, .5, .17);
          part(torso, box, color, [.65, .18, .22], [.4, 1.1, 0]);
          part(torso, bodyGeometry, color, [.45, .85, .4], [.77, .64, 0]);
          for (const x of [.55, .92]) part(torso, box, bone, [.16, .2, .45], [x, .16, .12]);
          part(torso, box, dark, [.16, .07, .03], [-.3, 1.69, .29]);
          break;
      }
    }
    const label = document.createElement('span');
    label.className = 'player-label';
    label.textContent = name;
    const speech = document.createElement('span');
    speech.className = 'player-speech';
    speech.hidden = true;
    labels.append(label, speech);
    world.add(root);
    const bounds = new THREE.Box3().setFromObject(root);
    const previewBounds = bounds.getBoundingSphere(new THREE.Sphere());
    root.rotation.y = .45;
    return { root, torso, limbs, floating, kind, label, speech, speechUntil: 0, speechTop: bounds.max.y + .2, height, previewBounds, phase: 0, age: seed % 11, walking: 0, x: CENTER, y: CENTER, tx: CENTER, ty: CENTER, heading: .45 };
  }

  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }
  resize();
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(canvas);

  return {
    makeAvatar,
    remove(avatar: ReturnType<typeof makeAvatar>) { world.remove(avatar.root); avatar.label.remove(); avatar.speech.remove(); },
    say(avatar: ReturnType<typeof makeAvatar>, text: string, state = 'saved') {
      avatar.speech.textContent = text;
      avatar.speech.dataset.state = state;
      avatar.speechUntil = performance.now() + Math.min(12000, 5000 + text.length * 40);
    },
    movement(x: number, y: number) { return { x: right.x * x - forward.x * y, y: right.z * x - forward.z * y }; },
    render(avatars: Iterable<ReturnType<typeof makeAvatar>>, target: ReturnType<typeof makeAvatar>, dt: number, reducedMotion: boolean, preview = false) {
      point.set((target.x - CENTER) / UNIT, .85, (target.y - CENTER) / UNIT);
      focus.lerp(point, reducedMotion ? 1 : 1 - Math.exp(-7 * dt));
      let distance = 13 * Math.max(.5, Math.min(1, canvas.clientHeight / 420));
      if (preview) {
        focus.copy(target.previewBounds.center).applyQuaternion(target.root.quaternion).add(target.root.position);
        const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
        distance = target.previewBounds.radius * 1.35 / Math.sin(halfFov);
      }
      // The chooser fits the actual body; the world keeps its existing follow camera.
      camera.position.copy(focus).addScaledVector(offset, distance / 13);
      camera.lookAt(focus);
      camera.updateMatrixWorld();
      for (const avatar of avatars) {
        const dx = avatar.tx - avatar.x, dy = avatar.ty - avatar.y;
        const speed = Math.hypot(dx, dy);
        const blend = 1 - Math.exp(-14 * dt);
        avatar.x += dx * blend;
        avatar.y += dy * blend;
        if (speed > .6) avatar.heading = Math.atan2(dx, dy);
        avatar.walking += ((speed > .6 ? 1 : 0) - avatar.walking) * Math.min(1, dt * 12);
        avatar.phase += dt * 8 * avatar.walking;
        avatar.age += dt;
        const swing = reducedMotion ? 0 : Math.sin(avatar.phase) * .3 * avatar.walking;
        avatar.limbs.forEach((limb, i) => { limb.rotation.x = swing * (i < 2 ? 1 : -1) * (i % 2 ? -1 : 1); });
        const angle = Math.atan2(Math.sin(avatar.heading - avatar.root.rotation.y), Math.cos(avatar.heading - avatar.root.rotation.y));
        avatar.root.rotation.y += angle * Math.min(1, dt * 12);
        avatar.root.position.set((avatar.x - CENTER) / UNIT, 0, (avatar.y - CENTER) / UNIT);
        avatar.torso.position.y = reducedMotion ? 0 : Math.abs(Math.sin(avatar.phase)) * .025 * avatar.walking;
        if (avatar.kind === 1 || avatar.kind === 4) avatar.torso.rotation.z = swing * .12;
        if (avatar.kind === 2) avatar.torso.position.y = reducedMotion ? 0 : Math.sin(avatar.age * 1.6) * .065;
        avatar.floating.forEach(({ part, y }, i) => {
          part.position.y = y + (reducedMotion ? 0 : Math.sin(avatar.age * 1.5 + i) * .06);
          part.rotation.y = reducedMotion ? 0 : Math.sin(avatar.age * .8 + i) * .25;
        });
        point.copy(avatar.root.position);
        point.y = -.15;
        point.project(camera);
        const visible = point.z > -1 && point.z < 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1;
        avatar.label.hidden = !visible;
        if (visible) avatar.label.style.transform = `translate(${(point.x * .5 + .5) * canvas.clientWidth}px, ${(-point.y * .5 + .5) * canvas.clientHeight}px) translateX(-50%)`;
        point.copy(avatar.root.position);
        point.y += avatar.speechTop + avatar.torso.position.y;
        point.project(camera);
        avatar.speech.hidden = preview || performance.now() > avatar.speechUntil || point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
        if (!avatar.speech.hidden) avatar.speech.style.transform = `translate(${(point.x * .5 + .5) * canvas.clientWidth}px, ${(-point.y * .5 + .5) * canvas.clientHeight}px) translate(-50%, -100%)`;
      }
      renderer.render(world, camera);
    },
    dispose() { sizeObserver.disconnect(); renderer.dispose(); box.dispose(); bodyGeometry.dispose(); crystal.dispose(); [...materials, bone, dark].forEach(m => m.dispose()); labels.replaceChildren(); },
  };
}

export type Scene = ReturnType<typeof createScene>;
export type Avatar = ReturnType<Scene['makeAvatar']>;
