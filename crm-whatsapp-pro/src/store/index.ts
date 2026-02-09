/**
 * Store Global - Estado da Central de Atendimento
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Tipos
export interface Chat {
  id: string;
  name: string;
  phone?: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  isGroup: boolean;
  isOnline?: boolean;
  typing?: boolean;
}

export interface Message {
  id: string;
  chatId: string;
  content: string;
  timestamp: number;
  fromMe: boolean;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'error';
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  quotedMessage?: Message;
  mediaUrl?: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Note {
  id: string;
  chatId: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  content: string;
}

// Filtros disponíveis
export type ChatFilter = 'all' | 'unread' | 'waiting' | 'groups' | 'tagged' | 'snoozed';

// Store de UI
interface UIState {
  // Sidebar CRM
  isCRMSidebarOpen: boolean;
  toggleCRMSidebar: () => void;
  setCRMSidebarOpen: (open: boolean) => void;
  
  // Chat selecionado
  selectedChatId: string | null;
  selectChat: (chatId: string | null) => void;
  
  // Filtro ativo
  activeFilter: ChatFilter;
  setActiveFilter: (filter: ChatFilter) => void;
  
  // Busca
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  
  // Modais
  activeModal: string | null;
  openModal: (modal: string) => void;
  closeModal: () => void;
  
  // Painel de notas
  isNotesPanelOpen: boolean;
  toggleNotesPanel: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Sidebar
  isCRMSidebarOpen: true,
  toggleCRMSidebar: () => set((s) => ({ isCRMSidebarOpen: !s.isCRMSidebarOpen })),
  setCRMSidebarOpen: (open) => set({ isCRMSidebarOpen: open }),
  
  // Chat
  selectedChatId: null,
  selectChat: (chatId) => set({ selectedChatId: chatId }),
  
  // Filtro
  activeFilter: 'all',
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  
  // Busca
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  // Modais
  activeModal: null,
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  
  // Notas
  isNotesPanelOpen: false,
  toggleNotesPanel: () => set((s) => ({ isNotesPanelOpen: !s.isNotesPanelOpen })),
}));

// Store de Dados (persistido)
interface DataState {
  // Tags
  tags: Tag[];
  chatTags: Record<string, string[]>; // chatId -> tagIds
  addTag: (tag: Tag) => void;
  removeTag: (tagId: string) => void;
  assignTagToChat: (chatId: string, tagId: string) => void;
  removeTagFromChat: (chatId: string, tagId: string) => void;
  
  // Notas
  notes: Record<string, Note>; // chatId -> note
  saveNote: (chatId: string, content: string) => void;
  
  // Respostas Rápidas
  quickReplies: QuickReply[];
  addQuickReply: (reply: QuickReply) => void;
  updateQuickReply: (id: string, reply: Partial<QuickReply>) => void;
  removeQuickReply: (id: string) => void;
  
  // Snooze
  snoozedChats: Record<string, number>; // chatId -> timestamp até quando
  snoozeChat: (chatId: string, until: number) => void;
  unsnoozeChat: (chatId: string) => void;
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      // Tags
      tags: [
        { id: '1', name: 'VIP', color: '#fbbf24' },
        { id: '2', name: 'Urgente', color: '#ef4444' },
        { id: '3', name: 'Aguardando', color: '#3b82f6' },
        { id: '4', name: 'Resolvido', color: '#22c55e' },
      ],
      chatTags: {},
      addTag: (tag) => set((s) => ({ tags: [...s.tags, tag] })),
      removeTag: (tagId) => set((s) => ({ tags: s.tags.filter((t) => t.id !== tagId) })),
      assignTagToChat: (chatId, tagId) => set((s) => ({
        chatTags: {
          ...s.chatTags,
          [chatId]: [...(s.chatTags[chatId] || []), tagId].filter((v, i, a) => a.indexOf(v) === i),
        },
      })),
      removeTagFromChat: (chatId, tagId) => set((s) => ({
        chatTags: {
          ...s.chatTags,
          [chatId]: (s.chatTags[chatId] || []).filter((t) => t !== tagId),
        },
      })),
      
      // Notas
      notes: {},
      saveNote: (chatId, content) => set((s) => ({
        notes: {
          ...s.notes,
          [chatId]: {
            id: chatId,
            chatId,
            content,
            createdAt: s.notes[chatId]?.createdAt || Date.now(),
            updatedAt: Date.now(),
          },
        },
      })),
      
      // Respostas Rápidas
      quickReplies: [
        { id: '1', shortcut: '/oi', title: 'Saudação', content: 'Olá! Como posso ajudar?' },
        { id: '2', shortcut: '/pix', title: 'Dados PIX', content: 'Segue nossa chave PIX: ...' },
        { id: '3', shortcut: '/entrega', title: 'Prazo Entrega', content: 'O prazo de entrega é de 3 a 7 dias úteis.' },
      ],
      addQuickReply: (reply) => set((s) => ({ quickReplies: [...s.quickReplies, reply] })),
      updateQuickReply: (id, reply) => set((s) => ({
        quickReplies: s.quickReplies.map((r) => (r.id === id ? { ...r, ...reply } : r)),
      })),
      removeQuickReply: (id) => set((s) => ({
        quickReplies: s.quickReplies.filter((r) => r.id !== id),
      })),
      
      // Snooze
      snoozedChats: {},
      snoozeChat: (chatId, until) => set((s) => ({
        snoozedChats: { ...s.snoozedChats, [chatId]: until },
      })),
      unsnoozeChat: (chatId) => set((s) => {
        const { [chatId]: _, ...rest } = s.snoozedChats;
        return { snoozedChats: rest };
      }),
    }),
    {
      name: 'crm-atendimento-data',
    }
  )
);

// Store de Conexão
export type ConnectionStatus = {
  status: 'disconnected' | 'connecting' | 'qr_pending' | 'connected' | 'error';
};

interface ConnectionState {
  status: ConnectionStatus['status'];
  qrCode: string | null;
  user: { id: string; name: string } | null;
  error: string | null;
  
  setStatus: (status: ConnectionState['status']) => void;
  setQRCode: (qr: string | null) => void;
  setUser: (user: ConnectionState['user']) => void;
  setError: (error: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'disconnected',
  qrCode: null,
  user: null,
  error: null,
  
  setStatus: (status) => set({ status }),
  setQRCode: (qrCode) => set({ qrCode }),
  setUser: (user) => set({ user }),
  setError: (error) => set({ error }),
}));

// Store de Chats (dados reais do WhatsApp)
interface ChatsState {
  chats: Chat[];
  messages: Record<string, Message[]>; // chatId -> messages
  isLoading: boolean;
  
  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessageStatus: (chatId: string, messageId: string, status: Message['status']) => void;
  
  setLoading: (loading: boolean) => void;
}

export const useChatsStore = create<ChatsState>((set) => ({
  chats: [],
  messages: {},
  isLoading: false,
  
  setChats: (chats) => set({ chats }),
  
  addChat: (chat) => set((state) => {
    const exists = state.chats.find((c) => c.id === chat.id);
    if (exists) {
      return {
        chats: state.chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)),
      };
    }
    return { chats: [chat, ...state.chats] };
  }),
  
  updateChat: (chatId, updates) => set((state) => ({
    chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...updates } : c)),
  })),
  
  setMessages: (chatId, messages) => set((state) => ({
    messages: { ...state.messages, [chatId]: messages },
  })),
  
  addMessage: (chatId, message) => set((state) => {
    const existing = state.messages[chatId] || [];
    // Evitar duplicatas
    if (existing.find((m) => m.id === message.id)) {
      return state;
    }
    return {
      messages: {
        ...state.messages,
        [chatId]: [...existing, message].sort((a, b) => a.timestamp - b.timestamp),
      },
    };
  }),
  
  updateMessageStatus: (chatId, messageId, status) => set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: (state.messages[chatId] || []).map((m) =>
        m.id === messageId ? { ...m, status } : m
      ),
    },
  })),
  
  setLoading: (isLoading) => set({ isLoading }),
}));
