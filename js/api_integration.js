/**
 * SIGAP - Módulo de Integração (API & Mocks)
 * Responsável por conectar o SIGAP aos sistemas Verde/Solar
 */

const ApiIntegration = {
    // URL base que será usada no futuro (exemplo)
    API_BASE_URL: 'https://api.defensoria.rj.gov.br/v1',

    /**
     * FUNÇÃO MOCK (PULO DO GATO)
     * Simula a conexão com o banco de dados da Defensoria
     */
    async simularSincronizacaoVerde(appInstance) {
        console.log("📡 [Mock] Iniciando conexão com WebService...");

        // 1. Feedback visual (Loading)
        this._toggleLoading(true, "Conectando ao WebService da Defensoria...");

        try {
            // 2. Simular latência de rede (2 segundos)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 3. Massa de dados simulada (O que viria do Verde)
            const pautaFake = [
                { nome: "MARIA DA SILVA (SIMULAÇÃO)", horario: "09:00", materia: "DIVÓRCIO", cpf: "123.***.***-00" },
                { nome: "JOÃO PEDRO (SIMULAÇÃO)", horario: "09:30", materia: "ALIMENTOS", cpf: "456.***.***-11" },
                { nome: "ANA SOUZA (SIMULAÇÃO)", horario: "10:00", materia: "CURATELA", cpf: "789.***.***-22" }
            ];

            // 4. Inserção no Firebase (usando a lógica do seu PautaService)
            // Assumindo que PautaService está disponível globalmente
            for (const assistido of pautaFake) {
                await PautaService.addAssistedManual(appInstance, {
                    name: assistido.nome,
                    scheduledTime: assistido.horario,
                    subject: assistido.materia,
                    cpf: assistido.cpf,
                    status: 'pauta'
                });
            }

            if (window.showNotification) {
                showNotification("Sincronização com Sistema Verde concluída!", "success");
            } else {
                alert("Sincronização com Sistema Verde concluída!");
            }

        } catch (error) {
            console.error("❌ Erro na integração:", error);
            alert("Erro ao sincronizar dados da rede interna.");
        } finally {
            this._toggleLoading(false);
        }
    },

    /**
     * Helper para controlar o loading na UI
     */
    _toggleLoading(show, message = "") {
        const loader = document.getElementById('loading-container');
        const text = document.getElementById('loading-text');
        
        if (loader) {
            show ? loader.classList.remove('hidden') : loader.classList.add('hidden');
        }
        if (text && show) {
            text.innerText = message;
        }
    }
};

// Exporta para uso global (caso não esteja usando módulos ES6 puros)
window.ApiIntegration = ApiIntegration;
