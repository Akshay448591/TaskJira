import { useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { NOTIFICATION_TYPES } from '../lib/constants.js';
import { Alert, Avatar, Field } from '../components/ui.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const fileRef = useRef();
  const [form, setForm] = useState({ name: user.name, bio: user.bio || '', emailNotifications: user.settings?.emailNotifications ?? true, timezone: user.settings?.timezone || 'UTC' });
  const [prefs, setPrefs] = useState(() => Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t.value, { inApp: user.settings?.notifications?.[t.value]?.inApp ?? true, email: user.settings?.notifications?.[t.value]?.email ?? false }])));
  const setPref = (type, ch, v) => setPrefs((p) => ({ ...p, [type]: { ...p[type], [ch]: v } }));
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState({ profile: '', password: '', avatar: '' });
  const [err, setErr] = useState({ profile: '', password: '', avatar: '' });
  const flash = (k, m, e = '') => { setMsg((s) => ({ ...s, [k]: m })); setErr((s) => ({ ...s, [k]: e })); };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch('/users/me', { name: form.name, bio: form.bio, settings: { emailNotifications: form.emailNotifications, timezone: form.timezone, notifications: prefs } });
      setUser(data.user);
      flash('profile', 'Profile saved');
    } catch (x) { flash('profile', '', errMsg(x)); }
  };
  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const { data } = await api.post('/users/me/avatar', fd);
      setUser(data.user);
      flash('avatar', 'Avatar updated');
    } catch (x) { flash('avatar', '', errMsg(x)); }
    e.target.value = '';
  };
  const removeAvatar = async () => {
    try { const { data } = await api.delete('/users/me/avatar'); setUser(data.user); flash('avatar', 'Avatar removed'); }
    catch (x) { flash('avatar', '', errMsg(x)); }
  };
  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api.patch('/users/me/password', pw);
      setPw({ currentPassword: '', newPassword: '' });
      flash('password', 'Password changed. Other devices were signed out.');
    } catch (x) { flash('password', '', errMsg(x)); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="page-title">Account settings</h1>
      <section className="card space-y-4 p-5">
        <h2 className="font-medium">Avatar</h2>
        <Alert>{err.avatar}</Alert><Alert tone="success">{msg.avatar}</Alert>
        <div className="flex items-center gap-4">
          <Avatar user={user} size={16} />
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => fileRef.current.click()}>Upload image</button>
            {user.avatar && <button className="btn-ghost" onClick={removeAvatar}>Remove</button>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={upload} />
          </div>
        </div>
        <p className="text-xs text-slate-500">JPG, PNG, WEBP or GIF up to 2 MB.</p>
      </section>
      <form onSubmit={saveProfile} className="card space-y-4 p-5">
        <h2 className="font-medium">Profile</h2>
        <Alert>{err.profile}</Alert><Alert tone="success">{msg.profile}</Alert>
        <Field label="Full name"><input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email" hint="Email cannot be changed"><input className="input" disabled value={user.email} /></Field>
        <Field label="Bio"><textarea className="input" rows={3} maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Field>
        <Field label="Timezone"><input className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="e.g. Asia/Kolkata" /></Field>
        <div id="notifications" className="space-y-2 border-t border-slate-100 pt-4">
          <h2 className="font-medium">Notifications</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.emailNotifications} onChange={(e) => setForm({ ...form, emailNotifications: e.target.checked })} /> Allow email notifications (master switch)</label>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Notify me about</th><th className="w-20 text-center">In-app</th><th className="w-20 text-center">Email</th></tr></thead>
            <tbody>
              {NOTIFICATION_TYPES.map((t) => (
                <tr key={t.value} className="border-t border-slate-100">
                  <td className="py-2"><span className="inline-flex items-center gap-2"><Icon name={t.icon} size={15} className="text-slate-400" />{t.label}</span></td>
                  <td className="text-center"><input type="checkbox" checked={prefs[t.value].inApp} onChange={(e) => setPref(t.value, 'inApp', e.target.checked)} /></td>
                  <td className="text-center"><input type="checkbox" disabled={!form.emailNotifications} checked={prefs[t.value].email} onChange={(e) => setPref(t.value, 'email', e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400">Deadline alerts are sent once a task is due within 24 hours, and once more if it becomes overdue. Tip: mention teammates with @ + the part of their email before the @.</p>
        </div>
        <button className="btn-primary">Save changes</button>
      </form>
      <form onSubmit={changePassword} className="card space-y-4 p-5">
        <h2 className="font-medium">Change password</h2>
        <Alert>{err.password}</Alert><Alert tone="success">{msg.password}</Alert>
        <Field label="Current password"><input className="input" type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
        <Field label="New password" hint="At least 8 characters, with a letter and a number"><input className="input" type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
        <button className="btn-primary">Update password</button>
      </form>
    </div>
  );
}
