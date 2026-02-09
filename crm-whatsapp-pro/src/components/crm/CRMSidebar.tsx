/**
 * CRM Sidebar - Painel lateral com superpoderes
 */

'use client';

import { useState } from 'react';
import {
  X,
  User,
  Tag,
  FileText,
  Clock,
  Zap,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit2,
  Trash2,
  Bell,
  BellOff,
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  Calendar,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, useDataStore, type Tag as TagType } from '@/store';

type TabId = 'contact' | 'tags' | 'notes' | 'schedule' | 'quick';

const TABS: { id: TabId; icon: React.ComponentType<any>; label: string }[] = [
  { id: 'contact', icon: User, label: 'Contato' },
  { id: 'tags', icon: Tag, label: 'Tags' },
  { id: 'notes', icon: FileText, label: 'Notas' },
  { id: 'schedule', icon: Clock, label: 'Agendar' },
  { id: 'quick', icon: Zap, label: 'Rápidas' },
];

export function CRMSidebar() {
  const { isCRMSidebarOpen, toggleCRMSidebar, selectedChatId } = useUIStore();
  const [activeTab, setActiveTab] = useState<TabId>('contact');

  if (!selectedChatId) return null;

  return (
    <>
      {/* Toggle Button (quando fechado) */}
      {!isCRMSidebarOpen && (
        <button
          onClick={toggleCRMSidebar}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-wa-accent-green text-white p-2 rounded-l-lg shadow-lg z-20 hover:bg-wa-accent-green/90"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed right-0 top-0 h-full w-[380px] bg-wa-bg-panel border-l border-wa-border z-10',
          'transform transition-transform duration-300 ease-out',
          isCRMSidebarOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-wa-bg border-b border-wa-border">
          <h2 className="text-lg font-semibold text-wa-text-primary">Painel CRM</h2>
          <button
            onClick={toggleCRMSidebar}
            className="p-2 rounded-full hover:bg-wa-bg-hover text-wa-text-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-wa-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex flex-col items-center py-3 text-xs transition-colors',
                activeTab === tab.id
                  ? 'text-wa-accent-green border-b-2 border-wa-accent-green bg-wa-bg-hover/30'
                  : 'text-wa-text-secondary hover:bg-wa-bg-hover'
              )}
            >
              <tab.icon className="w-5 h-5 mb-1" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="h-[calc(100%-120px)] overflow-y-auto">
          {activeTab === 'contact' && <ContactTab />}
          {activeTab === 'tags' && <TagsTab />}
          {activeTab === 'notes' && <NotesTab />}
          {activeTab === 'schedule' && <ScheduleTab />}
          {activeTab === 'quick' && <QuickRepliesTab />}
        </div>
      </aside>
    </>
  );
}

// Tab: Informações do Contato
function ContactTab() {
  const { selectedChatId } = useUIStore();

  // Mock data - substituir por dados reais
  const contact = {
    name: 'João Silva',
    phone: '11999999999',
    email: 'joao@email.com',
    address: 'São Paulo, SP',
    totalOrders: 5,
    totalSpent: 1250.0,
    lastOrder: '2024-01-10',
    tags: ['VIP', 'Frequente'],
  };

  return (
    <div className="p-4 space-y-4">
      {/* Avatar e Nome */}
      <div className="flex flex-col items-center py-4">
        <div className="w-24 h-24 rounded-full bg-wa-accent-green flex items-center justify-center text-white text-3xl font-semibold mb-3">
          JS
        </div>
        <h3 className="text-xl font-semibold text-wa-text-primary">{contact.name}</h3>
        <p className="text-wa-text-secondary text-sm">Cliente desde Jan 2023</p>
      </div>

      {/* Ações Rápidas */}
      <div className="flex justify-center gap-4">
        <button className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-wa-bg-hover">
          <div className="p-2 rounded-full bg-wa-accent-green/20">
            <Phone className="w-5 h-5 text-wa-accent-green" />
          </div>
          <span className="text-xs text-wa-text-secondary">Ligar</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-wa-bg-hover">
          <div className="p-2 rounded-full bg-wa-accent-blue/20">
            <Mail className="w-5 h-5 text-wa-accent-blue" />
          </div>
          <span className="text-xs text-wa-text-secondary">Email</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-wa-bg-hover">
          <div className="p-2 rounded-full bg-purple-500/20">
            <BellOff className="w-5 h-5 text-purple-500" />
          </div>
          <span className="text-xs text-wa-text-secondary">Silenciar</span>
        </button>
      </div>

      {/* Informações */}
      <div className="space-y-3 bg-wa-bg rounded-lg p-4">
        <h4 className="text-sm font-medium text-wa-text-secondary uppercase tracking-wide">
          Informações
        </h4>
        <InfoRow icon={Phone} label="Telefone" value={`+55 ${contact.phone}`} />
        <InfoRow icon={Mail} label="Email" value={contact.email} />
        <InfoRow icon={MapPin} label="Cidade" value={contact.address} />
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Pedidos" value={contact.totalOrders.toString()} icon={ShoppingBag} />
        <StatCard
          label="Total Gasto"
          value={`R$ ${contact.totalSpent.toFixed(2)}`}
          icon={ShoppingBag}
        />
      </div>

      {/* Último Pedido */}
      <div className="bg-wa-bg rounded-lg p-4">
        <h4 className="text-sm font-medium text-wa-text-secondary uppercase tracking-wide mb-2">
          Último Pedido
        </h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-wa-text-primary font-medium">#12345</p>
            <p className="text-wa-text-secondary text-sm">{contact.lastOrder}</p>
          </div>
          <span className="px-2 py-1 bg-green-500/20 text-green-500 rounded text-xs font-medium">
            Entregue
          </span>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-wa-text-secondary" />
      <div>
        <p className="text-xs text-wa-text-secondary">{label}</p>
        <p className="text-sm text-wa-text-primary">{value}</p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<any>;
}) {
  return (
    <div className="bg-wa-bg rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-wa-text-secondary" />
        <span className="text-xs text-wa-text-secondary">{label}</span>
      </div>
      <p className="text-lg font-semibold text-wa-text-primary">{value}</p>
    </div>
  );
}

// Tab: Tags
function TagsTab() {
  const { selectedChatId } = useUIStore();
  const { tags, chatTags, assignTagToChat, removeTagFromChat, addTag } = useDataStore();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#00a884');

  const chatTagIds = chatTags[selectedChatId!] || [];

  const handleAddTag = () => {
    if (!newTagName.trim()) return;
    const newTag = {
      id: Date.now().toString(),
      name: newTagName.trim(),
      color: newTagColor,
    };
    addTag(newTag);
    setNewTagName('');
  };

  const toggleTag = (tagId: string) => {
    if (chatTagIds.includes(tagId)) {
      removeTagFromChat(selectedChatId!, tagId);
    } else {
      assignTagToChat(selectedChatId!, tagId);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Tags atribuídas */}
      <div>
        <h4 className="text-sm font-medium text-wa-text-secondary mb-3">Tags deste contato</h4>
        <div className="flex flex-wrap gap-2">
          {chatTagIds.length === 0 ? (
            <p className="text-wa-text-secondary text-sm">Nenhuma tag atribuída</p>
          ) : (
            chatTagIds.map((tagId) => {
              const tag = tags.find((t) => t.id === tagId);
              if (!tag) return null;
              return (
                <span
                  key={tag.id}
                  className="px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2"
                  style={{ backgroundColor: tag.color + '30', color: tag.color }}
                >
                  {tag.name}
                  <button onClick={() => toggleTag(tag.id)} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })
          )}
        </div>
      </div>

      {/* Todas as tags */}
      <div>
        <h4 className="text-sm font-medium text-wa-text-secondary mb-3">Todas as tags</h4>
        <div className="space-y-2">
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors',
                chatTagIds.includes(tag.id)
                  ? 'bg-wa-accent-green/20 border border-wa-accent-green'
                  : 'bg-wa-bg hover:bg-wa-bg-hover'
              )}
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="text-wa-text-primary">{tag.name}</span>
              </div>
              {chatTagIds.includes(tag.id) && (
                <span className="text-wa-accent-green text-xs">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Criar nova tag */}
      <div className="border-t border-wa-border pt-4">
        <h4 className="text-sm font-medium text-wa-text-secondary mb-3">Criar nova tag</h4>
        <div className="flex gap-2">
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Nome da tag"
            className="flex-1 px-3 py-2 bg-wa-bg-input rounded-lg text-wa-text-primary placeholder:text-wa-text-secondary outline-none"
          />
          <button
            onClick={handleAddTag}
            className="px-4 py-2 bg-wa-accent-green text-white rounded-lg hover:bg-wa-accent-green/90"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Tab: Notas
function NotesTab() {
  const { selectedChatId } = useUIStore();
  const { notes, saveNote } = useDataStore();
  const [noteText, setNoteText] = useState(notes[selectedChatId!]?.content || '');

  const handleSave = () => {
    saveNote(selectedChatId!, noteText);
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h4 className="text-sm font-medium text-wa-text-secondary mb-3">Notas do contato</h4>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Adicione notas sobre este contato..."
          className="w-full h-48 px-3 py-2 bg-wa-bg-input rounded-lg text-wa-text-primary placeholder:text-wa-text-secondary outline-none resize-none"
        />
      </div>

      <button
        onClick={handleSave}
        className="w-full py-2.5 bg-wa-accent-green text-white rounded-lg hover:bg-wa-accent-green/90 font-medium"
      >
        Salvar Notas
      </button>

      {notes[selectedChatId!] && (
        <p className="text-xs text-wa-text-secondary text-center">
          Última atualização:{' '}
          {new Date(notes[selectedChatId!].updatedAt).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  );
}

// Tab: Agendamento
function ScheduleTab() {
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');

  const handleSchedule = () => {
    if (!scheduleDate || !scheduleTime || !scheduleMessage) return;
    console.log('Agendando:', { scheduleDate, scheduleTime, scheduleMessage });
    // Limpar
    setScheduleDate('');
    setScheduleTime('');
    setScheduleMessage('');
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h4 className="text-sm font-medium text-wa-text-secondary mb-3">Agendar mensagem</h4>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-wa-text-secondary mb-1 block">Data</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full px-3 py-2 bg-wa-bg-input rounded-lg text-wa-text-primary outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-wa-text-secondary mb-1 block">Hora</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full px-3 py-2 bg-wa-bg-input rounded-lg text-wa-text-primary outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-wa-text-secondary mb-1 block">Mensagem</label>
            <textarea
              value={scheduleMessage}
              onChange={(e) => setScheduleMessage(e.target.value)}
              placeholder="Digite a mensagem a ser enviada..."
              className="w-full h-32 px-3 py-2 bg-wa-bg-input rounded-lg text-wa-text-primary placeholder:text-wa-text-secondary outline-none resize-none"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleSchedule}
        className="w-full py-2.5 bg-wa-accent-green text-white rounded-lg hover:bg-wa-accent-green/90 font-medium flex items-center justify-center gap-2"
      >
        <Clock className="w-5 h-5" />
        Agendar Envio
      </button>

      {/* Lista de agendamentos (mock) */}
      <div className="border-t border-wa-border pt-4">
        <h4 className="text-sm font-medium text-wa-text-secondary mb-3">Agendamentos</h4>
        <div className="text-center text-wa-text-secondary text-sm py-4">
          Nenhum agendamento pendente
        </div>
      </div>
    </div>
  );
}

// Tab: Respostas Rápidas
function QuickRepliesTab() {
  const { quickReplies, addQuickReply, removeQuickReply } = useDataStore();
  const [newShortcut, setNewShortcut] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    if (!newShortcut || !newContent) return;
    addQuickReply({
      id: Date.now().toString(),
      shortcut: newShortcut.startsWith('/') ? newShortcut : '/' + newShortcut,
      title: newTitle || newShortcut,
      content: newContent,
    });
    setNewShortcut('');
    setNewTitle('');
    setNewContent('');
    setIsAdding(false);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-wa-text-secondary">Respostas Rápidas</h4>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-3 py-1.5 bg-wa-accent-green text-white rounded-lg text-sm hover:bg-wa-accent-green/90 flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Nova
        </button>
      </div>

      {/* Formulário de nova resposta */}
      {isAdding && (
        <div className="bg-wa-bg rounded-lg p-3 space-y-2">
          <input
            type="text"
            value={newShortcut}
            onChange={(e) => setNewShortcut(e.target.value)}
            placeholder="Atalho (ex: /oi)"
            className="w-full px-3 py-2 bg-wa-bg-input rounded-lg text-wa-text-primary placeholder:text-wa-text-secondary outline-none text-sm"
          />
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="w-full px-3 py-2 bg-wa-bg-input rounded-lg text-wa-text-primary placeholder:text-wa-text-secondary outline-none text-sm"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Conteúdo da mensagem..."
            className="w-full h-24 px-3 py-2 bg-wa-bg-input rounded-lg text-wa-text-primary placeholder:text-wa-text-secondary outline-none resize-none text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setIsAdding(false)}
              className="flex-1 py-2 bg-wa-bg-hover text-wa-text-secondary rounded-lg text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              className="flex-1 py-2 bg-wa-accent-green text-white rounded-lg text-sm"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Lista de respostas */}
      <div className="space-y-2">
        {quickReplies.map((reply) => (
          <div
            key={reply.id}
            className="bg-wa-bg rounded-lg p-3 hover:bg-wa-bg-hover transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-wa-accent-green font-mono text-sm">{reply.shortcut}</span>
              <div className="flex items-center gap-1">
                <button className="p-1 hover:bg-wa-bg-input rounded">
                  <Edit2 className="w-3.5 h-3.5 text-wa-text-secondary" />
                </button>
                <button
                  onClick={() => removeQuickReply(reply.id)}
                  className="p-1 hover:bg-wa-bg-input rounded"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            </div>
            <p className="text-wa-text-secondary text-xs mb-1">{reply.title}</p>
            <p className="text-wa-text-primary text-sm line-clamp-2">{reply.content}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-wa-text-secondary text-center">
        Digite o atalho no chat para usar a resposta rápida
      </p>
    </div>
  );
}
