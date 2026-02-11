// ============================================================================
// WEBHOOK SYSTEM - VERSÃO CORRIGIDA E BLINDADA
// Implementa todas as correções do Prompt 300%
// ============================================================================

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'sua_chave_secreta_webhook';
const processedWebhooks = new Set(); // Cache de webhooks processados
const webhookQueue = []; // Fila de processamento assíncrono
let isProcessingQueue = false;

// ============================================================================
// MIDDLEWARE DE VALIDAÇÃO
// ============================================================================

function validateWebhookOrigin(req, res, next) {
    const apiKey = req.headers['apikey'];
    const signature = req.headers['x-webhook-signature'];
    
    // Validar API key da Evolution
    if (apiKey !== process.env.EVOLUTION_API_KEY) {
        console.error('[Webhook] ❌ API key inválida:', apiKey);
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Invalid API key'
        });
    }
    
    // Log da requisição
    console.log('[Webhook] ✅ Origem validada:', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
    });
    
    next();
}

// ============================================================================
// VALIDAÇÃO DE PAYLOAD
// ============================================================================

function validateWebhookPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Payload inválido');
    }
    
    if (!payload.event || typeof payload.event !== 'string') {
        throw new Error('Evento não especificado');
    }
    
    if (!payload.data) {
        throw new Error('Data ausente no payload');
    }
    
    return true;
}

// ============================================================================
// DEDUPLICAÇÃO
// ============================================================================

function isDuplicateWebhook(event, data) {
    // Gerar hash único do webhook
    const key = data.key || {};
    const hash = `${event}:${JSON.stringify(key)}:${data.messageTimestamp || Date.now()}`;
    
    if (processedWebhooks.has(hash)) {
        return true;
    }
    
    // Adicionar ao cache
    processedWebhooks.add(hash);
    
    // Limitar tamanho do cache (manter últimos 1000)
    if (processedWebhooks.size > 1000) {
        const firstItem = processedWebhooks.values().next().value;
        processedWebhooks.delete(firstItem);
    }
    
    return false;
}

// ============================================================================
// PROCESSAMENTO ASSÍNCRONO DA FILA
// ============================================================================

async function processWebhookQueue(io, realtimeMessages, chatModes, ConnectionMonitor) {
    if (isProcessingQueue || webhookQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    
    while (webhookQueue.length > 0) {
        const webhook = webhookQueue.shift();
        
        try {
            await processWebhookEvent(webhook.event, webhook.data, io, realtimeMessages, chatModes, ConnectionMonitor);
            console.log('[Queue] ✅ Webhook processado:', webhook.event);
        } catch (error) {
            console.error('[Queue] ❌ Erro ao processar webhook:', error);
            
            // Re-enfileirar se não atingiu max retries
            webhook.retries = (webhook.retries || 0) + 1;
            if (webhook.retries < 3) {
                webhookQueue.push(webhook);
                console.log('[Queue] 🔄 Webhook re-enfileirado (tentativa', webhook.retries + 1, ')');
            }
        }
        
        // Delay entre processamentos (evitar sobrecarga)
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    isProcessingQueue = false;
}

// ============================================================================
// PROCESSAMENTO DE EVENTOS
// ============================================================================

async function processWebhookEvent(event, data, io, realtimeMessages, chatModes, ConnectionMonitor) {
    const startTime = Date.now();
    
    try {
        switch (event) {
            case 'messages.upsert':
            case 'MESSAGES_UPSERT':
                await handleMessageUpsert(data, io, realtimeMessages, chatModes);
                break;
                
            case 'messages.update':
            case 'MESSAGES_UPDATE':
                await handleMessageUpdate(data, io);
                break;
                
            case 'chats.upsert':
            case 'CHATS_UPSERT':
                await handleChatUpsert(data, io);
                break;
                
            case 'chats.update':
            case 'CHATS_UPDATE':
                await handleChatUpdate(data, io);
                break;
                
            case 'presence.update':
            case 'PRESENCE_UPDATE':
                await handlePresenceUpdate(data, io);
                break;
                
            case 'connection.update':
            case 'CONNECTION_UPDATE':
                await handleConnectionUpdate(data, io, ConnectionMonitor);
                break;
                
            default:
                console.log('[Webhook] ⚠️ Evento não tratado:', event);
        }
        
        const duration = Date.now() - startTime;
        console.log(`[Webhook] ✅ ${event} processado em ${duration}ms`);
        
    } catch (error) {
        console.error(`[Webhook] ❌ Erro ao processar ${event}:`, error);
        throw error;
    }
}

// ============================================================================
// HANDLERS ESPECÍFICOS
// ============================================================================

async function handleMessageUpsert(data, io, realtimeMessages, chatModes) {
    const messages = Array.isArray(data) ? data : [data];
    
    for (const msg of messages) {
        try {
            const key = msg.key || {};
            const remoteJid = key.remoteJid;
            const messageContent = msg.message || {};
            const timestamp = msg.messageTimestamp || Math.floor(Date.now() / 1000);
            const fromMe = key.fromMe || false;
            
            if (!remoteJid) {
                console.warn('[Webhook] ⚠️ Mensagem sem remoteJid:', msg);
                continue;
            }
            
            // Extrair texto
            let messageText = '';
            if (messageContent.conversation) {
                messageText = messageContent.conversation;
            } else if (messageContent.extendedTextMessage?.text) {
                messageText = messageContent.extendedTextMessage.text;
            } else if (messageContent.imageMessage?.caption) {
                messageText = messageContent.imageMessage.caption;
            } else if (messageContent.videoMessage?.caption) {
                messageText = messageContent.videoMessage.caption;
            }
            
            // Montar mensagem normalizada
            const normalizedMessage = {
                key: key,
                message: messageContent,
                messageTimestamp: timestamp,
                pushName: msg.pushName || 'Desconhecido',
                remoteJid: remoteJid,
                fromMe: fromMe,
                messageText: messageText,
                receivedAt: Date.now()
            };
            
            // Adicionar ao buffer
            realtimeMessages.push(normalizedMessage);
            if (realtimeMessages.length > 500) {
                realtimeMessages.shift();
            }
            
            // Emitir via Socket.io
            io.emit('new-message', normalizedMessage);
            io.to(`chat:${remoteJid}`).emit('chat-message', normalizedMessage);
            
            console.log('[Webhook] ✉️ Mensagem processada:', {
                from: remoteJid,
                text: messageText.substring(0, 50) + '...',
                fromMe: fromMe
            });
            
            // IA (se ativada)
            if (!fromMe && chatModes[remoteJid] === 'ai') {
                setTimeout(() => {
                    console.log('[Webhook] 🤖 Modo IA ativo para:', remoteJid);
                    // Aqui você chamaria a função de IA
                }, 1000);
            }
            
        } catch (error) {
            console.error('[Webhook] ❌ Erro ao processar mensagem individual:', error);
        }
    }
}

async function handleMessageUpdate(data, io) {
    const updates = Array.isArray(data) ? data : [data];
    
    for (const update of updates) {
        try {
            const key = update.key || {};
            const status = update.update?.status;
            
            if (!key.remoteJid || !status) continue;
            
            io.emit('message-status-update', {
                remoteJid: key.remoteJid,
                messageId: key.id,
                status: status
            });
            
            console.log('[Webhook] 📝 Status atualizado:', {
                chat: key.remoteJid,
                status: status
            });
            
        } catch (error) {
            console.error('[Webhook] ❌ Erro ao processar update:', error);
        }
    }
}

async function handleChatUpsert(data, io) {
    const chats = Array.isArray(data) ? data : [data];
    
    for (const chat of chats) {
        try {
            const remoteJid = chat.id || chat.remoteJid;
            
            io.emit('chat-upsert', {
                remoteJid: remoteJid,
                unreadCount: chat.unreadCount || 0,
                timestamp: Date.now()
            });
            
            console.log('[Webhook] 💬 Chat criado/atualizado:', remoteJid);
            
        } catch (error) {
            console.error('[Webhook] ❌ Erro ao processar chat upsert:', error);
        }
    }
}

async function handleChatUpdate(data, io) {
    const updates = Array.isArray(data) ? data : [data];
    
    for (const update of updates) {
        try {
            const remoteJid = update.id || update.remoteJid;
            
            io.emit('chat-update', {
                remoteJid: remoteJid,
                unreadCount: update.unreadCount,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('[Webhook] ❌ Erro ao processar chat update:', error);
        }
    }
}

async function handlePresenceUpdate(data, io) {
    try {
        const remoteJid = data.id || data.remoteJid;
        const presences = data.presences || {};
        
        io.emit('presence-update', {
            remoteJid: remoteJid,
            presences: presences,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('[Webhook] ❌ Erro ao processar presence:', error);
    }
}

async function handleConnectionUpdate(data, io, ConnectionMonitor) {
    try {
        const state = data.state || data.connection;
        
        ConnectionMonitor.updateStatus(state, 'Atualização via webhook');
        
        io.emit('connection-update', {
            state: state,
            qr: data.qr,
            timestamp: Date.now()
        });
        
        console.log('[Webhook] 🔌 Conexão atualizada:', state);
        
    } catch (error) {
        console.error('[Webhook] ❌ Erro ao processar connection update:', error);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    validateWebhookOrigin,
    validateWebhookPayload,
    isDuplicateWebhook,
    processWebhookQueue,
    processWebhookEvent,
    webhookQueue,
    processedWebhooks
};
