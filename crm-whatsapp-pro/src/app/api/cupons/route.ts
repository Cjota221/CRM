import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.CRM_API_URL || 'https://cjota-crm.9eo9b2.easypanel.host';

function getProxyHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const cookie = request.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;
  const auth = request.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  return headers;
}

/**
 * GET /api/cupons — Lista cupons
 */
export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${API_BASE}/api/cupons`, {
      headers: getProxyHeaders(request),
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Cupons GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar cupons' }, { status: 500 });
  }
}

/**
 * POST /api/cupons — Cria cupom
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/cupons`, {
      method: 'POST',
      headers: getProxyHeaders(request),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Cupons POST error:', error);
    return NextResponse.json({ error: 'Erro ao criar cupom' }, { status: 500 });
  }
}

/**
 * PUT /api/cupons — Atualiza cupom
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/cupons`, {
      method: 'PUT',
      headers: getProxyHeaders(request),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Cupons PUT error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar cupom' }, { status: 500 });
  }
}

/**
 * DELETE /api/cupons — Remove cupom
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const res = await fetch(`${API_BASE}/api/cupons${id ? `?id=${id}` : ''}`, {
      method: 'DELETE',
      headers: getProxyHeaders(request),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Cupons DELETE error:', error);
    return NextResponse.json({ error: 'Erro ao deletar cupom' }, { status: 500 });
  }
}
