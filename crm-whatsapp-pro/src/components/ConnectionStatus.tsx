/**
 * ConnectionStatus - Barra de status de conexão
 */

'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, QrCode, Loader2, AlertTriangle, RefreshCw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConnectionStore, type ConnectionStatus } from '@/store';

export function ConnectionStatus() {
  const { status, qrCode, user, error, setStatus, setQRCode, setUser, setError } =
    useConnectionStore();
  const [showQR, setShowQR] = useState(false);

  // Conectar via SSE
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connect = () => {
      eventSource = new EventSource('/api/whatsapp/qr');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'qr':
              setQRCode(data.qr);
              setStatus('qr_pending');
              setShowQR(true);
              break;
            case 'connected':
              setStatus('connected');
              setUser(data.user);
              setQRCode(null);
              setShowQR(false);
              break;
            case 'status':
              setStatus(data.status);
              break;
            case 'error':
              setError(data.error);
              setStatus('error');
              break;
          }
        } catch (e) {
          console.error('Erro ao processar evento:', e);
        }
      };

      eventSource.onerror = () => {
        setStatus('disconnected');
        eventSource?.close();
        // Tentar reconectar após 5s
        setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
    };
  }, []);

  // Forçar reconexão
  const handleReconnect = async () => {
    setStatus('connecting');
    try {
      await fetch('/api/whatsapp/reconnect', { method: 'POST' });
    } catch (e) {
      setError('Erro ao reconectar');
    }
  };

  // Barra de status
  const statusConfig: Record<ConnectionStatus['status'], { bg: string; icon: LucideIcon; text: string; animate?: boolean }> = {
    connected: {
      bg: 'bg-green-500',
      icon: Wifi,
      text: user ? `Conectado como ${user.name}` : 'Conectado',
    },
    connecting: {
      bg: 'bg-yellow-500',
      icon: Loader2,
      text: 'Conectando...',
      animate: true,
    },
    qr_pending: {
      bg: 'bg-blue-500',
      icon: QrCode,
      text: 'Escaneie o QR Code',
    },
    disconnected: {
      bg: 'bg-red-500',
      icon: WifiOff,
      text: 'Desconectado',
    },
    error: {
      bg: 'bg-red-500',
      icon: AlertTriangle,
      text: error || 'Erro na conexão',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <>
      {/* Barra de Status */}
      <div
        className={cn(
          'flex items-center justify-center gap-2 px-4 py-2 text-white text-sm font-medium',
          config.bg
        )}
      >
        <Icon className={cn('w-4 h-4', config.animate && 'animate-spin')} />
        <span>{config.text}</span>

        {(status === 'disconnected' || status === 'error') && (
          <button
            onClick={handleReconnect}
            className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Reconectar
          </button>
        )}

        {status === 'qr_pending' && (
          <button
            onClick={() => setShowQR(true)}
            className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs"
          >
            Ver QR Code
          </button>
        )}
      </div>

      {/* Modal QR Code */}
      {showQR && qrCode && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">
              Conectar WhatsApp
            </h2>
            <p className="text-gray-600 text-center mb-6">
              Escaneie o QR Code com seu celular para conectar
            </p>

            {/* QR Code Image */}
            <div className="bg-white p-4 rounded-xl border-2 border-gray-100 flex items-center justify-center mb-6">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrCode)}`}
                alt="QR Code"
                className="w-64 h-64"
              />
            </div>

            {/* Instruções */}
            <ol className="text-sm text-gray-600 space-y-2 mb-6">
              <li className="flex items-start gap-2">
                <span className="bg-green-500 text-white w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs">
                  1
                </span>
                Abra o WhatsApp no seu celular
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-green-500 text-white w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs">
                  2
                </span>
                Toque em Menu ou Configurações e selecione &quot;Aparelhos conectados&quot;
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-green-500 text-white w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs">
                  3
                </span>
                Toque em &quot;Conectar um aparelho&quot; e escaneie o código
              </li>
            </ol>

            <button
              onClick={() => setShowQR(false)}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-medium transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
