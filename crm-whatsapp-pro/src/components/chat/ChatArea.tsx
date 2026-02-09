/**
 * ChatArea - Área principal de conversa estilo WhatsApp
 * Integrado com stores reais e hooks de envio
 */

'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  MoreVertical,
  Smile,
  Paperclip,
  Mic,
  Send,
  X,
  Image,
  FileText,
  Camera,
  Phone,
  Video,
  Check,
  CheckCheck,
  Clock,
  Reply,
  Copy,
  Trash2,
  Star,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn, formatTime, formatWhatsAppText, getInitials, stringToColor } from '@/lib/utils';
import { useUIStore, useDataStore, useChatsStore, useConnectionStore, type Message } from '@/store';
import { useSendMessage } from '@/hooks/useWhatsApp';

// Mensagens mock para demonstração (quando não há conexão real)
const MOCK_MESSAGES: Message[] = [
  {
    id: '1',
    chatId: '5511999999999@s.whatsapp.net',
    content: 'Olá! Tudo bem?',
    timestamp: Date.now() / 1000 - 3600,
    fromMe: false,
    status: 'read',
    type: 'text',
  },
  {
    id: '2',
    chatId: '5511999999999@s.whatsapp.net',
    content: 'Oi! Tudo sim, e você?',
    timestamp: Date.now() / 1000 - 3500,
    fromMe: true,
    status: 'read',
    type: 'text',
  },
  {
    id: '3',
    chatId: '5511999999999@s.whatsapp.net',
    content: 'Gostaria de saber sobre o produto X. Qual o preço e prazo de entrega?',
    timestamp: Date.now() / 1000 - 3400,
    fromMe: false,
    status: 'read',
    type: 'text',
  },
  {
    id: '4',
    chatId: '5511999999999@s.whatsapp.net',
    content: 'Claro! O produto X custa *R$ 199,90* e o prazo de entrega é de _3 a 5 dias úteis_.',
    timestamp: Date.now() / 1000 - 3300,
    fromMe: true,
    status: 'read',
    type: 'text',
  },
  {
    id: '5',
    chatId: '5511999999999@s.whatsapp.net',
    content: 'Ótimo! Vocês aceitam PIX?',
    timestamp: Date.now() / 1000 - 600,
    fromMe: false,
    status: 'read',
    type: 'text',
  },
  {
    id: '6',
    chatId: '5511999999999@s.whatsapp.net',
    content: 'Sim, aceitamos! Nossa chave PIX é: loja@email.com',
    timestamp: Date.now() / 1000 - 500,
    fromMe: true,
    status: 'delivered',
    type: 'text',
  },
  {
    id: '7',
    chatId: '5511999999999@s.whatsapp.net',
    content: 'Perfeito! Vou fazer o pagamento agora.',
    timestamp: Date.now() / 1000 - 300,
    fromMe: false,
    status: 'read',
    type: 'text',
  },
];

export function ChatArea() {
  // ============ STORES ============
  const { selectedChatId, toggleCRMSidebar, isCRMSidebarOpen } = useUIStore();
  const { quickReplies } = useDataStore();
  const { messages: realMessages, chats } = useChatsStore();
  const { status: connectionStatus } = useConnectionStore();
  
  // ============ HOOKS ============
  const { sendText, isSending } = useSendMessage();
  
  // ============ STATE LOCAL ============
  const [message, setMessage] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [sendingError, setSendingError] = useState<string | null>(null);
  
  // ============ REFS ============
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ============ COMPUTED VALUES ============
  
  // Buscar chat atual (real ou mock)
  const currentChat = useMemo(() => {
    const found = chats.find((c) => c.id === selectedChatId);
    if (found) return found;
    
    // Mock fallback
    return {
      id: selectedChatId || '',
      name: 'João Silva',
      phone: '11999999999',
      isOnline: true,
      isGroup: false,
      unreadCount: 0,
      lastMessage: '',
      lastMessageTime: Date.now() / 1000,
    };
  }, [chats, selectedChatId]);

  // Buscar mensagens (reais ou mock)
  const messages = useMemo(() => {
    if (selectedChatId && realMessages[selectedChatId]?.length > 0) {
      return [...realMessages[selectedChatId], ...localMessages].sort((a, b) => a.timestamp - b.timestamp);
    }
    // Fallback para mock + mensagens locais
    const mockForChat = MOCK_MESSAGES.filter((m) => m.chatId === selectedChatId);
    return [...mockForChat, ...localMessages].sort((a, b) => a.timestamp - b.timestamp);
  }, [selectedChatId, realMessages, localMessages]);

  // Filtrar respostas rápidas pelo texto digitado
  const filteredReplies = useMemo(() => {
    if (!message.startsWith('/')) return [];
    return quickReplies.filter((r) =>
      r.shortcut.toLowerCase().includes(message.toLowerCase())
    );
  }, [quickReplies, message]);

  // Cor do avatar baseada no nome
  const avatarColor = useMemo(() => stringToColor(currentChat.name), [currentChat.name]);

  // ============ EFFECTS ============

  // Scroll para o final quando mudar de chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChatId, messages.length]);

  // Mostrar/esconder respostas rápidas
  useEffect(() => {
    setShowQuickReplies(message.startsWith('/') && filteredReplies.length > 0);
  }, [message, filteredReplies.length]);

  // Limpar erro após 5s
  useEffect(() => {
    if (sendingError) {
      const timer = setTimeout(() => setSendingError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [sendingError]);

  // ============ HANDLERS ============

  // Enviar mensagem
  const handleSend = useCallback(async () => {
    if (!message.trim() || !selectedChatId) return;
    
    const messageText = message.trim();
    setSendingError(null);
    
    // Criar mensagem otimista (aparece imediatamente)
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      chatId: selectedChatId,
      content: messageText,
      timestamp: Date.now() / 1000,
      fromMe: true,
      status: 'pending',
      type: 'text',
    };
    
    // Adicionar mensagem local imediatamente
    setLocalMessages(prev => [...prev, optimisticMessage]);
    setMessage('');
    inputRef.current?.focus();
    
    // Tentar enviar via WhatsApp real
    if (connectionStatus === 'connected') {
      try {
        await sendText(selectedChatId, messageText);
        // Atualizar status para 'sent'
        setLocalMessages(prev => 
          prev.map(m => m.id === optimisticMessage.id 
            ? { ...m, status: 'sent' as const }
            : m
          )
        );
      } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        setSendingError('Falha ao enviar. Tentando novamente...');
        // Manter como pending mas marcar erro
        setLocalMessages(prev => 
          prev.map(m => m.id === optimisticMessage.id 
            ? { ...m, status: 'error' as const }
            : m
          )
        );
      }
    } else {
      // Sem conexão, simular envio
      setTimeout(() => {
        setLocalMessages(prev => 
          prev.map(m => m.id === optimisticMessage.id 
            ? { ...m, status: 'delivered' as const }
            : m
          )
        );
      }, 500);
    }
  }, [message, selectedChatId, connectionStatus, sendText]);

  // Inserir resposta rápida
  const insertQuickReply = useCallback((content: string) => {
    setMessage(content);
    setShowQuickReplies(false);
    inputRef.current?.focus();
  }, []);

  // ============ RENDER - Nenhum chat selecionado ============
  if (!selectedChatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-wa-bg-conversation">
        <div className="text-center">
          <div className="w-64 h-64 mx-auto mb-6 opacity-20">
            <svg viewBox="0 0 303 172" className="w-full h-full">
              <path
                fill="#8696a0"
                d="M229.565 160.229c32.647-16.027 54.918-49.337 54.918-87.857 0-54.126-44.078-98.019-98.439-98.019-54.361 0-98.439 43.893-98.439 98.019 0 38.52 22.271 71.83 54.918 87.857H75.248c-11.279 0-18.896 11.539-14.403 21.823h181.294c4.493-10.284-3.124-21.823-14.403-21.823h-67.276l69.105-.000z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-light text-wa-text-primary mb-2">WhatsApp Web</h2>
          <p className="text-wa-text-secondary text-sm max-w-md">
            Envie e receba mensagens sem manter seu celular conectado.
          </p>
          <p className="text-wa-text-secondary text-xs mt-4">
            Selecione um contato para iniciar uma conversa
          </p>
        </div>
      </div>
    );
  }

  // ============ RENDER - Chat selecionado ============
  return (
    <div className="flex-1 flex flex-col bg-wa-bg-conversation relative">
      {/* Header do Chat */}
      <div className="flex items-center justify-between px-4 py-2 bg-wa-bg-panel border-b border-wa-border">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold cursor-pointer hover:opacity-90 transition-opacity"
            style={{ backgroundColor: avatarColor }}
            onClick={toggleCRMSidebar}
          >
            {getInitials(currentChat.name)}
          </div>

          {/* Info */}
          <div className="cursor-pointer" onClick={toggleCRMSidebar}>
            <h2 className="font-medium text-wa-text-primary">{currentChat.name}</h2>
            <p className="text-xs text-wa-text-secondary">
              {currentChat.isOnline ? (
                <span className="text-wa-accent-green">online</span>
              ) : (
                'offline'
              )}
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-full hover:bg-wa-bg-hover text-wa-text-secondary transition-colors">
            <Video className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-wa-bg-hover text-wa-text-secondary transition-colors">
            <Phone className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-wa-bg-hover text-wa-text-secondary transition-colors">
            <Search className="w-5 h-5" />
          </button>
          <button
            className={cn(
              'p-2 rounded-full hover:bg-wa-bg-hover transition-colors',
              isCRMSidebarOpen ? 'text-wa-accent-green' : 'text-wa-text-secondary'
            )}
            onClick={toggleCRMSidebar}
            title="Abrir painel CRM"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Erro de envio */}
      {sendingError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-20">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{sendingError}</span>
        </div>
      )}

      {/* Área de Mensagens */}
      <div
        className="flex-1 overflow-y-auto px-16 py-4"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23182229' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {/* Mensagens */}
        <div className="space-y-1">
          {messages.map((msg, index) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              showTail={index === 0 || messages[index - 1]?.fromMe !== msg.fromMe}
            />
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Sugestões de Respostas Rápidas */}
      {showQuickReplies && filteredReplies.length > 0 && (
        <div className="absolute bottom-20 left-20 right-20 bg-wa-bg-panel border border-wa-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
          {filteredReplies.map((reply) => (
            <button
              key={reply.id}
              onClick={() => insertQuickReply(reply.content)}
              className="w-full px-4 py-3 text-left hover:bg-wa-bg-hover border-b border-wa-border last:border-0 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-wa-accent-green font-mono text-sm">{reply.shortcut}</span>
                <span className="text-wa-text-secondary text-xs">{reply.title}</span>
              </div>
              <p className="text-wa-text-primary text-sm mt-1 truncate">{reply.content}</p>
            </button>
          ))}
        </div>
      )}

      {/* Área de Input */}
      <div className="flex items-end gap-2 px-4 py-3 bg-wa-bg-panel">
        {/* Botão Emoji */}
        <button className="p-2 rounded-full hover:bg-wa-bg-hover text-wa-text-secondary transition-colors">
          <Smile className="w-6 h-6" />
        </button>

        {/* Botão Anexar */}
        <div className="relative">
          <button
            className="p-2 rounded-full hover:bg-wa-bg-hover text-wa-text-secondary transition-colors"
            onClick={() => setShowAttachMenu(!showAttachMenu)}
          >
            <Paperclip className="w-6 h-6" />
          </button>

          {/* Menu de Anexos */}
          {showAttachMenu && (
            <div className="absolute bottom-14 left-0 bg-wa-bg-panel rounded-lg shadow-lg border border-wa-border p-2 z-10">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Image, color: 'bg-purple-500', label: 'Fotos' },
                  { icon: Camera, color: 'bg-pink-500', label: 'Câmera' },
                  { icon: FileText, color: 'bg-blue-500', label: 'Documento' },
                ].map((item) => (
                  <button
                    key={item.label}
                    className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-wa-bg-hover transition-colors"
                    onClick={() => setShowAttachMenu(false)}
                  >
                    <div className={cn('p-3 rounded-full', item.color)}>
                      <item.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs text-wa-text-secondary">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input de Texto */}
        <div className="flex-1 bg-wa-bg-input rounded-lg px-4 py-2">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Digite uma mensagem"
            className="w-full bg-transparent text-wa-text-primary placeholder:text-wa-text-secondary outline-none resize-none max-h-32"
            rows={1}
            disabled={isSending}
          />
        </div>

        {/* Botão Enviar/Gravar */}
        {message.trim() ? (
          <button
            onClick={handleSend}
            disabled={isSending}
            className={cn(
              'p-2 rounded-full text-white transition-colors',
              isSending 
                ? 'bg-wa-accent-green/50 cursor-not-allowed' 
                : 'bg-wa-accent-green hover:bg-wa-accent-green/90'
            )}
          >
            {isSending ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Send className="w-6 h-6" />
            )}
          </button>
        ) : (
          <button className="p-2 rounded-full hover:bg-wa-bg-hover text-wa-text-secondary transition-colors">
            <Mic className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}

// Componente de Balão de Mensagem
interface MessageBubbleProps {
  message: Message;
  showTail: boolean;
}

function MessageBubble({ message, showTail }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={cn('flex', message.fromMe ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setShowMenu(true)}
      onMouseLeave={() => setShowMenu(false)}
    >
      <div
        className={cn(
          'relative max-w-[65%] px-3 py-2 rounded-lg shadow-wa',
          message.fromMe ? 'bg-wa-bubble-out' : 'bg-wa-bubble-in',
          showTail && (message.fromMe ? 'rounded-tr-none' : 'rounded-tl-none')
        )}
      >
        {/* Tail */}
        {showTail && (
          <div
            className={cn(
              'absolute top-0 w-3 h-3',
              message.fromMe
                ? '-right-2 border-l-8 border-l-wa-bubble-out border-t-8 border-t-transparent'
                : '-left-2 border-r-8 border-r-wa-bubble-in border-t-8 border-t-transparent'
            )}
          />
        )}

        {/* Conteúdo */}
        <p
          className="text-wa-text-primary text-sm whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: formatWhatsAppText(message.content) }}
        />

        {/* Timestamp e Status */}
        <div className="flex items-center justify-end gap-1 mt-1 -mb-1">
          <span className="text-[11px] text-wa-text-time">{formatTime(message.timestamp)}</span>
          {message.fromMe && <MessageStatus status={message.status} />}
        </div>

        {/* Menu de Ações */}
        {showMenu && (
          <div
            className={cn(
              'absolute top-1 flex items-center gap-0.5 bg-wa-bg-panel rounded shadow-md p-1',
              message.fromMe ? 'left-0 -translate-x-full -ml-2' : 'right-0 translate-x-full ml-2'
            )}
          >
            <button className="p-1.5 hover:bg-wa-bg-hover rounded" title="Responder">
              <Reply className="w-4 h-4 text-wa-text-secondary" />
            </button>
            <button className="p-1.5 hover:bg-wa-bg-hover rounded" title="Copiar">
              <Copy className="w-4 h-4 text-wa-text-secondary" />
            </button>
            <button className="p-1.5 hover:bg-wa-bg-hover rounded" title="Favoritar">
              <Star className="w-4 h-4 text-wa-text-secondary" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Status da mensagem (ticks)
function MessageStatus({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4 text-wa-text-time" />;
    case 'sent':
      return <Check className="w-4 h-4 text-wa-text-time" />;
    case 'delivered':
      return <CheckCheck className="w-4 h-4 text-wa-text-time" />;
    case 'read':
      return <CheckCheck className="w-4 h-4 text-wa-accent-blue" />;
    default:
      return null;
  }
}
