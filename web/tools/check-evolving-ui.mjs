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
  // Same recipe/seed is deterministic; the five body topologies differ.
  const forms = evaluate(`(async () => {
    const {createScene} = await import('/src/evolving/scene.js');
    const canvas = document.createElement('canvas'), labels = document.createElement('div');
    canvas.style.cssText = 'position:fixed;width:400px;height:300px';
    document.body.append(canvas,labels);
    const scene = createScene(canvas, labels);
    const signature = a => ({kind:a.kind,height:a.height,parts:a.torso.children.length,limbs:a.limbs.length});
    const result = {bodies:[0,1,2,3,4].map(s=>signature(scene.makeAvatar(s,''))),
      old:signature(scene.makeAvatar(123,'',1)), repeat:signature(scene.makeAvatar(123,'',1))};
    scene.dispose(); canvas.remove(); labels.remove(); return result;
  })()`);
  assert.equal(new Set(forms.bodies.map(f => JSON.stringify(f))).size, 5);
  assert.deepEqual(forms.old, forms.repeat);
  assert.equal(forms.old.kind, -1);
  run('click', '#reroll');
  assert.equal(evaluate('document.querySelector("#previous-look").hidden'), false);
  run('click', '#previous-look');
  run('fill', '#name', 'UI acceptance');
  run('click', '#join');
  run('wait', '--fn', 'document.querySelector("#entry").hidden');
  const guest = evaluate('fetch("/evolving-api/session").then(r=>r.json())');
  assert.equal(guest.avatarVersion, 2);
  assert.equal(guest.appearanceChoicePending, false);
  run('click', '#open-chat');
  run('wait', '--fn', 'document.querySelector("#messages [data-message-id]") !== null');
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
  run('eval', 'document.querySelector("#messages").scrollTop = 75');
  const scroll = evaluate('document.querySelector("#messages").scrollTop');
  run('click', '#close-chat');
  run('click', '#open-chat');
  assert.equal(evaluate('document.querySelector("#message").value'), 'Незавершённый текст');
  assert.ok(Math.abs(evaluate('document.querySelector("#messages").scrollTop') - scroll) < 2);
  const first = evaluate('document.querySelector("#messages").firstElementChild.dataset.messageId');
  assert.equal(post(), 200);
  run('wait', '--fn', '!document.querySelector("#latest").hidden');
  assert.equal(evaluate('document.querySelector("#messages").firstElementChild.dataset.messageId'), first);
  assert.ok(Math.abs(evaluate('document.querySelector("#messages").scrollTop') - scroll) < 2);
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
  console.log('PASS: five body topologies, deterministic legacy form, previous choice, fixed profile, phone/desktop chat, input focus, draft/scroll preservation and return.');
} catch (error) {
  console.error(run('snapshot', '-i'));
  console.error(run('eval', 'document.querySelector("#connection-text").textContent'));
  run('screenshot', '/tmp/opencraft-ui-failure.png');
  throw error;
} finally { run('close'); }
