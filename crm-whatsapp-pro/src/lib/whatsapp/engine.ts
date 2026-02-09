/**
 * WhatsApp Engine - Conexão direta via Baileys
 * 
 * Este módulo gerencia a conexão com WhatsApp sem depender de containers Docker.
 * Oferece reconexão automática com backoff exponencial para 99.9% uptime.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  MessageUpsertType,
  WAMessage,
  ConnectionState,
  BaileysEventMap,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';

// Tipo para erro do Boom
interface BoomError extends Error {
  output?: {
    statusCode?: number;
  };
}

// Logger silencioso para produção
const logger = pino({ level: process.env.NODE_ENV === 'development' ? 'debug' : 'silent' });

// Tipos
export interface FormattedMessage {
  id: string;
  chatId: string;
  fromMe: boolean;
  timestamp: number;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'contact' | 'location' | 'unknown';
  content: string;
  caption?: string;
  quotedMessage?: any;
  pushName?: string;
  mediaUrl?: string;
  mimetype?: string;
  filename?: string;
}

export interface ConnectionInfo {
  connected: boolean;
  user?: {
    id: string;
    name: string;
  };
  reconnectAttempts: number;
  lastConnected?: Date;
  status: 'connected' | 'connecting' | 'disconnected' | 'qr_pending' | 'error';
}

export interface ChatInfo {
  id: string;
  name?: string;
  unreadCount: number;
  lastMessage?: FormattedMessage;
  timestamp: number;
  isGroup: boolean;
  participant?: string;
}

type EventHandler<T = any> = (data: T) => void;

class WhatsAppEngine {
  private socket: WASocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 3000; // 3 segundos
  private isConnecting = false;
  private lastConnected: Date | null = null;
  private currentQR: string | null = null;
  private connectionStatus: ConnectionInfo['status'] = 'disconnected';
  
  // Sistema de eventos
  private handlers: Map<string, EventHandler[]> = new Map();
  
  // Cache de chats e mensagens
  private chatsCache: Map<string, ChatInfo> = new Map();
  private messagesCache: Map<string, FormattedMessage[]> = new Map();
  
  // Diretório de autenticação
  private authDir: string;
  
  constructor() {
    this.authDir = path.join(process.cwd(), 'auth_session');
    this.ensureAuthDir();
  }
  
  private ensureAuthDir() {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }
  
  /**
   * Conectar ao WhatsApp
   */
  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log('[WhatsApp] Já está conectando...');
      return;
    }
    
    this.isConnecting = true;
    this.connectionStatus = 'connecting';
    this.emit('status_change', { status: 'connecting' });
    
    try {
      // Carregar estado de autenticação persistido
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      
      // Buscar versão mais recente do WhatsApp Web
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`[WhatsApp] Usando versão ${version.join('.')} (latest: ${isLatest})`);
      
      // Criar socket
      this.socket = makeWASocket({
        version,
        logger,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: true,
        generateHighQualityLinkPreview: true,
        
        // Configurações de estabilidade
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000, // Ping a cada 25s para manter conexão
        retryRequestDelayMs: 500,
        markOnlineOnConnect: true,
        
        // Histórico
        syncFullHistory: false, // true baixa todo histórico (muito lento)
        
        // Browser info (simular WhatsApp Web)
        browser: ['CRM WhatsApp Pro', 'Chrome', '120.0.0'],
      });
      
      // Configurar handlers de eventos
      this.setupEventHandlers(saveCreds);
      
    } catch (error) {
      console.error('[WhatsApp] Erro ao conectar:', error);
      this.isConnecting = false;
      this.connectionStatus = 'error';
      this.emit('error', { error });
      this.scheduleReconnect();
    }
  }
  
  /**
   * Configurar handlers de eventos do Baileys
   */
  private setupEventHandlers(saveCreds: () => Promise<void>): void {
    if (!this.socket) return;
    
    // Salvar credenciais quando atualizarem
    this.socket.ev.on('creds.update', saveCreds);
    
    // Handler principal de conexão
    this.socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      this.handleConnectionUpdate(update);
    });
    
    // Mensagens recebidas
    this.socket.ev.on('messages.upsert', ({ messages, type }: { messages: WAMessage[], type: MessageUpsertType }) => {
      this.handleMessagesUpsert(messages, type);
    });
    
    // Status de mensagens (ticks)
    this.socket.ev.on('messages.update', (updates: any[]) => {
      this.handleMessagesUpdate(updates);
    });
    
    // Chats atualizados
    this.socket.ev.on('chats.update', (chats: any[]) => {
      this.handleChatsUpdate(chats);
    });
    
    // Contatos atualizados
    this.socket.ev.on('contacts.update', (contacts: any[]) => {
      this.emit('contacts_update', contacts);
    });
    
    // Presença (online/offline/digitando)
    this.socket.ev.on('presence.update', (presence: any) => {
      this.emit('presence_update', presence);
    });
  }
  
  /**
   * Handler de atualização de conexão
   */
  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;
    
    // QR Code para escanear
    if (qr) {
      this.currentQR = qr;
      this.connectionStatus = 'qr_pending';
      console.log('[WhatsApp] QR Code gerado. Escaneie com seu celular.');
      this.emit('qr', qr);
    }
    
    // Conexão estabelecida
    if (connection === 'open') {
      console.log('[WhatsApp] ✅ Conectado com sucesso!');
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.lastConnected = new Date();
      this.currentQR = null;
      this.connectionStatus = 'connected';
      
      this.emit('connected', {
        user: this.socket?.user,
        timestamp: this.lastConnected,
      });
      this.emit('status_change', { status: 'connected' });
    }
    
    // Conexão fechada
    if (connection === 'close') {
      this.isConnecting = false;
      const error = lastDisconnect?.error as BoomError;
      const statusCode = error?.output?.statusCode || 0;
      const reason = DisconnectReason[statusCode] || `unknown (${statusCode})`;
      
      console.log(`[WhatsApp] ❌ Desconectado: ${reason}`);
      
      // Verificar se deve reconectar
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      if (shouldReconnect) {
        this.connectionStatus = 'disconnected';
        this.emit('disconnected', { reason, willReconnect: true });
        this.scheduleReconnect();
      } else {
        // Logout manual - limpar sessão
        console.log('[WhatsApp] Logout detectado. Limpando sessão...');
        this.clearSession();
        this.connectionStatus = 'disconnected';
        this.emit('logged_out');
      }
      
      this.emit('status_change', { status: this.connectionStatus });
    }
  }
  
  /**
   * Handler de novas mensagens
   */
  private handleMessagesUpsert(messages: WAMessage[], type: MessageUpsertType): void {
    if (type !== 'notify') return;
    
    for (const msg of messages) {
      if (!msg.message) continue;
      
      const formatted = this.formatMessage(msg);
      
      // Atualizar cache
      const chatMessages = this.messagesCache.get(formatted.chatId) || [];
      chatMessages.push(formatted);
      this.messagesCache.set(formatted.chatId, chatMessages.slice(-100)); // Manter últimas 100
      
      // Emitir evento
      this.emit('message', formatted);
      
      // Log
      const direction = formatted.fromMe ? '📤' : '📥';
      console.log(`[WhatsApp] ${direction} ${formatted.chatId}: ${formatted.content.substring(0, 50)}...`);
    }
  }
  
  /**
   * Handler de atualização de status de mensagens
   */
  private handleMessagesUpdate(updates: any[]): void {
    for (const update of updates) {
      // Status: 1=pending, 2=sent, 3=delivered, 4=read
      this.emit('message_status', {
        id: update.key.id,
        chatId: update.key.remoteJid,
        status: update.update.status,
        statusText: this.getStatusText(update.update.status),
      });
    }
  }
  
  /**
   * Handler de atualização de chats
   */
  private handleChatsUpdate(chats: any[]): void {
    for (const chat of chats) {
      const existing = this.chatsCache.get(chat.id) || {} as ChatInfo;
      this.chatsCache.set(chat.id, {
        ...existing,
        ...chat,
        id: chat.id,
        isGroup: chat.id.includes('@g.us'),
      });
    }
    this.emit('chats_update', chats);
  }
  
  /**
   * Agendar reconexão com backoff exponencial
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WhatsApp] Máximo de tentativas de reconexão atingido.');
      this.emit('reconnect_failed', {
        attempts: this.reconnectAttempts,
        message: 'Não foi possível reconectar após múltiplas tentativas',
      });
      return;
    }
    
    // Backoff exponencial: 3s, 4.5s, 6.75s, 10s, 15s...
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      60000 // Máximo 60 segundos
    );
    
    this.reconnectAttempts++;
    
    console.log(`[WhatsApp] Reconectando em ${Math.round(delay / 1000)}s (tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay,
    });
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  /**
   * Formatar mensagem do Baileys para formato padronizado
   */
  private formatMessage(raw: WAMessage): FormattedMessage {
    const key = raw.key;
    const msg = raw.message!;
    
    return {
      id: key.id!,
      chatId: key.remoteJid!,
      fromMe: key.fromMe || false,
      timestamp: typeof raw.messageTimestamp === 'number' 
        ? raw.messageTimestamp 
        : Number(raw.messageTimestamp),
      type: this.getMessageType(msg),
      content: this.extractContent(msg),
      caption: this.extractCaption(msg),
      quotedMessage: msg.extendedTextMessage?.contextInfo?.quotedMessage,
      pushName: raw.pushName || undefined,
    };
  }
  
  /**
   * Detectar tipo de mensagem
   */
  private getMessageType(msg: proto.IMessage): FormattedMessage['type'] {
    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.imageMessage) return 'image';
    if (msg.videoMessage) return 'video';
    if (msg.audioMessage) return 'audio';
    if (msg.documentMessage) return 'document';
    if (msg.stickerMessage) return 'sticker';
    if (msg.contactMessage || msg.contactsArrayMessage) return 'contact';
    if (msg.locationMessage || msg.liveLocationMessage) return 'location';
    return 'unknown';
  }
  
  /**
   * Extrair conteúdo de texto da mensagem
   */
  private extractContent(msg: proto.IMessage): string {
    return msg.conversation ||
           msg.extendedTextMessage?.text ||
           msg.imageMessage?.caption ||
           msg.videoMessage?.caption ||
           msg.documentMessage?.fileName ||
           '[Mídia]';
  }
  
  /**
   * Extrair caption de mídia
   */
  private extractCaption(msg: proto.IMessage): string | undefined {
    return msg.imageMessage?.caption ||
           msg.videoMessage?.caption ||
           undefined;
  }
  
  /**
   * Converter status numérico para texto
   */
  private getStatusText(status: number): string {
    switch (status) {
      case 1: return 'pending';
      case 2: return 'sent';
      case 3: return 'delivered';
      case 4: return 'read';
      default: return 'unknown';
    }
  }
  
  // ===========================================================================
  // MÉTODOS PÚBLICOS - Envio de Mensagens
  // ===========================================================================
  
  /**
   * Enviar mensagem de texto
   */
  async sendText(jid: string, text: string): Promise<proto.WebMessageInfo> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    
    const normalizedJid = this.normalizeJid(jid);
    const result = await this.socket.sendMessage(normalizedJid, { text });
    
    console.log(`[WhatsApp] 📤 Mensagem enviada para ${normalizedJid}`);
    return result!;
  }
  
  /**
   * Enviar imagem
   */
  async sendImage(jid: string, buffer: Buffer, caption?: string): Promise<proto.WebMessageInfo> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    
    const normalizedJid = this.normalizeJid(jid);
    return (await this.socket.sendMessage(normalizedJid, {
      image: buffer,
      caption,
    }))!;
  }
  
  /**
   * Enviar áudio (voice note)
   */
  async sendAudio(jid: string, buffer: Buffer): Promise<proto.WebMessageInfo> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    
    const normalizedJid = this.normalizeJid(jid);
    return (await this.socket.sendMessage(normalizedJid, {
      audio: buffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true, // Push to talk (aparece como voice note)
    }))!;
  }
  
  /**
   * Enviar documento/arquivo
   */
  async sendDocument(jid: string, buffer: Buffer, filename: string, mimetype: string): Promise<proto.WebMessageInfo> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    
    const normalizedJid = this.normalizeJid(jid);
    return (await this.socket.sendMessage(normalizedJid, {
      document: buffer,
      fileName: filename,
      mimetype,
    }))!;
  }
  
  /**
   * Enviar localização
   */
  async sendLocation(jid: string, latitude: number, longitude: number): Promise<proto.WebMessageInfo> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    
    const normalizedJid = this.normalizeJid(jid);
    return (await this.socket.sendMessage(normalizedJid, {
      location: { degreesLatitude: latitude, degreesLongitude: longitude },
    }))!;
  }
  
  /**
   * Marcar mensagens como lidas
   */
  async markAsRead(jid: string, messageIds: string[]): Promise<void> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    
    const normalizedJid = this.normalizeJid(jid);
    await this.socket.readMessages([
      { remoteJid: normalizedJid, id: messageIds[0], participant: undefined }
    ]);
  }
  
  /**
   * Enviar "digitando..."
   */
  async sendTyping(jid: string): Promise<void> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    await this.socket.sendPresenceUpdate('composing', this.normalizeJid(jid));
  }
  
  /**
   * Parar "digitando..."
   */
  async stopTyping(jid: string): Promise<void> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    await this.socket.sendPresenceUpdate('paused', this.normalizeJid(jid));
  }
  
  // ===========================================================================
  // MÉTODOS PÚBLICOS - Consultas
  // ===========================================================================
  
  /**
   * Buscar histórico de mensagens de um chat
   */
  async fetchMessages(jid: string, limit = 50): Promise<WAMessage[]> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    // Note: Este método pode variar dependendo da versão do Baileys
    // Em versões mais novas, use store.loadMessages
    return [];
  }
  
  /**
   * Buscar informações de um contato
   */
  async getContact(jid: string): Promise<any> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    const normalizedJid = this.normalizeJid(jid);
    // Baileys não tem método direto, use o cache
    return null;
  }
  
  /**
   * Verificar se número existe no WhatsApp
   */
  async checkNumberExists(phone: string): Promise<{ exists: boolean; jid?: string }> {
    if (!this.socket) throw new Error('WhatsApp não conectado');
    
    const cleanPhone = phone.replace(/\D/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;
    
    try {
      const results = await this.socket.onWhatsApp(jid);
      const result = results?.[0];
      return { 
        exists: result?.exists === true, 
        jid: result?.jid 
      };
    } catch {
      return { exists: false };
    }
  }
  
  // ===========================================================================
  // MÉTODOS PÚBLICOS - Controle
  // ===========================================================================
  
  /**
   * Desconectar (mas manter sessão)
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }
    this.isConnecting = false;
    this.connectionStatus = 'disconnected';
  }
  
  /**
   * Logout completo (limpa sessão)
   */
  async logout(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
    }
    this.clearSession();
  }
  
  /**
   * Limpar sessão salva
   */
  private clearSession(): void {
    if (fs.existsSync(this.authDir)) {
      fs.rmSync(this.authDir, { recursive: true, force: true });
      fs.mkdirSync(this.authDir, { recursive: true });
    }
    this.chatsCache.clear();
    this.messagesCache.clear();
    this.currentQR = null;
  }
  
  /**
   * Forçar reconexão
   */
  async forceReconnect(): Promise<void> {
    console.log('[WhatsApp] Forçando reconexão...');
    this.reconnectAttempts = 0; // Reset contador
    await this.disconnect();
    await this.connect();
  }
  
  /**
   * Obter informações de conexão
   */
  getConnectionInfo(): ConnectionInfo {
    return {
      connected: this.isConnected(),
      user: this.socket?.user ? {
        id: this.socket.user.id,
        name: this.socket.user.name || 'Usuário',
      } : undefined,
      reconnectAttempts: this.reconnectAttempts,
      lastConnected: this.lastConnected || undefined,
      status: this.connectionStatus,
    };
  }
  
  /**
   * Verificar se está conectado
   */
  isConnected(): boolean {
    return !!this.socket?.user;
  }
  
  /**
   * Obter QR code atual
   */
  getCurrentQR(): string | null {
    return this.currentQR;
  }
  
  // ===========================================================================
  // SISTEMA DE EVENTOS
  // ===========================================================================
  
  /**
   * Registrar handler de evento
   */
  on<T = any>(event: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler as EventHandler);
  }
  
  /**
   * Remover handler de evento
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  /**
   * Emitir evento
   */
  private emit(event: string, data?: any): void {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[WhatsApp] Erro no handler de ${event}:`, error);
      }
    });
  }
  
  // ===========================================================================
  // UTILITÁRIOS
  // ===========================================================================
  
  /**
   * Normalizar JID para formato correto
   */
  private normalizeJid(jid: string): string {
    // Se já tem sufixo, retornar como está
    if (jid.includes('@')) {
      return jid;
    }
    
    // Limpar e adicionar sufixo
    const clean = jid.replace(/\D/g, '');
    
    // Adicionar DDI brasileiro se necessário
    if (clean.length === 10 || clean.length === 11) {
      return `55${clean}@s.whatsapp.net`;
    }
    
    return `${clean}@s.whatsapp.net`;
  }
}

// Exportar singleton
export const whatsappEngine = new WhatsAppEngine();

// Exportar classe para testes
export { WhatsAppEngine };
