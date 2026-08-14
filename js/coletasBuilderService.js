// js/coletasBuilderService.js - Construtor Avançado: Edição, Tipos, Opções, Reordenação e Integração Sheets
import { doc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, escapeHTML } from './utils.js';

export const ColetasBuilderService = {
    
    renderConstrutorHTML(coletaData, coletaId) {
        const campos = coletaData.dicionarioDeCampos || [];
        const links = coletaData.linksExternos || [];
        const formatoNumeracao = coletaData.formatoNumeracao || 'numero';
        const urlSheets = coletaData.urlSincronizacaoSheets || '';

        const opcoesCamposHtml = campos.map((c, index) => `
            <label class="flex items-center gap-2 text-sm text-slate-700 bg-white p-2 border rounded-lg cursor-pointer hover:bg-slate-50 transition">
                <input type="checkbox" name="campos_link" value="${c.id}" class="h-4 w-4 text-indigo-600 rounded">
                <span class="truncate" title="${escapeHTML(c.label)}">${this.formatarPrefixo(index + 1, formatoNumeracao)} ${escapeHTML(c.label)}</span>
            </label>
        `).join('');

        return `
            <div class="space-y-8 animate-fade-in pb-10">
                <!-- CABEÇALHO -->
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-indigo-50 p-4 rounded-2xl border border-indigo-100 gap-4">
                    <div>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Editando Coleta:</span>
                        <h3 class="text-lg font-black text-indigo-900">${escapeHTML(coletaData.nomeDaColeta)}</h3>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" onclick="ColetasBuilderService.limparRespostas('${coletaId}')" class="bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-4 py-2 rounded-xl text-xs transition border border-amber-200 shadow-sm">🧹 Limpar Respostas (Zerar BI)</button>
                        <button type="button" onclick="ColetasBuilderService.apagarColeta('${coletaId}')" class="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-4 py-2 rounded-xl text-xs transition border border-red-200 shadow-sm">🗑️ Excluir Coleta</button>
                    </div>
                </div>

                <!-- BLOCO 1: PERGUNTAS -->
                <div class="bg-white border-2 border-indigo-100 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
                    
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-150 pb-3 mb-5 gap-3">
                        <div class="flex items-center gap-3">
                            <h3 class="text-lg font-black text-slate-800">1. Estrutura do Formulário (Perguntas)</h3>
                            <select id="select-formato-num" onchange="ColetasBuilderService.mudarFormatoNum('${coletaId}', this.value)" class="text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer">
                                <option value="numero" ${formatoNumeracao === 'numero' ? 'selected' : ''}>Numeração: 1, 2, 3...</option>
                                <option value="romano" ${formatoNumeracao === 'romano' ? 'selected' : ''}>Numeração: I, II, III...</option>
                                <option value="letra" ${formatoNumeracao === 'letra' ? 'selected' : ''}>Numeração: A, B, C...</option>
                            </select>
                        </div>
                        <div class="flex gap-2">
                            <button type="button" onclick="ColetasBuilderService.importarJsonLivre('${coletaId}', ${JSON.stringify(coletaData).replace(/"/g, '&quot;')})" class="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold px-3 py-1.5 rounded-lg border border-indigo-200 transition">📥 Importar JSON</button>
                            ${campos.length > 0 ? `<button type="button" onclick="ColetasBuilderService.apagarTodasPerguntas('${coletaId}')" class="text-xs text-red-600 font-bold hover:underline self-center">Apagar Tudo</button>` : ''}
                        </div>
                    </div>
                    
                    <div id="lista-campos-dicionario" class="space-y-3 mb-6 max-h-80 overflow-y-auto pr-2">
                        ${campos.length === 0 ? '<p class="text-sm text-slate-400 italic w-full">Nenhuma pergunta adicionada.</p>' : 
                            campos.map((c, index) => {
                                // Mostra o tipo de forma legível
                                let tipoDisplay = c.tipo.replace('_', ' ');
                                if (c.tipo === 'numero_abrangente') tipoDisplay = 'Número Abrangente (Idade/Frequência)';
                                
                                return `
                                <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div class="flex items-center gap-3 w-full">
                                        <span class="font-black text-indigo-600 text-xs bg-indigo-50 px-2 py-1 rounded border border-indigo-100 shrink-0">${this.formatarPrefixo(index + 1, formatoNumeracao)}</span>
                                        <div class="w-full">
                                            <p class="font-bold text-slate-700 text-sm">${escapeHTML(c.label)}</p>
                                            <p class="text-[10px] font-bold text-slate-400 uppercase mt-0.5">📝 ${tipoDisplay} ${c.opcoes?.length ? `| 🏷️ Opções: [${c.opcoes.join(', ')}]` : ''}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                        ${index > 0 ? `<button type="button" onclick="ColetasBuilderService.moverCampo('${coletaId}', ${index}, ${index - 1})" class="bg-white hover:bg-slate-100 text-slate-600 border px-2 py-1 rounded text-xs" title="Subir">⬆️</button>` : ''}
                                        ${index < campos.length - 1 ? `<button type="button" onclick="ColetasBuilderService.moverCampo('${coletaId}', ${index}, ${index + 1})" class="bg-white hover:bg-slate-100 text-slate-600 border px-2 py-1 rounded text-xs" title="Descer">⬇️</button>` : ''}
                                        <button type="button" onclick="ColetasBuilderService.abrirModalEditarCampo('${coletaId}', ${index})" class="bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-1 rounded text-xs font-bold ml-1" title="Editar Pergunta">✏️ Editar</button>
                                        <button type="button" onclick="ColetasBuilderService.removerCampo('${coletaId}', ${index})" class="bg-white hover:bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded text-xs font-bold" title="Remover">✕</button>
                                    </div>
                                </div>
                            `}).join('')}
                    </div>

                    <!-- ADICIONAR NOVA PERGUNTA -->
                    <div class="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                        <h4 class="text-sm font-bold text-indigo-900 mb-3">Adicionar Nova Pergunta</h4>
                        <div class="flex flex-col gap-3">
                            <input type="text" id="novo-campo-label" placeholder="Digite a pergunta (Ex: Número de Atendimentos)" class="p-3 border border-indigo-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                            
                            <div class="flex flex-col sm:flex-row gap-3">
                                <select id="novo-campo-tipo" class="w-full sm:w-1/2 p-3 border border-indigo-200 rounded-xl text-sm bg-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                                    <option value="numero">Número Estatístico (Soma/Média)</option>
                                    <option value="numero_abrangente">🔢 Número Abrangente (Idade/Frequência)</option>
                                    <option value="texto_curto">Texto Curto (1 linha)</option>
                                    <option value="texto_longo">Parágrafo (Várias linhas)</option>
                                    <option value="data">Data</option>
                                    <option value="booleano">Sim / Não</option>
                                    <option value="selecao">Lista Suspensa (Dropdown)</option>
                                    <option value="multipla_escolha">Múltipla Escolha (Bolhinhas)</option>
                                </select>
                                <button type="button" id="btn-add-campo" class="w-full sm:w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl text-sm transition shadow-md">+ Salvar Pergunta</button>
                            </div>

                            <div id="container-opcoes-extras" class="hidden mt-2">
                                <label class="block text-xs font-bold text-indigo-700 mb-1">Digite as opções separadas por vírgula (,)</label>
                                <input type="text" id="novo-campo-opcoes" placeholder="Ex: Fundamental, Médio, Superior" class="w-full p-3 border border-indigo-200 rounded-xl text-sm bg-white">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- BLOCO 2: GERAÇÃO DE LINKS -->
                <div class="bg-white border-2 border-emerald-100 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
                    <div class="flex justify-between items-center border-b border-slate-150 pb-3 mb-5">
                        <h3 class="text-lg font-black text-slate-800">2. Links de Distribuição (Órgãos/Parceiros)</h3>
                        ${links.length > 0 ? `
                            <button type="button" onclick="ColetasBuilderService.apagarTodosLinks('${coletaId}')" class="text-xs text-red-600 font-bold hover:underline">Apagar Todos os Links</button>
                        ` : ''}
                    </div>
                    
                    <div class="space-y-3 mb-6 max-h-64 overflow-y-auto pr-2">
                        ${links.length === 0 ? '<p class="text-sm text-slate-400 italic">Nenhum link gerado.</p>' : 
                            links.map((l, index) => `
                                <div class="bg-white border border-emerald-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm hover:shadow-md transition">
                                    <div class="w-full truncate">
                                        <p class="font-black text-emerald-900 text-sm uppercase">📍 ${escapeHTML(l.orgao)}</p>
                                        <p class="text-[11px] text-slate-500 font-medium mt-1">
                                            ${l.requerSenha ? '🔒 Requer Senha' : '🔓 Acesso Aberto'} | 📋 ${l.camposHabilitados.length} perguntas liberadas
                                        </p>
                                    </div>
                                    <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                                        <button type="button" onclick="ColetasBuilderService.copiarLink('${l.token}')" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-4 py-2.5 rounded-xl text-xs transition border border-emerald-300 whitespace-nowrap">📋 Copiar Link</button>
                                        <button type="button" onclick="ColetasBuilderService.removerLink('${coletaId}', ${index})" class="bg-red-50 hover:bg-red-100 text-red-600 font-bold p-2.5 rounded-xl text-xs transition border border-red-200" title="Apagar Link">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                    </div>

                    <div class="bg-emerald-50 p-5 rounded-xl border border-emerald-100 space-y-4">
                        <h4 class="text-sm font-bold text-emerald-900">Gerar Novo Link</h4>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-slate-600 mb-1">Destinatário (Órgão/Pessoa)</label>
                                <input type="text" id="novo-link-orgao" placeholder="Ex: Cartório do 1º Ofício" class="w-full p-3 border border-emerald-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <label class="text-xs font-bold text-slate-600">Senha de Acesso</label>
                                    <label class="flex items-center gap-1 cursor-pointer text-[10px] text-slate-500">
                                        <input type="checkbox" id="novo-link-requer-senha" checked class="rounded"> Exigir
                                    </label>
                                </div>
                                <input type="password" id="novo-link-senha" placeholder="Digite uma senha" class="w-full p-3 border border-emerald-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
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

                <!-- BLOCO 3: INTEGRAÇÃO GOOGLE SHEETS / LOOKER STUDIO -->
                <div class="bg-white border-2 border-blue-100 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                    <h3 class="text-lg font-black text-slate-800 border-b border-slate-100 pb-3 mb-5">3. Sincronização Automática (Google Sheets / Looker Studio)</h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-600 mb-1">URL do Web App (Google Apps Script):</label>
                            <input type="text" id="input-url-sheets" 
                                   value="${escapeHTML(urlSheets)}" 
                                   placeholder="Cole aqui a URL do seu script de integração..." 
                                   class="w-full p-3 border border-blue-200 rounded-xl text-sm outline-none bg-blue-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition">
                        </div>
                        
                        <button type="button" 
                                onclick="ColetasBuilderService.atualizarConfigIntegracao('${coletaId}', document.getElementById('input-url-sheets').value)" 
                                class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-md transition flex items-center gap-2">
                            💾 Salvar URL de Sincronização
                        </button>
                        <p class="text-[11px] text-slate-400 mt-1">
                            Ao colar e salvar a URL do Web App aqui, todas as submissões realizadas via link externo serão espelhadas automaticamente para a sua planilha do Google.
                        </p>
                    </div>
                </div>
            </div>
        `;
    },

    formatarPrefixo(num, tipo) {
        if (tipo === 'romano') {
            const romanos = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
            return romanos[num] || num + '.';
        }
        if (tipo === 'letra') {
            const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            return (letras[num - 1] || num) + ')';
        }
        return num + '.';
    },

    initEventos(db, coletaId, coletaData) {
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

        const checkRequerSenha = document.getElementById('novo-link-requer-senha');
        const inputSenha = document.getElementById('novo-link-senha');
        if (checkRequerSenha && inputSenha) {
            checkRequerSenha.addEventListener('change', (e) => {
                inputSenha.disabled = !e.target.checked;
                inputSenha.classList.toggle('bg-slate-100', !e.target.checked);
                if (!e.target.checked) inputSenha.value = '';
            });
        }

        document.getElementById('btn-add-campo')?.addEventListener('click', async () => {
            const label = document.getElementById('novo-campo-label').value.trim();
            const tipo = document.getElementById('novo-campo-tipo').value;
            const opcoesString = document.getElementById('novo-campo-opcoes')?.value;
            
            if (!label) return showNotification("Digite a pergunta.", "error");

            const novoCampo = {
                id: 'c_' + Math.random().toString(36).substring(2, 8),
                label,
                tipo
            };

            if (tipo === 'selecao' || tipo === 'multipla_escolha') {
                if (!opcoesString) return showNotification("Preencha as opções do campo separadas por vírgula.", "warning");
                novoCampo.opcoes = opcoesString.split(',').map(o => o.trim()).filter(o => o !== '');
            }

            const camposAtuais = coletaData.dicionarioDeCampos || [];
            camposAtuais.push(novoCampo);

            await updateDoc(doc(db, "formularios_coleta", coletaId), { dicionarioDeCampos: camposAtuais });
            showNotification("Pergunta salva!", "success");
            window.abrirConstrutor(coletaId); 
        });

        document.getElementById('btn-gerar-link')?.addEventListener('click', async () => {
            const orgao = document.getElementById('novo-link-orgao').value.trim();
            const requerSenha = document.getElementById('novo-link-requer-senha').checked;
            const senha = document.getElementById('novo-link-senha').value.trim();
            
            const checkboxes = document.querySelectorAll('input[name="campos_link"]:checked');
            const camposHabilitados = Array.from(checkboxes).map(cb => cb.value);

            if (!orgao) return showNotification("Informe o nome do destinatário.", "error");
            if (requerSenha && !senha) return showNotification("Defina uma senha para o link.", "error");
            if (camposHabilitados.length === 0) return showNotification("Selecione pelo menos uma pergunta para enviar.", "error");

            const token = Math.random().toString(36).substring(2, 12);
            const novoLink = {
                orgao, token, requerSenha,
                senha: requerSenha ? senha : null,
                camposHabilitados
            };

            const linksAtuais = coletaData.linksExternos || [];
            linksAtuais.push(novoLink);

            await updateDoc(doc(db, "formularios_coleta", coletaId), { linksExternos: linksAtuais });
            showNotification("Link Gerado com Sucesso!", "success");
            window.abrirConstrutor(coletaId);
        });
    },

    async atualizarConfigIntegracao(coletaId, urlPlanilha) {
        try {
            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { 
                urlSincronizacaoSheets: urlPlanilha.trim() 
            });
            showNotification("URL de sincronização salva com sucesso!", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao salvar URL de integração.", "error");
        }
    },

    async mudarFormatoNum(coletaId, novoFormato) {
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            await updateDoc(docRef, { formatoNumeracao: novoFormato });
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
        }
    },

    async moverCampo(coletaId, indexOrigem, indexDestino) {
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const freshSnap = await getDoc(docRef);
            if (!freshSnap.exists()) return;

            let campos = freshSnap.data().dicionarioDeCampos || [];
            const [removido] = campos.splice(indexOrigem, 1);
            campos.splice(indexDestino, 0, removido);

            await updateDoc(docRef, { dicionarioDeCampos: campos });
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao reordenar.", "error");
        }
    },

    async abrirModalEditarCampo(coletaId, index) {
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const freshSnap = await getDoc(docRef);
            if (!freshSnap.exists()) return;

            let campos = freshSnap.data().dicionarioDeCampos || [];
            const campo = campos[index];
            if (!campo) return;

            const novoLabel = prompt("Editar Enunciado da Pergunta:", campo.label);
            if (novoLabel === null) return;
            const labelLimpo = novoLabel.trim();
            if (!labelLimpo) return showNotification("O enunciado não pode ficar vazio.", "error");

            const tiposValidos = "numero, numero_abrangente, texto_curto, texto_longo, data, booleano, selecao, multipla_escolha";
            const novoTipo = prompt(`Editar Tipo da Pergunta:\n(Opções: ${tiposValidos})`, campo.tipo);
            if (novoTipo === null) return;
            const tipoLimpo = novoTipo.trim();

            let novasOpcoes = campo.opcoes || [];
            if (tipoLimpo === 'selecao' || tipoLimpo === 'multipla_escolha') {
                const opcoesStr = prompt("Editar Opções (separadas por vírgula):", (campo.opcoes || []).join(', '));
                if (opcoesStr !== null) {
                    novasOpcoes = opcoesStr.split(',').map(o => o.trim()).filter(o => o !== '');
                }
            }

            campos[index] = {
                ...campo,
                label: labelLimpo,
                tipo: tipoLimpo,
                opcoes: novasOpcoes
            };

            await updateDoc(docRef, { dicionarioDeCampos: campos });
            showNotification("Pergunta atualizada com sucesso!", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao editar pergunta.", "error");
        }
    },

    async removerCampo(coletaId, index) {
        if (!confirm("Deseja realmente apagar esta pergunta?")) return;
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const freshSnap = await getDoc(docRef);
            if (!freshSnap.exists()) return;

            let campos = freshSnap.data().dicionarioDeCampos || [];
            campos.splice(index, 1);

            await updateDoc(docRef, { dicionarioDeCampos: campos });
            showNotification("Pergunta removida.", "info");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao remover pergunta.", "error");
        }
    },

    async apagarTodasPerguntas(coletaId) {
        if (!confirm("⚠️ Deseja apagar TODAS as perguntas deste formulário?")) return;
        try {
            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { dicionarioDeCampos: [] });
            showNotification("Todas as perguntas foram apagadas.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao apagar perguntas.", "error");
        }
    },

    async importarJsonLivre(coletaId, coletaData) {
        const jsonInput = prompt("Cole aqui o JSON estruturado com as perguntas:");
        if (!jsonInput) return;

        try {
            const novasPerguntas = JSON.parse(jsonInput);
            if (!Array.isArray(novasPerguntas)) {
                return showNotification("O formato do JSON deve ser uma lista [...]", "error");
            }

            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const camposAtuais = coletaData.dicionarioDeCampos || [];
            
            const formatadas = novasPerguntas.map(p => ({
                id: p.id || 'c_' + Math.random().toString(36).substring(2, 8),
                label: p.label || p.pergunta || 'Nova Pergunta',
                tipo: p.tipo || 'numero',
                opcoes: p.opcoes || []
            }));

            const listaFinal = [...camposAtuais, ...formatadas];
            await updateDoc(docRef, { dicionarioDeCampos: listaFinal });
            showNotification(`${formatadas.length} perguntas importadas com sucesso!`, "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao interpretar o JSON. Verifique a sintaxe.", "error");
        }
    },

    async removerLink(coletaId, index) {
        if (!confirm("Deseja realmente apagar este link?")) return;
        try {
            const db = window.app.db;
            const docRef = doc(db, "formularios_coleta", coletaId);
            const freshSnap = await getDoc(docRef);
            if (!freshSnap.exists()) return;

            let links = freshSnap.data().linksExternos || [];
            links.splice(index, 1);

            await updateDoc(docRef, { linksExternos: links });
            showNotification("Link apagado.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao apagar link.", "error");
        }
    },

    async apagarTodosLinks(coletaId) {
        if (!confirm("⚠️ Deseja apagar TODOS os links gerados? Os órgãos perderão o acesso.")) return;
        try {
            const db = window.app.db;
            await updateDoc(doc(db, "formularios_coleta", coletaId), { linksExternos: [] });
            showNotification("Todos os links foram apagados.", "success");
            window.abrirConstrutor(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao apagar links.", "error");
        }
    },

    async limparRespostas(coletaId) {
        if (!confirm("⚠️ ATENÇÃO: Deseja apagar TODAS as respostas enviadas por todos os órgãos? O BI será zerado permanentemente!")) return;
        try {
            const db = window.app.db;
            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                showNotification("Não há respostas para apagar.", "info");
                return;
            }

            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            showNotification("Todas as respostas foram apagadas com sucesso!", "success");
            window.verResultados(coletaId);
        } catch (e) {
            console.error(e);
            showNotification("Erro ao limpar respostas.", "error");
        }
    },

    async apagarColeta(coletaId) {
        if (!confirm("⚠️ ATENÇÃO: Deseja apagar esta Coleta Estatística INTEIRA e todas as suas respostas?")) return;
        try {
            const db = window.app.db;
            const q = query(collection(db, "respostas_coleta"), where("coletaId", "==", coletaId));
            const snapRespostas = await getDocs(q);
            const batch = writeBatch(db);
            snapRespostas.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            await deleteDoc(doc(db, "formularios_coleta", coletaId));
            
            document.getElementById('container-construtor-coleta').classList.add('hidden');
            window.app.listarColetas();
            showNotification("Coleta excluída permanentemente.", "success");
        } catch (e) {
            console.error(e);
            showNotification("Erro ao excluir coleta.", "error");
        }
    },

    copiarLink(token) {
        let baseUrl = window.location.href.split('?')[0].replace('index.html', '');
        const link = `${baseUrl}coleta.html?token=${token}`;
        navigator.clipboard.writeText(link).then(() => {
            showNotification("Link copiado para a área de transferência!", "success");
        });
    }
};

window.ColetasBuilderService = ColetasBuilderService;
