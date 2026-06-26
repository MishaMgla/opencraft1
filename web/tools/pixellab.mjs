import { BASE_URL, ENDPOINTS, requestBody, jobIdOf, jobDoneOf, jobFailedOf, jobImagesOf } from './contract.mjs';

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function generate(
  { type, prompt, size, frames = 1, directions = 4, view },
  { apiKey, fetchImpl = fetch, pollMs = 2000, timeoutMs = 300000, sleep = realSleep },
) {
  if (!apiKey) throw new Error('PIXELLAB_API_KEY is not set');
  // How many images a complete result must contain. Used to distinguish a
  // genuine inline (sync) response from a partial one returned alongside a
  // background_job_id — we must NOT accept a half-generated character.
  const expected = type === 'character' ? directions : type === 'effect' ? frames : 1;
  const res = await fetchImpl(`${BASE_URL}${ENDPOINTS[type]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody(type, { prompt, size, view })),
  });
  if (!res.ok) throw new Error(`PixelLab POST ${ENDPOINTS[type]} failed: HTTP ${res.status}`);
  const post = await res.json();
  const syncImages = jobImagesOf(post);
  // Only accept the inline response if it is COMPLETE. A short/partial images
  // payload (e.g. a job envelope with an empty or 2-of-4 images object) falls
  // through to polling instead of being treated as a finished sync result.
  if (syncImages.length >= expected) {
    return { images: syncImages.map((b64) => Buffer.from(b64, 'base64')) };
  }
  const id = jobIdOf(post);
  if (!id) throw new Error('PixelLab POST returned neither a complete image set nor a background_job_id');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pollRes = await fetchImpl(`${BASE_URL}/background-jobs/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) throw new Error(`PixelLab poll failed: HTTP ${pollRes.status}`);
    const job = await pollRes.json();
    if (jobFailedOf(job)) throw new Error(`PixelLab job ${id} failed`);
    if (jobDoneOf(job)) {
      const images = jobImagesOf(job).map((b64) => Buffer.from(b64, 'base64'));
      if (images.length < expected) {
        throw new Error(`PixelLab job ${id} returned ${images.length} image(s), expected ${expected}`);
      }
      return { images };
    }
    if (Date.now() > deadline) throw new Error(`PixelLab job ${id} timed out after ${timeoutMs}ms`);
    await sleep(pollMs);
  }
}
