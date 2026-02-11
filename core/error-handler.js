// ============================================================================
// SISTEMA GLOBAL DE TRATAMENTO DE ERROS
// Implementa Correção #8 do Prompt 300%
// ============================================================================

class ErrorHandler {
    constructor() {
        // === CONFIGURAÇÃO ===
        this.maxLogSize = 500; // Máximo de erros no log
        this.notifyThreshold = 10; // Notificar admin após X erros críticos
        
        // === LOGS ===
        this.errorLog = []; // Todos os erros
        this.criticalErrors = 0; // Contador de erros críticos
        
        // === CATEGORIAS ===
        this.categories = {
            WHATSAPP: 'whatsapp',
            DATABASE: 'database',
            API: 'api',
            AUTH: 'auth',
            WEBHOOK: 'webhook',
            NETWORK: 'network',
            VALIDATION: 'validation',
            SYSTEM: 'system',
            UNKNOWN: 'unknown'
        };
        
        // === SEVERIDADES ===
        this.severity = {
            LOW: 'low',
            MEDIUM: 'medium',
            HIGH: 'high',
            CRITICAL: 'critical'
        };
    }
    
    /**
     * Registrar erro
     * @param {Error|string} error - Erro ou mensagem
     * @param {Object} context - Contexto adicional
     * @returns {Object} Entrada do log
     */
    log(error, context = {}) {
        const entry = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            category: context.category || this.categories.UNKNOWN,
            severity: context.severity || this.severity.MEDIUM,
            details: context.details || {},
            source: context.source || 'unknown',
            userId: context.userId || null,
            handled: false
        };
        
        // Adicionar ao log
        this.errorLog.unshift(entry);
        
        // Limitar tamanho
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.pop();
        }
        
        // Incrementar contador de críticos
        if (entry.severity === this.severity.CRITICAL) {
            this.criticalErrors++;
            
            // Notificar admin se atingir threshold
            if (this.criticalErrors % this.notifyThreshold === 0) {
                this.notifyAdmins(entry);
            }
        }
        
        // Log no console
        this.logToConsole(entry);
        
        return entry;
    }
    
    /**
     * Log no console
     */
    logToConsole(entry) {
        const icon = this.getSeverityIcon(entry.severity);
        const prefix = `${icon} [${entry.category.toUpperCase()}]`;
        
        console.error(
            `${prefix} ${entry.message}`,
            entry.details
        );
        
        if (entry.stack) {
            console.error(entry.stack);
        }
    }
    
    /**
     * Ícone por severidade
     */
    getSeverityIcon(sev) {
        switch (sev) {
            case this.severity.LOW: return '⚠️';
            case this.severity.MEDIUM: return '⚠️';
            case this.severity.HIGH: return '❌';
            case this.severity.CRITICAL: return '🔥';
            default: return '❓';
        }
    }
    
    /**
     * Gerar ID único
     */
    generateId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Notificar admins (placeholder para integração futura)
     */
    notifyAdmins(entry) {
        console.warn(
            `🔔 [ADMIN NOTIFICATION] ${this.criticalErrors} erros críticos detectados`,
            {
                lastError: entry.message,
                category: entry.category,
                timestamp: entry.timestamp
            }
        );
        
        // TODO: Integrar com sistema de notificações
        // - Socket.io para admins conectados
        // - Email/SMS para admins offline
        // - Webhook para sistema externo de monitoramento
    }
    
    /**
     * Obter estatísticas
     */
    getStats() {
        const byCategory = {};
        const bySeverity = {};
        
        this.errorLog.forEach(entry => {
            // Por categoria
            byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
            
            // Por severidade
            bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
        });
        
        return {
            total: this.errorLog.length,
            critical: this.criticalErrors,
            byCategory,
            bySeverity,
            recent: this.errorLog.slice(0, 10)
        };
    }
    
    /**
     * Limpar log
     */
    clearLog() {
        const count = this.errorLog.length;
        this.errorLog = [];
        this.criticalErrors = 0;
        console.log(`🧹 [ErrorHandler] ${count} erros removidos do log`);
    }
    
    /**
     * Buscar erros
     */
    search(filters = {}) {
        let results = [...this.errorLog];
        
        // Filtrar por categoria
        if (filters.category) {
            results = results.filter(e => e.category === filters.category);
        }
        
        // Filtrar por severidade
        if (filters.severity) {
            results = results.filter(e => e.severity === filters.severity);
        }
        
        // Filtrar por período
        if (filters.since) {
            const since = new Date(filters.since).getTime();
            results = results.filter(e => 
                new Date(e.timestamp).getTime() >= since
            );
        }
        
        // Filtrar por usuário
        if (filters.userId) {
            results = results.filter(e => e.userId === filters.userId);
        }
        
        // Limitar resultados
        if (filters.limit) {
            results = results.slice(0, filters.limit);
        }
        
        return results;
    }
    
    /**
     * Marcar erro como tratado
     */
    markHandled(errorId) {
        const error = this.errorLog.find(e => e.id === errorId);
        if (error) {
            error.handled = true;
            return true;
        }
        return false;
    }
}

// ============================================================================
// HANDLERS ESPECÍFICOS PARA TIPOS DE ERRO
// ============================================================================

class WhatsAppErrorHandler extends ErrorHandler {
    handleConnectionError(error, context = {}) {
        return this.log(error, {
            ...context,
            category: this.categories.WHATSAPP,
            severity: this.severity.HIGH,
            source: 'connection'
        });
    }
    
    handleMessageError(error, context = {}) {
        return this.log(error, {
            ...context,
            category: this.categories.WHATSAPP,
            severity: this.severity.MEDIUM,
            source: 'message'
        });
    }
    
    handleQRCodeError(error, context = {}) {
        return this.log(error, {
            ...context,
            category: this.categories.WHATSAPP,
            severity: this.severity.LOW,
            source: 'qrcode'
        });
    }
}

class DatabaseErrorHandler extends ErrorHandler {
    handleQueryError(error, context = {}) {
        return this.log(error, {
            ...context,
            category: this.categories.DATABASE,
            severity: this.severity.HIGH,
            source: 'query'
        });
    }
    
    handleConnectionError(error, context = {}) {
        return this.log(error, {
            ...context,
            category: this.categories.DATABASE,
            severity: this.severity.CRITICAL,
            source: 'connection'
        });
    }
}

class APIErrorHandler extends ErrorHandler {
    handleRequestError(error, context = {}) {
        const statusCode = context.statusCode || 500;
        const severity = statusCode >= 500 
            ? this.severity.HIGH 
            : this.severity.MEDIUM;
        
        return this.log(error, {
            ...context,
            category: this.categories.API,
            severity,
            source: 'request'
        });
    }
    
    handleRateLimitError(error, context = {}) {
        return this.log(error, {
            ...context,
            category: this.categories.API,
            severity: this.severity.MEDIUM,
            source: 'ratelimit'
        });
    }
}

// ============================================================================
// MIDDLEWARE EXPRESS PARA TRATAMENTO DE ERROS
// ============================================================================

function createErrorMiddleware(errorHandler) {
    return (err, req, res, next) => {
        // Log do erro
        errorHandler.log(err, {
            category: errorHandler.categories.API,
            severity: errorHandler.severity.HIGH,
            details: {
                method: req.method,
                path: req.path,
                query: req.query,
                body: req.body,
                ip: req.ip
            }
        });
        
        // Resposta ao cliente
        const statusCode = err.statusCode || 500;
        const message = process.env.NODE_ENV === 'production' 
            ? 'Erro interno do servidor' 
            : err.message;
        
        res.status(statusCode).json({
            error: message,
            ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
        });
    };
}

// ============================================================================
// HANDLERS GLOBAIS PARA NODE.JS
// ============================================================================

function setupGlobalHandlers(errorHandler) {
    // Uncaught Exception
    process.on('uncaughtException', (error) => {
        errorHandler.log(error, {
            category: errorHandler.categories.SYSTEM,
            severity: errorHandler.severity.CRITICAL,
            source: 'uncaughtException'
        });
        
        console.error('🔥 [CRITICAL] Uncaught Exception - Encerrando processo...');
        process.exit(1);
    });
    
    // Unhandled Rejection
    process.on('unhandledRejection', (reason, promise) => {
        errorHandler.log(new Error(String(reason)), {
            category: errorHandler.categories.SYSTEM,
            severity: errorHandler.severity.CRITICAL,
            source: 'unhandledRejection',
            details: { promise }
        });
    });
    
    // Warning
    process.on('warning', (warning) => {
        errorHandler.log(warning, {
            category: errorHandler.categories.SYSTEM,
            severity: errorHandler.severity.LOW,
            source: 'warning'
        });
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    ErrorHandler,
    WhatsAppErrorHandler,
    DatabaseErrorHandler,
    APIErrorHandler,
    createErrorMiddleware,
    setupGlobalHandlers
};
