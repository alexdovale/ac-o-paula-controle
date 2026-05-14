import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); // <-- Precisamos do Auth aqui!

export const AtendimentoExternoService = {
    pautaId: null,
    assistidoId: null,
    colaboradorNome: null,
    fluxoSelecionado: null,

    async init() {
        console.log("⚡ Atendimento Externo inicializado (Com Auth Anônima)");

        // 1. Pega as informações e a senha (token) direto da URL do navegador
        const urlParams = new URLSearchParams(window.location.search);
        this.pautaId = urlParams.get('pautaId');
        this.assistidoId = urlParams.get('assistidoId');
        const tokenRecebido = urlParams.get('token');
        this.colaboradorNome = urlParams.get('colab') || "Colaborador";

        if (!this.pautaId || !this.assistidoId || !tokenRecebido) {
            this.showError("Link Incompleto", "O link acessado está faltando informações importantes.");
            return;
        }

        try {
            // LOGIN ANÔNIMO SILENCIOSO: Obrigatório para o Firebase não bloquear a leitura!
            await signInAnonymously(auth);

            // 2. Busca os dados do assistido no Firestore
            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                this.showError("Não encontrado", "Este assistido não existe mais na pauta.");
                return;
            }

            const assistido = docSnap.data();

            // 3. O PULO DO GATO: Validação de Segurança
            if (assistido.delegationToken !== tokenRecebido) {
                this.showError("Acesso Negado", "Token de segurança inválido ou expirado. O link pode ter sido alterado.");
                return;
            }

            // Evita que um link antigo seja reutilizado se já foi finalizado
            if (assistido.status === 'atendido' || assistido.status === 'aguardandoDistribuicao') {
                this.showError("Atendimento Concluído", "Este atendimento já foi finalizado anteriormente.");
                return;
            }

            // 4. Se passou na segurança, libera a interface!
            this.renderizarInterface(assistido);
            this.setupListeners();

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            // Agora o erro vai mostrar exatamente o que deu errado na tela
            this.showError("Erro no Servidor", `Falha de conexão ou permissão: ${error.message}`);
        }
    },

    renderizarInterface(assistido) {
        document.getElementById('assistido-nome').textContent = assistido.name || 'Nome não informado';
        document.getElementById('assistido-assunto').textContent = assistido.subject || 'Assunto não informado';
        
        // Exibe o painel do colaborador
        document.getElementById('area-colaborador').classList.remove('hidden');
        document.getElementById('btn-fluxo-dist').classList.remove('hidden'); 
    },

    setupListeners() {
        const btnDireto = document.getElementById('btn-fluxo-direto');
        const btnDist = document.getElementById('btn-fluxo-dist');
        const btnFinalizar = document.getElementById('btn-finalizar');

        if(btnDireto) btnDireto.onclick = () => this.selecionarFluxo('direto', btnDireto);
        if(btnDist) btnDist.onclick = () => this.selecionarFluxo('distribuicao', btnDist);

        if(btnFinalizar) {
            btnFinalizar.onclick = () => this.finalizarProcesso();
        }
    },

    selecionarFluxo(tipo, botaoClicado) {
        this.fluxoSelecionado = tipo;
        
        // Limpa os estilos dos botões
        const botoes = [document.getElementById('btn-fluxo-direto'), document.getElementById('btn-fluxo-dist')];
        botoes.forEach(b => {
            if(b) {
                b.classList.remove('ring-4', 'ring-blue-400', 'bg-blue-50');
                b.classList.add('border-gray-200');
            }
        });

        // Coloca destaque azul apenas no botão clicado
        botaoClicado.classList.remove('border-gray-200');
        botaoClicado.classList.add('ring-4', 'ring-blue-400', 'bg-blue-50');
    },

    async finalizarProcesso() {
        if (!this.fluxoSelecionado) {
            alert("Selecione como deseja finalizar (Finalizar Atendimento ou Distribuição).");
            return;
        }

        const btnFinalizar = document.getElementById('btn-finalizar');
        btnFinalizar.disabled = true;
        btnFinalizar.textContent = "Salvando...";

        try {
            const docRef = doc(db, "pautas", this.pautaId, "attendances", this.assistidoId);
            
            // Dados padrão que serão salvos de qualquer forma
            let updateData = {
                attendedAt: new Date().toISOString(),
                attendedTime: new Date().toISOString(),
                attendedBy: this.colaboradorNome,
                finalizadoPeloColaborador: true
            };

            // Regras específicas dependendo do botão que ele escolheu
            if (this.fluxoSelecionado === 'direto') {
                updateData.status = 'atendido';
                updateData.distributionStatus = 'completed';
            } else if (this.fluxoSelecionado === 'distribuicao') {
                updateData.status = 'aguardandoDistribuicao';
                updateData.distributionStatus = 'pending';
            }

            // Atualiza o Firestore
            await updateDoc(docRef, updateData);

            // Troca a tela inteira por uma mensagem de Sucesso Verde
            document.getElementById('area-colaborador').innerHTML = `
                <div class="text-center p-8 bg-green-50 rounded-xl border border-green-200 shadow-sm mt-8">
                    <span class="text-5xl">✅</span>
                    <h2 class="text-2xl font-bold text-green-800 mt-4">Atendimento Concluído!</h2>
                    <p class="text-green-600 mt-2 font-medium">Muito obrigado! Você já pode fechar esta aba.</p>
                </div>
            `;
            document.getElementById('header-bg').className = "bg-green-600 p-5 text-white";

        } catch (error) {
            console.error("Erro ao salvar no banco:", error);
            alert("Erro ao salvar os dados no servidor. Verifique a internet e tente novamente.");
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = "Tentar Novamente";
        }
    },

    showError(titulo, mensagem) {
        const corpo = document.querySelector('.w-full.max-w-2xl');
        if (corpo) {
            corpo.innerHTML = `
                <div class="bg-red-600 p-6 text-white text-center">
                    <span class="text-5xl">❌</span>
                    <h1 class="font-black text-2xl uppercase mt-4">ERRO!</h1>
                </div>
                <div class="p-8 text-center bg-white">
                    <h2 class="text-xl font-bold text-gray-800">${titulo}</h2>
                    <p class="text-gray-600 mt-4">${mensagem}</p>
                </div>
            `;
        }
    }
};
