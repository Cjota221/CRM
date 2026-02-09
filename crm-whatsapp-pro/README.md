# 🎯 Central de Atendimento - WhatsApp Clone

Interface de atendimento profissional estilo WhatsApp Web com superpoderes.

## ✨ Features

### Interface Clone WhatsApp
- ✅ Lista de conversas com filtros (Todos, Não lidos, Aguardando, Grupos)
- ✅ Área de chat com balões estilo WhatsApp
- ✅ Ticks de status (enviado, entregue, lido)
- ✅ Indicador de digitando
- ✅ Formatação de texto (*negrito*, _itálico_, ~tachado~)
- ✅ Background com padrão WhatsApp

### Superpoderes (Sidebar CRM)
- ✅ **Tags** - Organize conversas com tags coloridas
- ✅ **Notas** - Adicione notas a cada contato
- ✅ **Agendamento** - Agende mensagens para envio futuro
- ✅ **Respostas Rápidas** - Atalhos tipo `/oi`, `/pix`
- ✅ Informações do contato

### Conexão Estável
- ✅ Baileys direto (sem Docker)
- ✅ Reconexão automática com backoff exponencial
- ✅ QR Code para conexão
- ✅ Status em tempo real via SSE

## 🚀 Como Rodar

```bash
# 1. Instalar dependências
cd crm-whatsapp-pro
npm install

# 2. Rodar em desenvolvimento
npm run dev

# 3. Acessar
http://localhost:3000
```

## 📁 Estrutura

```
src/
├── app/
│   ├── api/whatsapp/     # APIs de conexão
│   ├── layout.tsx
│   ├── page.tsx          # Página principal
│   └── globals.css
├── components/
│   ├── chat/
│   │   ├── ChatList.tsx  # Lista de conversas
│   │   └── ChatArea.tsx  # Área de mensagens
│   ├── crm/
│   │   └── CRMSidebar.tsx # Painel de superpoderes
│   └── ConnectionStatus.tsx
├── lib/
│   ├── whatsapp/
│   │   └── engine.ts     # Motor Baileys
│   └── utils.ts
└── store/
    └── index.ts          # Estado Zustand
```

## 🎨 Cores do WhatsApp (Dark Theme)

```css
--wa-bg: #111b21
--wa-bg-panel: #202c33
--wa-bubble-in: #202c33
--wa-bubble-out: #005c4b
--wa-accent-green: #00a884
--wa-accent-blue: #53bdeb
```

## ⌨️ Atalhos

| Atalho | Ação |
|--------|------|
| `/` | Abre respostas rápidas |
| `Enter` | Enviar mensagem |
| `Shift+Enter` | Nova linha |

## 🔧 Próximos Passos

1. [ ] Integrar com Baileys real (substituir mocks)
2. [ ] Adicionar envio de mídia
3. [ ] Implementar gravação de áudio
4. [ ] Sincronizar com Supabase
5. [ ] Adicionar busca de mensagens
