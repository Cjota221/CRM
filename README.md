# CRM FacilZap - Sistema Local

Sistema de CRM integrado com a API FacilZap para gestão de clientes, produtos e pedidos.

## 🚀 Como Executar

### 1. Configurar o Token da API

Abra o arquivo `server.js` e substitua `'SEU_TOKEN_AQUI'` pelo seu token da FacilZap:

```javascript
const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN || 'SEU_TOKEN_AQUI';
```

Você também pode definir a variável de ambiente `FACILZAP_TOKEN` antes de executar.

### 2. Instalar Dependências (primeira vez)

```bash
npm install
```

### 3. Iniciar o Servidor

```bash
npm start
```

### 4. Acessar o Sistema

Abra no navegador: **http://localhost:3000**

---

## 📋 Funcionalidades

### ✅ Sincronização com API
- Busca automática de Clientes, Produtos e Pedidos da API FacilZap
- Paginação automática para buscar todos os dados
- Dados salvos localmente no navegador (LocalStorage)

### ✅ Gestão de Clientes
- Lista de clientes com status de atividade (Ativo, Em Risco, Inativo)
- Filtro por status, tags e busca por nome/email/telefone
- Ordenação por pedidos, valor gasto ou inatividade
- Visualização detalhada com histórico de compras

### ✅ Gestão de Inatividade
- Clientes classificados automaticamente:
  - **Ativo**: Última compra há até X dias (configurável)
  - **Em Risco**: Última compra entre X e Y dias
  - **Inativo**: Última compra há mais de Y dias
- Indicador visual de dias sem comprar
- Filtro rápido por clientes inativos

### ✅ Histórico de Compras
- Produtos comprados por cada cliente
- Quantidade total comprada de cada produto
- Último pedido de cada produto
- Lista de pedidos com detalhes

### ✅ Gestão de Produtos
- Lista de produtos sincronizados
- Filtro por status (ativo/inativo) e controle de estoque
- Busca por nome ou SKU

### ✅ Gestão de Pedidos
- Lista de pedidos com cliente, data e valor
- Busca por código do pedido ou nome do cliente
- Visualização detalhada com produtos

---

## ⚙️ Configurações

Clique em **Configurações** no menu lateral para ajustar:

- **Cliente Ativo**: Dias desde a última compra para considerar ativo (padrão: 30)
- **Cliente em Risco**: Dias desde a última compra para considerar em risco (padrão: 60)

---

## 🗄️ Armazenamento de Dados

Os dados são salvos no **LocalStorage** do navegador:
- `crm_clients` - Lista de clientes
- `crm_products` - Lista de produtos  
- `crm_orders` - Lista de pedidos
- `crm_settings` - Configurações do sistema
- `crm_last_sync` - Data da última sincronização

> **Nota**: Os dados persistem no navegador. Limpar os dados do site apagará as informações.

---

## 📡 Endpoints da API

O servidor local expõe:
- `GET /api/facilzap-proxy` - Proxy para buscar dados da API FacilZap

---

## 🔧 Estrutura do Projeto

```
CRM/
├── index.html          # Interface do sistema
├── script.js           # Lógica do frontend (CRM)
├── server.js           # Servidor local com proxy para API
├── package.json        # Dependências do projeto
├── netlify.toml        # Configuração Netlify (opcional)
└── functions/          # Netlify Functions (deploy)
    ├── facilzap-proxy.js
    └── image-proxy.js
```

---

## 🐛 Solução de Problemas

### Erro "Token não configurado"
Configure seu token no arquivo `server.js` ou via variável de ambiente.

### Erro 401 - Token inválido
Verifique se o token está correto e ativo na FacilZap.

### Dados não aparecem após sincronização
Abra o console do navegador (F12) para verificar erros.

---

## 📞 Suporte FacilZap API

- WhatsApp: 0800 954 6100
- Email: suporte.ti@facilzap.com.br
