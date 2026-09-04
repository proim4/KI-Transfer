// Supabase Edge Function: the only place that may create, edit, or delete a
// user account. Uses the service-role key (Admin API) which must never ship
// to the browser — every action here re-verifies the *caller* is an active
// Admin from their own JWT (except `bootstrap`, which only runs once, before
// any Admin exists at all — see the check inside it).
//
// Deploy: supabase functions deploy manage-users
// Invoke:  supabase.functions.invoke('manage-users', { body: { action, ... } })

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMAIL_DOMAIN = 'ki-transfer.local';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

function usernameToEmail(username: string): string {
  return `${username}@${EMAIL_DOMAIN}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

/** Resolves the caller from their bearer JWT and requires an active Admin profile. */
async function requireAdmin(req: Request): Promise<{ id: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'ต้องเข้าสู่ระบบก่อน' }, 401);

  const supabase = admin();
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'เซสชันไม่ถูกต้องหรือหมดอายุ' }, 401);

  const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', userData.user.id).single();
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
    return json({ error: 'คุณไม่มีสิทธิ์จัดการผู้ใช้งาน' }, 403);
  }
  return { id: userData.user.id };
}

function validateUsername(username: unknown): string | Response {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username.trim().toLowerCase())) {
    return json({ error: 'Username ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ ความยาว 3-32 ตัวอักษร' }, 400);
  }
  return username.trim().toLowerCase();
}

function validatePassword(password: unknown): string | Response {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Password ต้องมีความยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` }, 400);
  }
  return password;
}

async function createAuthUserAndProfile(
  supabase: ReturnType<typeof admin>,
  username: string,
  password: string,
  role: 'admin' | 'user',
  status: 'active' | 'inactive',
) {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  });
  if (createError) {
    const duplicate = /already.*registered|already.*exists/i.test(createError.message);
    return json({ error: duplicate ? 'Username นี้มีอยู่ในระบบแล้ว กรุณาใช้ Username อื่น' : createError.message }, 400);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: created.user.id, username, role, status });
  if (profileError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    const duplicate = profileError.message.includes('duplicate') || profileError.code === '23505';
    return json({ error: duplicate ? 'Username นี้มีอยู่ในระบบแล้ว กรุณาใช้ Username อื่น' : profileError.message }, 400);
  }

  return json({ id: created.user.id, username, role, status });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { action } = body;
  const supabase = admin();

  if (action === 'bootstrap') {
    const { data: hasAdmin } = await supabase.rpc('has_any_admin');
    if (hasAdmin) {
      return json({ error: 'มีผู้ดูแลระบบอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบเพื่อขอบัญชีผู้ใช้งาน' }, 403);
    }
    const username = validateUsername(body.username);
    if (username instanceof Response) return username;
    const password = validatePassword(body.password);
    if (password instanceof Response) return password;
    return createAuthUserAndProfile(supabase, username, password, 'admin', 'active');
  }

  if (action === 'create') {
    const caller = await requireAdmin(req);
    if (caller instanceof Response) return caller;
    const username = validateUsername(body.username);
    if (username instanceof Response) return username;
    const password = validatePassword(body.password);
    if (password instanceof Response) return password;
    const role = body.role === 'admin' ? 'admin' : 'user';
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    return createAuthUserAndProfile(supabase, username, password, role, status);
  }

  if (action === 'update') {
    const caller = await requireAdmin(req);
    if (caller instanceof Response) return caller;
    const userId = body.userId;
    if (typeof userId !== 'string') return json({ error: 'userId is required' }, 400);

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.role === 'admin' || body.role === 'user') updates.role = body.role;
    if (body.status === 'active' || body.status === 'inactive') {
      updates.status = body.status;
      const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: body.status === 'inactive' ? '876000h' : 'none',
      });
      if (banError) return json({ error: banError.message }, 400);
    }
    if (typeof body.password === 'string' && body.password.length > 0) {
      const password = validatePassword(body.password);
      if (password instanceof Response) return password;
      const { error: passwordError } = await supabase.auth.admin.updateUserById(userId, { password });
      if (passwordError) return json({ error: passwordError.message }, 400);
    }

    const { error: updateError } = await supabase.from('profiles').update(updates).eq('id', userId);
    if (updateError) return json({ error: updateError.message }, 400);
    return json({ ok: true });
  }

  if (action === 'delete') {
    const caller = await requireAdmin(req);
    if (caller instanceof Response) return caller;
    const userId = body.userId;
    if (typeof userId !== 'string') return json({ error: 'userId is required' }, 400);

    const { data: target } = await supabase.from('profiles').select('role, status').eq('id', userId).single();
    if (target?.role === 'admin' && target.status === 'active') {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('status', 'active');
      if ((count ?? 0) <= 1) {
        return json({ error: 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้ ระบบต้องมีผู้ดูแลระบบอย่างน้อย 1 คน' }, 400);
      }
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) return json({ error: deleteError.message }, 400);
    return json({ ok: true });
  }

  return json({ error: `Unknown action: ${String(action)}` }, 400);
});
