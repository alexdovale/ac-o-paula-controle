// js/coletasBuilderService.js - Módulo de Construção de Coletas Dinâmicas
import { collection, doc, updateDoc, addDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification, escapeHTML } from './utils.js';

export const ColetasBuilderService = {
    
    // Gera a interface do construtor dentro do SIGEP
    renderConstrutorHTML(coletaData) {
        const campos = coletaData.dicionarioDeCampos || [];
        const links = coletaData.linksExternos || [];

        // Gera os checkboxes para a criação de um novo link
        const opcoesCamposHtml = campos.map(c => `
            <label class="flex items-center gap-2 text-sm text-slate-700 bg-white p-2 border rounded-lg cursor-pointer hover:bg-slate-50">
                <input type="checkbox" name="campos_link" value="${c.id}" class="h-4 w-4 text-indigo-600 rounded">
                ${escapeHTML(c.label)} <span class="text-[10px] text-slate-400">(${c.tipo})</span>
            </label>
        `).join('');

        return `
            <div class="space-y-6 max-w-5xl mx-auto">
                
                <!-- DICIONÁRIO GLOBAL DE CAMPOS -->
                <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h3 class="text-lg font-black text-slate-800 border-b pb-2 mb-4">📚 Dicionário Global de Campos</h3>
                    
                    <div id="lista-campos-dicionario" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                        ${campos.length === 0 ? '<p class="text-sm text-slate-400">Nenhum campo cadastrado na matriz.</p>' : 
                            campos.map(c => `
                                <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl flex justify-between items-center">
                                    <div>
                                        <p class="font-bold text-slate-700 text-sm">${escapeHTML(c.label)}</p>
                                        <p class="text-[10px] text-slate-500 uppercase tracking-widest">${c.tipo}</p>
                                    </div>
                                </div>
                            `).join('')}
                    </div>

                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <h4 class="text-xs font-bold text-slate-600 uppercase mb-3">Adicionar Novo Campo à Matriz</h4>
                        <div class="flex flex-col sm:flex-row gap-3">
                            <input type="text" id="novo-campo-label" placeholder="Nome da Pergunta/Campo" class="flex-1 p-2.5 border border-slate-300 rounded-xl text-sm">
                            <select id="novo-campo-tipo" class="w-full sm:w-48 p-2.5 border border-slate-300 rounded-xl text-sm bg-white">
                                <option value="numero">Número</option>
                                <option value="texto">Texto</option>
                                <option value="booleano">Sim / Não</option>
                            </select>
                            <button type="button" id="btn-add-campo" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition">Adicionar</button>
                        </div>
                    </div>
                </div>

                <!-- GERADOR DE LINKS MODULARES -->
                <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h3 class="text-lg font-black text-slate-800 border-b pb-2 mb-4">🔗 Links de Coleta Externos</h3>
                    
                    <div class="space-y-3 mb-6">
                        ${links.length === 0 ? '<p class="text-sm text-slate-400">Nenhum link gerado.</p>' : 
                            links.map(l => `
                                <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex flex-col sm:flex-row justify-between gap-3">
                                    <div>
                                        <p class="font-bold text-indigo-900 text-sm">📍 ${escapeHTML(l.orgao)}</p>
                                        <p class="text-[10px] text-indigo-600 mt-1">
                                            🔒 ${l.requerSenha ? 'Exige Senha' : 'Acesso Livre'} | 📝 ${l.camposHabilitados.length} campos liberados
                                        </p>
                                    </div>
                                    <button type="button" onclick="ColetasBuilderService.copiarLink('${l.token}')" class="bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-xl text-xs transition">Copiar Link</button>
                                </div>
                            `).join('')}
                    </div>

                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                        <h4 class="text-xs font-bold text-slate-600 uppercase mb-2">Gerar Novo Link Personalizado</h4>
                        
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">Nome do Órgão / Destinatário</label>
                            <input type="text" id="novo-link-orgao" placeholder="Ex: Vara de Família - Comarca X" class="w-full p-2.5 border border-slate-300 rounded-xl text-sm">
                        </div>

                        <div class="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" id="novo-link-requer-senha" checked class="h-4 w-4 text-indigo-600 rounded">
                                <span class="text-sm font-bold text-slate-700">Exigir Senha de Acesso</span>
                            </label>
                            <input type="password" id="novo-link-senha" placeholder="Defina a senha" class="flex-1 p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-2">Selecione quais campos este órgão deverá preencher:</label>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                ${opcoesCamposHtml}
                            </div>
                        </div>

                        <button type="button" id="btn-gerar-link" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm shadow transition">Gerar Link Específico</button>
                    </div>
                </div>
            </div>
        `;
    },

    initEventos(db, coletaId, coletaData) {
        // Toggle do campo de senha
        const checkRequerSenha = document.getElementById('novo-link-requer-senha');
        const inputSenha = document.getElementById('novo-link-senha');
        
        if (checkRequerSenha && inputSenha) {
            checkRequerSenha.addEventListener('change', (e) => {
                inputSenha.disabled = !e.target.checked;
                inputSenha.classList.toggle('bg-slate-100', !e.target.checked);
                if (!e.target.checked) inputSenha.value = '';
            });
        }

        // Adicionar Campo ao Dicionário
        document.getElementById('btn-add-campo')?.addEventListener('click', async () => {
            const label = document.getElementById('novo-campo-label').value.trim();
            const tipo = document.getElementById('novo-campo-tipo').value;
            
            if (!label) return showNotification("Informe o nome do campo.", "error");

            const novoCampo = {
                id: 'c_' + Math.random().toString(36).substring(2, 8),
                label,
                tipo
            };

            const camposAtuais = coletaData.dicionarioDeCampos || [];
            camposAtuais.push(novoCampo);

            await updateDoc(doc(db, "formularios_coleta", coletaId), { dicionarioDeCampos: camposAtuais });
            window.location.reload();
        });

        // Gerar Link Personalizado
        document.getElementById('btn-gerar-link')?.addEventListener('click', async () => {
            const orgao = document.getElementById('novo-link-orgao').value.trim();
            const requerSenha = document.getElementById('novo-link-requer-senha').checked;
            const senha = document.getElementById('novo-link-senha').value.trim();
            
            const checkboxes = document.querySelectorAll('input[name="campos_link"]:checked');
            const camposHabilitados = Array.from(checkboxes).map(cb => cb.value);

            if (!orgao) return showNotification("Informe o nome do órgão.", "error");
            if (requerSenha && !senha) return showNotification("Defina uma senha para o link.", "error");
            if (camposHabilitados.length === 0) return showNotification("Selecione pelo menos um campo para este link.", "error");

            const token = Math.random().toString(36).substring(2, 12);
            
            const novoLink = {
                orgao,
                token,
                requerSenha,
                senha: requerSenha ? senha : null,
                camposHabilitados
            };

            const linksAtuais = coletaData.linksExternos || [];
            linksAtuais.push(novoLink);

            await updateDoc(doc(db, "formularios_coleta", coletaId), { linksExternos: linksAtuais });
            window.location.reload();
        });
    },

    copiarLink(token) {
        let baseUrl = window.location.href.split('?')[0].replace('index.html', '');
        const link = `${baseUrl}coleta.html?token=${token}`;
        navigator.clipboard.writeText(link).then(() => {
            showNotification("Link copiado!", "success");
        });
    }
};

window.ColetasBuilderService = ColetasBuilderService;
