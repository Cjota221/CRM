import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware Next.js — Proteção de rotas
 * 
 * Rotas públicas: /login, /api/auth/*, assets estáticos
 * Rotas protegidas: tudo dentro de (dashboard)
 * 
 * Verifica cookie `crm_session` e redireciona para /login se ausente
 */

const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/webhooks',
  '/_next',
  '/favicon.ico',
  '/logo.png',
  '/V.png',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir rotas públicas
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Permitir assets estáticos
  if (pathname.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/)) {
    return NextResponse.next();
  }

  // Verificar cookie de sessão
  const session = request.cookies.get('crm_session');

  if (!session?.value) {
    // API routes: retornar 401 JSON
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // Páginas: redirecionar ao login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Usuário autenticado tentando acessar /login → redirecionar ao dashboard
  if (pathname === '/login' && session?.value) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match todas as rotas exceto:
     * - _next/static (assets)
     * - _next/image (otimização de imagens)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
