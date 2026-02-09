/**
 * Hooks para integração com WhatsApp
 */

'use client';

import { useEffect, useCallback, useState } from 'react';
import { useConnectionStore } from '@/store';

/**
 * Hook para gerenciar conexão WhatsApp via SSE
 */
export function useWhatsAppConnection() {
  const { 
    status, 
    qrCode, 
    user, 
    error,
    setStatus, 
    setQRCode, 
    setUser, 
    setError 
  } = useConnectionStore();
  
  const [isInitialized, setIsInitialized] = useState(false);

  // Conectar via SSE
  useEffect(() => {
    if (isInitialized) return;
    
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        eventSource = new EventSource('/api/whatsapp/qr');
        
        eventSource.onopen = () => {
          console.log('[SSE] Conexão estabelecida');
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[SSE] Evento recebido:', data.type);

            switch (data.type) {
              case 'qr':
                setQRCode(data.qr);
                setStatus('qr_pending');
                break;
              case 'connected':
                setStatus('connected');
                setUser(data.user || { id: 'unknown', name: 'Usuário' });
                setQRCode(null);
                break;
              case 'status':
                setStatus(data.status);
                break;
              case 'error':
                setError(data.error || 'Erro desconhecido');
                setStatus('error');
                break;
              case 'disconnected':
                setStatus('disconnected');
                break;
            }
          } catch (e) {
            console.error('[SSE] Erro ao processar evento:', e);
          }
        };

        eventSource.onerror = (e) => {
          console.error('[SSE] Erro na conexão:', e);
          eventSource?.close();
          
          // Tentar reconectar após 5s
          reconnectTimeout = setTimeout(() => {
            console.log('[SSE] Tentando reconectar...');
            connect();
          }, 5000);
        };
      } catch (e) {
        console.error('[SSE] Erro ao criar EventSource:', e);
      }
    };

    connect();
    setIsInitialized(true);

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [isInitialized, setStatus, setQRCode, setUser, setError]);

  // Forçar reconexão
  const reconnect = useCallback(async () => {
    setStatus('connecting');
    try {
      const response = await fetch('/api/whatsapp/reconnect', { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        setError(data.error || 'Erro ao reconectar');
      }
    } catch (e) {
      setError('Erro de rede ao reconectar');
    }
  }, [setStatus, setError]);

  // Logout
  const logout = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/logout', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setStatus('disconnected');
        setUser(null);
        setQRCode(null);
      }
    } catch (e) {
      console.error('Erro ao fazer logout:', e);
    }
  }, [setStatus, setUser, setQRCode]);

  return {
    status,
    qrCode,
    user,
    error,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    needsQR: status === 'qr_pending',
    reconnect,
    logout,
  };
}

/**
 * Hook para enviar mensagens
 */
export function useSendMessage() {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendText = useCallback(async (jid: string, text: string) => {
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid, text, type: 'text' }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Erro ao enviar mensagem');
      }

      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setIsSending(false);
    }
  }, []);

  const sendImage = useCallback(async (jid: string, base64: string, caption?: string) => {
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          jid, 
          type: 'image', 
          mediaBase64: base64, 
          caption 
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Erro ao enviar imagem');
      }

      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setIsSending(false);
    }
  }, []);

  return {
    sendText,
    sendImage,
    isSending,
    error,
  };
}

/**
 * Hook para buscar status da conexão
 */
export function useConnectionStatus() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/status');
      const data = await response.json();
      setStatus(data);
    } catch (e) {
      console.error('Erro ao buscar status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Atualizar a cada 30 segundos
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { status, loading, refresh };
}
