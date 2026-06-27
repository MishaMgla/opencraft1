import {
  BASE_URL, ENDPOINTS, DIRECTIONS, requestBody,
  jobIdOf, jobDoneOf, jobFailedOf, jobImagesOf,
  characterIdOf, rotationUrlsOf, animateRequestBody, animationJobIdsOf, animationFramesOf,
  usageOf,
} from './contract.mjs';

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wrap a fetch so a network-layer failure surfaces its REAL reason. undici
// rejects with `TypeError: fetch failed` and hides the actual cause (DNS, connect
// timeout, TLS, proxy) on `.cause` — without this, a blocked runner only ever
// reports the useless string "fetch failed" (see the issue-83 horse block).
async function connect(fetchImpl, url, init, what) {
  try {
    return await fetchImpl(url, init);
  } catch (e) {
    const c = e?.cause;
    const detail = c ? [c.code, c.errno, c.message].filter(Boolean).join(' ') : e.message;
    throw new Error(`PixelLab ${what} could not reach ${url}: ${detail || 'fetch failed'} `
      + '(network egress to api.pixellab.ai — check the runner can make outbound HTTPS)');
  }
}

const authHeaders = (apiKey) => ({ Authorization: `Bearer ${apiKey}` });

async function postJson(fetchImpl, url, apiKey, body, what) {
  const res = await connect(fetchImpl, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
    body: JSON.stringify(body),
  }, what);
  if (!res.ok) throw new Error(`PixelLab ${what} failed: HTTP ${res.status}`
    + (res.status === 402 ? ' (insufficient credits — check `/balance`)' : ''));
  return res.json();
}

async function getJson(fetchImpl, url, apiKey, what) {
  const res = await connect(fetchImpl, url, { headers: authHeaders(apiKey) }, what);
  if (!res.ok) throw new Error(`PixelLab ${what} failed: HTTP ${res.status}`);
  return res.json();
}

// Download a PUBLIC asset URL (rotation/frame image) to a Buffer. These URLs are
// pre-signed and need no Authorization header.
async function download(fetchImpl, url, what) {
  const res = await connect(fetchImpl, url, {}, what);
  if (!res.ok) throw new Error(`PixelLab ${what} failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Poll a background job until it completes; throw on failure or timeout.
async function pollJob(fetchImpl, apiKey, id, { pollMs, timeoutMs, sleep }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await getJson(fetchImpl, `${BASE_URL}/background-jobs/${id}`, apiKey, `poll job ${id}`);
    if (jobFailedOf(job)) throw new Error(`PixelLab job ${id} failed`);
    if (jobDoneOf(job)) return job;
    if (Date.now() > deadline) throw new Error(`PixelLab job ${id} timed out after ${timeoutMs}ms`);
    await sleep(pollMs);
  }
}

// tile / hud (pixflux): synchronous inline base64, with a background-job fallback
// for the rare async envelope. effect would route here too but is rejected upstream.
async function generatePixflux(input, ctx) {
  const { type, prompt, size, frames = 1, view, outline, noBackground, templateId } = input;
  const { apiKey, fetchImpl, pollMs, timeoutMs, sleep } = ctx;
  const expected = type === 'effect' ? frames : 1;
  const usage = [];
  const post = await postJson(fetchImpl, `${BASE_URL}${ENDPOINTS[type]}`, apiKey,
    requestBody(type, { prompt, size, view, outline, noBackground, templateId }), `POST ${ENDPOINTS[type]}`);
  if (usageOf(post)) usage.push(usageOf(post));
  // Accept the inline response only if COMPLETE (never a half-generated set).
  const syncImages = jobImagesOf(post);
  if (syncImages.length >= expected) {
    return { images: syncImages.map((b64) => Buffer.from(b64, 'base64')), usage };
  }
  const id = jobIdOf(post);
  if (!id) throw new Error('PixelLab POST returned neither a complete image set nor a background_job_id');
  const job = await pollJob(fetchImpl, apiKey, id, { pollMs, timeoutMs, sleep });
  if (usageOf(job)) usage.push(usageOf(job));
  const images = jobImagesOf(job).map((b64) => Buffer.from(b64, 'base64'));
  if (images.length < expected) {
    throw new Error(`PixelLab job ${id} returned ${images.length} image(s), expected ${expected}`);
  }
  return { images, usage };
}

// character: ASYNC-ONLY. The POST yields {background_job_id, character_id} with no
// inline images; the 4 directional sprites are PUBLIC URLs on the finished
// CharacterDetail (rotation_urls) that must be downloaded. An optional walk-style
// animation is a SECOND pipeline (one job per direction) whose frames are also URLs.
async function generateCharacter(input, ctx) {
  const { prompt, size, directions = 4, view, outline, templateId, animation, frameCount } = input;
  const { apiKey, fetchImpl, pollMs, timeoutMs, sleep } = ctx;
  const poll = (id) => pollJob(fetchImpl, apiKey, id, { pollMs, timeoutMs, sleep });
  const usage = [];

  // 1. Create the character (async). 2. Wait for the generation job.
  const post = await postJson(fetchImpl, `${BASE_URL}${ENDPOINTS.character}`, apiKey,
    requestBody('character', { prompt, size, view, outline, templateId }),
    'POST /create-character-with-4-directions');
  if (usageOf(post)) usage.push(usageOf(post));
  const characterId = characterIdOf(post);
  const jobId = jobIdOf(post);
  if (!characterId || !jobId) throw new Error('PixelLab create-character returned no character_id/background_job_id');
  const genJob = await poll(jobId);
  if (usageOf(genJob)) usage.push(usageOf(genJob));

  // 3. Fetch the character; download the directional stills from rotation_urls.
  let detail = await getJson(fetchImpl, `${BASE_URL}/characters/${characterId}`, apiKey, `GET /characters/${characterId}`);
  const urls = rotationUrlsOf(detail);
  if (urls.length < directions) {
    throw new Error(`PixelLab character ${characterId} returned ${urls.length} rotation URL(s), expected ${directions}`);
  }
  const images = [];
  for (const u of urls.slice(0, directions)) images.push(await download(fetchImpl, u, 'download rotation image'));

  // 4. Optional animation (e.g. walk): one job per direction, then frame URLs.
  let anim = null;
  if (animation) {
    const animPost = await postJson(fetchImpl, `${BASE_URL}/animate-character`, apiKey,
      animateRequestBody({ characterId, animation, frameCount }), 'POST /animate-character');
    if (usageOf(animPost)) usage.push(usageOf(animPost));
    for (const aid of animationJobIdsOf(animPost)) {
      const aj = await poll(aid);
      if (usageOf(aj)) usage.push(usageOf(aj));
    }
    detail = await getJson(fetchImpl, `${BASE_URL}/characters/${characterId}`, apiKey, `GET /characters/${characterId}`);
    const grp = animationFramesOf(detail, animation);
    if (!grp) throw new Error(`PixelLab character ${characterId} has no '${animation}' animation after animate-character`);
    const frames = {};
    for (const dir of DIRECTIONS.slice(0, directions)) {
      frames[dir] = [];
      for (const u of grp.frames[dir] ?? []) frames[dir].push(await download(fetchImpl, u, `download ${animation} frame`));
    }
    anim = { name: animation, frames };
  }

  return { images, animation: anim, usage };
}

export async function generate(input, opts) {
  const { apiKey, fetchImpl = fetch, pollMs = 2000, timeoutMs = 300000, sleep = realSleep } = opts;
  if (!apiKey) throw new Error('PIXELLAB_API_KEY is not set');
  const ctx = { apiKey, fetchImpl, pollMs, timeoutMs, sleep };
  return input.type === 'character'
    ? generateCharacter(input, ctx)
    : generatePixflux(input, ctx);
}

// Account balance — credits (usd) + subscription generations. Used for a cheap
// preflight so generation failures from an empty account are legible.
export async function getBalance({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('PIXELLAB_API_KEY is not set');
  return getJson(fetchImpl, `${BASE_URL}/balance`, apiKey, 'GET /balance');
}
