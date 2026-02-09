/**
 * Página Principal - Central de Atendimento
 */

'use client';

import { ChatList } from '@/components/chat/ChatList';
import { ChatArea } from '@/components/chat/ChatArea';
import { CRMSidebar } from '@/components/crm/CRMSidebar';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useUIStore } from '@/store';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const { isCRMSidebarOpen } = useUIStore();

  return (
    <div className="h-screen flex flex-col bg-wa-bg overflow-hidden">
      {/* Barra de Status de Conexão */}
      <ConnectionStatus />

      {/* Layout Principal */}
      <div className="flex-1 flex overflow-hidden">
        {/* Área do WhatsApp */}
        <div
          className={cn(
            'flex flex-1 transition-all duration-300',
            isCRMSidebarOpen ? 'mr-[380px]' : 'mr-0'
          )}
        >
          {/* Lista de Chats */}
          <ChatList />

          {/* Área de Conversa */}
          <ChatArea />
        </div>

        {/* Sidebar CRM */}
        <CRMSidebar />
      </div>
    </div>
  );
}
