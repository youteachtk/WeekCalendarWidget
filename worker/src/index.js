const GOOGLE_CLIENT_ID = '761061579107-v9jis3ikqluqo1ghrb16antp1e4qoitv.apps.googleusercontent.com';

const INITIAL_USERS = [
  'arturo.mendez@prefecomelchorocampo.edu.mx',
  'youteach.tk@gmail.com',
  'arturomendezk2@gmail.com'
];

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      ...extraHeaders
    }
  });
}

async function ensureSeed(env) {
  if (await env.WEEKCAL_AUTH.get('meta:seeded')) return;

  for (const email of INITIAL_USERS) {
    const normalized = normalizeEmail(email);
    await env.WEEKCAL_AUTH.put('allow:' + normalized, JSON.stringify({
      email: normalized,
      addedAt: new Date().toISOString(),
      source: 'bootstrap'
    }));
    await env.WEEKCAL_AUTH.put('admin:' + normalized, '1');
  }

  await env.WEEKCAL_AUTH.put('meta:seeded', new Date().toISOString());
}

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function expectedClientId(env) {
  return String(env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID).trim();
}

function assertAudience(payload, env) {
  const expected = expectedClientId(env);
  const candidates = [
    payload.aud,
    payload.audience,
    payload.issued_to,
    payload.azp
  ].filter(Boolean).map(String);

  if (!candidates.includes(expected)) {
    throw new Error('El token de Google no pertenece a la integración de WeekCal.');
  }
}

async function verifyIdToken(env, idToken) {
  if (!idToken) throw new Error('Falta el token de identidad de Google.');

  const response = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  if (!response.ok) throw new Error('Google rechazó el token de identidad.');

  const payload = await response.json();
  assertAudience(payload, env);

  const email = normalizeEmail(payload.email);
  if (!email || String(payload.email_verified) !== 'true') {
    throw new Error('Google no pudo verificar el correo de esta cuenta.');
  }

  return { email, payload };
}

async function verifyAccessToken(env, accessToken) {
  if (!accessToken) throw new Error('Falta la sesión de Google.');

  const tokenInfoResponse = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken)
  );
  if (!tokenInfoResponse.ok) throw new Error('La sesión de Google expiró o no es válida.');

  const tokenInfo = await tokenInfoResponse.json();
  assertAudience(tokenInfo, env);

  const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: 'Bearer ' + accessToken }
  });
  if (!userInfoResponse.ok) throw new Error('Google no pudo identificar la cuenta conectada.');

  const userInfo = await userInfoResponse.json();
  const email = normalizeEmail(userInfo.email);
  if (!email || userInfo.email_verified !== true) {
    throw new Error('Google no pudo verificar el correo de esta cuenta.');
  }

  return { email, tokenInfo, userInfo };
}

async function isAllowed(env, email) {
  return Boolean(await env.WEEKCAL_AUTH.get('allow:' + normalizeEmail(email)));
}

async function isAdmin(env, email) {
  return Boolean(await env.WEEKCAL_AUTH.get('admin:' + normalizeEmail(email)));
}

async function requireAdmin(request, env) {
  const accessToken = bearer(request);
  const identity = await verifyAccessToken(env, accessToken);
  if (!(await isAllowed(env, identity.email)) || !(await isAdmin(env, identity.email))) {
    throw new Error('Esta cuenta no tiene permisos para administrar usuarios de WeekCal.');
  }
  return identity;
}

async function listAllowedUsers(env) {
  const users = [];
  let cursor;

  do {
    const page = await env.WEEKCAL_AUTH.list({
      prefix: 'allow:',
      cursor,
      limit: 1000
    });

    for (const key of page.keys) {
      const email = key.name.slice('allow:'.length);
      users.push({
        email,
        admin: await isAdmin(env, email)
      });
    }

    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return users.sort((a, b) => a.email.localeCompare(b.email));
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export default {
  async fetch(request, env) {
    await ensureSeed(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS'
        }
      });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true, service: 'weekcal-auth' });
      }

      if (request.method === 'POST' && url.pathname === '/api/check-identity') {
        const body = await readJson(request);
        const identity = await verifyIdToken(env, body.idToken);
        const authorized = await isAllowed(env, identity.email);

        return json({
          authorized,
          email: identity.email,
          admin: authorized ? await isAdmin(env, identity.email) : false
        }, authorized ? 200 : 403);
      }

      if (request.method === 'POST' && url.pathname === '/api/check-access') {
        const body = await readJson(request);
        const identity = await verifyAccessToken(env, body.accessToken);
        const authorized = await isAllowed(env, identity.email);

        return json({
          authorized,
          email: identity.email,
          admin: authorized ? await isAdmin(env, identity.email) : false
        }, authorized ? 200 : 403);
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/users') {
        const identity = await requireAdmin(request, env);
        return json({
          adminEmail: identity.email,
          users: await listAllowedUsers(env)
        });
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/users') {
        await requireAdmin(request, env);
        const body = await readJson(request);
        const email = normalizeEmail(body.email);

        if (!/^\S+@\S+\.\S+$/.test(email)) {
          return json({ error: 'Correo no válido.' }, 400);
        }

        await env.WEEKCAL_AUTH.put('allow:' + email, JSON.stringify({
          email,
          addedAt: new Date().toISOString(),
          source: 'admin'
        }));

        return json({ ok: true, email, users: await listAllowedUsers(env) });
      }

      if (request.method === 'DELETE' && url.pathname === '/api/admin/users') {
        const identity = await requireAdmin(request, env);
        const body = await readJson(request);
        const email = normalizeEmail(body.email);

        if (!email) return json({ error: 'Falta el correo.' }, 400);
        if (email === identity.email) {
          return json({ error: 'No puedes quitar tu propia cuenta mientras administras WeekCal.' }, 400);
        }

        await env.WEEKCAL_AUTH.delete('allow:' + email);
        await env.WEEKCAL_AUTH.delete('admin:' + email);

        return json({ ok: true, email, users: await listAllowedUsers(env) });
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return json({ error: error?.message || 'Error de autorización.' }, 401);
    }
  }
};
