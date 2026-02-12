import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  name: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email, password) => {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: email, password }),
          });
          const data = await res.json();

          if (res.ok && data.success) {
            set({
              user: data.user || { name: email, email },
              isAuthenticated: true,
            });
            return { success: true };
          }

          return { success: false, message: data.message || 'Credenciais inválidas' };
        } catch {
          return { success: false, message: 'Erro de conexão' };
        }
      },

      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch {
          // Ignora erro de rede no logout
        }
        set({ user: null, isAuthenticated: false });
        window.location.href = '/login';
      },

      checkAuth: async () => {
        try {
          const res = await fetch('/api/auth/check');
          const data = await res.json();
          set({
            isAuthenticated: data.authenticated === true,
            isLoading: false,
          });
        } catch {
          set({ isAuthenticated: false, isLoading: false });
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
    }),
    {
      name: 'crm-auth',
      partialize: (state) => ({
        user: state.user,
      }),
    }
  )
);
