import { createContext, useContext, useEffect, useState } from 'react';
import { api, mutate } from '../lib/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch (e) {
      setUser(null);
      if (e.response?.status !== 401)
        setError(
          'We could not reach your workspace. Check the API connection.',
        );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  async function signIn(mode, values) {
    const { data } = await mutate(`/auth/${mode}`, values);
    setUser(data.user);
  }
  async function signOut() {
    await mutate('/auth/logout');
    setUser(null);
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, error, refresh, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
