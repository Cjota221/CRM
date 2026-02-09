/**
 * API Routes - WhatsApp QR Code (Server-Sent Events)
 * 
 * GET /api/whatsapp/qr - Stream de eventos para QR code
 */

import { NextRequest } from 'next/server';
import { whatsappEngine } from '@/lib/whatsapp/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Headers para SSE
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Desabilitar buffering do nginx
  };
  
  const stream = new ReadableStream({
    start(controller) {
      // Enviar status inicial
      const info = whatsappEngine.getConnectionInfo();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'status', ...info })}\n\n`)
      );
      
      // Se já tiver QR code, enviar imediatamente
      const currentQR = whatsappEngine.getCurrentQR();
      if (currentQR) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'qr', qr: currentQR })}\n\n`)
        );
      }
      
      // Handler para QR code
      const qrHandler = (qr: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'qr', qr })}\n\n`)
        );
      };
      
      // Handler para conexão estabelecida
      const connectedHandler = (data: any) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'connected', ...data })}\n\n`)
        );
        // Fechar stream após conectar
        cleanup();
        controller.close();
      };
      
      // Handler para erros
      const errorHandler = (data: any) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', ...data })}\n\n`)
        );
      };
      
      // Handler para status
      const statusHandler = (data: any) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'status', ...data })}\n\n`)
        );
      };
      
      // Registrar handlers
      whatsappEngine.on('qr', qrHandler);
      whatsappEngine.on('connected', connectedHandler);
      whatsappEngine.on('error', errorHandler);
      whatsappEngine.on('status_change', statusHandler);
      
      // Cleanup function
      const cleanup = () => {
        whatsappEngine.off('qr', qrHandler);
        whatsappEngine.off('connected', connectedHandler);
        whatsappEngine.off('error', errorHandler);
        whatsappEngine.off('status_change', statusHandler);
      };
      
      // Iniciar conexão se não estiver conectado
      if (!whatsappEngine.isConnected()) {
        whatsappEngine.connect().catch((error) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
          );
        });
      }
      
      // Heartbeat a cada 30 segundos
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);
      
      // Cleanup quando o cliente desconectar
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        cleanup();
      });
    },
  });
  
  return new Response(stream, { headers });
}
