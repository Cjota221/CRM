# 🚀 Gerenciamento do Servidor CRM

## ✅ Servidor Configurado para Inicialização Automática

O servidor agora está sendo gerenciado pelo **PM2** e iniciará automaticamente quando o Windows ligar.

---

## 📋 Comandos Úteis

### Ver status do servidor
```powershell
pm2 list
```

### Reiniciar o servidor
```powershell
pm2 restart crm-server
```

### Parar o servidor
```powershell
pm2 stop crm-server
```

### Iniciar o servidor (se estiver parado)
```powershell
pm2 start crm-server
```

### Ver logs do servidor em tempo real
```powershell
pm2 logs crm-server
```

### Ver logs das últimas 50 linhas
```powershell
pm2 logs crm-server --lines 50
```

### Monitorar CPU e Memória
```powershell
pm2 monit
```

---

## 🔧 Solução de Problemas

### Servidor não está respondendo?
```powershell
# Verificar status
pm2 list

# Se estiver com erro, reiniciar
pm2 restart crm-server

# Se não aparecer na lista, iniciar
cd C:\Users\Public\CRM
pm2 start server.js --name "crm-server"
pm2 save
```

### Remover inicialização automática
```powershell
# Deletar o atalho da pasta de inicialização
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\CRM-Server.lnk"
```

### Adicionar novamente a inicialização automática
```powershell
# Executar o script start-crm-server.bat
C:\Users\Public\CRM\start-crm-server.bat
```

---

## 🌐 URLs do Sistema

- **Central de Atendimento**: http://localhost:3000/atendimentos.html
- **Dashboard CRM**: http://localhost:3000/index.html
- **Anny BI**: http://localhost:3000/anny.html
- **Evolution API**: http://localhost:8080

---

## 📦 Atualizar o Código

Após fazer `git pull`, sempre reinicie o servidor:

```powershell
cd C:\Users\Public\CRM
git pull
pm2 restart crm-server
```

---

## ⚡ Comandos Rápidos (Copiar e Colar)

**Status rápido:**
```powershell
pm2 list
```

**Reiniciar tudo:**
```powershell
pm2 restart all
```

**Ver erros:**
```powershell
pm2 logs crm-server --err --lines 20
```
