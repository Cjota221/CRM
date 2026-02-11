// ============================================================================
// CONNECTION MONITOR - SISTEMA AVANÇADO DE MONITORAMENTO E RECONEXÃO
// Implementa Correção #4 do Prompt 300%
// ============================================================================

class ConnectionMonitor {
    constructor(config = {}) {
        // === ESTADO ===
        this.status = 'unknown';
        this.lastCheck = null;
        this.lastConnected = null;
        this.lastDisconnected = null;
        this.reconnectAttempts = 0;
        this.consecutiveFailures = 0;
        
        // === CONFIGURAÇÃO ===
        this.maxReconnectAttempts = config.maxReconnectAttempts || 20; // Aumentado de 5 para 20
        this.checkInterval = config.checkInterval || 30 * 1000; // 30 segundos (antes 2 minutos)
        this.reconnectDelay = config.reconnectDelay || 5000; // 5 segundos inicial
        this.reconnectDelayMax = config.reconnectDelayMax || 300000; // Máximo 5 minutos
        
        // === LIMITES ===
        this.healthCheckTimeout = 15000; // 15 segundos
        this.apiCallTimeout = 30000; // 30 segundos
        
        // === FLAGS ===
        this.isReconnecting = false;
        this.isCheckingConnection = false;
        this.monitoringEnabled = true;
        this.autoReconnectEnabled = true;
        
        // === HISTÓRICO DE ERROS ===
        this.errorLog = [];
        this.maxErrorLog = 100;
        
        // === MÉTRICAS ===
        this.metrics = {
            totalChecks: 0,
            successfulChecks: 0,
            failedChecks: 0,
            totalReconnects: 0,
            successfulReconnects: 0,
            failedReconnects: 0,
            longestDowntime: 0,
            currentDowntime: 0
        };
        
        // === DEPENDÊNCIAS (serão injetadas) ===
        this.io = null;
        this.evolutionUrl = null;
        this.evolutionApiKey = null;
        this.instanceName = null;
        this.fetch = null;
    }
    
    /**
     * Configurar dependências
     */
    configure(deps) {
        this.io = deps.io;
        this.evolutionUrl = deps.evolutionUrl;
        this.evolutionApiKey = deps.evolutionApiKey;
        this.instanceName = deps.instanceName;
        this.fetch = deps.fetch || require('node-fetch');
    }
    
    /**
     * Inicializar monitoramento
     */
    init() {
        console.log('[ConnectionMonitor] 🚀 Iniciando monitoramento...');
        
        // Primeira verificação após 10 segundos
        setTimeout(() => {
            this.checkConnection();
        }, 10000);
        
        // Verificação periódica
        setInterval(() => {
            if (this.monitoringEnabled) {
                this.checkConnection();
            }
        }, this.checkInterval);
        
        // Broadcast status a cada 1 minuto
        setInterval(() => {
            this.broadcastStatus();
        }, 60000);
        
        console.log('[ConnectionMonitor] ✅ Monitoramento ativo');
    }
    
    /**
     * Verificar conexão com Evolution API
     */
    async checkConnection() {
        // Evitar verificações concorrentes
        if (this.isCheckingConnection) {
            console.log('[ConnectionMonitor] ⚠️ Verificação já em andamento');
            return;
        }
        
        this.isCheckingConnection = true;
        this.lastCheck = Date.now();
        this.metrics.totalChecks++;
        
        try {
            console.log('[ConnectionMonitor] 🔍 Verificando conexão...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.healthCheckTimeout);
            
            const response = await this.fetch(
                `${this.evolutionUrl}/instance/connectionState/${this.instanceName}`,
                {
                    headers: {
                        'apikey': this.evolutionApiKey,
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                }
            );
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const state = data.instance?.state;
            
            console.log('[ConnectionMonitor] 📡 Estado:', state);
            
            // Avaliar estado
            switch (state) {
                case 'open':
                    this.handleConnected();
                    break;
                    
                case 'connecting':
                    this.handleConnecting();
                    break;
                    
                case 'close':
                    this.handleDisconnected('close');
                    break;
                    
                default:
                    this.handleDisconnected(`unknown_state:${state}`);
            }
            
            this.metrics.successfulChecks++;
            this.consecutiveFailures = 0;
            
        } catch (error) {
            console.error('[ConnectionMonitor] ❌ Erro na verificação:', error.message);
            
            this.metrics.failedChecks++;
            this.consecutiveFailures++;
            
            // Log erro
            this.logError('check_failed', error.message, {
                attempt: this.metrics.totalChecks,
                consecutiveFailures: this.consecutiveFailures
            });
            
            // Se falhou muitas vezes seguidas
            if (this.consecutiveFailures >= 3) {
                this.handleDisconnected('api_offline');
            }
            
        } finally {
            this.isCheckingConnection = false;
        }
    }
    
    /**
     * Handler: Conectado
     */
    handleConnected() {
        const wasDisconnected = this.status !== 'connected';
        
        this.status = 'connected';
        this.lastConnected = Date.now();
        
        if (wasDisconnected) {
            console.log('[ConnectionMonitor] ✅ CONECTADO');
            
            // Calcular downtime
            if (this.lastDisconnected) {
                const downtime = Date.now() - this.lastDisconnected;
                this.metrics.currentDowntime = 0;
                
                if (downtime > this.metrics.longestDowntime) {
                    this.metrics.longestDowntime = downtime;
                }
                
                console.log('[ConnectionMonitor] 📊 Downtime:', Math.floor(downtime / 1000), 'segundos');
            }
            
            // Resetar contadores
            this.reconnectAttempts = 0;
            this.consecutiveFailures = 0;
            
            // Broadcast para clientes
            this.broadcastStatus();
        }
    }
    
    /**
     * Handler: Conectando
     */
    handleConnecting() {
        this.status = 'connecting';
        console.log('[ConnectionMonitor] 🔄 Conectando...');
    }
    
    /**
     * Handler: Desconectado
     */
    handleDisconnected(reason) {
        const wasConnected = this.status === 'connected';
        
        this.status = 'disconnected';
        
        if (wasConnected) {
            this.lastDisconnected = Date.now();
            console.log('[ConnectionMonitor] ❌ DESCONECTADO:', reason);
            
            // Broadcast para clientes
            this.broadcastStatus();
        }
        
        // Atualizar downtime
        if (this.lastDisconnected) {
            this.metrics.currentDowntime = Date.now() - this.lastDisconnected;
        }
        
        // Tentar reconectar
        if (this.autoReconnectEnabled && !this.isReconnecting) {
            setTimeout(() => {
                this.attemptAutoReconnect();
            }, 2000);
        }
    }
    
    /**
     * Tentar reconexão automática com backoff exponencial
     */
    async attemptAutoReconnect() {
        if (this.isReconnecting) {
            console.log('[Reconnect] ⚠️ Já está reconectando');
            return false;
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[Reconnect] ❌ Máximo de tentativas atingido');
            this.logError('max_reconnect_attempts', 'Desistindo após 20 tentativas');
            
            // Notificar administradores
            this.notifyAdmins('CRITICAL: WhatsApp desconectado após 20 tentativas de reconexão');
            
            return false;
        }
        
        this.isReconnecting = true;
        this.reconnectAttempts++;
        this.metrics.totalReconnects++;
        
        // Calcular delay com backoff exponencial
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.reconnectDelayMax
        );
        
        console.log(`[Reconnect] 🔄 Tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${delay/1000}s`);
        
        // Broadcast estado
        if (this.io) {
            this.io.emit('connection-status', {
                status: 'reconnecting',
                attempt: this.reconnectAttempts,
                maxAttempts: this.maxReconnectAttempts,
                nextRetryIn: delay
            });
        }
        
        // Aguardar delay
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
            // Restart via API
            console.log('[Reconnect] 📡 Enviando comando de restart...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.apiCallTimeout);
            
            const response = await this.fetch(
                `${this.evolutionUrl}/instance/restart/${this.instanceName}`,
                {
                    method: 'PUT',
                    headers: {
                        'apikey': this.evolutionApiKey,
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                }
            );
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            console.log('[Reconnect] ✅ Restart enviado');
            
            // Aguardar 15 segundos para conectar
            await new Promise(resolve => setTimeout(resolve, 15000));
            
            // Verificar se conectou
            const connected = await this.verifyConnection();
            
            if (connected) {
                console.log('[Reconnect] ✅ RECONECTADO COM SUCESSO');
                
                this.metrics.successfulReconnects++;
                this.reconnectAttempts = 0;
                this.isReconnecting = false;
                
                // Broadcast sucesso
                if (this.io) {
                    this.io.emit('connection-status', {
                        status: 'connected',
                        message: 'Reconexão bem-sucedida'
                    });
                }
                
                return true;
            }
            
            // Não conectou, tentar novamente
            console.log('[Reconnect] ⚠️ Restart não conectou. Tentando novamente...');
            this.isReconnecting = false;
            
            setTimeout(() => {
                this.attemptAutoReconnect();
            }, 3000);
            
            return false;
            
        } catch (error) {
            console.error('[Reconnect] ❌ Erro ao reconectar:', error.message);
            
            this.metrics.failedReconnects++;
            this.logError('reconnect_failed', error.message, {
                attempt: this.reconnectAttempts
            });
            
            this.isReconnecting = false;
            
            // Tentar novamente após delay
            setTimeout(() => {
                this.attemptAutoReconnect();
            }, 5000);
            
            return false;
        }
    }
    
    /**
     * Verificar conexão (simples)
     */
    async verifyConnection() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await this.fetch(
                `${this.evolutionUrl}/instance/connectionState/${this.instanceName}`,
                {
                    headers: {
                        'apikey': this.evolutionApiKey,
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                }
            );
            
            clearTimeout(timeoutId);
            
            if (!response.ok) return false;
            
            const data = await response.json();
            return data.instance?.state === 'open';
            
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Log de erro
     */
    logError(type, message, details = {}) {
        const error = {
            timestamp: new Date().toISOString(),
            type: type,
            message: message,
            details: details
        };
        
        this.errorLog.push(error);
        
        // Limitar tamanho do log
        if (this.errorLog.length > this.maxErrorLog) {
            this.errorLog.shift();
        }
        
        // Log no console
        console.error('[ConnectionMonitor] 📝 Erro registrado:', error);
    }
    
    /**
     * Broadcast status para clientes conectados
     */
    broadcastStatus() {
        if (!this.io) return;
        
        const status = {
            status: this.status,
            lastCheck: this.lastCheck,
            lastConnected: this.lastConnected,
            lastDisconnected: this.lastDisconnected,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            isReconnecting: this.isReconnecting,
            currentDowntime: this.metrics.currentDowntime,
            metrics: this.metrics,
            timestamp: Date.now()
        };
        
        this.io.emit('connection-status', status);
    }
    
    /**
     * Atualizar status
     */
    updateStatus(newStatus, reason = '') {
        const oldStatus = this.status;
        this.status = newStatus;
        
        if (newStatus === 'connected') {
            this.lastConnected = Date.now();
            this.reconnectAttempts = 0;
        }
        
        console.log(`[ConnectionMonitor] Status: ${oldStatus} → ${newStatus} ${reason ? `(${reason})` : ''}`);
        
        this.broadcastStatus();
    }
    
    /**
     * Notificar administradores
     */
    notifyAdmins(message) {
        // Implementar notificação (email, SMS, Slack, etc)
        console.log('[ConnectionMonitor] 🚨 NOTIFICAÇÃO ADMIN:', message);
        
        // Exemplo: enviar para Slack
        // fetch('https://hooks.slack.com/...', {
        //     method: 'POST',
        //     body: JSON.stringify({ text: message })
        // });
    }
    
    /**
     * Resetar métricas
     */
    resetMetrics() {
        this.metrics = {
            totalChecks: 0,
            successfulChecks: 0,
            failedChecks: 0,
            totalReconnects: 0,
            successfulReconnects: 0,
            failedReconnects: 0,
            longestDowntime: 0,
            currentDowntime: 0
        };
        
        console.log('[ConnectionMonitor] 🔄 Métricas resetadas');
    }
    
    /**
     * Obter relatório de status
     */
    getStatusReport() {
        return {
            status: this.status,
            uptime: this.lastConnected ? Date.now() - this.lastConnected : 0,
            downtime: this.metrics.currentDowntime,
            reconnectAttempts: this.reconnectAttempts,
            metrics: this.metrics,
            errorLog: this.errorLog.slice(-10), // Últimos 10 erros
            timestamp: Date.now()
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = ConnectionMonitor;
