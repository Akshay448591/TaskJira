import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { Alert, Field } from '../components/ui.jsx';
import AuthLayout from './AuthLayout.jsx';

export default function ResetPassword() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/reset-password', { token: sp.get('token') || '', password });
      setMsg(data.message);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(errMsg(err));
    }
  };
  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Alert tone="success">{msg}</Alert>
        <Field label="New password" hint="At least 8 characters, with a letter and a number"><input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button className="btn-primary h-9 w-full">Update password</button>
      </form>
      <p className="mt-6 text-center text-sm"><Link className="text-brand-600 hover:underline" to="/login">Back to login</Link></p>
    </AuthLayout>
  );
}
