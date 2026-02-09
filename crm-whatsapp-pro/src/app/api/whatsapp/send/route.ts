/**
 * API Routes - WhatsApp Send Message
 * 
 * POST /api/whatsapp/send - Envia mensagem
 */

import { NextRequest, NextResponse } from 'next/server';
import { whatsappEngine } from '@/lib/whatsapp/engine';

interface SendMessageBody {
  jid: string;
  text?: string;
  type?: 'text' | 'image' | 'audio' | 'document';
  caption?: string;
  // Para mídia, o buffer deve ser enviado como base64
  mediaBase64?: string;
  filename?: string;
  mimetype?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SendMessageBody = await request.json();
    const { jid, text, type = 'text', caption, mediaBase64, filename, mimetype } = body;
    
    if (!jid) {
      return NextResponse.json({
        success: false,
        error: 'JID é obrigatório',
      }, { status: 400 });
    }
    
    if (!whatsappEngine.isConnected()) {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp não conectado',
      }, { status: 503 });
    }
    
    let result;
    
    switch (type) {
      case 'text':
        if (!text) {
          return NextResponse.json({
            success: false,
            error: 'Texto é obrigatório para mensagens de texto',
          }, { status: 400 });
        }
        result = await whatsappEngine.sendText(jid, text);
        break;
        
      case 'image':
        if (!mediaBase64) {
          return NextResponse.json({
            success: false,
            error: 'mediaBase64 é obrigatório para imagens',
          }, { status: 400 });
        }
        const imageBuffer = Buffer.from(mediaBase64, 'base64');
        result = await whatsappEngine.sendImage(jid, imageBuffer, caption);
        break;
        
      case 'audio':
        if (!mediaBase64) {
          return NextResponse.json({
            success: false,
            error: 'mediaBase64 é obrigatório para áudio',
          }, { status: 400 });
        }
        const audioBuffer = Buffer.from(mediaBase64, 'base64');
        result = await whatsappEngine.sendAudio(jid, audioBuffer);
        break;
        
      case 'document':
        if (!mediaBase64 || !filename || !mimetype) {
          return NextResponse.json({
            success: false,
            error: 'mediaBase64, filename e mimetype são obrigatórios para documentos',
          }, { status: 400 });
        }
        const docBuffer = Buffer.from(mediaBase64, 'base64');
        result = await whatsappEngine.sendDocument(jid, docBuffer, filename, mimetype);
        break;
        
      default:
        return NextResponse.json({
          success: false,
          error: `Tipo de mensagem não suportado: ${type}`,
        }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      messageId: result.key.id,
      timestamp: result.messageTimestamp,
    });
    
  } catch (error: any) {
    console.error('[API] Erro ao enviar mensagem:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
