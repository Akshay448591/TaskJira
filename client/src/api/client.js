import axios from 'axios';
import { progress } from '../lib/progress.js';
import { toast } from '../lib/toast.jsx';

const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

const api = axios.create({ baseURL, withCredentials: true });

// tell the server which socket made this request, so it does not echo the change back to the same tab
api.interceptors.request.use((config) => {
  if (window.__socketId) config.headers['X-Socket-Id'] = window.__socketId;
  if (!config.silent) { config._tracked = true; progress.start(); } // drives the top progress bar
  return config;
});

let refreshing = null;

// When the 15-minute access cookie is gone/expired, silently rotate the refresh token and retry once.
api.interceptors.response.use(
  (res) => { if (res.config?._tracked) progress.done(); return res; },
  async (error) => {
    const { config, response } = error;
    if (config?._tracked) progress.done();
    if (!response && error.code !== 'ERR_CANCELED') toast.error("Can't reach the server", { id: 'network', description: 'Check your connection. Changes will sync once it is back.', duration: 6000 });
    if (response?.status === 401 && response.data?.code === 'TOKEN_EXPIRED' && config && !config._retried) {
      config._retried = true;
      refreshing = refreshing || api.post('/auth/refresh').finally(() => (refreshing = null));
      try {
        await refreshing;
        return api(config);
      } catch {
        window.dispatchEvent(new Event('auth:logout'));
      }
    }
    return Promise.reject(error);
  }
);

export const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';
export default api;
