// Browser checks through agent-browser, against an already running loopback
// persistent test server. Creates one named guest; always closes its own browser.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const origin = process.argv[2] || 'http://127.0.0.1:8767';
const url = new URL(origin);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.protocol, 'http:');
const session = `evolving-ui-${Date.now()}`;
const run = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 45000 });
const evaluate = code => JSON.parse(run('eval', code));
try {
  run('open', origin);
  run('set', 'viewport', '390', '844');
  run('wait', '--fn', '!document.querySelector("#join").disabled');
  assert.equal(evaluate('document.querySelector("#appearance-note, #keep-look") !== null'), false);
  assert.equal(evaluate('document.querySelector("#entry-info").open'), false);
  for (const [width, height] of [[320,568], [390,844], [844,390], [1280,800]]) {
    run('set', 'viewport', String(width), String(height));
    for (const open of [true, false]) {
      run('eval', `document.querySelector('#entry-info').open = ${open}`);
      run('wait', '--fn', `(() => {
        const scene = document.querySelector('#world').getBoundingClientRect();
        return scene.top >= document.querySelector('.entry-copy').getBoundingClientRect().bottom &&
          scene.height > 20 && Math.abs(scene.bottom - document.querySelector('#entry-form').getBoundingClientRect().top) < 2;
      })()`);
    }
    assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    run('screenshot', `/tmp/opencraft-entry-${width}.png`);
  }
  run('set', 'viewport', '390', '844');
  // Same recipe/seed is deterministic; the five body topologies differ.
  const forms = evaluate(`(async () => {
    const {createScene} = await import('/src/evolving/scene.js');
    const THREE = await import('three');
    const canvas = document.createElement('canvas'), labels = document.createElement('div');
    canvas.style.cssText = 'position:fixed;width:400px;height:300px';
    document.body.append(canvas,labels);
    const scene = createScene(canvas, labels);
    const signature = a => ({kind:a.kind,height:a.height,parts:a.torso.children.length,limbs:a.limbs.length});
    const sample = (seed, version = 2) => { const a = scene.makeAvatar(seed,'',version); const s = signature(a); scene.remove(a); return s; };
    const result = {bodies:[0,1,2,3,4].map(s=>sample(s)), old:sample(123,1), repeat:sample(123,1)};
    // A leg's pivot must meet the body, not hang beside it. Check every height variant.
    const capture = document.createElement('canvas'); capture.width = 400; capture.height = 300;
    const ctx = capture.getContext('2d', {willReadFrequently:true});
    result.detached = []; result.badFrames = [];
    for (let variant = 0; variant < 7; variant++) for (const kind of [0,1,2,3,4]) {
      const seed = variant * 32 + (kind - variant * 32 % 5 + 5) % 5;
      const a = scene.makeAvatar(seed, '');
      a.root.rotation.y = 0; a.root.updateMatrixWorld(true);
      const body = a.torso.children.filter(p => p.isMesh).map(p => new THREE.Box3().setFromObject(p));
      for (const limb of a.limbs) if (!body.some(b => b.containsPoint(limb.position))) result.detached.push(seed);
      a.root.rotation.y = .45;
      scene.render([a], a, .05, true, true);
      ctx.drawImage(canvas, 0, 0, 400, 300);
      const pixels = ctx.getImageData(0,0,400,300).data;
      let left=400, right=-1, top=300, bottom=-1;
      for (let y=0;y<300;y++) for (let x=0;x<400;x++) {
        const i=(y*400+x)*4;
        if (pixels[i]+pixels[i+1]+pixels[i+2] > 30) { left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y); }
      }
      if (right<left || left<8 || right>391 || top<8 || bottom>291 ||
        Math.abs((top+bottom)/2-150)>30 || Math.abs((left+right)/2-200)>40) result.badFrames.push({seed,left,right,top,bottom});
      scene.remove(a);
    }
    scene.dispose(); canvas.remove(); labels.remove(); return result;
  })()`);
  assert.equal(new Set(forms.bodies.map(f => JSON.stringify(f))).size, 5);
  assert.deepEqual(forms.old, forms.repeat);
  assert.equal(forms.old.kind, -1);
  assert.deepEqual(forms.detached, []);
  assert.deepEqual(forms.badFrames, []);
  run('click', '#reroll');
  assert.equal(evaluate('document.querySelector("#previous-look").hidden'), false);
  run('click', '#previous-look');
  run('fill', '#name', 'UI acceptance');
  run('click', '#join');
  run('wait', '--fn', 'document.querySelector("#entry").hidden');
  assert.equal(evaluate('document.querySelector("#world").getBoundingClientRect().top'), 0);
  const guest = evaluate('fetch("/evolving-api/session").then(r=>r.json())');
  assert.equal(guest.avatarVersion, 2);
  assert.equal(guest.appearanceChoicePending, false);
  run('click', '#open-chat');
  run('wait', '--fn', 'document.querySelector("#messages [data-message-id]") !== null');
  assert.deepEqual(evaluate(`({background:getComputedStyle(document.querySelector('#conversation')).backgroundColor,
    border:getComputedStyle(document.querySelector('#conversation')).borderWidth,
    height:document.querySelector('#conversation').getBoundingClientRect().height <= 150,
    world:document.querySelector('#world').getBoundingClientRect().height === innerHeight,
    header:getComputedStyle(document.querySelector('#conversation header')).display,
    author:getComputedStyle(document.querySelector('#messages .author')).display,
    date:getComputedStyle(document.querySelector('#messages time')).display,
    input:getComputedStyle(document.querySelector('#message')).fontSize,
    targets:['send','expand-chat','close-chat'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>=44&&r.height>=44})})`),
    {background:'rgba(0, 0, 0, 0)',border:'0px',height:true,world:true,header:'none',author:'inline',date:'none',input:'16px',targets:true});
  assert.deepEqual(evaluate(`({controls:document.querySelector('#controls').hidden,
    keyboard:document.activeElement.id === 'message',overflow:document.documentElement.scrollWidth>innerWidth,
    overlap:document.querySelector('#conversation').getBoundingClientRect().bottom > document.querySelector('#stick').getBoundingClientRect().top})`),
  {controls:false,keyboard:false,overflow:false,overlap:false});
  run('screenshot', '/tmp/opencraft-ui-compact.png');
  const post = () => evaluate(`fetch('/evolving-api/messages', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({requestId:crypto.randomUUID().replaceAll('-',''),text:'Проверка уведомления UI'})}).then(r=>r.status)`);
  run('click', '#close-chat');
  assert.equal(post(), 200);
  run('wait', '--fn', '!document.querySelector("#unread-dot").hidden');
  assert.equal(evaluate('document.querySelector("#conversation").hidden'), true);
  run('click', '#open-chat');
  run('fill', '#message', 'Незавершённый текст');
  assert.equal(evaluate('document.querySelector("#controls").hidden'), true);
  run('click', '#expand-chat');
  assert.equal(evaluate('document.querySelector("#conversation").classList.contains("expanded")'), true);
  assert.equal(evaluate('getComputedStyle(document.querySelector("#messages time")).display'), 'inline');
  run('screenshot', '/tmp/opencraft-ui-history.png');
  run('eval', 'document.querySelector("#messages").scrollTop = 75');
  const readingPosition = () => evaluate(`(() => {
    const list=document.querySelector('#messages'), top=list.getBoundingClientRect().top;
    const line=[...list.children].find(line=>line.getBoundingClientRect().bottom>top);
    return {id:line.dataset.messageId,offset:Math.round(line.getBoundingClientRect().top-top)};
  })()`);
  const reading = readingPosition();
  run('click', '#close-chat');
  assert.equal(evaluate('document.activeElement.id'), 'open-chat');
  run('click', '#open-chat');
  assert.equal(evaluate('document.querySelector("#message").value'), 'Незавершённый текст');
  assert.deepEqual(readingPosition(), reading);
  const first = evaluate('document.querySelector("#messages").firstElementChild.dataset.messageId');
  assert.equal(post(), 200);
  run('wait', '--fn', '!document.querySelector("#latest").hidden');
  assert.equal(evaluate('document.querySelector("#messages").firstElementChild.dataset.messageId'), first);
  assert.deepEqual(readingPosition(), reading);
  run('set', 'viewport', '320', '568');
  assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  run('screenshot', '/tmp/opencraft-ui-small.png');
  run('set', 'viewport', '1280', '800');
  assert.equal(evaluate('document.querySelector("#conversation").getBoundingClientRect().left > innerWidth / 2'), true);
  run('screenshot', '/tmp/opencraft-ui-desktop.png');
  run('open', origin);
  run('wait', '--fn', '!document.querySelector("#join").disabled');
  assert.equal(evaluate('document.querySelector("#reroll").hidden'), true);
  assert.deepEqual(evaluate('fetch("/evolving-api/session").then(r=>r.json())'), guest);
  run('click', '#join');
  run('wait', '--fn', 'document.querySelector("#entry").hidden');
  run('click', '#open-chat');
  assert.equal(evaluate('document.querySelector("#message").value'), 'Незавершённый текст');
  run('fill', '#message', 'Проверка компактной отправки');
  run('click', '#send');
  run('wait', '--fn', 'document.querySelector("#message").value === "" && document.querySelector("#delivery").textContent === "Сохранено в разговоре."');
  assert.equal(evaluate('document.activeElement.id'), 'message');
  console.log('PASS: entry and body regressions; transparent compact chat, fixed camera viewport, readable input, touch targets, expanded dates, focus return, draft/message-anchor preservation, guest return and send.');
} catch (error) {
  console.error(run('snapshot', '-i'));
  console.error(run('eval', 'document.querySelector("#connection-text").textContent'));
  run('screenshot', '/tmp/opencraft-ui-failure.png');
  throw error;
} finally { run('close'); }
