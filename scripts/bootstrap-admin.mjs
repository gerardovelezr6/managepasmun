// Creates an account with a privileged role (default: High Command). Use "advisor" for the first advisor.
// Usage: npm run bootstrap -- you@example.com "StrongPassword!" "Secretary-General Placeholder" [high_command|advisor]
import { createClient } from '@supabase/supabase-js';

const [email, password, fullName = 'High Command', role = 'high_command'] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !password) {
  console.error('Usage: npm run bootstrap -- <email> <password> [full name] [high_command|advisor]');
  process.exit(1);
}
if (!['high_command', 'advisor'].includes(role)) {
  console.error('Role must be high_command or advisor');
  process.exit(1);
}
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (error) {
  console.error('Could not create user:', error.message);
  process.exit(1);
}

// profile row is created by a trigger with role 'pending'; promote it.
await new Promise((r) => setTimeout(r, 500));
const { error: upErr } = await sb
  .from('profiles')
  .upsert({ id: data.user.id, email, full_name: fullName, role });
if (upErr) {
  console.error('User created but role promotion failed:', upErr.message);
  process.exit(1);
}
console.log(`${role === 'advisor' ? 'Advisor' : 'High Command'} account ready: ${email}`);
