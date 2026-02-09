/**
 * API Routes - WhatsApp Status
 * 
 * GET /api/whatsapp/status - Retorna status da conexão
 */

import { NextResponse } from 'next/server';
import { whatsappEngine } from '@/lib/whatsapp/engine';

export async function GET() {
  try {
    const info = whatsappEngine.getConnectionInfo();
    
    return NextResponse.json({
      success: true,
      ...info,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      status: 'error',
    }, { status: 500 });
  }
}
