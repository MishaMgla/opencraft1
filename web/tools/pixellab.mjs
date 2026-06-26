import { BASE_URL, ENDPOINTS, requestBody, jobIdOf, jobDoneOf, jobFailedOf, jobImagesOf } from './contract.mjs';

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function generate(
  { type, prompt, size, frames = 1 },
  { apiKey, fetchImpl = fetch, pollMs = 2000, timeoutMs = 300000, sleep = realSleep },
) {
  if (!apiKey) throw new Error('PIXELLAB_API_KEY is not set');
  const res = await fetchImpl(`${BASE_URL}${ENDPOINTS[type]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody(type, { prompt, size, frames })),
  });
  if (!res.ok) throw new Error(`PixelLab POST ${ENDPOINTS[type]} failed: HTTP ${res.status}`);
  const post = await res.json();
  const syncImages = jobImagesOf(post);
  if (syncImages.length > 0) {
    return { images: syncImages.map((b64) => Buffer.from(b64, 'base64')) };
  }
  const id = jobIdOf(post);
  if (!id) throw new Error('PixelLab POST returned neither images nor a background_job_id');
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
      if (!images.length) throw new Error(`PixelLab job ${id} completed with no images`);
      return { images };
    }
    if (Date.now() > deadline) throw new Error(`PixelLab job ${id} timed out after ${timeoutMs}ms`);
    await sleep(pollMs);
  }
}
