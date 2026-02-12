import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.CRM_API_URL || 'https://cjota-crm.9eo9b2.easypanel.host';

/**
 * GET /api/webhooks — Lista webhooks configurados
 */
export async function GET(request: NextRequest) {
  try {
    const cookie = request.headers.get('cookie');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers['cookie'] = cookie;

    const res = await fetch(`${API_BASE}/api/webhooks`, {
      headers,
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Webhooks GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar webhooks' }, { status: 500 });
  }
}

/**
 * POST /api/webhooks — Recebe webhooks do FacilZap / Evolution
 * Nota: webhooks externos NÃO enviam cookies, então não precisam de auth
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${API_BASE}/api/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
