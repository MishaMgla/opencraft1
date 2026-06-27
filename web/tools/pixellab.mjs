import {
  BASE_URL, ENDPOINTS, DIRECTIONS, ORDINAL_DIRECTIONS, requestBody,
  jobIdOf, jobDoneOf, jobFailedOf, jobImagesOf,
  characterIdOf, rotationUrlsOf, ordinalRotationUrlsOf,
  animateRequestBody, animationJobIdsOf, animationFramesOf,
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
  if (!res.ok) {
    // Surface the response body — FastAPI 422s carry a `detail` explaining exactly
    // which field is wrong, which a bare "HTTP 422" hides.
    let body = '';
    try { body = (await res.text()).replace(/\s+/g, ' ').slice(0, 300); } catch { /* ignore */ }
    throw new Error(`PixelLab ${what} failed: HTTP ${res.status}`
      + (res.status === 402 ? ' (insufficient credits — check `/balance`)' : '')
      + (body ? ` — ${body}` : ''));
  }
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
  const ordinal = input.ordinal === true;
  const { apiKey, fetchImpl, pollMs, timeoutMs, animTimeoutMs, sleep } = ctx;
  const poll = (id) => pollJob(fetchImpl, apiKey, id, { pollMs, timeoutMs, sleep });
  const usage = [];

  // ISO (ordinal) characters use the 8-direction endpoint and keep the four
  // diagonal facings; cardinal characters use the legacy 4-direction endpoint.
  const endpoint = ordinal ? ENDPOINTS.character8 : ENDPOINTS.character;
  const bodyType = ordinal ? 'character8' : 'character';

  // 1. Create the character (async). 2. Wait for the generation job.
  const post = await postJson(fetchImpl, `${BASE_URL}${endpoint}`, apiKey,
    requestBody(bodyType, { prompt, size, view, outline, templateId }),
    `POST ${endpoint}`);
  if (usageOf(post)) usage.push(usageOf(post));
  const characterId = characterIdOf(post);
  const jobId = jobIdOf(post);
  if (!characterId || !jobId) throw new Error('PixelLab create-character returned no character_id/background_job_id');
  const genJob = await poll(jobId);
  if (usageOf(genJob)) usage.push(usageOf(genJob));

  // 3. Fetch the character; download the directional stills from rotation_urls.
  let detail = await getJson(fetchImpl, `${BASE_URL}/characters/${characterId}`, apiKey, `GET /characters/${characterId}`);
  let dirs, urls;
  if (ordinal) {
    const picked = ordinalRotationUrlsOf(detail);
    if (picked.length < ORDINAL_DIRECTIONS.length) {
      throw new Error(`PixelLab character ${characterId} returned ${picked.length}/${ORDINAL_DIRECTIONS.length} ordinal rotation URL(s) `
        + `(have keys: ${Object.keys(detail.rotation_urls ?? {}).join(', ') || 'none'})`);
    }
    dirs = picked.map((p) => p.dir);
    urls = picked.map((p) => p.url);
  } else {
    urls = rotationUrlsOf(detail);
    if (urls.length < directions) {
      throw new Error(`PixelLab character ${characterId} returned ${urls.length} rotation URL(s), expected ${directions}`);
    }
    dirs = DIRECTIONS.slice(0, directions);
    urls = urls.slice(0, directions);
  }
  const images = [];
  for (const u of urls) images.push(await download(fetchImpl, u, 'download rotation image'));

  // 4. Optional animation (e.g. walk): one job per direction, then frame URLs.
  // NON-FATAL: the 4 directional stills above are the core deliverable. If the
  // animation step fails (API hiccup, validation, slow job), still return the
  // static character so the asset ships — the walk cycle is an enhancement, not a
  // gate. The failure is reported up so the caller can warn.
  let anim = null;
  // The text-to-animation (v3) path is only wired for the cardinal 4-direction
  // characters; ISO ordinal characters ship STATIC (the renderer plays a
  // procedural trot while moving), keeping regeneration to a single reliable job.
  if (animation && !ordinal) {
    try {
      const animPost = await postJson(fetchImpl, `${BASE_URL}/animate-character`, apiKey,
        animateRequestBody({ characterId, animation, frameCount }), 'POST /animate-character');
      if (usageOf(animPost)) usage.push(usageOf(animPost));
      // Poll the per-direction jobs in PARALLEL (independent) with a longer
      // timeout — v3 generation is slow, and sequential polling multiplied that
      // by 4. allSettled so a single slow/failed direction doesn't sink the rest;
      // the finished frames persist on the character either way.
      const settled = await Promise.allSettled(
        animationJobIdsOf(animPost).map((aid) =>
          pollJob(fetchImpl, apiKey, aid, { pollMs, timeoutMs: animTimeoutMs, sleep })),
      );
      for (const r of settled) if (r.status === 'fulfilled' && usageOf(r.value)) usage.push(usageOf(r.value));
      // Authoritative result: GET the character (animations persist server-side,
      // independent of whether our client poll caught each job).
      detail = await getJson(fetchImpl, `${BASE_URL}/characters/${characterId}`, apiKey, `GET /characters/${characterId}`);
      const grp = animationFramesOf(detail, animation);
      const frames = {};
      let total = 0;
      for (const dir of DIRECTIONS.slice(0, directions)) {
        frames[dir] = [];
        for (const u of grp?.frames?.[dir] ?? []) { frames[dir].push(await download(fetchImpl, u, `download ${animation} frame`)); total++; }
      }
      // Partial is fine (missing directions fall back to the idle/trot in the
      // renderer); only a TOTAL miss counts as a failed animation → static ship.
      if (!total) throw new Error(`no '${animation}' frames available after animate-character (all directions timed out/failed)`);
      anim = { name: animation, frames };
    } catch (e) {
      anim = { failed: true, error: e.message };
    }
  }

  return { images, dirs, animation: anim, usage };
}

export async function generate(input, opts) {
  const {
    apiKey, fetchImpl = fetch, pollMs = 2000, timeoutMs = 300000,
    animTimeoutMs = 900000, sleep = realSleep,
  } = opts;
  if (!apiKey) throw new Error('PIXELLAB_API_KEY is not set');
  const ctx = { apiKey, fetchImpl, pollMs, timeoutMs, animTimeoutMs, sleep };
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
