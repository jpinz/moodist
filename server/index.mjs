import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const STATIC_ROOT = resolve(process.env.STATIC_ROOT ?? '/var/www/html');
const INGRESS_PORT = Number(process.env.PORT ?? 8080);
const AUDIO_PORT = Number(process.env.AUDIO_PORT ?? 8099);
const SUPERVISOR_URL = process.env.SUPERVISOR_URL ?? 'http://supervisor';
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN;
const SESSION_TTL = 12 * 60 * 60 * 1000;
const sessions = new Map();

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function json(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function supervisor(path, options = {}) {
  if (!SUPERVISOR_TOKEN) {
    throw new Error('The Home Assistant Supervisor API is unavailable.');
  }

  const response = await fetch(`${SUPERVISOR_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `******
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Home Assistant returned ${response.status}: ${message}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function getTargets() {
  const states = await supervisor('/core/api/states');
  const mediaPlayers = states
    .filter(state => state.entity_id.startsWith('media_player.'))
    .map(state => ({
      entityId: state.entity_id,
      kind: 'device',
      name: state.attributes.friendly_name ?? state.entity_id,
    }));
  const groups = states
    .filter(
      state =>
        state.entity_id.startsWith('group.') &&
        Array.isArray(state.attributes.entity_id) &&
        state.attributes.entity_id.some(entity =>
          entity.startsWith('media_player.'),
        ),
    )
    .map(state => ({
      entityId: state.entity_id,
      kind: 'group',
      name: state.attributes.friendly_name ?? state.entity_id,
    }));

  return [...groups, ...mediaPlayers].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function configuredAudioUrl(request) {
  let configured = process.env.AUDIO_URL ?? '';

  try {
    const options = JSON.parse(readFileSync('/data/options.json', 'utf8'));
    configured = options.audio_url || configured;
  } catch {
    // The options file exists only when this image runs as an add-on.
  }

  if (configured) return configured.replace(/\/+$/, '');

  const forwardedHost = request.headers['x-forwarded-host'];
  const host = String(forwardedHost ?? request.headers.host ?? 'homeassistant.local')
    .split(',')[0]
    .trim()
    .replace(/:\d+$/, '');
  return `http://${host}:${AUDIO_PORT}`;
}

async function callMediaService(service, entityIds, data = {}) {
  if (entityIds.length === 0) return;

  await supervisor(`/core/api/services/media_player/${service}`, {
    body: JSON.stringify({ entity_id: entityIds, ...data }),
    method: 'POST',
  });
}

function getSession(id) {
  let session = sessions.get(id);
  if (!session) {
    session = {
      clients: new Set(),
      lastSeen: Date.now(),
      mixer: null,
      outputs: [],
      playing: false,
      sounds: [],
      streamUrl: '',
    };
    sessions.set(id, session);
  }

  session.lastSeen = Date.now();
  return session;
}

function stopMixer(session, closeClients = false) {
  if (session.mixer) {
    session.mixer.kill('SIGTERM');
    session.mixer = null;
  }

  if (closeClients) {
    for (const client of session.clients) client.end();
    session.clients.clear();
  }
}

function soundFile(path) {
  if (typeof path !== 'string') return null;

  const marker = '/sounds/';
  const markerIndex = path.indexOf(marker);
  if (markerIndex === -1) return null;

  const requested = normalize(path.slice(markerIndex + 1));
  const absolute = resolve(STATIC_ROOT, requested);
  if (
    relative(STATIC_ROOT, absolute).startsWith('..') ||
    !existsSync(absolute) ||
    !statSync(absolute).isFile()
  ) {
    return null;
  }

  return absolute;
}

function startMixer(session) {
  stopMixer(session);
  if (!session.playing || session.clients.size === 0) return;

  const sounds = session.sounds
    .map(sound => ({
      file: soundFile(sound.path),
      volume: Math.max(0, Math.min(1, Number(sound.volume))),
    }))
    .filter(sound => sound.file && Number.isFinite(sound.volume));

  if (sounds.length === 0) return;

  const args = ['-hide_banner', '-loglevel', 'error'];
  for (const sound of sounds) {
    args.push('-stream_loop', '-1', '-i', sound.file);
  }

  const inputs = sounds
    .map(
      (sound, index) =>
        `[${index}:a]volume=${sound.volume.toFixed(4)}[audio${index}]`,
    )
    .join(';');
  const labels = sounds.map((_, index) => `[audio${index}]`).join('');
  const filter =
    `${inputs};${labels}amix=inputs=${sounds.length}:duration=longest:` +
    'normalize=0,alimiter=limit=0.95[out]';

  args.push(
    '-filter_complex',
    filter,
    '-map',
    '[out]',
    '-vn',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '192k',
    '-f',
    'mp3',
    'pipe:1',
  );

  const mixer = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  session.mixer = mixer;
  mixer.stdout.on('data', chunk => {
    for (const client of session.clients) client.write(chunk);
  });
  mixer.stderr.on('data', chunk => console.error(chunk.toString().trim()));
  mixer.on('close', () => {
    if (session.mixer === mixer) session.mixer = null;
  });
  mixer.on('error', error => console.error('Unable to start ffmpeg:', error));
}

async function updateSession(request, response, id) {
  const body = await readJson(request);
  const session = getSession(id);
  const previousOutputs = session.outputs;
  const nextOutputs = Array.isArray(body.outputs)
    ? [...new Set(body.outputs.filter(value => typeof value === 'string'))]
    : [];
  const validTargets = new Set((await getTargets()).map(target => target.entityId));

  if (nextOutputs.some(entityId => !validTargets.has(entityId))) {
    return json(response, 400, { error: 'An unavailable output was selected.' });
  }

  session.outputs = nextOutputs;
  session.playing = body.playing === true;
  session.sounds = Array.isArray(body.sounds) ? body.sounds.slice(0, 100) : [];
  session.streamUrl = `${configuredAudioUrl(request)}/api/stream/${id}`;

  const removed = previousOutputs.filter(
    entityId => !nextOutputs.includes(entityId),
  );
  if (removed.length > 0) await callMediaService('media_stop', removed);

  if (!session.playing || session.sounds.length === 0) {
    stopMixer(session, true);
    await callMediaService('media_stop', nextOutputs);
  } else {
    startMixer(session);
    await callMediaService('play_media', nextOutputs, {
      media_content_id: session.streamUrl,
      media_content_type: 'music',
    });
  }

  return json(response, 200, { streamUrl: session.streamUrl });
}

function stream(response, id) {
  const session = sessions.get(id);
  if (!session || !session.playing || session.sounds.length === 0) {
    return json(response, 404, { error: 'This stream is not playing.' });
  }

  response.writeHead(200, {
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
  });
  session.clients.add(response);
  session.lastSeen = Date.now();

  response.on('close', () => {
    session.clients.delete(response);
    if (session.clients.size === 0) stopMixer(session);
  });
  startMixer(session);
}

function staticFile(request, response) {
  const url = new URL(request.url, 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    return response.end();
  }

  let file = resolve(STATIC_ROOT, `.${pathname}`);
  if (relative(STATIC_ROOT, file).startsWith('..')) {
    response.writeHead(403);
    return response.end();
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    file = join(STATIC_ROOT, 'index.html');
  }

  response.writeHead(200, {
    'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=86400',
    'Content-Type': mimeTypes[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
}

function ingressHandler(request, response) {
  const url = new URL(request.url, 'http://localhost');

  Promise.resolve()
    .then(async () => {
      if (request.method === 'GET' && url.pathname === '/api/outputs') {
        const targets = await getTargets();
        return json(response, 200, { available: true, targets });
      }

      const match = url.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)$/);
      if (request.method === 'PUT' && match) {
        return updateSession(request, response, match[1]);
      }

      if (url.pathname.startsWith('/api/')) {
        return json(response, 404, { error: 'Not found.' });
      }

      return staticFile(request, response);
    })
    .catch(error => {
      console.error(error);
      if (!response.headersSent) json(response, 503, { error: error.message });
      else response.end();
    });
}

function audioHandler(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const match = url.pathname.match(/^\/api\/stream\/([a-f0-9-]+)$/);

  if (request.method === 'GET' && match) return stream(response, match[1]);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json(response, 200, { status: 'ok' });
  }

  return json(response, 404, { error: 'Not found.' });
}

createServer(ingressHandler).listen(INGRESS_PORT, '0.0.0.0', () => {
  console.log(`Moodist is listening on port ${INGRESS_PORT}.`);
});

if (AUDIO_PORT !== INGRESS_PORT) {
  createServer(audioHandler).listen(AUDIO_PORT, '0.0.0.0', () => {
    console.log(`Moodist audio is listening on port ${AUDIO_PORT}.`);
  });
}

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL;
  for (const [id, session] of sessions) {
    if (session.lastSeen < cutoff) {
      stopMixer(session, true);
      sessions.delete(id);
    }
  }
}, 60 * 60 * 1000).unref();
