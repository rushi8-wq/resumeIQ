import axios from 'axios';
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 15000,
});
export async function mutate(path, data, options = {}) {
  const {
    data: { csrfToken },
  } = await api.get('/auth/csrf');
  return api.request({
    url: path,
    method: 'post',
    data,
    ...options,
    headers: { ...options.headers, 'x-csrf-token': csrfToken },
  });
}
export const errorMessage = (error) =>
  error.response?.data?.error?.fields?.map((f) => f.message).join(' ') ||
  error.response?.data?.error?.message ||
  (error.code === 'ECONNABORTED'
    ? 'The request timed out. Check suggestion history before trying again.'
    : 'Could not connect. Check that the API is running and try again.');
