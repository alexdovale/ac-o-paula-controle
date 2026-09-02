import { 
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc, 
    query, orderBy, limit, where, writeBatch, setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

import { abrirGerenciarUnidades as abrirGerenciarUnidadesUsuario } from './gerenciarUnidadesUsuario.js';
import { renderEstruturaAtual } from './estruturaAtual.js';

let adminFilters = {
    usuarios: { page: 1, pageSize: 10, search: '' },
    pendentes: { page: 1, pageSize: 5, search: '' },
    logs: { page: 1, pageSize: 10, search: '' }
};

let cachedUsuarios = [];
let cachedPendentes = [];
let cachedLogs = [];
let globalApp = null;

export const logAction = async (db, auth, userName, currentPautaId, actionType, details, targetId = null) => {
    try {
        if (!auth?.currentUser) return;
        const logData = {
            action: actionType || 'ACAO_DESCONHECIDA',
            details: details || 'Sem detalhes',
            targetId: targetId || null,
            pautaId: currentPautaId || 'N/A',
            userEmail: auth.currentUser.email || 'email@desconhecido',
            userId: auth.currentUser.uid || 'uid_desconhecido',
            userName: userName || auth.currentUser.email || 'Desconhecido',
            orgaoId: globalApp?.currentUser?.orgaoId || 'padrao_dprj',
            timestamp: new Date().toISOString()
        };
        await addDoc(collection(db, "audit_logs"), logData);
    } catch (error) { 
        console.error("Erro ao registrar log:", error); 
    }
};

// ==========================================
// GESTAO DE UNIDADES
// ==========================================

export const carregarUnidades = async (db) => {
    try {
        const snapshot = await getDocs(collection(db, "unidades"));
        if (!snapshot.empty) {
            return snapshot.docs.filter(d => d.data().ativo !== false).map(doc => ({ id: doc.id, ...doc.data() }));
        }
        return [];
    } catch (error) {
        return [];
    }
};

export const criarUnidade = async (db, dados) => {
    try {
        const nomeNormalizado = dados.nome.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const unidadeId = nomeNormalizado;
        const unidadeRef = doc(db, "unidades", unidadeId);
        await setDoc(unidadeRef, {
            id: unidadeId,
            nome: dados.nome,
            sigla: dados.sigla || '',
            endereco: dados.endereco || '',
            telefone: dados.telefone || '',
            email: dados.email || '',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            ativo: true
        });
        showNotification(`Unidade "${dados.nome}" criada com sucesso.`, "success");
        return { id: unidadeId, ...dados };
    } catch (error) {
        showNotification("Erro ao criar unidade: " + error.message, "error");
        return null;
    }
};

export const atualizarUnidade = async (db, unidadeId, dados) => {
    try {
        await updateDoc(doc(db, "unidades", unidadeId), {
            ...dados,
            atualizadoEm: new Date().toISOString()
        });
        showNotification(`Unidade "${dados.nome}" atualizada.`, "success");
        return true;
    } catch (error) {
        showNotification("Erro ao atualizar unidade: " + error.message, "error");
        return false;
    }
};

export const excluirUnidade = async (db, unidadeId, unidadeNome) => {
    if (!confirm(`Tem certeza que deseja excluir a unidade "${unidadeNome}"?\n\nUsuários vinculados a esta unidade perderão o acesso.`)) return false;
    try {
        await updateDoc(doc(db, "unidades", unidadeId), { 
            ativo: false, 
            excluidoEm: new Date().toISOString() 
        });
        
        const usersSnap = await getDocs(collection(db, "users"));
        const batch = writeBatch(db);
        let usuariosAfetados = 0;
        
        for (const userDoc of usersSnap.docs) {
            const userData = userDoc.data();
            const unidades = userData.unidades || [];
            if (unidades.some(u => u.unidadeId === unidadeId)) {
                const novasUnidades = unidades.filter(u => u.unidadeId !== unidadeId);
                batch.update(userDoc.ref, { unidades: novasUnidades, updatedAt: new Date().toISOString() });
                usuariosAfetados++;
            }
        }
        
        if (usuariosAfetados > 0) {
            await batch.commit();
            showNotification(`Unidade "${unidadeNome}" desativada e removida de ${usuariosAfetados} usuário(s).`, "info");
        } else {
            showNotification(`Unidade "${unidadeNome}" desativada.`, "info");
        }
        return true;
    } catch (error) {
        showNotification("Erro ao excluir unidade: " + error.message, "error");
        return false;
    }
};

const parseCSVLinha = (linha) => {
    const resultado = [];
    let dentroAspas = false;
    let valorAtual = '';
    for (let i = 0; i < linha.length; i++) {
        const char = linha[i];
        if (char === '"') dentroAspas = !dentroAspas;
        else if (char === ',' && !dentroAspas) { resultado.push(valorAtual.trim()); valorAtual = ''; } 
        else valorAtual += char;
    }
    resultado.push(valorAtual.trim());
    return resultado;
};

const parseCSVUnidades = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n');
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                const unidades = [];
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;
                    const valores = parseCSVLinha(lines[i]);
                    const unidade = {};
                    headers.forEach((h, idx) => { unidade[h] = valores[idx] || ''; });
                    if (unidade.nome) unidades.push({ nome: unidade.nome, sigla: unidade.sigla || '', endereco: unidade.endereco || '', telefone: unidade.telefone || '', email: unidade.email || '' });
                }
                resolve(unidades);
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file, 'UTF-8');
    });
};

const parseJSONUnidades = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const unidades = Array.isArray(data) ? data : data.unidades || [];
                resolve(unidades.map(u => ({ nome: u.nome, sigla: u.sigla || '', endereco: u.endereco || '', telefone: u.telefone || '', email: u.email || '' })));
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
};

const importarUnidadesEmMassa = async (db, unidades) => {
    const unidadesExistentes = await carregarUnidades(db);
    const nomesExistentes = new Set(unidadesExistentes.map(u => u.nome.toLowerCase()));
    let criadas = 0; let duplicadas = 0;
    for (const unidade of unidades) {
        if (nomesExistentes.has(unidade.nome.toLowerCase())) { duplicadas++; continue; }
        await criarUnidade(db, unidade);
        criadas++;
    }
    showNotification(`${criadas} unidade(s) importada(s). ${duplicadas} duplicada(s) ignorada(s).`, criadas > 0 ? 'success' : 'warning');
};

export const abrirImportadorUnidades = async (db) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 z-[900] flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="bg-slate-900 px-6 py-4 flex justify-between items-center shrink-0 border-b border-slate-800">
                <h2 class="text-base font-bold text-white tracking-wide">Importação em Massa de Unidades</h2>
                <button id="fechar-importador-unidades" class="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
                <div class="flex border-b border-slate-200">
                    <button class="tab-importador-unidades py-2 px-4 font-semibold text-xs text-slate-900 border-b-2 border-slate-900" data-tab="upload">Upload de Arquivo</button>
                    <button class="tab-importador-unidades py-2 px-4 font-semibold text-xs text-slate-500 hover:text-slate-700" data-tab="modelo">Layout Padrão</button>
                    <button class="tab-importador-unidades py-2 px-4 font-semibold text-xs text-slate-500 hover:text-slate-700" data-tab="manual">Entrada Manual</button>
                    <button class="tab-importador-unidades py-2 px-4 font-semibold text-xs text-slate-500 hover:text-slate-700" data-tab="estrutura">Estrutura Atual</button>
                </div>
                <div id="painel-upload-unidades" class="space-y-4">
                    <div class="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
                        <input type="file" id="arquivo-unidades" accept=".csv,.json" class="hidden">
                        <button id="btn-selecionar-arquivo-unidades" class="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 px-6 rounded-lg text-xs transition">Selecionar Arquivo (CSV/JSON)</button>
                    </div>
                    <div id="info-arquivo-unidades" class="hidden p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                        <p class="text-emerald-800 font-bold text-xs">Arquivo validado com sucesso.</p>
                        <p id="info-arquivo-unidades-detalhes" class="text-xs text-emerald-600 mt-1"></p>
                        <div class="mt-3 flex gap-3">
                            <button id="btn-previsualizar-unidades" class="bg-white border border-emerald-300 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-semibold">Pré-visualizar</button>
                            <button id="btn-importar-unidades" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">Executar Importação</button>
                        </div>
                    </div>
                    <div id="preview-unidades" class="hidden">
                        <div class="bg-slate-50 rounded-xl p-4 max-h-60 overflow-y-auto border border-slate-200">
                            <table class="w-full text-xs"><thead class="bg-slate-100 text-slate-600"><tr><th class="p-2 text-left">Nome</th><th class="p-2 text-left">Sigla</th></tr></thead><tbody id="preview-unidades-tbody"></tbody></table>
                        </div>
                    </div>
                </div>
                <div id="painel-modelo-unidades" class="hidden space-y-4">
                    <div class="bg-slate-50 rounded-xl p-5 border border-slate-200">
                        <p class="text-xs font-semibold text-slate-700 mb-2">Estrutura esperada do arquivo CSV:</p>
                        <pre class="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-[11px] font-mono"><code>nome,sigla,endereco,telefone,email
"Defensoria Caxias","DPDC","Av. Presidente Kennedy...","(21) 0000-0000","contato@dperj.br"</code></pre>
                    </div>
                </div>
                <div id="painel-manual-unidades" class="hidden space-y-4">
                    <div class="bg-slate-50 rounded-xl p-5 border border-slate-200">
                        <label class="block text-xs font-semibold text-slate-600 mb-2">Insira os dados separados por pipe (|): sigla|nome|endereco|telefone|email</label>
                        <textarea id="manual-unidades-text" rows="6" class="w-full p-3 border border-slate-300 rounded-lg font-mono text-xs focus:ring-1 focus:ring-slate-900 outline-none" placeholder="DPDC|Defensoria Caxias|Av. Presidente Kennedy|(21) 0000-0000|contato@dperj.br"></textarea>
                        <button id="btn-importar-manual-unidades" class="mt-4 bg-slate-900 text-white px-5 py-2 rounded-lg text-xs font-semibold">Processar Entrada</button>
                    </div>
                </div>
                <div id="painel-estrutura-unidades" class="hidden space-y-4" style="min-height: 400px;">
                    <div id="meu-container-estrutura" class="w-full"></div>
                </div>
            </div>
            <div class="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-200 shrink-0">
                <button id="fechar-importador-unidades-footer" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const fechar = () => modal.remove();
    document.getElementById('fechar-importador-unidades')?.addEventListener('click', fechar);
    document.getElementById('fechar-importador-unidades-footer')?.addEventListener('click', fechar);
    
    document.querySelectorAll('.tab-importador-unidades').forEach(tab => {
        tab.addEventListener('click', () => {
            const aba = tab.dataset.tab;
            document.querySelectorAll('.tab-importador-unidades').forEach(t => {
                t.classList.remove('text-slate-900', 'border-b-2', 'border-slate-900');
                t.classList.add('text-slate-500');
            });
            tab.classList.add('text-slate-900', 'border-b-2', 'border-slate-900');
            document.getElementById('painel-upload-unidades').classList.add('hidden');
            document.getElementById('painel-modelo-unidades').classList.add('hidden');
            document.getElementById('painel-manual-unidades').classList.add('hidden');
            document.getElementById('painel-estrutura-unidades').classList.add('hidden');
            document.getElementById(`painel-${aba}-unidades`).classList.remove('hidden');
            
            if (aba === 'estrutura' && globalApp) {
                const container = document.getElementById('meu-container-estrutura');
                container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loader-small mx-auto"></div></div>';
                renderEstruturaAtual(globalApp, container);
            }
        });
    });
    
    const fileInput = document.getElementById('arquivo-unidades');
    document.getElementById('btn-selecionar-arquivo-unidades')?.addEventListener('click', () => fileInput.click());
    
    let dadosImportados = null;
    fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const extensao = file.name.split('.').pop().toLowerCase();
            let unidades = [];
            if (extensao === 'csv') unidades = await parseCSVUnidades(file);
            else if (extensao === 'json') unidades = await parseJSONUnidades(file);
            dadosImportados = unidades;
            document.getElementById('info-arquivo-unidades-detalhes').textContent = `Arquivo: ${file.name} | Total: ${unidades.length} registros`;
            document.getElementById('info-arquivo-unidades').classList.remove('hidden');
        } catch (error) { showNotification("Erro ao processar arquivo.", "error"); }
    });
    
    document.getElementById('btn-previsualizar-unidades')?.addEventListener('click', () => {
        if (!dadosImportados?.length) return;
        document.getElementById('preview-unidades-tbody').innerHTML = dadosImportados.slice(0, 10).map(u => `<tr class="border-b border-slate-100"><td class="p-2 text-slate-700">${escapeHTML(u.nome)}</td><td class="p-2 text-slate-500">${escapeHTML(u.sigla || '-')}</td></tr>`).join('');
        document.getElementById('preview-unidades').classList.remove('hidden');
    });
    
    document.getElementById('btn-importar-unidades')?.addEventListener('click', async () => {
        if (!dadosImportados?.length) return;
        await importarUnidadesEmMassa(db, dadosImportados);
        fechar();
        if (window.abrirGerenciadorUnidades) window.abrirGerenciadorUnidades();
    });
    
    document.getElementById('btn-importar-manual-unidades')?.addEventListener('click', async () => {
        const texto = document.getElementById('manual-unidades-text').value.trim();
        const unidades = texto.split('\n').filter(l => l.trim()).map(l => {
            const p = l.split('|').map(v => v.trim());
            return { sigla: p[0] || '', nome: p[1] || '', endereco: p[2] || '', telefone: p[3] || '', email: p[4] || '' };
        }).filter(u => u.nome);
        await importarUnidadesEmMassa(db, unidades);
        fechar();
        if (window.abrirGerenciadorUnidades) window.abrirGerenciadorUnidades();
    });
};

export const abrirModalUsuariosPorUnidade = async (db, unidadeId, unidadeNome) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4';
    modal.innerHTML = `<div class="bg-white p-6 rounded-2xl w-full max-w-lg shadow-2xl text-center"><div class="loader-small mx-auto mb-4"></div></div>`;
    document.body.appendChild(modal);

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const usuariosVinculados = usersSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(u => u.unidades?.some(un => un.unidadeId === unidadeId) && u.status !== 'pending' && u.role !== 'suspended');

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                <div class="bg-slate-900 px-6 py-4 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="font-bold text-sm tracking-wide">Usuários Vinculados</h3>
                        <p class="text-slate-400 text-xs mt-0.5">${escapeHTML(unidadeNome)}</p>
                    </div>
                    <button id="fechar-usuarios-unidade" class="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                <div class="p-4 overflow-y-auto flex-1">
                    ${usuariosVinculados.length > 0 
                        ? `<div class="space-y-2">
                            ${usuariosVinculados.map(u => `
                            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                                <div>
                                    <p class="font-bold text-slate-800 text-xs">${escapeHTML(u.name || 'Sem nome')}</p>
                                    <p class="text-[11px] text-slate-500">${escapeHTML(u.email || '')}</p>
                                </div>
                                <span class="text-[10px] bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded font-mono uppercase">${u.role || 'user'}</span>
                            </div>`).join('')}
                          </div>`
                        : '<div class="text-center py-12 text-slate-400 text-xs">Nenhum usuário vinculado.</div>'
                    }
                </div>
                <div class="p-4 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
                    <button id="fechar-usuarios-unidade-footer" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold">Fechar</button>
                </div>
            </div>
        `;

        const closeModal = () => modal.remove();
        document.getElementById('fechar-usuarios-unidade')?.addEventListener('click', closeModal);
        document.getElementById('fechar-usuarios-unidade-footer')?.addEventListener('click', closeModal);
    } catch (error) {
        modal.remove();
    }
};

export const abrirGerenciadorUnidades = async (db) => {
    let unidades = await carregarUnidades(db);
    let filtroTexto = '';
    
    const renderLista = () => {
        const filtradas = unidades.filter(u => 
            u.nome.toLowerCase().includes(filtroTexto.toLowerCase()) ||
            (u.sigla || '').toLowerCase().includes(filtroTexto.toLowerCase())
        );
        
        const container = document.getElementById('lista-unidades-admin');
        if (!container) return;
        
        if (filtradas.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center py-8 text-slate-400 text-xs">Nenhuma unidade encontrada.</div>';
            return;
        }
        
        container.innerHTML = filtradas.map(unidade => `
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:border-slate-300 transition-all">
                <div class="flex justify-between items-start">
                    <div class="flex-1 min-w-0 pr-2">
                        <h4 class="font-bold text-slate-800 text-sm truncate">${escapeHTML(unidade.nome)}</h4>
                        <p class="text-xs text-slate-500 mt-0.5">${escapeHTML(unidade.sigla || 'Sem sigla')}</p>
                        ${unidade.endereco ? `<p class="text-[11px] text-slate-400 mt-1 truncate">Local: ${escapeHTML(unidade.endereco)}</p>` : ''}
                    </div>
                    <div class="flex gap-1 shrink-0">
                        <button class="btn-ver-usuarios text-slate-600 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" title="Visualizar membros">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        </button>
                        <button class="btn-editar-unidade text-slate-600 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" data-sigla="${escapeHTML(unidade.sigla || '')}" 
                                data-endereco="${escapeHTML(unidade.endereco || '')}" data-telefone="${escapeHTML(unidade.telefone || '')}" data-email="${escapeHTML(unidade.email || '')}" title="Editar">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button class="btn-excluir-unidade text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" title="Excluir">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
        container.querySelectorAll('.btn-ver-usuarios').forEach(btn => {
            btn.addEventListener('click', () => abrirModalUsuariosPorUnidade(db, btn.dataset.id, btn.dataset.nome));
        });
        
        container.querySelectorAll('.btn-editar-unidade').forEach(btn => {
            btn.addEventListener('click', () => abrirModalFormUnidade(db, {
                id: btn.dataset.id, nome: btn.dataset.nome, sigla: btn.dataset.sigla, endereco: btn.dataset.endereco, telefone: btn.dataset.telefone, email: btn.dataset.email
            }, () => {
                document.getElementById('gerenciador-unidades-modal')?.remove();
                abrirGerenciadorUnidades(db);
            }));
        });
        
        container.querySelectorAll('.btn-excluir-unidade').forEach(btn => {
            btn.addEventListener('click', async () => {
                await excluirUnidade(db, btn.dataset.id, btn.dataset.nome);
                document.getElementById('gerenciador-unidades-modal')?.remove();
                abrirGerenciadorUnidades(db);
            });
        });
    };
    
    const modal = document.createElement('div');
    modal.id = 'gerenciador-unidades-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[700] flex items-center justify-center p-4 overflow-y-auto backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="bg-slate-900 px-6 py-4 flex justify-between items-center shrink-0 border-b border-slate-800">
                <h2 class="text-base font-bold text-white tracking-wide">Gerenciamento de Unidades e Órgãos</h2>
                <button id="fechar-gerenciador-unidades" class="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                    <div class="relative w-full sm:w-80"><input type="text" id="pesquisa-unidades" placeholder="Pesquisar unidade..." class="w-full p-2.5 pl-9 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-slate-900"></div>
                    <div class="flex gap-2 w-full sm:w-auto">
                        <button id="btn-importar-unidades-massa" class="flex-1 sm:flex-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2 rounded-xl text-xs transition shadow-sm">Importação em Massa</button>
                        <button id="btn-nova-unidade" class="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white font-semibold px-4 py-2 rounded-xl text-xs transition shadow-sm">Nova Unidade</button>
                    </div>
                </div>
                <div id="lista-unidades-admin" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>
            </div>
            <div class="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-200 shrink-0"><button id="fechar-gerenciador-unidades-footer" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold">Fechar</button></div>
        </div>
    `;
    document.body.appendChild(modal);
    renderLista();
    
    const fechar = () => modal.remove();
    document.getElementById('fechar-gerenciador-unidades')?.addEventListener('click', fechar);
    document.getElementById('fechar-gerenciador-unidades-footer')?.addEventListener('click', fechar);
    document.getElementById('pesquisa-unidades')?.addEventListener('input', (e) => { filtroTexto = e.target.value; renderLista(); });
    document.getElementById('btn-nova-unidade')?.addEventListener('click', () => { abrirModalFormUnidade(db, null, () => { fechar(); abrirGerenciadorUnidades(db); }); });
    document.getElementById('btn-importar-unidades-massa')?.addEventListener('click', () => { fechar(); abrirImportadorUnidades(db); });
};

const abrirModalGerenciarRecepcoesGlobal = async (app) => {
    const { db } = app;
    const { RecepcaoConfigService } = await import('./recepcaoConfig.js');

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 z-[800] flex items-center justify-center p-4 overflow-y-auto backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col relative">
            <div class="bg-slate-900 px-6 py-4 flex justify-between items-center shrink-0 border-b border-slate-800">
                <div>
                    <h2 class="text-base font-bold text-white tracking-wide">Unidades de Apoio e Recepções</h2>
                    <p class="text-slate-400 text-xs mt-0.5">Configuração de hubs operacionais e distribuição de atendimento</p>
                </div>
                <button id="fechar-gerenciador-recepcoes" class="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-6" id="painel-conteudo-recepcoes">
                <div class="flex justify-center items-center h-40">
                    <div class="loader-small mx-auto mb-4"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const fechar = () => modal.remove();
    document.getElementById('fechar-gerenciador-recepcoes').onclick = fechar;

    const renderizarTelaAdmin = async () => {
        const recepcoes = await RecepcaoConfigService.buscarTodasRecepcoesAdmin(db);

        const container = document.getElementById('painel-conteudo-recepcoes');
        if (!container) return;

        let html = `
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h3 class="font-bold text-slate-800 text-sm">Gestão de Recepções</h3>
                    <p class="text-xs text-slate-500 mt-0.5">Vincule unidades operacionais e defina equipes alocadas.</p>
                </div>
                <button id="btn-nova-recepcao-custom" class="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-4 py-2 rounded-xl text-xs transition shadow-sm">
                    + Nova Recepção
                </button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${recepcoes.length === 0 ? `
                    <div class="col-span-full flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                        <p class="text-xs text-slate-500 font-medium">Nenhuma recepção configurada no sistema.</p>
                    </div>
                ` : recepcoes.map(rec => `
                    <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-slate-300 transition-all relative flex flex-col h-full">
                        <div class="absolute top-4 right-4">
                            <span class="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${rec.tipo === 'central' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}">
                                ${rec.tipo === 'central' ? 'Central' : 'Específica'}
                            </span>
                        </div>
                        
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-10 h-10 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-center text-lg">
                                ${rec.icone || '📋'}
                            </div>
                            <div class="flex-1 min-w-0 pr-12">
                                <h4 class="font-bold text-slate-800 text-sm truncate">${escapeHTML(rec.nome)}</h4>
                                <p class="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">${rec.andar ? escapeHTML(rec.andar) : 'Global'}</p>
                            </div>
                        </div>
                        
                        <div class="mb-4 flex-1 bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2.5 text-xs">
                            <div>
                                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Unidades Vinculadas</span>
                                <div class="text-slate-700 font-medium truncate">
                                    ${(rec.unidadesVinculadas || []).length > 0 
                                        ? `${rec.unidadesVinculadas.length} unidade(s) associada(s)`
                                        : (rec.unidadeNome ? escapeHTML(rec.unidadeNome) : '<span class="text-slate-400 italic">Nenhuma</span>')}
                                </div>
                            </div>
                            <div class="pt-2 border-t border-slate-200 flex justify-between items-center">
                                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Membros Autorizados</span>
                                <span class="bg-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded-full text-[10px]">${(rec.membros || []).length}</span>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-2 mt-auto pt-2 border-t border-slate-100">
                            <button class="btn-vincular-usuarios bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 rounded-xl text-xs transition col-span-2 flex items-center justify-center gap-1.5" data-id="${rec.id}">
                                Gerenciar Lotação de Equipe
                            </button>
                            <button class="btn-editar-recepcao bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-xl text-xs transition" data-id="${rec.id}">
                                Editar
                            </button>
                            <div class="flex gap-1.5">
                                <button class="btn-link-recepcao flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-xl text-xs transition" data-id="${rec.id}" title="Copiar link da TV">Link TV</button>
                                <button class="btn-excluir-recepcao flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 rounded-xl text-xs transition" data-id="${rec.id}" data-nome="${escapeHTML(rec.nome)}" title="Excluir">Excluir</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        container.innerHTML = html;

        document.getElementById('btn-nova-recepcao-custom')?.addEventListener('click', () => renderizarFormularioRecepcao());

        container.querySelectorAll('.btn-editar-recepcao').forEach(btn => {
            btn.addEventListener('click', () => {
                const rec = recepcoes.find(r => r.id === btn.dataset.id);
                if (rec) renderizarFormularioRecepcao(rec);
            });
        });

        container.querySelectorAll('.btn-link-recepcao').forEach(btn => {
            btn.addEventListener('click', () => {
                const rec = recepcoes.find(r => r.id === btn.dataset.id);
                if (rec) RecepcaoConfigService.copiarLinkPainel(rec);
            });
        });

        container.querySelectorAll('.btn-excluir-recepcao').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm(`Confirma a exclusão da recepção "${btn.dataset.nome}"?`)) {
                    try {
                        await deleteDoc(doc(db, "recepcoes", btn.dataset.id));
                        showNotification("Recepção excluída.", "success");
                        renderizarTelaAdmin();
                    } catch (error) {
                        showNotification("Erro ao excluir recepção.", "error");
                    }
                }
            });
        });

        container.querySelectorAll('.btn-vincular-usuarios').forEach(btn => {
            btn.addEventListener('click', () => {
                const rec = recepcoes.find(r => r.id === btn.dataset.id);
                if (rec) abrirModalVincularUsuarios(rec);
            });
        });
    };

    const renderizarFormularioRecepcao = (recepcaoEdicao = null) => {
        const container = document.getElementById('painel-conteudo-recepcoes');
        if (!container) return;

        container.innerHTML = `
            <div class="max-w-2xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                ${RecepcaoConfigService.renderFormRecepcao(recepcaoEdicao, [])}
            </div>
        `;

        RecepcaoConfigService.initFormRecepcaoEventos(
            async (dadosSalvos, idEdicao) => {
                if (idEdicao) {
                    await RecepcaoConfigService.atualizarRecepcao(db, idEdicao, dadosSalvos);
                } else {
                    await RecepcaoConfigService.criarRecepcao(db, dadosSalvos, app.currentUser.uid);
                }
                renderizarTelaAdmin();
            },
            () => { renderizarTelaAdmin(); }
        );
    };

    const abrirModalVincularUsuarios = async (recepcao) => {
        const modalVinculo = document.createElement('div');
        modalVinculo.className = 'fixed inset-0 bg-black/70 z-[900] flex items-center justify-center p-4 backdrop-blur-sm';
        modalVinculo.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col h-[80vh]">
                <div class="bg-slate-900 px-6 py-4 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="font-bold text-sm">Lotação de Servidores: ${escapeHTML(recepcao.nome)}</h3>
                        <p class="text-slate-400 text-xs mt-0.5">Selecione os usuários com permissão operacional</p>
                    </div>
                    <button class="fechar-vinculo text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                
                <div class="p-3 border-b border-slate-200 bg-slate-50 shrink-0">
                    <input type="text" id="busca-membros-recepcao" placeholder="Filtrar por nome ou e-mail..." 
                        class="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs outline-none focus:ring-1 focus:ring-slate-900">
                </div>

                <div class="flex-1 overflow-y-auto p-4 bg-slate-50/50" id="lista-usuarios-vinculo">
                    <div class="flex justify-center items-center h-full"><div class="loader-small"></div></div>
                </div>
                
                <div class="bg-white border-t border-slate-200 p-4 flex justify-between items-center shrink-0">
                    <span id="contagem-membros" class="text-xs font-semibold text-slate-500"></span>
                    <div class="flex gap-2">
                        <button class="fechar-vinculo bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs">Cancelar</button>
                        <button id="salvar-vinculo" class="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-2 rounded-lg text-xs shadow-sm">Salvar Alterações</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalVinculo);

        const fecharVinculo = () => modalVinculo.remove();
        modalVinculo.querySelectorAll('.fechar-vinculo').forEach(b => b.addEventListener('click', fecharVinculo));

        try {
            const usersSnap = await getDocs(collection(db, "users"));
            const todosUsuarios = usersSnap.docs.map(d => ({id: d.id, ...d.data()})).filter(u => u.status === 'approved' && u.role !== 'suspended');
            todosUsuarios.sort((a,b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));

            let membrosAtuais = [...(recepcao.membros || [])];

            const renderUsuarios = (termo = '') => {
                const listContainer = document.getElementById('lista-usuarios-vinculo');
                if (!listContainer) return;
                const q = termo.toLowerCase();
                const filtrados = todosUsuarios.filter(u => 
                    (u.name || '').toLowerCase().includes(q) || 
                    (u.email || '').toLowerCase().includes(q)
                );

                if (filtrados.length === 0) {
                    listContainer.innerHTML = '<p class="text-center text-slate-400 py-10 text-xs font-semibold">Nenhum registro encontrado.</p>';
                    return;
                }

                listContainer.innerHTML = `
                    <div class="space-y-1.5">
                        ${filtrados.map(u => {
                            const isChecked = membrosAtuais.includes(u.id);
                            return `
                                <label class="flex items-center gap-3 p-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 transition ${isChecked ? 'border-slate-900 bg-slate-50' : ''}">
                                    <input type="checkbox" class="cb-membro w-4 h-4 text-slate-900 rounded focus:ring-0" value="${u.id}" ${isChecked ? 'checked' : ''}>
                                    <div class="flex-1 min-w-0">
                                        <p class="font-bold text-slate-800 text-xs truncate">${escapeHTML(u.name || 'Sem nome')}</p>
                                        <p class="text-[10px] text-slate-500 truncate">${escapeHTML(u.email)}</p>
                                    </div>
                                    <span class="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">${u.role || 'user'}</span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                `;

                listContainer.querySelectorAll('.cb-membro').forEach(cb => {
                    cb.addEventListener('change', () => {
                        const label = cb.closest('label');
                        if (cb.checked) {
                            label.classList.add('border-slate-900', 'bg-slate-50');
                            if (!membrosAtuais.includes(cb.value)) membrosAtuais.push(cb.value);
                        } else {
                            label.classList.remove('border-slate-900', 'bg-slate-50');
                            membrosAtuais = membrosAtuais.filter(id => id !== cb.value);
                        }
                        atualizarContador();
                    });
                });
            };

            const atualizarContador = () => {
                const el = document.getElementById('contagem-membros');
                if (el) el.textContent = `${membrosAtuais.length} servidor(es) selecionado(s)`;
            };

            renderUsuarios();
            atualizarContador();

            document.getElementById('busca-membros-recepcao')?.addEventListener('input', (e) => renderUsuarios(e.target.value));

            document.getElementById('salvar-vinculo')?.addEventListener('click', async () => {
                const btn = document.getElementById('salvar-vinculo');
                if (!btn) return;
                btn.disabled = true;
                btn.textContent = 'Salvando...';

                try {
                    await updateDoc(doc(db, "recepcoes", recepcao.id), { membros: membrosAtuais });
                    showNotification("Lotação atualizada.", "success");
                    fecharVinculo();
                    renderizarTelaAdmin();
                } catch (error) {
                    showNotification("Erro ao salvar lotação.", "error");
                    btn.disabled = false;
                    btn.textContent = 'Salvar Alterações';
                }
            });

        } catch (err) {
            const listContainer = document.getElementById('lista-usuarios-vinculo');
            if (listContainer) listContainer.innerHTML = '<p class="text-center text-red-500 py-10 text-xs font-semibold">Erro ao carregar dados.</p>';
        }
    };

    await renderizarTelaAdmin();
};

const abrirModalFormUnidade = async (db, unidade = null, onClose) => {
    const isEdicao = !!unidade;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/60 z-[800] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div class="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
                <h3 class="font-bold text-sm tracking-wide">${isEdicao ? 'Editar Unidade' : 'Cadastrar Nova Unidade'}</h3>
                <button class="fechar-form-unidade text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div class="p-6 space-y-3.5 text-xs">
                <div><label class="block font-semibold text-slate-700 mb-1">Nome *</label><input type="text" id="unidade-nome" value="${unidade?.nome || ''}" class="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-900" placeholder="Ex: Defensoria Caxias"></div>
                <div><label class="block font-semibold text-slate-700 mb-1">Sigla</label><input type="text" id="unidade-sigla" value="${unidade?.sigla || ''}" class="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-900" placeholder="Ex: DPDC"></div>
                <div><label class="block font-semibold text-slate-700 mb-1">Endereço</label><input type="text" id="unidade-endereco" value="${unidade?.endereco || ''}" class="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-900" placeholder="Logradouro completo"></div>
                <div><label class="block font-semibold text-slate-700 mb-1">Telefone</label><input type="text" id="unidade-telefone" value="${unidade?.telefone || ''}" class="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-900" placeholder="(00) 0000-0000"></div>
                <div><label class="block font-semibold text-slate-700 mb-1">E-mail</label><input type="email" id="unidade-email" value="${unidade?.email || ''}" class="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-slate-900" placeholder="email@dominio.br"></div>
            </div>
            <div class="bg-slate-50 px-6 py-3.5 flex justify-end gap-2 border-t border-slate-200">
                <button class="fechar-form-unidade bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold">Cancelar</button>
                <button id="btn-salvar-unidade" class="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-lg text-xs font-semibold">${isSalvarText => isEdicao ? 'Salvar Alterações' : 'Criar Unidade'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const fechar = () => modal.remove();
    modal.querySelectorAll('.fechar-form-unidade').forEach(btn => btn.addEventListener('click', fechar));
    document.getElementById('btn-salvar-unidade')?.addEventListener('click', async () => {
        const nome = document.getElementById('unidade-nome').value.trim();
        if (!nome) { showNotification("Nome da unidade é obrigatório.", "error"); return; }
        const dados = { nome, sigla: document.getElementById('unidade-sigla').value.trim(), endereco: document.getElementById('unidade-endereco').value.trim(), telefone: document.getElementById('unidade-telefone').value.trim(), email: document.getElementById('unidade-email').value.trim() };
        if (isEdicao) await atualizarUnidade(db, unidade.id, dados);
        else await criarUnidade(db, dados);
        fechar();
        if (onClose) onClose();
    });
};

function renderPagination(containerId, currentPage, totalPages, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '<div class="flex items-center justify-center gap-1.5 mt-4">';
    html += `<button class="pag-btn px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled style="opacity:40%;cursor:not-allowed"' : ''}>Anterior</button>`;
    html += `<span class="px-2 py-1 text-xs font-medium text-slate-500">Pág. ${currentPage} de ${totalPages}</span>`;
    html += `<button class="pag-btn px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled style="opacity:40%;cursor:not-allowed"' : ''}>Próxima</button>`;
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.pag-btn').forEach(btn => {
        if (!btn.disabled) {
            btn.addEventListener('click', () => { if (onPageChange) onPageChange(parseInt(btn.dataset.page)); });
        }
    });
}

function renderPageSizeSelector(containerId, currentSize, onSizeChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500">Exibir:</span>
            <select id="page-size-select-${containerId}" class="text-xs border border-slate-300 rounded px-2 py-1 bg-white outline-none">
                <option value="5" ${currentSize === 5 ? 'selected' : ''}>5</option>
                <option value="10" ${currentSize === 10 ? 'selected' : ''}>10</option>
                <option value="15" ${currentSize === 15 ? 'selected' : ''}>15</option>
                <option value="20" ${currentSize === 20 ? 'selected' : ''}>20</option>
            </select>
        </div>
    `;
    const select = document.getElementById(`page-size-select-${containerId}`);
    if (select) {
        select.addEventListener('change', (e) => { if (onSizeChange) onSizeChange(parseInt(e.target.value)); });
    }
}

function renderSearchInput(containerId, placeholder, onSearch) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="relative">
            <input type="text" id="search-input-${containerId}" placeholder="${placeholder}" class="w-full p-2 pl-8 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-slate-900">
            <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <button id="clear-search-${containerId}" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 hidden">✕</button>
        </div>
    `;
    const input = document.getElementById(`search-input-${containerId}`);
    const clearBtn = document.getElementById(`clear-search-${containerId}`);
    if (input) {
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            if (clearBtn) clearBtn.classList.toggle('hidden', !val);
            if (onSearch) onSearch(val);
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (input) { input.value = ''; input.dispatchEvent(new Event('input')); }
        });
    }
}

// ==========================================
// GESTAO DE USUARIOS E MULTI-TENANT
// ==========================================

export const loadUsersList = async (db) => {
    try {
        const isAdminGlobal = globalApp?.currentUser?.role === 'superadmin' || globalApp?.currentUser?.role === 'superadmin_global';
        // 🔒 BLINDAGEM CONTRA UNDEFINED: Se não houver órgão, assume 'padrao_dprj' por segurança
        const meuTenant = globalApp?.currentUser?.orgaoId || 'padrao_dprj';
        
        const allUsers = [];
        
        if (isAdminGlobal) {
            const snapshot = await getDocs(collection(db, "users"));
            snapshot.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
        } else {
            const qOrg = query(collection(db, "users"), where("orgaoId", "==", meuTenant));
            const snapOrg = await getDocs(qOrg);
            snapOrg.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
            
            const qPend = query(collection(db, "users"), where("status", "==", "pending"));
            const snapPend = await getDocs(qPend);
            snapPend.forEach(doc => {
                const u = doc.data();
                if (!u.orgaoId && !allUsers.some(existing => existing.id === doc.id)) {
                    allUsers.push({ id: doc.id, ...u });
                }
            });
        }
        
        let pendentes = allUsers.filter(u => u.status === 'pending');
        let aprovados = allUsers.filter(u => u.status !== 'pending');
        
        if (adminFilters.pendentes.search) {
            const search = adminFilters.pendentes.search.toLowerCase();
            pendentes = pendentes.filter(u => (u.name || '').toLowerCase().includes(search) || (u.email || '').toLowerCase().includes(search));
        }
        if (adminFilters.usuarios.search) {
            const search = adminFilters.usuarios.search.toLowerCase();
            aprovados = aprovados.filter(u => (u.name || '').toLowerCase().includes(search) || (u.email || '').toLowerCase().includes(search));
        }
        
        cachedPendentes = pendentes;
        cachedUsuarios = aprovados;
        
        renderPendentesList(db);
        renderAprovadosTable(db);
        
    } catch (error) {
        console.error("Erro ao carregar lista de usuários:", error);
    }
};

function renderPendentesList(db) {
    const pendingList = document.getElementById('pending-users-list');
    if (!pendingList) return;
    
    const pendentes = cachedPendentes;
    const { page, pageSize } = adminFilters.pendentes;
    const start = (page - 1) * pageSize;
    const paginated = pendentes.slice(start, start + pageSize);
    const totalPages = Math.ceil(pendentes.length / pageSize);
    
    if (pendentes.length === 0) {
        pendingList.innerHTML = '<div class="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">Nenhum cadastro pendente de aprovação.</div>';
        document.getElementById('pagination-pendentes')?.classList.add('hidden');
        return;
    }
    
    pendingList.innerHTML = paginated.map(user => `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3.5 bg-white rounded-xl border border-slate-200 mb-2 shadow-sm gap-3">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <p class="font-bold text-slate-800 text-xs truncate">${escapeHTML(user.name || 'Sem nome')} (${escapeHTML(user.email)})</p>
                    <span class="bg-amber-100 text-amber-800 text-[9px] font-mono px-2 py-0.5 rounded">Pendente</span>
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <select id="role-select-${user.id}" class="text-[11px] border border-slate-300 rounded-lg p-1.5 bg-slate-50 outline-none font-medium">
                    <option value="user">Usuário</option>
                    <option value="apoio">Apoio</option>
                    <option value="admin">Administrador</option>
                    <option value="superadmin">Superadmin</option>
                    <option value="suspended">Suspenso</option>
                </select>
                <button onclick="window.approveUser('${user.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">Aprovar</button>
                <button onclick="window.deleteUser('${user.id}')" class="text-red-500 hover:text-red-700 px-2 py-1.5 text-xs font-semibold">Rejeitar</button>
            </div>
        </div>
    `).join('');
    
    renderPageSizeSelector('page-size-pendentes', pageSize, (newSize) => {
        adminFilters.pendentes.pageSize = newSize;
        adminFilters.pendentes.page = 1;
        renderPendentesList(db);
    });
    renderPagination('pagination-pendentes', page, totalPages, (newPage) => {
        adminFilters.pendentes.page = newPage;
        renderPendentesList(db);
    });
}

function renderAprovadosTable(db) {
    const tableBody = document.getElementById('approved-users-list');
    if (!tableBody) return;

    const aprovados = cachedUsuarios;
    const { page, pageSize } = adminFilters.usuarios;
    const start = (page - 1) * pageSize;
    const paginated = aprovados.slice(start, start + pageSize);
    const totalPages = Math.ceil(aprovados.length / pageSize);

    if (aprovados.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-400 text-xs">Nenhum registro encontrado.</td></tr>';
        document.getElementById('pagination-usuarios')?.classList.add('hidden');
        return;
    }

    const roleConfig = {
        'superadmin_global': { label: 'Superadmin Global', color: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' },
        'superadmin': { label: 'Superadmin', color: 'bg-purple-100 text-purple-800 border-purple-300' },
        'admin':      { label: 'Administrador', color: 'bg-blue-100 text-blue-800 border-blue-300'   },
        'user':       { label: 'Usuário',    color: 'bg-slate-100 text-slate-700 border-slate-200' },
        'apoio':      { label: 'Apoio',      color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
        'suspended':  { label: 'Suspenso',   color: 'bg-red-100 text-red-800 border-red-200'        },
    };

    tableBody.innerHTML = paginated.map(user => {
        const cfg = roleConfig[user.role] || roleConfig['user'];
        const unidadesCount = user.unidades?.length || 0;
        const isSuspended = user.role === 'suspended' || user.status === 'suspended';
        const rowClass = isSuspended ? 'opacity-60 bg-red-50/50' : 'hover:bg-slate-50/60';

        return `
            <tr class="border-b border-slate-200 ${rowClass} transition">
                <td class="px-3 py-3">
                    <p class="font-bold text-slate-800 text-xs">${escapeHTML(user.name || 'Sem nome')}</p>
                    <p class="text-[11px] text-slate-400">${escapeHTML(user.email)}</p>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold border mt-1 ${cfg.color}">
                        ${cfg.label}
                    </span>
                    ${user.orgaoId ? `<span class="text-[9px] text-slate-400 block mt-0.5 font-mono">Órgão: ${escapeHTML(user.orgaoId)}</span>` : ''}
                </td>
                <td class="px-3 py-3 text-center">
                    <button class="btn-gerenciar-unidades bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 mx-auto transition shadow-sm"
                        data-userid="${user.id}" title="Vincular unidades">
                        Unidades (${unidadesCount})
                    </button>
                </td>
                <td class="px-3 py-3">
                    <select id="role-select-${user.id}" class="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white outline-none font-medium cursor-pointer">
                        <option value="user"        ${user.role === 'user'        ? 'selected' : ''}>Usuário</option>
                        <option value="apoio"       ${user.role === 'apoio'       ? 'selected' : ''}>Apoio</option>
                        <option value="admin"       ${user.role === 'admin'       ? 'selected' : ''}>Administrador</option>
                        <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
                        <option value="superadmin_global" ${user.role === 'superadmin_global' ? 'selected' : ''}>Superadmin Global</option>
                        <option value="suspended"  ${user.role === 'suspended'  ? 'selected' : ''}>Suspenso</option>
                    </select>
                </td>
                <td class="px-3 py-3">
                    <div class="flex flex-col gap-1.5 min-w-[120px]">
                        <button onclick="window.updateUserRole('${user.id}')"
                            class="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold w-full transition shadow-sm">
                            Atualizar Perfil
                        </button>
                        <button onclick="window.toggleSuspendUser('${user.id}', ${isSuspended})"
                            class="${isSuspended
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-300'} border px-3 py-1.5 rounded-lg text-xs font-semibold w-full transition">
                            ${isSuspended ? 'Reativar Conta' : 'Suspender Conta'}
                        </button>
                        <button onclick="window.deleteUser('${user.id}')"
                            class="bg-white hover:bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold w-full transition">
                            Remover
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.querySelectorAll('.btn-gerenciar-unidades').forEach(btn => {
        btn.addEventListener('click', () => {
            if (globalApp) abrirGerenciarUnidadesUsuario(globalApp, btn.dataset.userid);
            else showNotification("Erro de inicialização.", "error");
        });
    });

    renderPageSizeSelector('page-size-usuarios', pageSize, (newSize) => {
        adminFilters.usuarios.pageSize = newSize;
        adminFilters.usuarios.page = 1;
        renderAprovadosTable(db);
    });
    renderPagination('pagination-usuarios', page, totalPages, (newPage) => {
        adminFilters.usuarios.page = newPage;
        renderAprovadosTable(db);
    });
}

export const approveUser = async (db, userId) => {
    try {
        const role = document.getElementById(`role-select-${userId}`)?.value || 'user';
        const orgaoIdAdmin = globalApp?.currentUser?.orgaoId || 'padrao_dprj';
        
        await updateDoc(doc(db, "users", userId), { 
            status: 'approved', 
            role: role, 
            orgaoId: orgaoIdAdmin, 
            approvedAt: new Date().toISOString() 
        });
        
        showNotification("Usuário aprovado e vinculado com sucesso.", "success");
        await loadUsersList(db);
    } catch (e) { 
        showNotification("Erro ao processar aprovação.", "error"); 
    }
};

export const updateUserRole = async (db, userId) => {
    try {
        const role = document.getElementById(`role-select-${userId}`)?.value || 'user';
        await updateDoc(doc(db, "users", userId), { role: role, status: role === 'suspended' ? 'suspended' : 'approved' });
        showNotification("Perfil atualizado.", "success");
        await loadUsersList(db);
    } catch (e) { showNotification("Erro ao atualizar.", "error"); }
};

export const toggleSuspendUser = async (db, userId, isSuspended) => {
    const novoRole   = isSuspended ? 'user'      : 'suspended';
    const novoStatus = isSuspended ? 'approved'  : 'suspended';
    const msg        = isSuspended ? 'Conta reativada.' : 'Conta suspensa.';
    try {
        await updateDoc(doc(db, "users", userId), {
            role: novoRole,
            status: novoStatus,
            updatedAt: new Date().toISOString()
        });
        showNotification(msg, isSuspended ? 'success' : 'warning');
        await loadUsersList(db);
    } catch (e) {
        showNotification("Erro ao alterar status.", "error");
    }
};

export const deleteUser = async (db, userId) => {
    if (!confirm("Confirma a remoção definitiva deste usuário?")) return;
    try {
        await deleteDoc(doc(db, "users", userId));
        showNotification("Usuário removido.", "success");
        await loadUsersList(db);
    } catch (e) { showNotification("Erro ao remover.", "error"); }
};

// ==========================================
// AUDITORIA E LOGS
// ==========================================

export const loadLogFilters = async (db) => {
    try {
        const userSelect = document.getElementById('filter-log-user');
        const actionSelect = document.getElementById('filter-log-action');
        
        const isAdminGlobal = globalApp?.currentUser?.role === 'superadmin' || globalApp?.currentUser?.role === 'superadmin_global';
        const meuTenant = globalApp?.currentUser?.orgaoId;

        if (userSelect) {
            let usersQuery = collection(db, "users");
            if (!isAdminGlobal) usersQuery = query(usersQuery, where("orgaoId", "==", meuTenant));
            
            const usersSnap = await getDocs(usersQuery);
            userSelect.innerHTML = '<option value="all">Todos os usuários</option>';
            usersSnap.forEach(doc => { const user = doc.data(); if (user.email) userSelect.appendChild(new Option(user.name || user.email, user.email)); });
        }
        if (actionSelect) {
            let logsQuery = collection(db, "audit_logs");
            if (!isAdminGlobal) logsQuery = query(logsQuery, where("orgaoId", "==", meuTenant));
            
            const logsSnap = await getDocs(logsQuery);
            const actions = new Set();
            logsSnap.forEach(doc => { const action = doc.data().action; if (action) actions.add(action); });
            actionSelect.innerHTML = '<option value="all">Todas as ações</option>';
            Array.from(actions).sort().forEach(action => actionSelect.appendChild(new Option(action, action)));
        }
    } catch (error) { console.error("Erro ao carregar filtros:", error); }
};

export const loadAuditLogs = async (db) => {
    const logsContainer = document.getElementById('audit-logs-container');
    const tableBody = document.getElementById('audit-logs-table-body');
    const pdfBtn = document.getElementById('export-audit-pdf-btn');
    const filterSection = document.getElementById('audit-filters-section');
    
    if (!logsContainer || !tableBody) return;
    if (filterSection) filterSection.classList.remove('hidden');
    logsContainer.classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-xs text-slate-400">Carregando registros...</td></tr>';
    if (pdfBtn) pdfBtn.classList.add('hidden');

    try {
        if (document.getElementById('filter-log-user')?.options.length <= 1) await loadLogFilters(db);

        const logsRef = collection(db, "audit_logs");
        const userFilter = document.getElementById('filter-log-user')?.value;
        const actionFilter = document.getElementById('filter-log-action')?.value;
        const startDate = document.getElementById('filter-log-start')?.value;
        const endDate = document.getElementById('filter-log-end')?.value;

        const q = query(logsRef, orderBy("timestamp", "desc"), limit(5000));
        const snapshot = await getDocs(q);

        const isAdminGlobal = globalApp?.currentUser?.role === 'superadmin' || globalApp?.currentUser?.role === 'superadmin_global';
        const meuTenant = globalApp?.currentUser?.orgaoId;

        let filteredLogs = [];
        snapshot.forEach((docSnap) => {
            const log = docSnap.data();
            if (!log.timestamp) return;
            
            if (!isAdminGlobal && log.orgaoId !== meuTenant) return;
            
            if (userFilter && userFilter !== 'all' && log.userEmail !== userFilter) return;
            if (actionFilter && actionFilter !== 'all' && log.action !== actionFilter) return;
            if (startDate && log.timestamp < startDate) return;
            if (endDate && log.timestamp > endDate + "T23:59:59") return;
            
            filteredLogs.push(log);
        });
        
        cachedLogs = filteredLogs;
        renderLogsTable(db);
        
        if (pdfBtn && filteredLogs.length > 0) pdfBtn.classList.remove('hidden');
        
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-xs text-red-500">Erro ao carregar registros.</td></tr>`;
    }
};

function renderLogsTable(db) {
    const tableBody = document.getElementById('audit-logs-table-body');
    if (!tableBody) return;
    
    let logs = [...cachedLogs];
    if (adminFilters.logs.search) {
        const search = adminFilters.logs.search.toLowerCase();
        logs = logs.filter(log => 
            (log.userName || '').toLowerCase().includes(search) ||
            (log.action || '').toLowerCase().includes(search) ||
            (log.details || '').toLowerCase().includes(search)
        );
    }
    
    const { page, pageSize } = adminFilters.logs;
    const start = (page - 1) * pageSize;
    const paginated = logs.slice(start, start + pageSize);
    const totalPages = Math.ceil(logs.length / pageSize);
    
    if (logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-xs text-slate-400">Nenhum registro encontrado.</td></tr>';
        document.getElementById('pagination-logs')?.classList.add('hidden');
        return;
    }
    
    tableBody.innerHTML = paginated.map(log => {
        let formattedDate = '-';
        try {
            const date = new Date(log.timestamp);
            if (!isNaN(date.getTime())) formattedDate = date.toLocaleString('pt-BR');
        } catch (e) {}
        
        return `
            <tr class="border-b border-slate-200 hover:bg-slate-50 transition">
                <td class="px-3 py-2 whitespace-nowrap text-[11px] text-slate-600 font-mono">${escapeHTML(formattedDate)}</td>
                <td class="px-3 py-2"><p class="font-bold text-slate-800 text-xs">${escapeHTML(log.userName || log.userEmail || 'Desconhecido')}</p></td>
                <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200 uppercase">${escapeHTML(log.action || 'ACAO')}</span></td>
                <td class="px-3 py-2 text-xs text-slate-600 max-w-xs break-words">${escapeHTML(log.details || '-')}${log.pautaId && log.pautaId !== 'N/A' ? `<br><span class="text-[9px] text-slate-400 font-mono">ID: ${escapeHTML(log.pautaId.substring(0,8))}</span>` : ''}</td>
            </tr>
        `;
    }).join('');
    
    renderPageSizeSelector('page-size-logs', pageSize, (newSize) => {
        adminFilters.logs.pageSize = newSize;
        adminFilters.logs.page = 1;
        renderLogsTable(db);
    });
    renderPagination('pagination-logs', page, totalPages, (newPage) => {
        adminFilters.logs.page = newPage;
        renderLogsTable(db);
    });
}

export const setupAdminSearch = () => {
    renderSearchInput('search-pendentes', 'Pesquisar pendentes...', (val) => {
        adminFilters.pendentes.search = val;
        adminFilters.pendentes.page = 1;
        if (globalApp) loadUsersList(globalApp.db);
    });
    renderSearchInput('search-usuarios', 'Pesquisar usuários...', (val) => {
        adminFilters.usuarios.search = val;
        adminFilters.usuarios.page = 1;
        if (globalApp) loadUsersList(globalApp.db);
    });
    renderSearchInput('search-logs', 'Pesquisar logs...', (val) => {
        adminFilters.logs.search = val;
        adminFilters.logs.page = 1;
        if (globalApp) renderLogsTable(globalApp.db);
    });
};

export const exportAuditLogsPDF = async (db) => {
    showNotification("Gerando relatório PDF...", "info");
    try {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF({ orientation: 'landscape' });
        const logs = cachedLogs;
        if (logs.length === 0) { showNotification("Nenhum registro para exportar.", "warning"); return; }
        docPDF.setFontSize(16); docPDF.setTextColor(55, 65, 81);
        docPDF.text("Relatório de Auditoria Operacional - SIGEP", 14, 20);
        
        const body = logs.slice(0, 500).map(log => [
            log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : '-',
            `${log.userName || log.userEmail || 'Desconhecido'}`,
            log.action || '-',
            (log.details || '-').substring(0, 100)
        ]);
        docPDF.autoTable({ head: [['Data/Hora', 'Usuário', 'Ação', 'Detalhes']], body: body, startY: 35, theme: 'striped' });
        docPDF.save(`Auditoria_SIGEP_${new Date().toISOString().slice(0,10)}.pdf`);
        showNotification("Relatório exportado.", "success");
    } catch (error) { showNotification("Erro ao gerar PDF.", "error"); }
};

// ==========================================
// DASHBOARD E INTELIGENCIA (BI)
// ==========================================

export const cleanupOldData = async (db) => {
    if (!confirm("Confirma a compactação de dados com mais de 7 dias para o BI?")) return;
    try {
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 7);
        
        const isAdminGlobal = globalApp?.currentUser?.role === 'superadmin' || globalApp?.currentUser?.role === 'superadmin_global';
        let pautasQuery = collection(db, "pautas");
        
        if (!isAdminGlobal) {
            pautasQuery = query(pautasQuery, where("orgaoId", "==", globalApp.currentUser.orgaoId));
        }
        
        const pautas = await getDocs(pautasQuery);
        let count = 0; let statsCount = 0;
        
        for (const pautaDoc of pautas.docs) {
            const pautaData = pautaDoc.data();
            const attRef = collection(db, "pautas", pautaDoc.id, "attendances");
            const q = query(attRef, where("createdAt", "<", limitDate.toISOString()));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const stats = { 
                    pautaName: pautaData.name || 'Sem nome', 
                    creatorEmail: pautaData.ownerEmail || pautaData.memberEmails?.[0] || 'Desconhecido', 
                    dataReferencia: limitDate.toISOString(), 
                    diaSemana: limitDate.getDay(), 
                    total: snapshot.size, 
                    atendidos: snapshot.docs.filter(d => d.data().status === 'atendido').length, 
                    faltosos: snapshot.docs.filter(d => d.data().status === 'faltoso').length, 
                    assuntos: {}, 
                    atendentes: {},
                    orgaoId: globalApp?.currentUser?.orgaoId || 'padrao_dprj' 
                };
                
                snapshot.docs.forEach(d => {
                    const data = d.data();
                    const sub = data.subject || 'Não informado';
                    stats.assuntos[sub] = (stats.assuntos[sub] || 0) + 1;
                    let profissionalNome = 'Não atribuído';
                    if (data.attendedBy) profissionalNome = typeof data.attendedBy === 'object' ? (data.attendedBy.nome || data.attendedBy.name) : data.attendedBy;
                    if (profissionalNome) stats.atendentes[profissionalNome] = (stats.atendentes[profissionalNome] || 0) + 1;
                });
                
                await addDoc(collection(db, "estatisticas_permanentes"), stats);
                statsCount++;
                const batch = writeBatch(db);
                snapshot.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                count += snapshot.size;
            }
        }
        showNotification(`Compactação concluída: ${count} registros consolidados.`, "success");
        if (window.loadDashboardData) window.loadDashboardData();
    } catch (error) { showNotification("Erro na compactação: " + error.message, "error"); }
};

export const loadDashboardData = async (db) => {
    const start = document.getElementById('stats-filter-start')?.value;
    const end = document.getElementById('stats-filter-end')?.value;
    const userFilter = document.getElementById('stats-filter-user')?.value;
    
    const resultsArea = document.getElementById('dashboard-results');
    if (!resultsArea) return;

    resultsArea.classList.remove('hidden');
    resultsArea.innerHTML = '<div class="text-center py-6 text-xs text-slate-500">Calculando indicadores executivos...</div>';
    
    try {
        const snapshot = await getDocs(collection(db, "estatisticas_permanentes"));
        if (snapshot.empty) {
            resultsArea.innerHTML = `<div class="text-center py-8 bg-white rounded-xl border border-slate-200 text-xs text-slate-500">Nenhum dado analítico consolidado encontrado.</div>`;
            return;
        }
        
        const isAdminGlobal = globalApp?.currentUser?.role === 'superadmin' || globalApp?.currentUser?.role === 'superadmin_global';
        const meuTenant = globalApp?.currentUser?.orgaoId;

        let rawData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        let filteredData = [...rawData];
        
        if (!isAdminGlobal) {
            filteredData = filteredData.filter(d => d.orgaoId === meuTenant);
        }
        
        if (start) filteredData = filteredData.filter(d => d.dataReferencia && d.dataReferencia >= start);
        if (end) filteredData = filteredData.filter(d => d.dataReferencia && d.dataReferencia <= end + "T23:59:59");
        if (userFilter && userFilter !== 'all') filteredData = filteredData.filter(d => d.creatorEmail === userFilter);
        
        let totalGeral = 0, totalAtendidos = 0, totalFaltosos = 0, mapAssuntos = {}, mapUsers = {};
        
        filteredData.forEach(d => {
            totalGeral += d.total || 0; 
            totalAtendidos += d.atendidos || 0; 
            totalFaltosos += d.faltosos || 0;
            if (d.assuntos) for (let [k, v] of Object.entries(d.assuntos)) mapAssuntos[k] = (mapAssuntos[k] || 0) + v;
            if (d.atendentes) for (let [k, v] of Object.entries(d.atendentes)) mapUsers[k] = (mapUsers[k] || 0) + v;
        });
        
        const taxa = totalGeral > 0 ? ((totalFaltosos / totalGeral) * 100).toFixed(1) : 0;
        
        resultsArea.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Demanda Total</p>
                    <h4 class="text-xl font-black text-slate-800 mt-1">${totalGeral}</h4>
                </div>
                <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
                    <p class="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Atendimentos Realizados</p>
                    <h4 class="text-xl font-black text-emerald-700 mt-1">${totalAtendidos}</h4>
                </div>
                <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
                    <p class="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Taxa de Absenteísmo</p>
                    <h4 class="text-xl font-black text-amber-700 mt-1">${taxa}%</h4>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
                    <h5 class="text-[11px] font-bold mb-3 uppercase text-slate-500 tracking-wider border-b border-slate-100 pb-2">Principais Assuntos</h5>
                    <div id="dash-subjects-list" class="space-y-2 text-xs"></div>
                </div>
                <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
                    <h5 class="text-[11px] font-bold mb-3 uppercase text-slate-500 tracking-wider border-b border-slate-100 pb-2">Produtividade por Atendente</h5>
                    <div id="dash-users-list" class="space-y-2 text-xs"></div>
                </div>
            </div>
        `;
        
        const renderRanking = (elementId, dataMap) => {
            const el = document.getElementById(elementId);
            const sorted = Object.entries(dataMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
            if (sorted.length === 0) { el.innerHTML = '<p class="text-center text-slate-400 py-3 text-xs italic">Sem dados suficientes.</p>'; return; }
            el.innerHTML = sorted.map(([name, count]) => `
                <div class="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 text-xs">
                    <span class="truncate pr-2 font-medium text-slate-700">${escapeHTML(name)}</span>
                    <span class="font-bold text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px]">${count}</span>
                </div>
            `).join('');
        };
        
        renderRanking('dash-subjects-list', mapAssuntos);
        renderRanking('dash-users-list', mapUsers);
        
    } catch (error) { 
        resultsArea.innerHTML = `<div class="text-center py-6 text-xs text-red-500 font-semibold border border-red-200 bg-red-50 rounded-xl">Erro ao carregar BI: ${error.message}</div>`; 
    }
};

export const populateUserFilter = async (db) => {
    const select = document.getElementById('stats-filter-user');
    if (!select) return;
    try {
        const isAdminGlobal = globalApp?.currentUser?.role === 'superadmin' || globalApp?.currentUser?.role === 'superadmin_global';
        let usersQuery = collection(db, "users");
        
        if (!isAdminGlobal) {
            usersQuery = query(usersQuery, where("orgaoId", "==", globalApp.currentUser.orgaoId));
        }
        
        const snapshot = await getDocs(usersQuery);
        select.innerHTML = '<option value="all">Todos os usuários</option>';
        snapshot.forEach(d => { if (d.data().email) select.appendChild(new Option(d.data().name || d.data().email, d.data().email)); });
    } catch (e) {}
};

// ============================================================================
// GESTAO DE CLIENTES / TENANTS (EXCLUSIVO SUPERADMIN_GLOBAL)
// ============================================================================

export const carregarOrgaos = async (db) => {
    try {
        const snapshot = await getDocs(collection(db, "orgaos_clientes"));
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        return [];
    }
};

export const abrirGerenciadorTenants = async (db) => {
    if (globalApp?.currentUser?.role !== 'superadmin_global') {
        showNotification("Acesso restrito a administradores globais.", "error");
        return;
    }

    let orgaos = await carregarOrgaos(db);
    
    const renderLista = () => {
        const container = document.getElementById('lista-tenants-admin');
        if (!container) return;
        
        if (orgaos.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center py-8 text-slate-400 text-xs">Nenhum cliente cadastrado.</div>';
            return;
        }
        
        container.innerHTML = orgaos.map(org => `
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-slate-800 text-sm">${escapeHTML(org.nome)}</h4>
                        <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${org.ativo !== false ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}">
                            ${org.ativo !== false ? 'Ativo' : 'Bloqueado'}
                        </span>
                    </div>
                    <p class="text-[11px] font-mono text-slate-400 mb-4">Identificador: ${escapeHTML(org.id)}</p>
                </div>
                
                <button class="btn-toggle-tenant w-full ${org.ativo !== false ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'} font-semibold py-2 rounded-lg text-xs transition" data-id="${org.id}" data-ativo="${org.ativo !== false}">
                    ${org.ativo !== false ? 'Bloquear Acesso' : 'Desbloquear Acesso'}
                </button>
            </div>
        `).join('');
        
        container.querySelectorAll('.btn-toggle-tenant').forEach(btn => {
            btn.addEventListener('click', async () => {
                const isAtivo = btn.dataset.ativo === 'true';
                const novoStatus = !isAtivo;
                const acao = novoStatus ? 'desbloquear' : 'bloquear';
                
                if (confirm(`Confirma a alteração para ${acao} este cliente?`)) {
                    btn.disabled = true;
                    btn.textContent = 'Salvando...';
                    try {
                        await updateDoc(doc(db, "orgaos_clientes", btn.dataset.id), { ativo: novoStatus, updatedAt: new Date().toISOString() });
                        showNotification("Status do cliente atualizado.", "success");
                        orgaos = await carregarOrgaos(db);
                        renderLista();
                    } catch (e) {
                        showNotification("Erro ao atualizar status.", "error");
                        btn.disabled = false;
                    }
                }
            });
        });
    };
    
    const modal = document.createElement('div');
    modal.id = 'gerenciador-tenants-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4 overflow-y-auto backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="bg-slate-900 px-6 py-4 flex justify-between items-center text-white shrink-0 border-b border-slate-800">
                <div>
                    <h2 class="font-bold text-sm tracking-wide">Gestão Corporativa de Clientes (Tenants)</h2>
                    <p class="text-slate-400 text-xs mt-0.5">Painel de controle de órgãos e prefeituras contratantes</p>
                </div>
                <button id="fechar-gerenciador-tenants" class="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3">Cadastrar Novo Cliente</h3>
                    <div class="flex flex-col sm:flex-row gap-3">
                        <input type="text" id="novo-tenant-nome" placeholder="Nome do Órgão ou Cliente (Ex: Prefeitura de Maricá)" class="flex-1 p-2.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-slate-900">
                        <button id="btn-salvar-tenant" class="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-2.5 rounded-lg text-xs transition shrink-0">Cadastrar Cliente</button>
                    </div>
                </div>
                
                <div>
                    <h3 class="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3">Clientes Cadastrados</h3>
                    <div id="lista-tenants-admin" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    renderLista();
    
    document.getElementById('fechar-gerenciador-tenants').addEventListener('click', () => modal.remove());
    
    document.getElementById('btn-salvar-tenant').addEventListener('click', async () => {
        const inputNome = document.getElementById('novo-tenant-nome');
        const nome = inputNome.value.trim();
        
        if (!nome) {
            showNotification("Informe o nome do cliente.", "error");
            return;
        }
        
        const btn = document.getElementById('btn-salvar-tenant');
        btn.disabled = true;
        btn.textContent = 'Salvando...';
        
        try {
            const tenantId = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            
            await setDoc(doc(db, "orgaos_clientes", tenantId), {
                id: tenantId,
                nome: nome,
                ativo: true,
                createdAt: new Date().toISOString()
            });
            
            showNotification("Cliente cadastrado com sucesso.", "success");
            inputNome.value = '';
            orgaos = await carregarOrgaos(db);
            renderLista();
            
        } catch (error) {
            showNotification("Erro ao cadastrar cliente.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = 'Cadastrar Cliente';
        }
    });
};

export const setupAdminEvents = (app) => {
    globalApp = app;

    setupAdminSearch();
    loadUsersList(app.db);
    populateUserFilter(app.db);

    document.getElementById('btn-unidades-master')?.addEventListener('click', () => {
        if (window.ImportadorOrgaosService && typeof window.ImportadorOrgaosService.abrirModalMaster === 'function') {
            window.ImportadorOrgaosService.abrirModalMaster(app);
        } else {
            abrirGerenciadorUnidades(app.db);
        }
    });

    document.getElementById('btn-recepcoes-master')?.addEventListener('click', () => {
        abrirModalGerenciarRecepcoesGlobal(app);
    });

    document.getElementById('admin-back-to-pautas-btn')?.addEventListener('click', () => {
        if (app.router) app.router.navigate('pauta-selection', {}, false);
    });

    document.getElementById('view-audit-logs-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('view-audit-logs-btn');
        if (btn) { btn.textContent = "Carregando..."; btn.disabled = true; }
        await loadAuditLogs(app.db);
        if (btn) { btn.textContent = "Carregar Logs"; btn.disabled = false; }
    });

    document.getElementById('cleanup-old-data-btn')?.addEventListener('click', () => {
        cleanupOldData(app.db);
    });

    document.getElementById('btn-load-dashboard')?.addEventListener('click', () => {
        loadDashboardData(app.db);
    });

    document.getElementById('export-audit-pdf-btn')?.addEventListener('click', () => {
        exportAuditLogsPDF(app.db);
    });

    document.getElementById('filter-log-user')?.addEventListener('change', () => loadAuditLogs(app.db));
    document.getElementById('filter-log-action')?.addEventListener('change', () => loadAuditLogs(app.db));
    document.getElementById('filter-log-start')?.addEventListener('change', () => loadAuditLogs(app.db));
    document.getElementById('filter-log-end')?.addEventListener('change', () => loadAuditLogs(app.db));

    // INJECAO DO BOTAO DE GESTAO DE CLIENTES (EXCLUSIVO PARA SUPERADMIN_GLOBAL)
    const roleUsuario = app?.currentUser?.role;
    if (roleUsuario === 'superadmin_global') {
        const btnContainer = document.getElementById('btn-unidades-master')?.parentElement;
        if (btnContainer && !document.getElementById('btn-gerenciar-tenants')) {
            const btnTenants = document.createElement('button');
            btnTenants.id = 'btn-gerenciar-tenants';
            btnTenants.className = 'bg-slate-900 hover:bg-slate-800 text-white font-semibold px-4 py-2 rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 ml-auto';
            btnTenants.innerHTML = 'Gestão de Clientes';
            btnTenants.onclick = () => abrirGerenciadorTenants(app.db);
            btnContainer.appendChild(btnTenants);
        }
    }
};

window.approveUser = (userId) => {
    if (globalApp) approveUser(globalApp.db, userId);
    else console.error("App não inicializado");
};

window.updateUserRole = (userId) => {
    if (globalApp) updateUserRole(globalApp.db, userId);
    else console.error("App não inicializado");
};

window.toggleSuspendUser = (userId, isSuspended) => {
    if (globalApp) toggleSuspendUser(globalApp.db, userId, isSuspended);
    else console.error("App não inicializado");
};

window.deleteUser = (userId) => {
    if (globalApp) deleteUser(globalApp.db, userId);
    else console.error("App não inicializado");
};

window.gerenciarUnidades = (userId) => {
    if (globalApp) abrirGerenciarUnidadesUsuario(globalApp, userId);
    else console.error("App não inicializado");
};

window.abrirGerenciadorUnidades = () => {
    if (globalApp) abrirGerenciarUnidades(globalApp.db);
    else console.error("App não inicializado");
};

window.abrirImportadorUnidades = () => {
    if (globalApp) abrirImportadorUnidades(globalApp.db);
    else console.error("App não inicializado");
};

window.abrirModalUsuariosPorUnidade = (unidadeId, unidadeNome) => {
    if (globalApp) abrirModalUsuariosPorUnidade(globalApp.db, unidadeId, unidadeNome);
    else console.error("App não inicializado");
};

window.abrirModalGerenciarRecepcoesGlobal = () => {
    if (globalApp) abrirModalGerenciarRecepcoesGlobal(globalApp);
    else console.error("App não inicializado");
};

window.renderEstruturaAtual = (container) => {
    if (globalApp) renderEstruturaAtual(globalApp, container);
    else console.error("App não inicializado");
};

window.cleanupOldData = () => {
    if (globalApp) cleanupOldData(globalApp.db);
    else console.error("App não inicializado");
};

window.loadDashboardData = () => {
    if (globalApp) loadDashboardData(globalApp.db);
    else console.error("App não inicializado");
};

window.populateUserFilter = () => {
    if (globalApp) populateUserFilter(globalApp.db);
    else console.error("App não inicializado");
};

window.loadAuditLogs = () => {
    if (globalApp) loadAuditLogs(globalApp.db);
    else console.error("App não inicializado");
};

window.exportAuditLogsPDF = () => {
    if (globalApp) exportAuditLogsPDF(globalApp.db);
    else console.error("App não inicializado");
};

window.setupAdminSearch = () => setupAdminSearch();

export const AdminService = {
    carregarUnidades,
    criarUnidade,
    atualizarUnidade,
    excluirUnidade,
    abrirImportadorUnidades,
    abrirModalUsuariosPorUnidade,
    abrirGerenciadorUnidades,
    setupAdminSearch,
    loadAuditLogs,
    exportAuditLogsPDF,
    cleanupOldData,
    loadDashboardData,
    populateUserFilter,
    approveUser,
    updateUserRole,
    toggleSuspendUser,
    deleteUser,
    carregarOrgaos,
    abrirGerenciadorTenants,
    setupAdminEvents,
    abrirModalGerenciarRecepcoesGlobal,
};

console.log("AdminService executivo com suporte Multi-Tenant registrado.");
