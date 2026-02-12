'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        router.push(redirect);
      } else {
        setError(result.message || 'Usuário ou senha inválidos');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[420px] px-5 relative z-10">
      <div className="bg-white/[0.97] rounded-[20px] p-12 px-10 shadow-[0_25px_60px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.1)] backdrop-blur-[20px]">
        {/* Logo */}
        <div className="text-center mb-9">
          <div className="w-[72px] h-[72px] bg-gradient-to-br from-crm-primary to-[#25d366] rounded-[18px] flex items-center justify-center mx-auto mb-4 shadow-[0_8px_24px_rgba(37,211,102,0.25)]">
            <svg className="w-9 h-9 fill-white" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">VEXX CRM</h1>
          <p className="text-sm text-slate-400">Acesse o painel de gestão</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-3.5 py-2.5 rounded-[10px] text-[13px] mb-4 text-center animate-[shake_0.4s_ease]">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label htmlFor="email" className="block text-[13px] font-semibold text-gray-700 mb-2 tracking-wide">
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 pointer-events-none" />
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu e-mail"
                required
                autoFocus
                className="w-full py-3 px-3.5 pl-11 border-2 border-slate-200 rounded-xl text-[15px] text-slate-800 bg-slate-50 outline-none transition-all focus:border-[#25d366] focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,211,102,0.1)] placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="mb-5">
            <label htmlFor="password" className="block text-[13px] font-semibold text-gray-700 mb-2 tracking-wide">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 pointer-events-none" />
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                required
                className="w-full py-3 px-3.5 pl-11 border-2 border-slate-200 rounded-xl text-[15px] text-slate-800 bg-slate-50 outline-none transition-all focus:border-[#25d366] focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,211,102,0.1)] placeholder:text-slate-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-br from-crm-primary to-[#25d366] text-white border-none rounded-xl text-[15px] font-semibold cursor-pointer transition-all tracking-wide mt-2 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(37,211,102,0.35)] active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
            ) : (
              'Entrar'
            )}
          </button>
        </form>
      </div>
      <p className="text-center mt-6 text-xs text-white/50">VEXX CRM &copy; 2025 — Painel de Gestão</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-[420px] px-5 relative z-10">
        <div className="bg-white/[0.97] rounded-[20px] p-12 px-10 shadow-[0_25px_60px_rgba(0,0,0,0.3)] backdrop-blur-[20px] text-center">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto" />
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
