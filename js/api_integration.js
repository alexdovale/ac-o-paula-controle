/**
 * SISTEMA GESTÃO (SIGAP) - Módulo de Integração (API & Mocks)
 * Simulação de Arquitetura de Microsserviços para Gestão Logística
 * Atualizado com Trava de Compliance de Dados para o 1º Login.
 */

import { PautaService } from './pauta.js';
import { showNotification, playSound } from './utils.js';

const ApiIntegration = {
    // URLs fictícias de serviços de infraestrutura
    API_NPF_URL: 'https://core-gestao.logistica.net/npf/v1',
    API_BDA_URL: 'https://agendamentos.logistica.net/bda/v1',

    // ========================================================================
    // 1. MOCK DE SERVIÇO: NPF (Núcleo de Processamento de Fluxo)
    // ========================================================================
    _mockNPF: [
        { 
            uid: "OPERADOR-001", 
            email: "gestor.master@logistica.net",
            nome: "Alex do Vale", 
            departamento: "Coordenação Logística", 
            setorId: "HUB-99", 
            setorNome: "Central de Distribuição Norte",
            complianceAceito: false 
        },
        { 
            uid: "OPERADOR-002", 
            email: "suporte.adm@logistica.net",
            nome: "Carlos Eduardo Alves", 
            departamento: "Analista de Projetos", 
            setorId: "HUB-99", 
            setorNome: "Central de Distribuição Norte",
            complianceAceito: true 
        }
    ],

    // ========================================================================
    // 2. MOCK DE SERVIÇO: BDA (Banco de Dados de Agendamentos)
    // ========================================================================
    _mockBDA: {
        "HUB-99": [ 
            { name: "CLIENTE ALFA", scheduledTime: "09:00", subject: "REQUISIÇÃO TÉCNICA", source: "Portal Web" },
            { name: "CLIENTE BETA", scheduledTime: "10:00", subject: "SUPORTE ESPECIAL", source: "Terminal Externo" }
        ]
    },

    /**
     * AUTENTICAÇÃO NO NPF
     */
    async autenticarNoNPF(identificador) {
        console.log(`📡 [Mock NPF] Validando credenciais de acesso para: ${identificador}`);
        this._toggleLoading(true, "Conectando ao NPF...");
        
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const operador = this._mockNPF.find(
            s => s.email === identificador || s.uid === identificador
        );
        
        this._toggleLoading(false);

        if (!operador) {
            throw new Error("Credenciais não reconhecidas pelo NPF.");
        }

        const complianceLocal = localStorage.getItem(`compliance_accepted_${operador.uid}`) === 'true';
        operador.precisaAceitarCompliance = !operador.complianceAceito && !complianceLocal;

        return operador;
    },

    /**
     * REGISTRO DE COMPLIANCE
     */
    async confirmarAceiteCompliance(uid) {
        console.log(`🔒 [Compliance] Termo aceito por: ${uid}`);
        const index = this._mockNPF.findIndex(s => s.uid === uid);
        if (index !== -1) this._mockNPF[index].complianceAceito = true;
        localStorage.setItem(`compliance_accepted_${uid}`, 'true');
        return true;
    },

    /**
     * BUSCA NO BDA
     */
    async buscarAgendamentos(setorId) {
        if (!setorId) return [];
        console.log(`📡 [Mock BDA] Consultando carga de trabalho: ${setorId}`);
        await new Promise(resolve => setTimeout(resolve, 1200));
        return this._mockBDA[setorId] || [];
    },

    /**
     * FLUXO INTEGRADO
     */
    async demonstrarFluxoLogistico(identificador) {
        try {
            const dadosOperador = await this.autenticarNoNPF(identificador);
            
            if (dadosOperador.precisaAceitarCompliance) {
                document.getElementById('compliance-modal')?.classList.remove('hidden');
                return { operacao: "PENDING_COMPLIANCE" };
            }

            const cargaTrabalho = await this.buscarAgendamentos(dadosOperador.setorId);
            
            return {
                operador: dadosOperador,
                pauta: cargaTrabalho,
                status: "OPERACIONAL"
            };
        } catch (error) {
            console.error("❌ Erro no fluxo:", error);
            return null;
        }
    },

    _toggleLoading(show, message = "") {
        const loader = document.getElementById('loading-container');
        if (loader) show ? loader.classList.remove('hidden') : loader.classList.add('hidden');
    }
};

window.ApiIntegration = ApiIntegration;