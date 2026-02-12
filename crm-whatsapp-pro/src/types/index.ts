/**
 * Tipos globais do CRM SaaS
 * Extraídos do monolito (server.js, script.js, atendimentos.js)
 */

// ============================================================================
// AUTH & TENANT
// ============================================================================

export interface User {
  id: string;
  email: string;
  nome: string;
  role: 'admin' | 'atendente' | 'viewer';
  avatar?: string;
  tenant_id: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  nome: string;
  slug: string;
  plano: 'free' | 'pro' | 'enterprise';
  config: TenantConfig;
}

export interface TenantConfig {
  whatsapp_instance?: string;
  evolution_url?: string;
  evolution_key?: string;
  facilzap_url?: string;
  facilzap_token?: string;
  supabase_url?: string;
  supabase_key?: string;
  openai_key?: string;
  n8n_url?: string;
}

// ============================================================================
// CLIENTES (CRM)
// ============================================================================

export interface Client {
  id: string | number;
  nome: string;
  name?: string;
  telefone?: string;
  celular?: string;
  phone?: string;
  email?: string;
  cidade?: string;
  city?: string;
  estado?: string;
  cpf?: string;
  cnpj?: string;
  tags?: string[];
  notas?: string;
  status: 'ativo' | 'inativo' | 'risco' | 'vip' | 'novo';
  ltv?: number;
  ticket_medio?: number;
  total_pedidos?: number;
  ultima_compra?: string;
  created_at: string;
  updated_at?: string;
}

export interface ClientFilter {
  search?: string;
  status?: Client['status'];
  tag?: string;
  cidade?: string;
  ltv_min?: number;
  ltv_max?: number;
  inativo_dias?: number;
  sort_by?: 'nome' | 'ltv' | 'ultima_compra' | 'total_pedidos';
  sort_dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// ============================================================================
// WHATSAPP / CHATS
// ============================================================================

export interface Chat {
  id: string;
  remoteJid: string;
  name: string;
  phone?: string;
  avatar?: string;
  lastMessage?: ChatMessage;
  lastMessageTime?: number;
  unreadCount: number;
  isGroup: boolean;
  isOnline?: boolean;
  typing?: boolean;
  participantsCount?: number;
  subject?: string;
  tags?: string[];
  snoozedUntil?: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  remoteJid: string;
  content: string;
  timestamp: number;
  fromMe: boolean;
  pushName?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'error';
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'poll' | 'contact' | 'location';
  mediaUrl?: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
  quotedMessage?: Partial<ChatMessage>;
  isForwarded?: boolean;
}

export type ChatFilter = 'all' | 'unread' | 'waiting' | 'groups' | 'sales' | 'snoozed' | 'vacuum';

// ============================================================================
// CAMPANHAS
// ============================================================================

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  audience_type: 'all' | 'segment' | 'group' | 'csv';
  audience_segment?: string;
  audience_groups?: string[];
  blocks: CampaignBlock[];
  batch_size: number;
  batch_interval: number;
  message_delay: number;
  simulate_presence: boolean;
  schedule_enabled: boolean;
  scheduled_at?: string;
  stats: CampaignStats;
  created_at: string;
  updated_at?: string;
}

export interface CampaignBlock {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'poll' | 'sticker' | 'product' | 'pix';
  delay: number;
  data: Record<string, any>;
}

export interface CampaignStats {
  total_recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  progress_percent: number;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  blocks: CampaignBlock[];
  created_at: string;
}

// ============================================================================
// PRODUTOS
// ============================================================================

export interface Product {
  id: string | number;
  nome: string;
  name?: string;
  descricao?: string;
  preco: number;
  price?: number;
  preco_promocional?: number;
  imagem?: string;
  image?: string;
  categoria?: string;
  category?: string;
  estoque?: number;
  sku?: string;
  ativo: boolean;
  link?: string;
  created_at: string;
}

// ============================================================================
// PEDIDOS
// ============================================================================

export interface Order {
  id: string | number;
  codigo?: string;
  cliente_id: string | number;
  client_id?: string | number;
  cliente_nome?: string;
  data: string;
  total: number;
  valor?: number;
  status: 'pendente' | 'pago' | 'enviado' | 'entregue' | 'cancelado';
  itens?: OrderItem[];
  forma_pagamento?: string;
  rastreio?: string;
  notas?: string;
  created_at: string;
}

export interface OrderItem {
  produto_id: string | number;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

// ============================================================================
// CUPONS
// ============================================================================

export interface Coupon {
  id: string;
  codigo: string;
  tipo: 'percentual' | 'valor_fixo' | 'frete_gratis';
  valor: number;
  descricao?: string;
  usos: number;
  limite_usos?: number;
  validade?: string;
  ativo: boolean;
  created_at: string;
}

// ============================================================================
// ANALYTICS
// ============================================================================

export interface DashboardMetrics {
  total_clientes: number;
  clientes_ativos: number;
  clientes_risco: number;
  clientes_inativos: number;
  ltv_medio: number;
  ticket_medio: number;
  receita_mes: number;
  pedidos_mes: number;
  chats_ativos: number;
  chats_nao_lidos: number;
  campanhas_ativas: number;
  taxa_conversao: number;
}

export interface SalesChart {
  labels: string[];
  values: number[];
  period: 'day' | 'week' | 'month';
}

// ============================================================================
// TAGS & NOTAS
// ============================================================================

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Note {
  id: string;
  entity_type: 'chat' | 'client';
  entity_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  content: string;
}

// ============================================================================
// WEBHOOKS
// ============================================================================

export interface WebhookEvent {
  id: string;
  source: 'evolution' | 'facilzap' | 'n8n';
  event_type: string;
  payload: Record<string, any>;
  processed: boolean;
  created_at: string;
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// ============================================================================
// INTEGRATION CONFIGS
// ============================================================================

export interface WhatsAppInstance {
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'qr_pending';
  number?: string;
  profileName?: string;
  profilePic?: string;
  lastConnected?: string;
}

export interface IntegrationStatus {
  name: string;
  connected: boolean;
  lastSync?: string;
  error?: string;
}
