// KyroXChat v2 - tanpa npm install. Jalan di Termux (localhost) dan Render.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DD = process.env.DATA_DIR || __dirname, UP = path.join(DD, 'uploads'), DB = path.join(DD, 'data.json');
fs.mkdirSync(UP, { recursive: true });

let db = { users: {}, chats: {}, msgs: {} };
try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch {}
let tm; const save = () => { clearTimeout(tm); tm = setTimeout(() => fs.writeFile(DB, JSON.stringify(db), () => {}), 300); };

const cl = {};
const send = (ids, ev) => ids.forEach(i => (cl[i] || []).forEach(r => r.write('data:' + JSON.stringify(ev) + '\n\n')));
const online = id => !!(cl[id] && cl[id].size);
const pub = u => ({ id: u.id, name: u.name, avatar: u.avatar || '', about: u.about || '', online: online(u.id), seen: u.seen || 0 });
const newId = () => { let id; do id = 'KyroXChat' + crypto.randomInt(100000, 999999); while (db.users[id]); return id; };
const auth = req => { const t = req.headers['x-token'] || new URL(req.url, 'http://x').searchParams.get('token'); return t && Object.values(db.users).find(u => u.token === t); };
const okUrl = s => /^\/uploads\/[\w.-]+$/.test(s || '');

const view = (c, me) => {
  const vis = (db.msgs[c.id] || []).filter(m => !(m.h || []).includes(me.id));
  const last = vis[vis.length - 1] || null;
  const o = { id: c.id, type: c.type, name: c.name || '', avatar: c.avatar || '', members: c.members, last, ts: last ? last.ts : c.ts, unread: vis.filter(m => m.from !== me.id && !(m.r || []).includes(me.id)).length };
  if (c.type === 'dm') o.peer = pub(db.users[c.members.find(x => x !== me.id)]);
  else o.mu = c.members.map(x => pub(db.users[x]));
  return o;
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.weba': 'audio/webm', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const body = req => new Promise((ok, no) => { let b = '', n = 0; req.on('data', d => { n += d.length; if (n > 1e6) { no(); req.destroy(); } else b += d; }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });

function file(req, res, f) {
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('404'); }
    const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
    if (f.endsWith('sw.js')) h['Cache-Control'] = 'no-cache';
    if (m) {
      const s = m[1] ? +m[1] : 0, en = m[2] ? +m[2] : st.size - 1;
      res.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${en}/${st.size}`, 'Content-Length': en - s + 1 });
      fs.createReadStream(f, { start: s, end: en }).pipe(res);
    } else { res.writeHead(200, { ...h, 'Content-Length': st.size }); fs.createReadStream(f).pipe(res); }
  });
}

const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/manifest.webmanifest': 'manifest.webmanifest', '/sw.js': 'sw.js', '/icon-192.png': 'icon-192.png', '/icon-512.png': 'icon-512.png' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  try {
    if (req.method === 'GET' && STATIC[p]) return file(req, res, path.join(__dirname, STATIC[p]));
    if (req.method === 'GET' && p.startsWith('/uploads/')) return file(req, res, path.join(UP, path.basename(p)));
    if (!p.startsWith('/api/')) { res.writeHead(404); return res.end(); }

    if (p === '/api/register' && req.method === 'POST') {
      const b = await body(req), name = String(b.name || '').trim().slice(0, 40);
      if (name.length < 2) return json(res, 400, { error: 'Nama lengkap minimal 2 huruf' });
      const user = { id: newId(), name, avatar: '', about: 'Hai, aku pakai KyroXChat!', token: crypto.randomBytes(24).toString('hex'), seen: Date.now(), ts: Date.now() };
      db.users[user.id] = user; save();
      return json(res, 200, { token: user.token, me: pub(user) });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const b = await body(req), user = db.users[String(b.id || '').trim()];
      if (!user || user.token !== String(b.code || '').trim()) return json(res, 401, { error: 'ID atau kode pemulihan salah' });
      return json(res, 200, { token: user.token, me: pub(user) });
    }

    const me = auth(req);
    if (!me) return json(res, 401, { error: 'Belum login' });

    if (p === '/api/me') return json(res, 200, { me: pub(me), code: me.token });

    if (p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const was = online(me.id);
      (cl[me.id] = cl[me.id] || new Set()).add(res);
      if (!was) send(Object.keys(cl), { t: 'pres', u: pub(me) });
      const ka = setInterval(() => res.write(':ka\n\n'), 20000);
      req.on('close', () => {
        clearInterval(ka); cl[me.id].delete(res);
        if (!cl[me.id].size) { me.seen = Date.now(); save(); send(Object.keys(cl), { t: 'pres', u: pub(me) }); }
      });
      return;
    }

    if (p === '/api/profile' && req.method === 'POST') {
      const b = await body(req);
      if (b.name !== undefined) { const n = String(b.name).trim().slice(0, 40); if (n.length >= 2) me.name = n; }
      if (b.about !== undefined) me.about = String(b.about).slice(0, 120);
      if (okUrl(b.avatar)) me.avatar = b.avatar;
      save(); send(Object.keys(cl), { t: 'user', u: pub(me) });
      return json(res, 200, { me: pub(me) });
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const fn = decodeURIComponent(req.headers['x-filename'] || 'file'), ext = path.extname(fn).toLowerCase().replace(/[^.\w]/g, '').slice(0, 8);
      const out = crypto.randomBytes(10).toString('hex') + ext, ws = fs.createWriteStream(path.join(UP, out));
      let n = 0, bad = false;
      req.on('data', d => { n += d.length; if (n > 100e6 && !bad) { bad = true; ws.destroy(); req.destroy(); } });
      req.pipe(ws);
      ws.on('finish', () => !bad && json(res, 200, { url: '/uploads/' + out, name: fn }));
      return;
    }

    if (p.startsWith('/api/user/')) {
      const t = db.users[decodeURIComponent(p.slice(10))];
      return t ? json(res, 200, { user: pub(t) }) : json(res, 404, { error: 'ID tidak ditemukan' });
    }

    if (p === '/api/chats') return json(res, 200, { chats: Object.values(db.chats).filter(c => c.members.includes(me.id)).map(c => view(c, me)).sort((a, b) => b.ts - a.ts) });

    if (p === '/api/chat/open' && req.method === 'POST') {
      const b = await body(req), peer = db.users[String(b.peer || '').trim()];
      if (!peer) return json(res, 404, { error: 'ID tidak ditemukan' });
      if (peer.id === me.id) return json(res, 400, { error: 'Itu ID kamu sendiri' });
      const id = 'dm_' + [me.id, peer.id].sort().join('_');
      if (!db.chats[id]) { db.chats[id] = { id, type: 'dm', members: [me.id, peer.id], ts: Date.now() }; db.msgs[id] = []; save(); send([peer.id], { t: 'chat' }); }
      return json(res, 200, { chat: view(db.chats[id], me) });
    }

    if (p === '/api/group' && req.method === 'POST') {
      const b = await body(req), name = String(b.name || '').trim().slice(0, 40);
      const ids = [...new Set((b.members || []).map(x => String(x).trim()).filter(Boolean))];
      const bad = ids.filter(i => !db.users[i]);
      if (!name) return json(res, 400, { error: 'Nama grup wajib diisi' });
      if (bad.length) return json(res, 404, { error: 'ID tidak ditemukan: ' + bad.join(', ') });
      const members = [...new Set([me.id, ...ids])];
      const id = 'g_' + crypto.randomBytes(6).toString('hex');
      db.chats[id] = { id, type: 'group', name, members, by: me.id, ts: Date.now() }; db.msgs[id] = []; save();
      send(members, { t: 'chat' });
      return json(res, 200, { chat: view(db.chats[id], me) });
    }

    if (p === '/api/group/update' && req.method === 'POST') {
      const b = await body(req), c = db.chats[b.chat];
      if (!c || c.type !== 'group' || !c.members.includes(me.id)) return json(res, 403, { error: 'Tidak boleh' });
      if (b.name && String(b.name).trim()) c.name = String(b.name).trim().slice(0, 40);
      if (okUrl(b.avatar)) c.avatar = b.avatar;
      if (Array.isArray(b.add)) {
        const ids = [...new Set(b.add.map(x => String(x).trim()).filter(Boolean))], bad = ids.filter(i => !db.users[i]);
        if (bad.length) return json(res, 404, { error: 'ID tidak ditemukan: ' + bad.join(', ') });
        ids.forEach(i => { if (!c.members.includes(i)) c.members.push(i); });
      }
      save(); send(c.members, { t: 'chat' });
      return json(res, 200, { chat: view(c, me) });
    }

    if (p === '/api/group/leave' && req.method === 'POST') {
      const b = await body(req), c = db.chats[b.chat];
      if (!c || c.type !== 'group' || !c.members.includes(me.id)) return json(res, 403, { error: 'Tidak boleh' });
      c.members = c.members.filter(x => x !== me.id); save();
      send([...c.members, me.id], { t: 'chat' });
      return json(res, 200, { ok: 1 });
    }

    if (p === '/api/messages') {
      const c = db.chats[u.searchParams.get('chat')];
      if (!c || !c.members.includes(me.id)) return json(res, 403, { error: 'Tidak boleh' });
      const users = {}; c.members.forEach(m => users[m] = pub(db.users[m]));
      return json(res, 200, { msgs: (db.msgs[c.id] || []).filter(m => !(m.h || []).includes(me.id)).slice(-300), users });
    }

    if (p === '/api/send' && req.method === 'POST') {
      const b = await body(req), c = db.chats[b.chat];
      if (!c || !c.members.includes(me.id)) return json(res, 403, { error: 'Tidak boleh' });
      const type = ['text', 'image', 'video', 'audio', 'file'].includes(b.type) ? b.type : 'text';
      const text = String(b.text || '').slice(0, 4000), url = okUrl(b.url) ? b.url : '';
      if (type === 'text' ? !text.trim() : !url) return json(res, 400, { error: 'Kosong' });
      const m = { id: crypto.randomBytes(6).toString('hex'), chat: c.id, from: me.id, type, text, url, name: String(b.name || '').slice(0, 120), ts: Date.now(), r: [] };
      const rp = b.reply && db.msgs[c.id].find(x => x.id === b.reply);
      if (rp) m.reply = { id: rp.id, from: rp.from, type: rp.type, text: (rp.text || rp.name || '').slice(0, 80) };
      db.msgs[c.id].push(m); save();
      send(c.members, { t: 'msg', m, from: pub(me) });
      return json(res, 200, { m });
    }

    if (p === '/api/msg/delete' && req.method === 'POST') {
      const b = await body(req), c = db.chats[b.chat], m = c && c.members.includes(me.id) && (db.msgs[c.id] || []).find(x => x.id === b.id);
      if (!m) return json(res, 404, { error: 'Pesan tidak ada' });
      if (b.all && m.from === me.id) { m.type = 'text'; m.text = ''; m.url = ''; m.name = ''; m.del = 1; delete m.reply; send(c.members, { t: 'del', chat: c.id, id: m.id }); }
      else (m.h = m.h || []).push(me.id);
      save(); return json(res, 200, { ok: 1 });
    }

    if (p === '/api/read' && req.method === 'POST') {
      const b = await body(req), c = db.chats[b.chat];
      if (!c || !c.members.includes(me.id)) return json(res, 403, { error: 'Tidak boleh' });
      let ch = false;
      (db.msgs[c.id] || []).forEach(m => { if (m.from !== me.id && !(m.r || []).includes(me.id)) { (m.r = m.r || []).push(me.id); ch = true; } });
      if (ch) { save(); send(c.members, { t: 'read', chat: c.id, by: me.id }); }
      return json(res, 200, { ok: 1 });
    }

    if (p === '/api/typing' && req.method === 'POST') {
      const b = await body(req), c = db.chats[b.chat];
      if (c && c.members.includes(me.id)) send(c.members.filter(x => x !== me.id), { t: 'typing', chat: c.id, from: me.id });
      return json(res, 200, { ok: 1 });
    }

    json(res, 404, { error: 'Tidak ada' });
  } catch (e) { try { json(res, 500, { error: 'Server error' }); } catch {} }
}).listen(PORT, '0.0.0.0', () => console.log(`\n  KyroXChat v2 jalan -> http://localhost:${PORT}\n`));
