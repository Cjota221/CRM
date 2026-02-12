import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.CRM_API_URL || 'https://cjota-crm.9eo9b2.easypanel.host';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard — Métricas do Dashboard
 * Agrega dados de clientes, pedidos e campanhas
 */
export async function GET(request: NextRequest) {
  try {
    const cookie = request.headers.get('cookie');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers['cookie'] = cookie;

    // Buscar dados em paralelo do backend
    const [clientesRes, campanhasRes] = await Promise.allSettled([
      fetch(`${API_BASE}/api/clientes`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/api/campanhas`, { headers, cache: 'no-store' }),
    ]);

    // Parse clientes
    let clientes: any[] = [];
    if (clientesRes.status === 'fulfilled' && clientesRes.value.ok) {
      const data = await clientesRes.value.json();
      clientes = Array.isArray(data) ? data : data.clientes || data.data || [];
    }

    // Parse campanhas
    let campanhas: any[] = [];
    if (campanhasRes.status === 'fulfilled' && campanhasRes.value.ok) {
      const data = await campanhasRes.value.json();
      campanhas = Array.isArray(data) ? data : data.campanhas || data.data || [];
    }

    // Calcular métricas
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const clientesAtivos = clientes.filter((c: any) => {
      if (c.status === 'ativo') return true;
      if (c.ultima_compra) {
        return new Date(c.ultima_compra) >= thirtyDaysAgo;
      }
      return false;
    });

    const clientesRisco = clientes.filter((c: any) => {
      if (c.status === 'risco') return true;
      if (c.ultima_compra) {
        const dt = new Date(c.ultima_compra);
        return dt < thirtyDaysAgo && dt >= sixtyDaysAgo;
      }
      return false;
    });

    const clientesInativos = clientes.filter((c: any) => {
      if (c.status === 'inativo') return true;
      if (c.ultima_compra) {
        return new Date(c.ultima_compra) < sixtyDaysAgo;
      }
      return !c.ultima_compra && c.status !== 'ativo' && c.status !== 'risco';
    });

    const ltvTotal = clientes.reduce((sum: number, c: any) => sum + (c.ltv || 0), 0);
    const ltvMedio = clientes.length > 0 ? ltvTotal / clientes.length : 0;

    const ltvRisco = clientesRisco.reduce((sum: number, c: any) => sum + (c.ltv || 0), 0);
    const ltvInativos = clientesInativos.reduce((sum: number, c: any) => sum + (c.ltv || 0), 0);

    const ticketMedio = clientes.reduce((sum: number, c: any) => sum + (c.ticket_medio || 0), 0) / (clientes.length || 1);

    const campanhasAtivas = campanhas.filter((c: any) => c.status === 'running' || c.status === 'scheduled');
    const totalEnviadas = campanhas.reduce((sum: number, c: any) => sum + (c.stats?.sent || 0), 0);

    const vips = clientes.filter((c: any) => c.status === 'vip' || (c.tags && c.tags.includes('vip')));

    const metrics = {
      total_clientes: clientes.length,
      clientes_ativos: clientesAtivos.length,
      clientes_risco: clientesRisco.length,
      clientes_inativos: clientesInativos.length,
      clientes_vip: vips.length,
      ltv_medio: Math.round(ltvMedio * 100) / 100,
      ltv_risco: Math.round(ltvRisco * 100) / 100,
      ltv_inativos: Math.round(ltvInativos * 100) / 100,
      ticket_medio: Math.round(ticketMedio * 100) / 100,
      campanhas_total: campanhas.length,
      campanhas_ativas: campanhasAtivas.length,
      mensagens_enviadas: totalEnviadas,
    };

    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error('Dashboard GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar métricas do dashboard' },
      { status: 500 }
    );
  }
}
