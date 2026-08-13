// js/biEventosService.js - Módulo de Estatísticas e Coleta Externa Multi-eventos
import { doc, getDoc, updateDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, escapeHTML } from './utils.js';

export const BiEventosService = {

    // Gera o HTML do painel de configuração de links externos na pauta
    renderConfiguradorLinksHTML(pautaData = {}) {
        const parceiros = pautaData.parceirosExternos || [];
        
        return `
            <div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 mt-4">
                <h4 class="text-sm font-black text-slate-700 uppercase tracking-wider mb-2">🔗 Links Externos de Coleta (Órgãos / Parceiros)</h4>
                <p class="text-xs text-slate-500 mb-4">Gere links protegidos por senha para que órgãos externos ou colaboradores enviem dados estatísticos diretamente para esta pauta.</p>
                
                <div id="bi-lista-parceiros" class="space-y-3 mb-4">
                    ${parceiros.length === 0 ? '<p class="text-xs text-slate-400 italic">Nenhum link externo configurado ainda.</p>' : 
                        parceiros.map((p, idx) => `
                            <div class="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm">
                                <div>
                                    <p class="font-bold text-slate-800 text-sm">📍 ${escapeHTML(p.nome)}</p>
                                    <p class="text-[10px] text-slate-400 font-mono">Token: ${p.token} | Senha: ••••••</p>
                                </div>
                                <div class="flex gap-2 w-full sm:w-auto">
                                    <button type="button" onclick="BiEventosService.copiarLinkParceiro('${p.token}')" class="flex-1 sm:flex-none bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs">Copiar Link</button>
                                    <button type="button" onclick="BiEventosService.removerParceiro('${p.token}')" class="bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-1.5 rounded-lg text-xs">Remover</button>
                                </div>
                            </div>
                        `).join('')}
                </div>

                <div class="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <h5 class="text-xs font-bold text-slate-700 uppercase">Adicionar Novo Parceiro / Órgão</h5>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input type="text" id="bi-novo-parceiro-nome" placeholder="Nome do Órgão / Colaborador (Ex: Cartório 1º Ofício)" class="p-2.5 border border-slate-300 rounded-xl text-sm">
                        <input type="password" id="bi-novo-parceiro-senha" placeholder="Senha de Acesso Exclusiva" class="p-2.5 border border-slate-300 rounded-xl text-sm">
                    </div>
                    <button type="button" id="bi-btn-adicionar-parceiro" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow transition">+ Criar Link de Acesso</button>
                </div>
            </div>
        `;
    },

    // Salva um novo parceiro na pauta atual do Firestore
    async adicionarParceiro(db, pautaId, pautaData) {
        const nomeInput = document.getElementById('bi-novo-parceiro-nome');
        const senhaInput = document.getElementById('bi-novo-parceiro-senha');
        
        const nome = nomeInput?.value.trim();
        const senha = senhaInput?.value.trim();

        if (!nome || !senha) {
            showNotification("Preencha o nome do órgão e a senha de acesso.", "error");
            return;
        }

        const token = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
        const novoParceiro = { nome, senha, token };

        const parceirosAtuais = pautaData.parceirosExternos || [];
        parceirosAtuais.push(novoParceiro);

        try {
            await updateDoc(doc(db, "pautas", pautaId), { parceirosExternos: parceirosAtuais });
            showNotification("Link externo criado com sucesso!", "success");
            window.location.reload(); // Recarrega para atualizar a interface
        } catch (error) {
            console.error(error);
            showNotification("Erro ao salvar parceiro.", "error");
        }
    },

    async removerParceiro(db, pautaId, pautaData, tokenRemover) {
        if (!confirm("Deseja realmente desativar e remover este link externo?")) return;

        const parceirosAtuais = pautaData.parceirosExternos || [];
        const novosParceiros = parceirosAtuais.filter(p => p.token !== tokenRemover);

        try {
            await updateDoc(doc(db, "pautas", pautaId), { parceirosExternos: novosParceiros });
            showNotification("Link externo removido.", "info");
            window.location.reload();
        } catch (error) {
            showNotification("Erro ao remover link.", "error");
        }
    },

    copiarLinkParceiro(token) {
        let baseUrl = window.location.href.split('?')[0].replace('index.html', '');
        const link = `${baseUrl}coleta.html?token=${token}`;
        navigator.clipboard.writeText(link).then(() => {
            showNotification("Link de coleta copiado para a área de transferência! 📋", "success");
        });
    }
};

window.BiEventosService = BiEventosService;
