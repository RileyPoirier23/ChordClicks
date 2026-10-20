/* ChordClicks Ultimate Guitar relay as a Cloudflare Worker (free tier is plenty).
   Deploy: npm i -g wrangler && wrangler login && wrangler deploy deploy/ug-proxy.worker.js --name chordclicks-ug
   Then put the worker URL (https://chordclicks-ug.<you>.workers.dev) in ChordClicks → Settings → Helper server.
   It only relays HTML from ultimate-guitar.com and returns the page's embedded JSON store, nothing else. */
export default {
  async fetch(req) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'content-type': 'application/json' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const u = new URL(req.url);
    if (u.pathname === '/api/health') return new Response('{"ok":true}', { headers: cors });
    if (u.pathname !== '/api/ug') return new Response('{"ok":false}', { status: 404, headers: cors });
    let t; try { t = new URL(u.searchParams.get('url') || ''); } catch (e) { return new Response('{"ok":false,"error":"Bad address"}', { status: 400, headers: cors }); }
    if (t.protocol !== 'https:' || !/(^|\.)ultimate-guitar\.com$/.test(t.hostname)) return new Response('{"ok":false,"error":"Only Ultimate Guitar pages"}', { status: 400, headers: cors });
    try {
      const r = await fetch(t.href, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', accept: 'text/html', 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', cf: { cacheTtl: 600, cacheEverything: true } });
      const html = await r.text(), m = /class="js-store"[^>]*?data-content="([^"]*)"/.exec(html);
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, html: m ? '<div class="js-store" data-content="' + m[1] + '"></div>' : html.slice(0, 200000) }), { headers: { ...cors, 'cache-control': 'public, max-age=600' } });
    } catch (e) { return new Response('{"ok":false,"error":"Could not reach Ultimate Guitar"}', { status: 502, headers: cors }); }
  },
};
