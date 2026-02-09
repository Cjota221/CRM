# 🎯 Plano Mestre: CRM WhatsApp Profissional

## Diagnóstico Atual

### ❌ Problemas Identificados
1. **Interface HTML/Tailwind pura** → Difícil manutenção e estado fragmentado
2. **CSS manual de balões** → Inconsistente com WhatsApp real
3. **Evolution API via Docker** → Problemas de sessão e reconexão
4. **Arquitetura monolítica** → `atendimentos.js` com 4000+ linhas
5. **Estado em LocalStorage** → Sem sync real-time entre abas

---

## 🏗️ ARQUITETURA PROPOSTA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Next.js 14)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────────┐   │
│  │   WhatsApp   │  │   CRM        │  │      Overlay de Superpoderes     │   │
│  │   Clone UI   │  │   Sidebar    │  │  (Tags, Notas, Agendamento, IA)  │   │
│  │  (Pixel      │  │   Retrátil   │  │                                  │   │
│  │  Perfect)    │  │   (Direita)  │  │   Componentes Modulares:         │   │
│  │              │  │              │  │   • <TagManager />               │   │
│  │  • ChatList  │  │  • Cliente   │  │   • <NotesPanel />               │   │
│  │  • ChatArea  │  │  • Pedidos   │  │   • <ScheduleModal />            │   │
│  │  • Messages  │  │  • Produtos  │  │   • <QuickReplies />             │   │
│  │  • Input     │  │  • Histórico │  │   • <AIAssistant />              │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                      ESTADO GLOBAL (Zustand + React Query)                   │
│  • Chats, Messages, Contacts → React Query (server state)                   │
│  • UI State, Filters, Selection → Zustand (client state)                    │
│  • WebSocket para real-time updates                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js/Next.js API)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │  WhatsApp Engine │  │   CRM Service    │  │  Webhook Handler │           │
│  │  (Baileys Direct)│  │  (FacilZap Sync) │  │  (Eventos)       │           │
│  │                  │  │                  │  │                  │           │
│  │  • Session Mgmt  │  │  • Clientes      │  │  • Pedidos       │           │
│  │  • Auto-Reconnect│  │  • Pedidos       │  │  • Carrinhos     │           │
│  │  • Message Queue │  │  • Produtos      │  │  • Pagamentos    │           │
│  │  • Media Handler │  │  • Merge Logic   │  │                  │           │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘           │
├─────────────────────────────────────────────────────────────────────────────┤
│                            BANCO DE DADOS                                    │
│  Supabase (PostgreSQL) - Já configurado no seu projeto                      │
│  • Mensagens sincronizadas                                                   │
│  • Clientes enriquecidos                                                     │
│  • Histórico de interações                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 PARTE 1: CLONE VISUAL DO WHATSAPP

### Opção A: Usar Template Open Source (RECOMENDADO)

**Biblioteca escolhida: `@nickvrsn/react-whatsapp-chat-ui`** ou fork customizado

```bash
# Estrutura de componentes prontos
npm install @nickvrsn/react-whatsapp-chat-ui
```

**OU criar do zero usando estes recursos:**

| Recurso | URL | Descrição |
|---------|-----|-----------|
| **Layout Base** | github.com/nickvrsn/whatsapp-web-clone | React + TypeScript completo |
| **Componentes UI** | github.com/nickvrsn/chat-ui-kit-react | Balões, inputs, avatares |
| **Ícones Exatos** | phosphoricons.com | Ícones idênticos ao WhatsApp |
| **Cores Oficiais** | Extrair do WhatsApp Web | Ver tabela abaixo |

### Paleta de Cores do WhatsApp Web (2024)

```css
:root {
  /* Backgrounds */
  --wa-bg-default: #111b21;        /* Fundo principal (dark) */
  --wa-bg-panel: #202c33;          /* Painéis laterais */
  --wa-bg-conversation: #0b141a;   /* Área de conversa */
  --wa-bg-lighter: #233138;        /* Inputs */
  
  /* Balões de mensagem */
  --wa-bubble-incoming: #202c33;   /* Mensagem recebida */
  --wa-bubble-outgoing: #005c4b;   /* Mensagem enviada (verde) */
  
  /* Textos */
  --wa-text-primary: #e9edef;
  --wa-text-secondary: #8696a0;
  --wa-text-bubble: #ffffff;
  
  /* Acentos */
  --wa-accent-green: #00a884;      /* Verde principal */
  --wa-accent-blue: #53bdeb;       /* Links, ticks azuis */
  
  /* Borders */
  --wa-border-default: #222d34;
  --wa-border-stronger: #3b4a54;
}
```

### Componentes Essenciais a Criar/Usar

```
src/
├── components/
│   ├── whatsapp/                    # Clone visual
│   │   ├── ChatList/
│   │   │   ├── ChatListItem.tsx     # Item da lista com preview
│   │   │   ├── ChatListHeader.tsx   # Search + filtros
│   │   │   └── index.tsx
│   │   ├── ChatArea/
│   │   │   ├── MessageBubble.tsx    # Balões com ticks
│   │   │   ├── MessageList.tsx      # Scroll infinito
│   │   │   ├── ChatHeader.tsx       # Nome + ações
│   │   │   └── index.tsx
│   │   ├── InputArea/
│   │   │   ├── TextInput.tsx
│   │   │   ├── EmojiPicker.tsx
│   │   │   ├── AttachMenu.tsx
│   │   │   └── VoiceRecorder.tsx
│   │   └── shared/
│   │       ├── Avatar.tsx
│   │       ├── Ticks.tsx            # ✓✓ azuis
│   │       └── Timestamp.tsx
│   │
│   └── crm/                         # Superpoderes
│       ├── CRMSidebar/
│       │   ├── ClientInfo.tsx
│       │   ├── OrderHistory.tsx
│       │   ├── ProductCards.tsx
│       │   └── index.tsx
│       ├── overlays/
│       │   ├── TagManager.tsx
│       │   ├── NotesPanel.tsx
│       │   ├── ScheduleModal.tsx
│       │   ├── QuickReplies.tsx
│       │   └── AIAssistant.tsx
│       └── toolbar/
│           └── ChatToolbar.tsx      # Botões extras
```

---

## 📦 PARTE 2: SIDEBAR CRM RETRÁTIL

### Arquitetura de Overlay

```tsx
// src/components/layout/MainLayout.tsx
export function MainLayout() {
  const [isCRMOpen, setCRMOpen] = useState(true);
  const selectedChat = useSelectedChat();
  
  return (
    <div className="flex h-screen">
      {/* WhatsApp Clone - Área Principal */}
      <div className={cn(
        "flex flex-1 transition-all duration-300",
        isCRMOpen ? "mr-[380px]" : "mr-0"
      )}>
        <ChatList className="w-[400px]" />
        <ChatArea className="flex-1" />
      </div>
      
      {/* CRM Sidebar - Overlay Direito */}
      <CRMSidebar 
        isOpen={isCRMOpen}
        onToggle={() => setCRMOpen(!isCRMOpen)}
        chatId={selectedChat?.id}
      />
      
      {/* Toolbar Flutuante no Chat */}
      {selectedChat && (
        <ChatToolbar chatId={selectedChat.id} />
      )}
    </div>
  );
}
```

### CRM Sidebar com Abas

```tsx
// src/components/crm/CRMSidebar/index.tsx
const CRM_TABS = [
  { id: 'profile', icon: User, label: 'Cliente' },
  { id: 'orders', icon: ShoppingBag, label: 'Pedidos' },
  { id: 'products', icon: Package, label: 'Produtos' },
  { id: 'notes', icon: FileText, label: 'Notas' },
  { id: 'ai', icon: Sparkles, label: 'IA' },
];

export function CRMSidebar({ isOpen, chatId, onToggle }) {
  const [activeTab, setActiveTab] = useState('profile');
  const client = useClientByChat(chatId); // Hook que faz match automático
  
  return (
    <aside className={cn(
      "fixed right-0 top-0 h-full w-[380px] bg-wa-panel border-l border-wa-border",
      "transform transition-transform duration-300",
      isOpen ? "translate-x-0" : "translate-x-full"
    )}>
      {/* Toggle Button */}
      <button 
        onClick={onToggle}
        className="absolute -left-10 top-1/2 bg-wa-accent-green rounded-l-lg p-2"
      >
        {isOpen ? <ChevronRight /> : <ChevronLeft />}
      </button>
      
      {/* Tabs */}
      <div className="flex border-b border-wa-border">
        {CRM_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 py-3 text-sm",
              activeTab === tab.id 
                ? "text-wa-accent-green border-b-2 border-wa-accent-green"
                : "text-wa-text-secondary"
            )}
          >
            <tab.icon className="w-4 h-4 mx-auto mb-1" />
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Content */}
      <div className="overflow-y-auto h-[calc(100%-60px)]">
        {activeTab === 'profile' && <ClientProfile client={client} />}
        {activeTab === 'orders' && <OrderHistory clientId={client?.id} />}
        {activeTab === 'products' && <ProductRecommendations chatId={chatId} />}
        {activeTab === 'notes' && <NotesPanel chatId={chatId} />}
        {activeTab === 'ai' && <AIAssistant chatId={chatId} />}
      </div>
    </aside>
  );
}
```

---

## 📦 PARTE 3: MOTOR DE CONEXÃO ESTÁVEL

### Problema com Evolution API + Docker

A Evolution API em container tem problemas de:
1. **Perda de sessão** quando o container reinicia
2. **Timeout de conexão** com WebSocket
3. **Delay na reconexão** automática

### Solução: Baileys Direto no Backend Next.js

```typescript
// src/lib/whatsapp/engine.ts
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';

const logger = pino({ level: 'silent' });

class WhatsAppEngine {
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 3000;
  private isConnecting = false;
  
  // Event handlers
  private handlers: Map<string, Function[]> = new Map();
  
  async connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    
    try {
      // Auth state persistido em arquivo (sobrevive a restarts)
      const { state, saveCreds } = await useMultiFileAuthState('./auth_session');
      
      // Buscar versão mais recente do WhatsApp
      const { version } = await fetchLatestBaileysVersion();
      
      this.socket = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: true,
        
        // CRÍTICO: Configurações de reconexão
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000, // Ping a cada 25s
        retryRequestDelayMs: 500,
        
        // Marcar como online
        markOnlineOnConnect: true,
        
        // Sincronização de histórico
        syncFullHistory: false, // true = baixa todo histórico (lento)
      });
      
      this.setupEventHandlers(saveCreds);
      
    } catch (error) {
      console.error('[WhatsApp] Erro ao conectar:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }
  
  private setupEventHandlers(saveCreds: () => Promise<void>) {
    if (!this.socket) return;
    
    // Salvar credenciais quando atualizar
    this.socket.ev.on('creds.update', saveCreds);
    
    // Handler de conexão
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        this.emit('qr', qr);
      }
      
      if (connection === 'open') {
        console.log('[WhatsApp] ✅ Conectado!');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.emit('connected');
      }
      
      if (connection === 'close') {
        this.isConnecting = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = DisconnectReason[statusCode] || 'unknown';
        
        console.log(`[WhatsApp] ❌ Desconectado: ${reason} (${statusCode})`);
        
        // Reconectar automaticamente (exceto se logout manual)
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          this.emit('disconnected', { reason, willReconnect: true });
          this.scheduleReconnect();
        } else {
          this.emit('logged_out');
        }
      }
    });
    
    // Mensagens recebidas
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      
      for (const msg of messages) {
        if (!msg.message) continue;
        this.emit('message', this.formatMessage(msg));
      }
    });
    
    // Status de mensagens (ticks)
    this.socket.ev.on('messages.update', (updates) => {
      for (const update of updates) {
        this.emit('message_status', {
          id: update.key.id,
          status: update.update.status, // 1=pending, 2=sent, 3=delivered, 4=read
        });
      }
    });
    
    // Chats atualizados
    this.socket.ev.on('chats.update', (chats) => {
      this.emit('chats_update', chats);
    });
    
    // Contatos
    this.socket.ev.on('contacts.update', (contacts) => {
      this.emit('contacts_update', contacts);
    });
  }
  
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WhatsApp] Máximo de tentativas atingido');
      this.emit('reconnect_failed');
      return;
    }
    
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
    this.reconnectAttempts++;
    
    console.log(`[WhatsApp] Reconectando em ${delay}ms (tentativa ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  // Enviar mensagem de texto
  async sendText(jid: string, text: string) {
    if (!this.socket) throw new Error('Não conectado');
    return this.socket.sendMessage(jid, { text });
  }
  
  // Enviar imagem
  async sendImage(jid: string, buffer: Buffer, caption?: string) {
    if (!this.socket) throw new Error('Não conectado');
    return this.socket.sendMessage(jid, { 
      image: buffer, 
      caption 
    });
  }
  
  // Enviar áudio (voice note)
  async sendAudio(jid: string, buffer: Buffer) {
    if (!this.socket) throw new Error('Não conectado');
    return this.socket.sendMessage(jid, { 
      audio: buffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true // Push to talk (voice note)
    });
  }
  
  // Buscar histórico de mensagens
  async fetchMessages(jid: string, limit = 50) {
    if (!this.socket) throw new Error('Não conectado');
    return this.socket.fetchMessageHistory(limit, { jid }, {});
  }
  
  // Event emitter
  on(event: string, handler: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }
  
  private emit(event: string, data?: any) {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(h => h(data));
  }
  
  private formatMessage(raw: any) {
    // Normalizar formato da mensagem
    const key = raw.key;
    const msg = raw.message;
    
    return {
      id: key.id,
      chatId: key.remoteJid,
      fromMe: key.fromMe,
      timestamp: raw.messageTimestamp,
      type: this.getMessageType(msg),
      content: this.extractContent(msg),
      quotedMessage: raw.message?.extendedTextMessage?.contextInfo?.quotedMessage,
      pushName: raw.pushName,
    };
  }
  
  private getMessageType(msg: any): string {
    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.imageMessage) return 'image';
    if (msg.videoMessage) return 'video';
    if (msg.audioMessage) return 'audio';
    if (msg.documentMessage) return 'document';
    if (msg.stickerMessage) return 'sticker';
    if (msg.contactMessage) return 'contact';
    if (msg.locationMessage) return 'location';
    return 'unknown';
  }
  
  private extractContent(msg: any): string {
    return msg.conversation || 
           msg.extendedTextMessage?.text ||
           msg.imageMessage?.caption ||
           msg.videoMessage?.caption ||
           '';
  }
  
  // Logout e limpar sessão
  async logout() {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
    }
  }
  
  // Status
  isConnected() {
    return this.socket?.user ? true : false;
  }
  
  getConnectionInfo() {
    return {
      connected: this.isConnected(),
      user: this.socket?.user,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// Singleton
export const whatsappEngine = new WhatsAppEngine();
```

### API Routes (Next.js)

```typescript
// src/app/api/whatsapp/status/route.ts
import { whatsappEngine } from '@/lib/whatsapp/engine';

export async function GET() {
  return Response.json(whatsappEngine.getConnectionInfo());
}

// src/app/api/whatsapp/send/route.ts
export async function POST(req: Request) {
  const { jid, text, type } = await req.json();
  
  try {
    const result = await whatsappEngine.sendText(jid, text);
    return Response.json({ success: true, messageId: result.key.id });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

// src/app/api/whatsapp/qr/route.ts (SSE para QR code)
export async function GET() {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      whatsappEngine.on('qr', (qr: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ qr })}\n\n`));
      });
      
      whatsappEngine.on('connected', () => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`));
        controller.close();
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## 📦 PARTE 4: PLANO DE AÇÃO DETALHADO

### Fase 1: Setup do Projeto (Dia 1-2)

```bash
# 1. Criar projeto Next.js
npx create-next-app@latest crm-whatsapp --typescript --tailwind --app --src-dir

# 2. Instalar dependências
cd crm-whatsapp
npm install @whiskeysockets/baileys @hapi/boom pino qrcode
npm install zustand @tanstack/react-query
npm install @supabase/supabase-js
npm install lucide-react framer-motion
npm install date-fns
npm install -D @types/node

# 3. Estrutura de pastas
mkdir -p src/components/{whatsapp,crm,ui}
mkdir -p src/lib/{whatsapp,supabase,utils}
mkdir -p src/hooks
mkdir -p src/store
mkdir -p auth_session
```

### Fase 2: Componentes WhatsApp Clone (Dia 3-7)

| Dia | Componente | Descrição |
|-----|------------|-----------|
| 3 | `ChatList` | Lista lateral com search e preview |
| 4 | `MessageBubble` | Balões com ticks, timestamps |
| 5 | `ChatArea` | Scroll infinito, carregamento |
| 6 | `InputArea` | Emoji picker, attach, voice |
| 7 | `ChatHeader` | Perfil, ações rápidas |

### Fase 3: Engine de Conexão (Dia 8-10)

| Dia | Tarefa |
|-----|--------|
| 8 | Implementar `WhatsAppEngine` com Baileys |
| 9 | API Routes + SSE para QR code |
| 10 | Testar reconexão automática |

### Fase 4: CRM Sidebar (Dia 11-14)

| Dia | Componente |
|-----|------------|
| 11 | `CRMSidebar` + tabs |
| 12 | `ClientProfile` + match automático |
| 13 | `OrderHistory` + integração FacilZap |
| 14 | `NotesPanel` + `TagManager` |

### Fase 5: Superpoderes (Dia 15-20)

| Dia | Feature |
|-----|---------|
| 15 | Sistema de Tags (Zustand + Supabase) |
| 16 | Quick Replies com variáveis |
| 17 | Agendamento de mensagens |
| 18 | Filtros avançados (Não lidos, Aguardando) |
| 19 | Integração IA (Groq/OpenAI) |
| 20 | Testes e polimento |

---

## 📁 ESTRUTURA FINAL DO PROJETO

```
crm-whatsapp/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── whatsapp/
│   │   │   │   ├── status/route.ts
│   │   │   │   ├── send/route.ts
│   │   │   │   ├── qr/route.ts
│   │   │   │   └── messages/route.ts
│   │   │   ├── crm/
│   │   │   │   ├── clients/route.ts
│   │   │   │   ├── orders/route.ts
│   │   │   │   └── sync/route.ts
│   │   │   └── webhooks/
│   │   │       └── facilzap/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/
│   │   ├── whatsapp/
│   │   │   ├── ChatList/
│   │   │   ├── ChatArea/
│   │   │   ├── InputArea/
│   │   │   └── shared/
│   │   ├── crm/
│   │   │   ├── CRMSidebar/
│   │   │   ├── overlays/
│   │   │   └── toolbar/
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       └── ...
│   │
│   ├── lib/
│   │   ├── whatsapp/
│   │   │   ├── engine.ts          # Baileys wrapper
│   │   │   └── formatters.ts      # Utilitários
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   └── queries.ts
│   │   └── utils/
│   │       └── phone.ts
│   │
│   ├── hooks/
│   │   ├── useChats.ts
│   │   ├── useMessages.ts
│   │   ├── useClient.ts
│   │   └── useWhatsAppConnection.ts
│   │
│   └── store/
│       ├── chatStore.ts           # Zustand
│       └── uiStore.ts
│
├── auth_session/                   # Credenciais WhatsApp (gitignore)
├── public/
├── .env.local
├── next.config.js
├── tailwind.config.ts
└── package.json
```

---

## 🎨 TEMAS E CUSTOMIZAÇÃO

### Suporte a Dark/Light Mode

```typescript
// src/lib/themes.ts
export const themes = {
  dark: {
    bgDefault: '#111b21',
    bgPanel: '#202c33',
    bgConversation: '#0b141a',
    bubbleIn: '#202c33',
    bubbleOut: '#005c4b',
    textPrimary: '#e9edef',
    textSecondary: '#8696a0',
    accentGreen: '#00a884',
  },
  light: {
    bgDefault: '#ffffff',
    bgPanel: '#f0f2f5',
    bgConversation: '#efeae2',
    bubbleIn: '#ffffff',
    bubbleOut: '#d9fdd3',
    textPrimary: '#111b21',
    textSecondary: '#667781',
    accentGreen: '#00a884',
  }
};
```

---

## ✅ CHECKLIST DE MIGRAÇÃO

### Do Projeto Atual para o Novo:

- [ ] Exportar dados do LocalStorage atual
- [ ] Migrar clientes para Supabase
- [ ] Migrar tags e notas para Supabase
- [ ] Migrar mensagens rápidas
- [ ] Migrar configurações de agendamento
- [ ] Configurar webhooks FacilZap no novo endpoint
- [ ] Testar conexão WhatsApp com Baileys
- [ ] Validar reconexão automática (simular queda)
- [ ] Testar envio/recebimento de mensagens
- [ ] Validar merge de clientes (CRM + WhatsApp)

---

## 📚 RECURSOS ADICIONAIS

### Repositórios de Referência

1. **WhatsApp Clone UI**
   - https://github.com/nickvrsn/whatsapp-web-clone
   - https://github.com/nickvrsn/react-whatsapp-clone
   
2. **Baileys (Engine)**
   - https://github.com/WhiskeySockets/Baileys
   - Docs: https://whiskeysockets.github.io/Baileys/

3. **Componentes Prontos**
   - https://chatscope.io/storybook/react/
   - https://github.com/nickvrsn/chat-ui-kit-react

### Dicas de Performance

1. **Virtualização de Lista**: Use `react-window` para listas longas
2. **Debounce de Busca**: Evitar re-renders desnecessários
3. **Lazy Loading de Imagens**: Carregar mídias sob demanda
4. **WebSocket para Real-time**: Evitar polling

---

## 🚀 PRÓXIMOS PASSOS IMEDIATOS

1. **Criar o projeto Next.js** com a estrutura proposta
2. **Implementar o WhatsAppEngine** com Baileys
3. **Construir os componentes visuais** do clone
4. **Integrar com Supabase** para persistência
5. **Migrar dados** do projeto atual

Quer que eu comece implementando alguma parte específica?
