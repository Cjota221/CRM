import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.CRM_API_URL || 'https://cjota-crm.9eo9b2.easypanel.host';

function getProxyHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const cookie = request.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;
  const auth = request.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  return headers;
}

/**
 * GET /api/campanhas — Lista campanhas
 */
export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${API_BASE}/api/campanhas`, {
      headers: getProxyHeaders(request),
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Campanhas GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar campanhas' }, { status: 500 });
  }
}

/**
 * POST /api/campanhas — Cria nova campanha
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/campanhas`, {
      method: 'POST',
      headers: getProxyHeaders(request),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Campanhas POST error:', error);
    return NextResponse.json({ error: 'Erro ao criar campanha' }, { status: 500 });
  }
}

/**
 * PUT /api/campanhas — Atualiza campanha
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/campanhas`, {
      method: 'PUT',
      headers: getProxyHeaders(request),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Campanhas PUT error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar campanha' }, { status: 500 });
  }
}

/**
 * DELETE /api/campanhas — Deleta campanha
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const res = await fetch(`${API_BASE}/api/campanhas${id ? `?id=${id}` : ''}`, {
      method: 'DELETE',
      headers: getProxyHeaders(request),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Campanhas DELETE error:', error);
    return NextResponse.json({ error: 'Erro ao deletar campanha' }, { status: 500 });
  }
}
