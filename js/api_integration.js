/**
 * SIGAP - Módulo de Integração (API & Mocks)
 * Simulação da Arquitetura de Microsserviços da DPRJ (SCI + Verde)
 * Este arquivo deve ser carregado no index.html ANTES do script principal.
 */

import { PautaService } from './pauta.js';
import { showNotification, playSound } from './utils.js';

const ApiIntegration = {
    // Simulação de URLs das APIs da Defensoria
    API_SCI_URL: 'https://api.defensoria.rj.gov.br/sci/v1',
    API_VERDE_URL: 'https://api.defensoria.rj.gov.br/verde/v1',

    // ========================================================================
    // 1. MOCK DO BANCO DE DADOS: SCI (Sistema Corporativo Interno)
    // Responsável por Identidade, Perfis e Lotação (Onde o servidor trabalha)
    // ========================================================================
    _mockBDSci: [
        { 
            matricula: "30699425", 
            email: "alex.silva@defensoria.rj.def.br",
            nome: "Alex do vale", 
            cargo: "Servidor Público", 
            orgaoVinculadoId: "123", 
            orgaoNome: "1ª D.P. Cível de Duque de Caxias" 
        },
        { 
            matricula: "10101", 
            email: "carlos.eduardo@defensoria.rj.def.br",
            nome: "Carlos Eduardo Alves", 
            cargo: "Defensor Público", 
            orgaoVinculadoId: "123", 
            orgaoNome: "1ª D.P. Cível de Duque de Caxias" 
        },
        { 
            matricula: "20202", 
            email: "mariana.souza@defensoria.rj.def.br",
            nome: "Mariana Souza", 
            cargo: "Servidora Administrativa", 
            orgaoVinculadoId: "456", 
            orgaoNome: "Núcleo de Família de Duque de Caxias" 
        },
        { 
            matricula: "30303", 
            email: "rafael.lima@defensoria.rj.def.br",
            nome: "Rafael Lima", 
            cargo: "Estagiário", 
            orgaoVinculadoId: "789", 
            orgaoNome: "Núcleo de Atendimento de Belford Roxo" 
        }
    ],

    // ========================================================================
    // 2. MOCK DO BANCO DE DADOS: SISTEMA VERDE
    // Responsável pelos Casos, Pautas e Agendamentos vinculados ao Órgão
    // ========================================================================
    _mockBDVerde: {
        "123": [ // Pauta da 1ª D.P. Cível de Duque de Caxias
            { name: "MARIA DA SILVA", scheduledTime: "09:00", subject: "AÇÃO INDENIZATÓRIA", cpf: "123.***.***-00", origem: "App Defensoria" },
            { name: "JOÃO DOS SANTOS", scheduledTime: "10:00", subject: "REINTEGRAÇÃO DE POSSE", cpf: "444.***.***-11", origem: "Telefone 129" }
        ],
        "456": [ // Pauta do Núcleo de Família de Duque de Caxias
            { name: "ANA PAULA", scheduledTime: "09:00", subject: "DIVÓRCIO CONSENSUAL", cpf: "777.***.***-22", origem: "Balcão (Urgência)" },
            { name: "ROBERTO LIMA", scheduledTime: "09:30", subject: "ALIMENTOS", cpf: "888.***.***-33", origem: "App Defensoria" }
        ],
        "789": [ // Pauta de Belford Roxo
            { name: "ANA SOUZA", scheduledTime: "10:00", subject: "CURATELA", cpf: "789.***.***-22", origem: "Atendimento Online" }
        ]
    },

    /**
     * PASSO 1: AUTENTICAÇÃO NO SCI
     * Simula o login do servidor e descobre em qual órgão ele está lotado.
     * Agora aceita E-mail Institucional ou Matrícula.
     */
    async autenticarServidorNoSCI(identificador) {
        console.log(`📡 [Mock SCI] Validando credenciais e buscando lotação para: ${identificador}`);
        this._toggleLoading(true, "Autenticando no SCI e buscando lotação...");
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // Latência da rede
        
        // Busca o servidor pelo e-mail ou pela matrícula
        const servidor = this._mockBDSci.find(
            s => s.email === identificador || s.matricula === identificador
        );
        
        this._toggleLoading(false);

        if (!servidor) {
            throw new Error("Servidor não encontrado no SCI. E-mail ou matrícula inválida.");
        }

        console.log(`✅ [Mock SCI] Servidor logado: ${servidor.nome} | Lotação: ${servidor.orgaoNome} (ID: ${servidor.orgaoVinculadoId})`);
        return servidor;
    },

    /**
     * PASSO 2: BUSCA DA PAUTA NO VERDE (Usado no ato de criar a pauta)
     * Busca a pauta baseada EXCLUSIVAMENTE no ID do órgão retornado pelo SCI.
     */
    async buscarDadosPautaOficial(orgaoId) {
        if (!orgaoId) return [];

        console.log(`📡 [Mock VERDE] Consumindo API de Pautas do Verde para o Órgão ID: ${orgaoId}`);
        this._toggleLoading(true, "Buscando Pauta do Dia no Verde...");
        
        await new Promise(resolve => setTimeout(resolve, 1500)); // Latência da rede
        
        const pauta = this._mockBDVerde[orgaoId] || [];
        
        this._toggleLoading(false);
        console.log(`✅ [Mock VERDE] Pauta recuperada: ${pauta.length} agendamentos encontrados.`);
        
        return pauta;
    },

    /**
     * FLUXO COMPLETO DE DEMONSTRAÇÃO
     * Use esta função na sua UI para mostrar a jornada completa aos avaliadores.
     */
    async demonstrarFluxoIntegracao(identificadorSimulado) {
        try {
            // 1. Vai no SCI e descobre quem é o cara e onde ele trabalha
            const dadosServidor = await this.autenticarServidorNoSCI(identificadorSimulado);
            
            if (window.showNotification) {
                showNotification(`Login SCI: Bem-vindo(a), ${dadosServidor.nome}. Lotação: ${dadosServidor.orgaoNome}`, "success");
            }

            // 2. Vai no Sistema Verde e puxa APENAS a pauta da lotação dele
            const pautaDoDia = await this.buscarDadosPautaOficial(dadosServidor.orgaoVinculadoId);
            
            return {
                servidor: dadosServidor,
                pauta: pautaDoDia
            };

        } catch (error) {
            console.error("❌ Falha no fluxo de integração:", error);
            if (window.showNotification) showNotification(error.message, "error");
            return null;
        }
    },

    /**
     * SINCRONIZAÇÃO MANUAL (Botão "Sincronizar Verde" na pauta aberta)
     */
    async simularSincronizacaoVerde(appInstance) {
        if (!appInstance || !appInstance.currentPauta) {
            alert("Abra uma pauta primeiro para sincronizar.");
            return;
        }

        // Pega o ID do órgão da pauta atualmente aberta no seu sistema
        const orgaoAtual = appInstance.currentPauta.orgaoId || "123"; 

        this._toggleLoading(true, "Sincronizando novas marcações do App Defensoria RJ...");

        try {
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Simula que alguém acabou de agendar algo pelo aplicativo no meio do expediente
            const assistidoNovoAgendamento = { 
                name: "ASSISTIDO NOVO (VIA APP)", 
                scheduledTime: "14:00", 
                subject: "URGÊNCIA > SAÚDE", 
                cpf: "999.***.***-99", 
                externalId: `EXT-${Math.floor(Math.random() * 1000)}`,
                origem: "App Defensoria"
            };

            await PautaService.addAssistedManual(appInstance, {
                ...assistidoNovoAgendamento,
                status: 'pauta'
            });

            if (window.showNotification) {
                showNotification("1 novo agendamento sincronizado do Sistema Verde!", "success");
                playSound('success'); 
            }
        } catch (error) {
            console.error("❌ Erro na integração:", error);
            showNotification("Erro durante a sincronização com o Verde.", "error");
            playSound('error');
        } finally {
            this._toggleLoading(false);
        }
    },

    /**
     * Helper para controle de interface (Loading)
     */
    _toggleLoading(show, message = "") {
        const loader = document.getElementById('loading-container');
        const text = document.getElementById('loading-text');
        
        if (loader) {
            show ? loader.classList.remove('hidden') : loader.classList.add('hidden');
        }
        if (text && show) {
            text.textContent = message;
        }
    }
};

window.ApiIntegration = ApiIntegration;
