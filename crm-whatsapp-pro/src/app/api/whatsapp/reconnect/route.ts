/**
 * API Routes - WhatsApp Force Reconnect
 * 
 * POST /api/whatsapp/reconnect - Forçar reconexão
 */

import { NextResponse } from 'next/server';
import { whatsappEngine } from '@/lib/whatsapp/engine';

export async function POST() {
  try {
    await whatsappEngine.forceReconnect();
    
    return NextResponse.json({
      success: true,
      message: 'Reconexão iniciada',
      status: 'connecting',
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
