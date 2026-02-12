import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.CRM_API_URL || 'https://cjota-crm.9eo9b2.easypanel.host';

/**
 * GET /api/campanhas — Lista campanhas
 */
export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/campanhas`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Campanhas POST error:', error);
    return NextResponse.json({ error: 'Erro ao criar campanha' }, { status: 500 });
  }
}
