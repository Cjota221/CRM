'use client';

import { ChatList } from '@/components/chat/ChatList';
import { ChatArea } from '@/components/chat/ChatArea';
import { CRMSidebar } from '@/components/crm/CRMSidebar';
import { ConnectionStatus } from '@/components/ConnectionStatus';

/**
 * Página de Atendimento — Layout WhatsApp clone
 * Ocupa a tela inteira (sem sidebar principal do CRM)
 */
export default function AtendimentoPage() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Status de conexão */}
      <ConnectionStatus />

      {/* Lista de chats */}
      <ChatList />

      {/* Área de conversa */}
      <ChatArea />

      {/* Sidebar CRM */}
      <CRMSidebar />
    </div>
  );
}
