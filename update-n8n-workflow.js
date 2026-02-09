/**
 * Script para atualizar o workflow do Agente Anne no N8N
 * Adiciona transferência IA → Humano
 */
const fs = require('fs');

const N8N_URL = 'https://cjota-n8n.9eo9b2.easypanel.host';
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhODBmOTYzZS0wNWRmLTQzNTAtOWU3My1iZDlmYmRjMjMzMTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZmY5MWVhOWEtOWViOC00MTAwLWEwYjAtOGYzZmQwOTM1M2RkIiwiaWF0IjoxNzcwNjYwNTE5fQ.wFQaHyWpcX66YcTe6qnoStQaewW6YF-xZPhpz2Uw8T8';
const WORKFLOW_ID = 'WiOj3Zu6dNWAxe0-94G4Z';

async function main() {
    const fetch = (await import('node-fetch')).default;

    // ========================================================================
    // BAIXAR WORKFLOW ATUAL
    // ========================================================================
    console.log('📥 Baixando workflow do Agente Anne...');
    const res = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
        headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });
    const wf = await res.json();
    console.log(`   Nós atuais: ${wf.nodes.length}`);

    // Verificar se já foi atualizado
    if (wf.nodes.find(n => n.name === 'Verificar Transferência')) {
        console.log('⚠️  Workflow já foi atualizado anteriormente! Abortando.');
        return;
    }

    // ========================================================================
    // 1. ATUALIZAR PROMPT DO AI AGENT
    // ========================================================================
    const aiAgent = wf.nodes.find(n => n.name === 'AI Agent');
    const oldPrompt = aiAgent.parameters.options.systemMessage;

    const transferInstructions = `

## TRANSFERÊNCIA PARA ATENDENTE

Se o cliente:
- Pedir para falar com um atendente humano
- Pedir para falar com uma pessoa real
- Disser que quer suporte humano, gerente, supervisor
- Reclamar que não quer falar com robô/bot
- O problema for muito complexo (ex: troca, devolução, reclamação grave, problema com pedido)

Responda EXATAMENTE assim (com a tag no início):
[TRANSFERIR_HUMANO] Entendi! Vou te transferir para um(a) atendente agora. Aguarde um momento 😊

IMPORTANTE: A tag [TRANSFERIR_HUMANO] DEVE estar no início da mensagem. Não use essa tag em nenhuma outra situação.`;

    aiAgent.parameters.options.systemMessage = oldPrompt + transferInstructions;
    console.log('✅ Prompt atualizado com instruções de transferência');

    // ========================================================================
    // 2. ADICIONAR NÓ: "Verificar Transferência" (If)
    // ========================================================================
    const ifTransferNode = {
        parameters: {
            conditions: {
                options: {
                    caseSensitive: false,
                    leftValue: '',
                    typeValidation: 'strict'
                },
                conditions: [{
                    id: 'transfer-check-1',
                    leftValue: '={{ $json.output }}',
                    rightValue: '[TRANSFERIR_HUMANO]',
                    operator: {
                        type: 'string',
                        operation: 'contains'
                    }
                }]
            },
            options: {}
        },
        id: 'a1b2c3d4-e5f6-7890-abcd-transfer001',
        name: 'Verificar Transferência',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [1200, -736]
    };

    // ========================================================================
    // 3. ADICIONAR NÓ: "Limpar tag" (Set)
    // ========================================================================
    const cleanMsgNode = {
        parameters: {
            assignments: {
                assignments: [{
                    id: 'clean-transfer-tag-1',
                    name: 'output',
                    value: '={{ $json.output.replace("[TRANSFERIR_HUMANO] ", "").replace("[TRANSFERIR_HUMANO]", "") }}',
                    type: 'string'
                }]
            },
            options: {}
        },
        id: 'b2c3d4e5-f6a7-8901-bcde-cleantag001',
        name: 'Limpar tag transfer',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [1400, -600]
    };

    // ========================================================================
    // 4. ADICIONAR NÓ: "Msg de transferência" (Evolution send-text)
    // ========================================================================
    const enviarOriginal = wf.nodes.find(n => n.name === 'Enviar texto');
    
    const enviarTransfer = {
        parameters: {
            resource: 'messages-api',
            instanceName: "={{ $('Dados').item.json.instancia }}",
            remoteJid: "={{ $('Dados').item.json['numero do cliente'] }}",
            messageText: '={{ $json.output }}',
            options_message: {
                delay: 2000,
                linkPreview: false
            }
        },
        id: 'c3d4e5f6-a7b8-9012-cdef-transfer002',
        name: 'Msg de transferência',
        type: 'n8n-nodes-evolution-api.evolutionApi',
        typeVersion: 2,
        position: [1600, -600]
    };

    // Copiar credenciais do nó "Enviar texto" existente
    if (enviarOriginal && enviarOriginal.credentials) {
        enviarTransfer.credentials = JSON.parse(JSON.stringify(enviarOriginal.credentials));
    }

    // Mover "Enviar texto" original para a direita (caminho normal)
    enviarOriginal.position = [1400, -880];

    // Adicionar novos nós
    wf.nodes.push(ifTransferNode, cleanMsgNode, enviarTransfer);
    console.log('✅ 3 novos nós adicionados');

    // ========================================================================
    // 5. ATUALIZAR CONEXÕES
    // ========================================================================
    
    // AI Agent -> Verificar Transferência (antes ia direto pro Enviar texto)
    wf.connections['AI Agent'].main = [[{
        node: 'Verificar Transferência',
        type: 'main',
        index: 0
    }]];

    // Verificar Transferência:
    //   True (saída 0) = CONTÉM [TRANSFERIR_HUMANO] → Limpar tag → Msg de transferência
    //   False (saída 1) = NÃO contém → Enviar texto (caminho normal)
    wf.connections['Verificar Transferência'] = {
        main: [
            [{ node: 'Limpar tag transfer', type: 'main', index: 0 }],
            [{ node: 'Enviar texto', type: 'main', index: 0 }]
        ]
    };

    wf.connections['Limpar tag transfer'] = {
        main: [[{ node: 'Msg de transferência', type: 'main', index: 0 }]]
    };

    wf.connections['Msg de transferência'] = {
        main: [[]]
    };

    console.log('✅ Conexões atualizadas');

    // ========================================================================
    // 6. SALVAR LOCALMENTE + UPLOAD PARA N8N
    // ========================================================================
    
    // Salvar cópia local
    fs.writeFileSync('n8n-agente-anne-workflow-UPDATED.json', JSON.stringify(wf, null, 2));
    console.log('✅ Cópia local salva');

    // Upload para o N8N (enviar apenas campos permitidos)
    console.log('📤 Enviando workflow atualizado para o N8N...');
    const payload = {
        name: wf.name,
        nodes: wf.nodes,
        connections: wf.connections,
        settings: {
            executionOrder: wf.settings?.executionOrder || 'v1'
        },
    };
    const updateRes = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
        method: 'PUT',
        headers: {
            'X-N8N-API-KEY': N8N_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const result = await updateRes.json();
    
    if (updateRes.ok) {
        console.log('');
        console.log('🎉 WORKFLOW ATUALIZADO COM SUCESSO!');
        console.log(`   Nós: ${result.nodes?.length || 'N/A'}`);
        console.log(`   Ativo: ${result.active}`);
        console.log('');
        console.log('Novo fluxo do AI Agent:');
        console.log('  AI Agent → Verificar Transferência');
        console.log('    ├── SIM (transferir) → Limpar tag → Msg de transferência');
        console.log('    └── NÃO (normal)    → Enviar texto');
        console.log('');
        console.log('Quando o cliente pedir atendente humano, a IA vai:');
        console.log('  1. Responder com mensagem de transferência');
        console.log('  2. A tag [TRANSFERIR_HUMANO] é removida automaticamente');
        console.log('  3. O CRM mostra a conversa na central de atendimento');
    } else {
        console.log('❌ Erro ao atualizar:', JSON.stringify(result));
    }
}

main().catch(err => console.error('❌ Erro:', err));
