/**
 * API Routes - WhatsApp Connect/Reconnect
 * 
 * POST /api/whatsapp/connect - Iniciar conexão
 * POST /api/whatsapp/reconnect - Forçar reconexão
 * POST /api/whatsapp/logout - Desconectar e limpar sessão
 */

import { NextResponse } from 'next/server';
import { whatsappEngine } from '@/lib/whatsapp/engine';

// POST /api/whatsapp/connect
export async function POST() {
  try {
    const info = whatsappEngine.getConnectionInfo();
    
    if (info.connected) {
      return NextResponse.json({
        success: true,
        message: 'Já conectado',
        ...info,
      });
    }
    
    // Iniciar conexão
    whatsappEngine.connect();
    
    return NextResponse.json({
      success: true,
      message: 'Conexão iniciada. Aguarde o QR code.',
      status: 'connecting',
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
