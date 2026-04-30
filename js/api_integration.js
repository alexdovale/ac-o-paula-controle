// js/api_integration.js

/**
 * SIGAP - Módulo de Integração (API & Mocks)
 * Este arquivo deve ser carregado no index.html ANTES do script principal.
 */

// ⭐ IMPORTAÇÃO ESTÁTICA DO PautaService ⭐
// Garante que PautaService esteja disponível quando ApiIntegration for carregado.
// Use o cache buster se ainda houver problemas com cache.
import { PautaService } from './pauta.js?v=202604262100'; // <<--- ADICIONADA AQUI

const ApiIntegration = {
    // Simulação de URL da Defensoria
    API_BASE_URL: 'https://api.defensoria.rj.gov.br/v1',

    /**
     * BUSCA DADOS OFICIAIS (Mock para demonstração)
     * Usado no ato de criar a pauta no index.html
     */
    async buscarDadosPautaOficial(orgaoId) {
        if (!orgaoId) return [];

        console.log(`📡 [Mock] Conectando ao Webservice do Órgão: ${orgaoId}`);
        
        // Simula o delay da rede da Defensoria (1.5 segundos)
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Dados baseados no órgão selecionado para dar realismo
        const bancosDeDadosFake = {
            "123": [
                { name: "MARIA DA SILVA (CAXIAS CÍVEL)", scheduledTime: "09:00", subject: "AÇÃO INDENIZATÓRIA", cpf: "123.***.***-00" },
                { name: "JOÃO DOS SANTOS (CAXIAS CÍVEL)", scheduledTime: "10:00", subject: "REINTEGRAÇÃO", cpf: "444.***.***-11" }
            ],
            "456": [
                { name: "ANA PAULA (CAXIAS FAMÍLIA)", scheduledTime: "09:00", subject: "DIVÓRCIO CONSENSUAL", cpf: "777.***.***-22" },
                { name: "ROBERTO LIMA (CAXIAS FAMÍLIA)", scheduledTime: "09:30", subject: "ALIMENTOS", cpf: "888.***.***-33" }
            ],
            "789": [
                { name: "ANA SOUZA (BELFORD ROXO)", scheduledTime: "10:00", subject: "CURATELA", cpf: "789.***.***-22" }
            ]
        };

        return bancosDeDadosFake[orgaoId] || [];
    },

    /**
     * SINCRONIZAÇÃO MANUAL (Botão "Sincronizar Verde" na pauta aberta)
     */
    async simularSincronizacaoVerde(appInstance) {
        if (!appInstance || !appInstance.currentPauta) {
            alert("Abra uma pauta primeiro para sincronizar.");
            return;
        }

        this._toggleLoading(true, "Conectando ao WebService da Defensoria...");

        try {
            // Simula latência
            await new Promise(resolve => setTimeout(resolve, 2000));

            const pautaFake = [
                { name: "MARIA DA SILVA (SYNC VERDE)", scheduledTime: "11:30", subject: "FAMÍLIA > DIVÓRCIO", cpf: "123.***.***-00", externalId: "EXT-991" },
                { name: "JOÃO PEDRO (SYNC VERDE)", scheduledTime: "11:45", subject: "CÍVEL > ALIMENTOS", cpf: "456.***.***-11", externalId: "EXT-992" }
            ];

            // Acessa o PautaService que foi exportado no pauta.js
            // Como usamos import estático, PautaService já deve estar acessível.
            // Não precisamos mais do `await import('./pauta.js');` aqui.
            // Se houver problemas com o cache, você pode adicionar o cache buster no import estático também.

            for (const assistido of pautaFake) {
                // Chama o método addAssistedManual que já existe no PautaService
                await PautaService.addAssistedManual(appInstance, {
                    ...assistido,
                    status: 'pauta'
                });
            }

            if (window.showNotification) {
                showNotification("Sincronização concluída com sucesso!", "success");
                playSound('success'); // Adicionado som para feedback
            }
        } catch (error) {
            console.error("❌ Erro na integração:", error);
            showNotification("Erro durante a sincronização.", "error");
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

// Torna o objeto global para ser achado pelo index.html e botões onclick
window.ApiIntegration = ApiIntegration;
