import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errMsg } from '../api/client.js';
import { Alert, Field } from '../components/ui.jsx';
import AuthLayout from './AuthLayout.jsx';

export default function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signup(form.name, form.email, form.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthLayout title="Create your account" subtitle="Start managing projects with your team">
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Full name"><input className="input" required value={form.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="At least 8 characters, with a letter and a number"><input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} /></Field>
        <button className="btn-primary h-9 w-full" disabled={busy} aria-busy={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link className="text-brand-600 hover:underline" to="/login">Log in</Link></p>
    </AuthLayout>
  );
}
