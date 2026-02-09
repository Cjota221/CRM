/**
 * API Routes - WhatsApp Logout
 * 
 * POST /api/whatsapp/logout - Desconectar e limpar sessão
 */

import { NextResponse } from 'next/server';
import { whatsappEngine } from '@/lib/whatsapp/engine';

export async function POST() {
  try {
    await whatsappEngine.logout();
    
    return NextResponse.json({
      success: true,
      message: 'Logout realizado. Sessão limpa.',
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
