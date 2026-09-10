export function checkedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) {
    throw new Error('Mobile server must be an exact HTTPS origin');
  }
  return url.origin;
}

export function createNativeWorld(server, http) {
  const origin = checkedOrigin(server);
  async function request(path, body) {
    const url = new URL(path, origin);
    if (url.origin !== origin || url.hash || ![
      '/preview-info', '/evolving-api/session', '/evolving-api/messages',
      '/evolving-api/appearance', '/evolving-api/socket-ticket',
    ].includes(url.pathname)) throw new Error('Unsupported world request');
    const response = await http.request({
      url: url.href, method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { data: body }),
      responseType: 'json', connectTimeout: 5000, readTimeout: 5000, disableRedirects: true,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(String(response.status));
    if (response.url && response.url !== url.href) throw new Error('Unexpected world redirect');
    // Native HTTP owns cookies. Do not copy response headers or credentials to storage.
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }
  return {
    request,
    async socket() {
      const { ticket } = await request('/evolving-api/socket-ticket', {});
      if (typeof ticket !== 'string' || !/^[a-f0-9]{64}$/.test(ticket)) throw new Error('Invalid socket ticket');
      return {
        url: `${origin.replace('https:', 'wss:')}/evolving-api/socket?recipes=2`,
        protocols: [`opencraft-guest.${ticket}`],
      };
    },
  };
}
