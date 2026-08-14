// js/coletasBuilderService.js - Construtor de Formulários Avançado
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, escapeHTML } from './utils.js';

export const ColetasBuilderService = {
    
    renderConstrutorHTML(coletaData) {
        const campos = coletaData.dicionarioDeCampos || [];
        const links = coletaData.linksExternos || [];

        const opcoesCamposHtml = campos.map(c => `
            <label class="flex items-center gap-2 text-sm text-slate-700 bg-white p-2 border rounded-lg cursor-pointer hover:bg-slate-50 transition">
                <input type="checkbox" name="campos_link" value="${c.id}" class="h-4 w-4 text-indigo-600 rounded">
                <span class="truncate" title="${escapeHTML(c.label)}">${escapeHTML(c.label)}</span>
            </label>
        `).join('');

        return `
            <div class="space-y-8 animate-fade-in">
                <!-- CABEÇALHO DO CONSTRUTOR -->
                <div>
                    <h3 class="text-xl font-black text-slate-800 uppercase tracking-widest text-center">Configuração: ${escapeHTML(coletaData.nomeDaColeta)}</h3>
                </div>

                <!-- BLOCO 1: DICIONÁRIO DE CAMPOS -->
                <div class="bg-white border-2 border-indigo-100 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
                    <h3 class="text-lg font-black text-slate-800 border-b border-slate-100 pb-3 mb-5">1. Estrutura do Formulário (Perguntas)</h3>
                    
                    <div id="lista-campos-dicionario" class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6 max-h-64 overflow-y-auto pr-2">
                        ${campos.length === 0 ? '<p class="text-sm text-slate-400 italic w-full">Nenhuma pergunta adicionada.</p>' : 
                            campos.map(c => `
                                <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                                    <p class="font-bold text-slate-700 text-sm truncate" title="${escapeHTML(c.label)}">${escapeHTML(c.label)}</p>
                                    <p class="text-[10px] font-bold text-indigo-500 uppercase mt-1">📝 ${c.tipo.replace('_', ' ')}</p>
                                </div>
                            `).join('')}
                    </div>

                    <div class="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                        <h4 class="text-sm font-bold text-indigo-900 mb-3">Adicionar Nova Pergunta</h4>
                        <div class="flex flex-col gap-3">
                            <input type="text" id="novo-campo-label" placeholder="Digite a pergunta (Ex: Qual sua idade?)" class="p-3 border border-indigo-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                            
                            <div class="flex flex-col sm:flex-row gap-3">
                                <select id="novo-campo-tipo" class="w-full sm:w-1/2 p-3 border border-indigo-200 rounded-xl text-sm bg-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                                    <option value="texto_curto">Texto Curto (1 linha)</option>
                                    <option value="texto_longo">Parágrafo (Várias linhas)</option>
                                    <option value="numero">Número Estatístico</option>
                                    <option value="data">Data</option>
                                    <option value="booleano">Sim / Não</option>
                                    <option value="selecao">Lista Suspensa (Dropdown)</option>
                                    <option value="multipla_escolha">Múltipla Escolha (Bolhinhas)</option>
                                </select>
                                <button type="button" id="btn-add-campo" class="w-full sm:w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl text-sm transition shadow-md">+ Salvar Pergunta</button>
                            </div>

                            <div id="container-opcoes-extras" class="hidden mt-2">
                                <label class="block text-xs font-bold text-indigo-700 mb-1">Digite as opções separadas por vírgula (,)</label>
                                <input type="text" id="novo-campo-opcoes" placeholder="Ex: Maçã, Banana, Laranja" class="w-full p-3 border border-indigo-200 rounded-xl text-sm">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- BLOCO 2: GERAÇÃO DE LINKS -->
                <div class="bg-white border-2 border-emerald-100 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
                    <h3 class="text-lg font-black text-slate-800 border-b border-slate-100 pb-3 mb-5">2. Links de Distribuição (Órgãos/Parceiros)</h3>
                    
                    <div class="space-y-3 mb-6 max-h-64 overflow-y-auto pr-2">
                        ${links.length === 0 ? '<p class="text-sm text-slate-400 italic">Nenhum link gerado.</p>' : 
                            links.map(l => `
                                <div class="bg-white border border-emerald-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm hover:shadow-md transition">
                                    <div class="w-full">
                                        <p class="font-black text-emerald-900 text-sm uppercase">📍 ${escapeHTML(l.orgao)}</p>
                                        <p class="text-[11px] text-slate-500 font-medium mt-1">
                                            ${l.requerSenha ? '🔒 Requer Senha' : '🔓 Acesso Aberto'} | 📋 ${l.camposHabilitados.length} perguntas liberadas
                                        </p>
                                    </div>
                                    <button type="button" onclick="ColetasBuilderService.copiarLink('${l.token}')" class="w-full sm:w-auto bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-5 py-2.5 rounded-xl text-xs transition border border-emerald-300 whitespace-nowrap">📋 Copiar Link</button>
                                </div>
                            `).join('')}
                    </div>

                    <div class="bg-emerald-50 p-5 rounded-xl border border-emerald-100 space-y-4">
                        <h4 class="text-sm font-bold text-emerald-900">Gerar Novo Link</h4>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-slate-600 mb-1">Destinatário (Órgão/Pessoa)</label>
                                <input type="text" id="novo-link-orgao" placeholder="Ex: Cartório do 1º Ofício" class="w-full p-3 border border-emerald-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <label class="text-xs font-bold text-slate-600">Senha de Acesso</label>
                                    <label class="flex items-center gap-1 cursor-pointer text-[10px] text-slate-500">
                                        <input type="checkbox" id="novo-link-requer-senha" checked class="rounded"> Exigir
                                    </label>
                                </div>
                                <input type="password" id="novo-link-senha" placeholder="Digite uma senha" class="w-full p-3 border border-emerald-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-xl border border-emerald-200">
                            <label class="block text-xs font-bold text-emerald-800 uppercase mb-3">Selecione o que eles vão preencher:</label>
                            ${campos.length === 0 ? '<p class="text-xs text-red-500">Adicione perguntas no Bloco 1 primeiro.</p>' : `
                                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    ${opcoesCamposHtml}
                                </div>
                            `}
                        </div>

                        <button type="button" id="btn-gerar-link" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition uppercase tracking-wide">Gerar Link Seguro</button>
                    </div>
                </div>
            </div>
        `;
    },

    initEventos(db, coletaId, coletaData) {
        // Lógica de Mostrar/Esconder campo de opções (Para Listas e Múltipla Escolha)
        const selectTipo = document.getElementById('novo-campo-tipo');
        const containerOpcoes = document.getElementById('container-opcoes-extras');
        if (selectTipo && containerOpcoes) {
            selectTipo.addEventListener('change', (e) => {
                if (e.target.value === 'selecao' || e.target.value === 'multipla_escolha') {
                    containerOpcoes.classList.remove('hidden');
                } else {
                    containerOpcoes.classList.add('hidden');
                }
            });
        }

        // Lógica de Exigir Senha
        const checkRequerSenha = document.getElementById('novo-link-requer-senha');
        const inputSenha = document.getElementById('novo-link-senha');
        if (checkRequerSenha && inputSenha) {
            checkRequerSenha.addEventListener('change', (e) => {
                inputSenha.disabled = !e.target.checked;
                inputSenha.classList.toggle('bg-slate-100', !e.target.checked);
                if (!e.target.checked) inputSenha.value = '';
            });
        }

        // SALVAR NOVA PERGUNTA NO BANCO
        document.getElementById('btn-add-campo')?.addEventListener('click', async () => {
            const label = document.getElementById('novo-campo-label').value.trim();
            const tipo = document.getElementById('novo-campo-tipo').value;
            const opcoesSting = document.getElementById('novo-campo-opcoes').value;
            
            if (!label) return showNotification("Digite a pergunta.", "error");

            const novoCampo = {
                id: 'c_' + Math.random().toString(36).substring(2, 8),
                label,
                tipo
            };

            // Se for lista, pega as opções e quebra por vírgula
            if (tipo === 'selecao' || tipo === 'multipla_escolha') {
                if (!opcoesSting) return showNotification("Preencha as opções do campo.", "warning");
                novoCampo.opcoes = opcoesSting.split(',').map(o => o.trim()).filter(o => o !== '');
            }

            const btn = document.getElementById('btn-add-campo');
            btn.textContent = "Salvando...";

            const camposAtuais = coletaData.dicionarioDeCampos || [];
            camposAtuais.push(novoCampo);

            await updateDoc(doc(db, "formularios_coleta", coletaId), { dicionarioDeCampos: camposAtuais });
            showNotification("Pergunta salva!", "success");
            
            // Recarrega a view do construtor simulando um f5 na div
            window.abrirConstrutor(coletaId); 
        });

        // GERAR NOVO LINK DE DISTRIBUIÇÃO
        document.getElementById('btn-gerar-link')?.addEventListener('click', async () => {
            const orgao = document.getElementById('novo-link-orgao').value.trim();
            const requerSenha = document.getElementById('novo-link-requer-senha').checked;
            const senha = document.getElementById('novo-link-senha').value.trim();
            
            const checkboxes = document.querySelectorAll('input[name="campos_link"]:checked');
            const camposHabilitados = Array.from(checkboxes).map(cb => cb.value);

            if (!orgao) return showNotification("Informe o nome do destinatário.", "error");
            if (requerSenha && !senha) return showNotification("Defina uma senha para o link.", "error");
            if (camposHabilitados.length === 0) return showNotification("Selecione pelo menos uma pergunta para enviar.", "error");

            const btn = document.getElementById('btn-gerar-link');
            btn.textContent = "Gerando...";

            const token = Math.random().toString(36).substring(2, 12);
            const novoLink = {
                orgao, token, requerSenha,
                senha: requerSenha ? senha : null,
                camposHabilitados
            };

            const linksAtuais = coletaData.linksExternos || [];
            linksAtuais.push(novoLink);

            await updateDoc(doc(db, "formularios_coleta", coletaId), { linksExternos: linksAtuais });
            showNotification("Link Gerado!", "success");
            window.abrirConstrutor(coletaId);
        });
    },

    copiarLink(token) {
        let baseUrl = window.location.href.split('?')[0].replace('index.html', '');
        const link = `${baseUrl}coleta.html?token=${token}`;
        navigator.clipboard.writeText(link).then(() => {
            showNotification("Link copiado! Você já pode enviá-old.", "info");
        });
    }
};

window.ColetasBuilderService = ColetasBuilderService;
