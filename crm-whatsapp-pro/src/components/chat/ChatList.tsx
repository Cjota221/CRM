/**
 * ChatList - Lista de conversas estilo WhatsApp
 */

'use client';

import { useState, useMemo } from 'react';
import { Search, Filter, MoreVertical, MessageSquarePlus } from 'lucide-react';
import { cn, formatRelativeDate, getInitials, stringToColor, truncate } from '@/lib/utils';
import { useUIStore, useDataStore, useChatsStore, type Chat, type ChatFilter } from '@/store';

// Dados mock para demonstração (quando não há dados reais)
const MOCK_CHATS: Chat[] = [
  {
    id: '5511999999999@s.whatsapp.net',
    name: 'João Silva',
    phone: '11999999999',
    lastMessage: 'Olá, gostaria de saber sobre o produto',
    lastMessageTime: Date.now() / 1000 - 300,
    unreadCount: 3,
    isGroup: false,
    isOnline: true,
  },
  {
    id: '5511988888888@s.whatsapp.net',
    name: 'Maria Santos',
    phone: '11988888888',
    lastMessage: 'Obrigada pelo atendimento!',
    lastMessageTime: Date.now() / 1000 - 3600,
    unreadCount: 0,
    isGroup: false,
  },
  {
    id: '5511977777777@s.whatsapp.net',
    name: 'Pedro Costa',
    phone: '11977777777',
    lastMessage: 'Qual o prazo de entrega?',
    lastMessageTime: Date.now() / 1000 - 7200,
    unreadCount: 1,
    isGroup: false,
    typing: true,
  },
  {
    id: 'group1@g.us',
    name: 'Equipe Vendas',
    lastMessage: 'Reunião às 15h',
    lastMessageTime: Date.now() / 1000 - 86400,
    unreadCount: 5,
    isGroup: true,
  },
];

const FILTERS: { id: ChatFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'unread', label: 'Não lidos' },
  { id: 'waiting', label: 'Aguardando' },
  { id: 'groups', label: 'Grupos' },
];

export function ChatList() {
  const { selectedChatId, selectChat, activeFilter, setActiveFilter, searchQuery, setSearchQuery } = useUIStore();
  const { tags, chatTags } = useDataStore();
  const { chats: realChats, isLoading } = useChatsStore();
  
  // Usar dados reais se disponíveis, senão usar mocks
  const chats = useMemo(() => {
    return realChats.length > 0 ? realChats : MOCK_CHATS;
  }, [realChats]);

  // Filtrar chats
  const filteredChats = chats.filter((chat) => {
    // Filtro de busca
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!chat.name.toLowerCase().includes(query) && !chat.phone?.includes(query)) {
        return false;
      }
    }

    // Filtro de tipo
    switch (activeFilter) {
      case 'unread':
        return chat.unreadCount > 0;
      case 'groups':
        return chat.isGroup;
      case 'waiting':
        return !chat.isGroup && chat.unreadCount > 0; // Simplificado
      default:
        return true;
    }
  });

  // Contadores
  const counts: Record<ChatFilter, number> = {
    all: chats.length,
    unread: chats.filter((c) => c.unreadCount > 0).length,
    waiting: chats.filter((c) => !c.isGroup && c.unreadCount > 0).length,
    groups: chats.filter((c) => c.isGroup).length,
    tagged: 0, // TODO: implementar contagem de chats com tags
    snoozed: 0, // TODO: implementar contagem de chats em snooze
  };

  return (
    <div className="flex flex-col h-full bg-wa-bg-panel border-r border-wa-border w-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-wa-bg-panel">
        <h1 className="text-xl font-semibold text-wa-text-primary">Conversas</h1>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-full hover:bg-wa-bg-hover text-wa-text-secondary">
            <MessageSquarePlus className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-wa-bg-hover text-wa-text-secondary">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Busca */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-3 bg-wa-bg-input rounded-lg px-4 py-2">
          <Search className="w-5 h-5 text-wa-text-secondary" />
          <input
            type="text"
            placeholder="Pesquisar ou começar uma nova conversa"
            className="flex-1 bg-transparent text-wa-text-primary placeholder:text-wa-text-secondary text-sm outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-wa-text-secondary hover:text-wa-text-primary"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 px-3 py-2 overflow-x-auto scrollbar-hide">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              activeFilter === filter.id
                ? 'bg-wa-accent-green text-white'
                : 'bg-wa-bg-input text-wa-text-secondary hover:bg-wa-bg-hover'
            )}
          >
            {filter.label}
            {counts[filter.id] > 0 && (
              <span className="ml-1.5 text-xs">({counts[filter.id]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista de Chats */}
      <div className="flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-wa-text-secondary">
            <Search className="w-12 h-12 mb-4 opacity-50" />
            <p>Nenhuma conversa encontrada</p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              isSelected={selectedChatId === chat.id}
              onClick={() => selectChat(chat.id)}
              tags={tags.filter((t) => chatTags[chat.id]?.includes(t.id))}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Item da lista
interface ChatListItemProps {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
  tags: { id: string; name: string; color: string }[];
}

function ChatListItem({ chat, isSelected, onClick, tags }: ChatListItemProps) {
  const avatarColor = stringToColor(chat.name);

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-wa-border/50',
        isSelected ? 'bg-wa-bg-hover' : 'hover:bg-wa-bg-hover/50'
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold"
          style={{ backgroundColor: avatarColor }}
        >
          {chat.avatar ? (
            <img src={chat.avatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            getInitials(chat.name)
          )}
        </div>
        {/* Indicador online */}
        {chat.isOnline && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-wa-bg-panel" />
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="font-medium text-wa-text-primary truncate">{chat.name}</span>
          <span
            className={cn(
              'text-xs',
              chat.unreadCount > 0 ? 'text-wa-accent-green' : 'text-wa-text-secondary'
            )}
          >
            {chat.lastMessageTime && formatRelativeDate(chat.lastMessageTime)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {/* Ícone de grupo */}
            {chat.isGroup && <span className="text-wa-text-secondary">👥</span>}
            
            {/* Preview da mensagem ou digitando */}
            {chat.typing ? (
              <span className="text-wa-accent-green text-sm italic">digitando...</span>
            ) : (
              <span className="text-wa-text-secondary text-sm truncate">
                {truncate(chat.lastMessage || '', 35)}
              </span>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 ml-2">
            {/* Tags */}
            {tags.slice(0, 2).map((tag) => (
              <div
                key={tag.id}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: tag.color }}
                title={tag.name}
              />
            ))}
            
            {/* Contador não lidos */}
            {chat.unreadCount > 0 && (
              <div className="bg-wa-accent-green text-white text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
