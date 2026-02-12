import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.CRM_API_URL || 'https://cjota-crm.9eo9b2.easypanel.host';

/**
 * POST /api/webhooks — Recebe webhooks do FacilZap / Evolution
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Forward to CRM backend
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
