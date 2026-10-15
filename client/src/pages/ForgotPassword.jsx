import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { Alert, Field } from '../components/ui.jsx';
import AuthLayout from './AuthLayout.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMsg(data.message);
    } catch (err) {
      setError(errMsg(err));
    }
  };
  return (
    <AuthLayout title="Reset password" subtitle="We'll email you a reset link">
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Alert tone="success">{msg}</Alert>
        <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <button className="btn-primary h-9 w-full">Send reset link</button>
      </form>
      <p className="mt-6 text-center text-sm"><Link className="text-brand-600 hover:underline" to="/login">Back to login</Link></p>
    </AuthLayout>
  );
}
