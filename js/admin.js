// js/admin.js - MÓDULO DE AUDITORIA, SEGURANÇA, REGISTROS DO BI E GERENCIAMENTO DE UNIDADES (SIGEP)

import { 
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc, 
    query, orderBy, limit, where, writeBatch, setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

// ============================================================
// IMPORTAÇÃO DOS COMPONENTES HOMOLOGADOS
// ============================================================
import { abrirGerenciarUnidades } from './gerenciarUnidadesUsuario.js';
import { abrirModalNovaRecepcao } from './novaRecepcao.js';
import { renderEstruturaAtual } from './estruturaAtual.js';

// ============================================================
// CONTROLE DE PAGINAÇÃO E FILTROS
// ============================================================

let adminFilters = {
    usuarios: { page: 1, pageSize: 10, search: '' },
    pendentes: { page: 1, pageSize: 5, search: '' },
    logs: { page: 1, pageSize: 10, search: '' }
};

let cachedUsuarios = [];
let cachedPendentes = [];
let cachedLogs = [];

// ============================================================
// VARIÁVEL GLOBAL DO APP
// ============================================================
let globalApp = null;

// ============================================================
// FUNÇÃO PARA GRAVAR LOG DE AUDITORIA
// ============================================================

export const logAction = async (db, auth, userName, currentPautaId, actionType, details, targetId = null) => {
    try {
        if (!auth?.currentUser) return;
        const logData = {
            action: actionType || 'AÇÃO_DESCONHECIDA',
            details: details || 'Sem detalhes',
            targetId: targetId || null,
            pautaId: currentPautaId || 'N/A',
            userEmail: auth.currentUser.email || 'email@desconhecido',
            userId: auth.currentUser.uid || 'uid_desconhecido',
            userName: userName || auth.currentUser.email || 'Desconhecido',
            timestamp: new Date().toISOString()
        };
        await addDoc(collection(db, "audit_logs"), logData);
    } catch (error) { 
        console.error("❌ Erro ao registrar log:", error); 
    }
};

// ============================================================
// MÓDULO DE GERENCIAMENTO DE UNIDADES/ÓRGÃOS (CRUD + IMPORTAÇÃO + PESQUISA)
// ============================================================

export const carregarUnidades = async (db) => {
    try {
        const snapshot = await getDocs(collection(db, "unidades"));
        if (!snapshot.empty) {
            return snapshot.docs.filter(d => d.data().ativo !== false).map(doc => ({ id: doc.id, ...doc.data() }));
        }
        return [];
    } catch (error) {
        console.error("Erro ao carregar unidades:", error);
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
        showNotification(`Unidade "${dados.nome}" criada com sucesso!`, "success");
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
        showNotification(`Unidade "${dados.nome}" atualizada!`, "success");
        return true;
    } catch (error) {
        showNotification("Erro ao atualizar unidade: " + error.message, "error");
        return false;
    }
};

export const excluirUnidade = async (db, unidadeId, unidadeNome) => {
    if (!confirm(`Tem certeza que deseja excluir a unidade "${unidadeNome}"?\n\nUsuários vinculados a esta unidade perderão acesso.`)) return false;
    
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
                batch.update(userDoc.ref, { 
                    unidades: novasUnidades,
                    updatedAt: new Date().toISOString()
                });
                usuariosAfetados++;
            }
        }
        
        if (usuariosAfetados > 0) {
            await batch.commit();
            showNotification(`Unidade "${unidadeNome}" desativada e removida de ${usuariosAfetados} usuário(s)!`, "info");
        } else {
            showNotification(`Unidade "${unidadeNome}" desativada!`, "info");
        }
        
        return true;
    } catch (error) {
        console.error("Erro ao excluir unidade:", error);
        showNotification("Erro ao excluir unidade: " + error.message, "error");
        return false;
    }
};

// ============================================================
// MÓDULO DE IMPORTAÇÃO EM MASSA DE UNIDADES
// ============================================================

const parseCSVLinha = (linha) => {
    const resultado = [];
    let dentroAspas = false;
    let valorAtual = '';
    
    for (let i = 0; i < linha.length; i++) {
        const char = linha[i];
        if (char === '"') {
            dentroAspas = !dentroAspas;
        } else if (char === ',' && !dentroAspas) {
            resultado.push(valorAtual.trim());
            valorAtual = '';
        } else {
            valorAtual += char;
        }
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
                    headers.forEach((h, idx) => {
                        unidade[h] = valores[idx] || '';
                    });
                    
                    if (unidade.nome) {
                        unidades.push({
                            nome: unidade.nome,
                            sigla: unidade.sigla || '',
                            endereco: unidade.endereco || '',
                            telefone: unidade.telefone || '',
                            email: unidade.email || ''
                        });
                    }
                }
                resolve(unidades);
            } catch (err) {
                reject(err);
            }
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
                resolve(unidades.map(u => ({
                    nome: u.nome,
                    sigla: u.sigla || '',
                    endereco: u.endereco || '',
                    telefone: u.telefone || '',
                    email: u.email || ''
                })));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
};

const importarUnidadesEmMassa = async (db, unidades) => {
    const unidadesExistentes = await carregarUnidades(db);
    const nomesExistentes = new Set(unidadesExistentes.map(u => u.nome.toLowerCase()));
    
    let criadas = 0;
    let duplicadas = 0;
    
    for (const unidade of unidades) {
        if (nomesExistentes.has(unidade.nome.toLowerCase())) {
            duplicadas++;
            continue;
        }
        await criarUnidade(db, unidade);
        criadas++;
    }
    
    showNotification(`✅ ${criadas} unidade(s) importada(s)! ${duplicadas} duplicada(s) ignorada(s).`, criadas > 0 ? 'success' : 'warning');
};

export const abrirImportadorUnidades = async (db) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 z-[900] flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="bg-gradient-to-r from-blue-800 to-blue-700 px-6 py-4 flex justify-between items-center shrink-0">
                <div>
                    <h2 class="text-xl font-black text-white flex items-center gap-2"><span>📁</span> Importar Unidades em Massa</h2>
                    <p class="text-blue-100 text-sm mt-1">Importe múltiplas unidades de uma só vez via CSV ou JSON</p>
                </div>
                <button id="fechar-importador-unidades" class="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
                <div class="flex border-b">
                    <button class="tab-importador-unidades py-2 px-4 font-bold text-sm text-blue-600 border-b-2 border-blue-600" data-tab="upload">📤 Upload</button>
                    <button class="tab-importador-unidades py-2 px-4 font-bold text-sm text-gray-500" data-tab="modelo">📄 Modelo</button>
                    <button class="tab-importador-unidades py-2 px-4 font-bold text-sm text-gray-500" data-tab="manual">✏️ Manual</button>
                    <button class="tab-importador-unidades py-2 px-4 font-bold text-sm text-gray-500" data-tab="estrutura">🏛️ Estrutura Atual</button>
                </div>
                <div id="painel-upload-unidades" class="space-y-4">
                    <div class="border-2 border-dashed border-blue-300 rounded-2xl p-8 text-center">
                        <input type="file" id="arquivo-unidades" accept=".csv,.json" class="hidden">
                        <button id="btn-selecionar-arquivo-unidades" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition shadow-lg">📂 Selecionar Arquivo</button>
                        <p class="text-sm text-gray-500 mt-3">Suporta CSV ou JSON</p>
                    </div>
                    <div id="info-arquivo-unidades" class="hidden p-4 bg-green-50 rounded-xl border border-green-200">
                        <p class="text-green-700 font-bold">✅ Arquivo carregado!</p>
                        <p id="info-arquivo-unidades-detalhes" class="text-sm text-green-600 mt-1"></p>
                        <div class="mt-3 flex gap-3">
                            <button id="btn-previsualizar-unidades" class="bg-indigo-600 text-white px-4 py-2 rounded-lg">👁️ Pré-visualizar</button>
                            <button id="btn-importar-unidades" class="bg-green-600 text-white px-4 py-2 rounded-lg font-bold">🚀 Importar</button>
                        </div>
                    </div>
                    <div id="preview-unidades" class="hidden">
                        <h4 class="font-bold text-slate-700 mb-3">📋 Prévia</h4>
                        <div class="bg-slate-50 rounded-xl p-4 max-h-60 overflow-y-auto">
                            <table class="w-full text-sm"><thead class="bg-slate-200"><tr><th class="p-2">Nome</th><th class="p-2">Sigla</th></tr></thead><tbody id="preview-unidades-tbody"></tbody></table>
                        </div>
                    </div>
                </div>
                <div id="painel-modelo-unidades" class="hidden space-y-4">
                    <div class="bg-slate-50 rounded-xl p-6">
                        <h3 class="font-bold text-lg mb-4">📄 Formato Esperado</h3>
                        <pre class="bg-gray-800 text-white p-4 rounded-lg overflow-x-auto text-xs"><code>nome,sigla,endereco,telefone,email\n"DP Caxias","Defensoria Pública - Duque de Caxias","Av. Presidente Kennedy, s/n - Centro, Duque de Caxias - RJ","(21) 2675-1234","caxias@dperj.br"</code></pre>
                    </div>
                </div>
                <div id="painel-manual-unidades" class="hidden space-y-4">
                    <div class="bg-slate-50 rounded-xl p-6">
                        <h3 class="font-bold text-lg mb-4">✏️ Inserção Manual</h3>
                        <textarea id="manual-unidades-text" rows="6" class="w-full p-3 border rounded-lg font-mono text-sm" placeholder="sigla|nome|endereco|telefone|email"></textarea>
                        <button id="btn-importar-manual-unidades" class="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg font-bold">Importar</button>
                    </div>
                </div>
                <div id="painel-estrutura-unidades" class="hidden space-y-4" style="min-height: 500px;">
                    <div id="meu-container-estrutura" class="w-full"></div>
                </div>
            </div>
            <div class="bg-slate-50 px-6 py-4 flex justify-end border-t shrink-0">
                <button id="fechar-importador-unidades-footer" class="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg">Fechar</button>
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
                t.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
                t.classList.add('text-gray-500');
            });
            tab.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
            document.getElementById('painel-upload-unidades').classList.add('hidden');
            document.getElementById('painel-modelo-unidades').classList.add('hidden');
            document.getElementById('painel-manual-unidades').classList.add('hidden');
            document.getElementById('painel-estrutura-unidades').classList.add('hidden');
            document.getElementById(`painel-${aba}-unidades`).classList.remove('hidden');
            
            if (aba === 'estrutura') {
                const container = document.getElementById('meu-container-estrutura');
                if (container && globalApp) {
                    container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loader-small mx-auto"></div><p class="text-gray-500 mt-2">Carregando estrutura...</p></div>';
                    renderEstruturaAtual(globalApp, container).catch(err => {
                        console.error("Erro ao renderizar estrutura:", err);
                        container.innerHTML = `<p class="text-red-500 text-center p-8">Erro ao carregar estrutura: ${err.message}</p>`;
                    });
                } else if (!globalApp) {
                    console.warn("App não inicializado para renderEstruturaAtual");
                }
            }
        });
    });
    
    const fileInput = document.getElementById('arquivo-unidades');
    document.getElementById('btn-selecionar-arquivo-unidades')?.addEventListener('click', () => fileInput.click());
    
    let dadosImportados = null;
    
    fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const infoDiv = document.getElementById('info-arquivo-unidades');
        const infoDetalhes = document.getElementById('info-arquivo-unidades-detalhes');
        try {
            const extensao = file.name.split('.').pop().toLowerCase();
            let unidades = [];
            if (extensao === 'csv') unidades = await parseCSVUnidades(file);
            else if (extensao === 'json') unidades = await parseJSONUnidades(file);
            else { showNotification("Formato não suportado", "error"); return; }
            dadosImportados = unidades;
            infoDetalhes.textContent = `Arquivo: ${file.name} | ${unidades.length} unidade(s)`;
            infoDiv.classList.remove('hidden');
        } catch (error) {
            showNotification("Erro ao ler arquivo", "error");
        }
    });
    
    document.getElementById('btn-previsualizar-unidades')?.addEventListener('click', () => {
        if (!dadosImportados?.length) { showNotification("Nenhum dado", "warning"); return; }
        const tbody = document.getElementById('preview-unidades-tbody');
        tbody.innerHTML = dadosImportados.slice(0, 10).map(u => `<tr class="border-b"><td class="p-2">${escapeHTML(u.nome)}</td><td class="p-2">${escapeHTML(u.sigla || '-')}</td></tr>`).join('');
        document.getElementById('preview-unidades').classList.remove('hidden');
    });
    
    document.getElementById('btn-importar-unidades')?.addEventListener('click', async () => {
        if (!dadosImportados?.length) { showNotification("Nenhum dado", "error"); return; }
        await importarUnidadesEmMassa(db, dadosImportados);
        fechar();
        if (window.abrirGerenciadorUnidades) window.abrirGerenciadorUnidades();
    });
    
    document.getElementById('btn-importar-manual-unidades')?.addEventListener('click', async () => {
        const texto = document.getElementById('manual-unidades-text').value.trim();
        if (!texto) { showNotification("Digite as unidades", "error"); return; }
        const unidades = texto.split('\n').filter(l => l.trim()).map(l => {
            const p = l.split('|').map(v => v.trim());
            return { sigla: p[0] || '', nome: p[1] || '', endereco: p[2] || '', telefone: p[3] || '', email: p[4] || '' };
        }).filter(u => u.nome);
        if (!unidades.length) { showNotification("Nenhuma unidade válida", "error"); return; }
        await importarUnidadesEmMassa(db, unidades);
        fechar();
        if (window.abrirGerenciadorUnidades) window.abrirGerenciadorUnidades();
    });
};

// ============================================================
// FUNÇÃO PARA VISUALIZAR USUÁRIOS VINCULADOS À UNIDADE
// ============================================================

export const abrirModalUsuariosPorUnidade = async (db, unidadeId, unidadeNome) => {
    if (!db || !unidadeId) {
        showNotification("Erro ao abrir: dados da unidade não encontrados.", "error");
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4';
    modal.innerHTML = `<div class="bg-white p-6 rounded-2xl w-full max-w-lg shadow-2xl text-center"><div class="loader-small mx-auto mb-4"></div><p class="text-gray-600">Carregando usuários vinculados a ${escapeHTML(unidadeNome)}...</p></div>`;
    document.body.appendChild(modal);

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const usuariosVinculados = usersSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(u => u.unidades?.some(un => un.unidadeId === unidadeId) && u.status !== 'pending' && u.role !== 'suspended');

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh] animate-fadeIn">
                <div class="bg-gradient-to-r from-emerald-700 to-emerald-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="font-black text-lg flex items-center gap-2">Usuários Vinculados</h3>
                        <p class="text-emerald-100 text-sm mt-1">${escapeHTML(unidadeNome)}</p>
                    </div>
                    <button id="fechar-usuarios-unidade" class="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
                </div>
                <div class="p-4 overflow-y-auto flex-1">
                    ${usuariosVinculados.length > 0 
                        ? `<div class="space-y-2">
                            <div class="text-xs text-gray-500 mb-2 px-1">Total: <span class="font-bold text-emerald-600">${usuariosVinculados.length}</span> usuário(s)</div>
                            ${usuariosVinculados.map(u => `
                            <div class="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <div class="flex justify-between items-start">
                                    <div class="flex-1">
                                        <p class="font-bold text-gray-800 text-sm flex items-center gap-2">
                                            ${escapeHTML(u.name || 'Sem nome')}
                                            <span class="text-[9px] ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} px-2 py-0.5 rounded-full uppercase font-mono">${u.role || 'user'}</span>
                                        </p>
                                        <p class="text-xs text-gray-500 mt-0.5 break-all">${escapeHTML(u.email || '')}</p>
                                    </div>
                                </div>
                            </div>`).join('')}
                          </div>`
                        : '<div class="text-center py-12 text-gray-400"><p>Nenhum usuário ativo vinculado a esta unidade.</p></div>'
                    }
                </div>
                <div class="p-4 border-t bg-gray-50 flex justify-end shrink-0">
                    <button id="fechar-usuarios-unidade-footer" class="bg-gray-200 hover:bg-gray-300 px-5 py-2 rounded-xl text-sm font-bold transition-colors">Fechar</button>
                </div>
            </div>
        `;

        const closeModal = () => modal.remove();
        document.getElementById('fechar-usuarios-unidade')?.addEventListener('click', closeModal);
        document.getElementById('fechar-usuarios-unidade-footer')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        
    } catch (error) {
        console.error("Erro ao carregar usuários da unidade:", error);
        showNotification("Erro ao carregar usuários da unidade.", "error");
        modal.remove();
    }
};

// ============================================================
// GERENCIADOR PRINCIPAL DE UNIDADES
// ============================================================

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
            container.innerHTML = '<div class="col-span-full text-center py-8 text-slate-400">Nenhuma unidade encontrada.</div>';
            return;
        }
        
        container.innerHTML = filtradas.map(unidade => `
            <div class="border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-all duration-200">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h4 class="font-bold text-slate-800 text-base">${escapeHTML(unidade.nome)}</h4>
                        <p class="text-xs text-slate-500">${escapeHTML(unidade.sigla || 'Sem sigla')}</p>
                        ${unidade.endereco ? `<p class="text-[10px] text-slate-400 mt-1">📍 ${escapeHTML(unidade.endereco)}</p>` : ''}
                    </div>
                    <div class="flex gap-1">
                        <button class="btn-ver-usuarios text-emerald-600 hover:text-emerald-800 p-1.5 rounded-full hover:bg-emerald-50 transition-all" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" title="Ver usuários vinculados">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        </button>
                        <button class="btn-editar-unidade text-blue-500 hover:text-blue-700 p-1.5 rounded-full hover:bg-blue-50 transition-all" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" data-sigla="${escapeHTML(unidade.sigla || '')}" 
                                data-endereco="${escapeHTML(unidade.endereco || '')}" data-telefone="${escapeHTML(unidade.telefone || '')}" data-email="${escapeHTML(unidade.email || '')}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button class="btn-excluir-unidade text-red-500 hover:text-red-700 p-1.5 rounded-full hover:bg-red-50 transition-all" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                        <button class="btn-nova-recepcao text-purple-500 hover:text-purple-700 p-1.5 rounded-full hover:bg-purple-50 transition-all" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" title="Nova Recepção">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
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
                id: btn.dataset.id,
                nome: btn.dataset.nome,
                sigla: btn.dataset.sigla,
                endereco: btn.dataset.endereco,
                telefone: btn.dataset.telefone,
                email: btn.dataset.email
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

        container.querySelectorAll('.btn-nova-recepcao').forEach(btn => {
            btn.addEventListener('click', () => {
                if (globalApp) {
                    // E na leitura:
abrirModalNovaRecepcao(globalApp, {
    unidadeId: btn.dataset.id,
    unidadeNome: btn.dataset.nome,
    orgaoId: btn.dataset.orgaoid   // ← campo correto
});
                } else {
                    showNotification("Módulo de Nova Recepção não carregado.", "error");
                }
            });
        });
    };
    
    const modal = document.createElement('div');
    modal.id = 'gerenciador-unidades-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[700] flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex justify-between items-center shrink-0">
                <div>
                    <h2 class="text-xl font-black text-white flex items-center gap-2">Gerenciar Unidades / Órgãos</h2>
                    <p class="text-slate-300 text-sm mt-0.5">SIGEP - Defensoria Pública</p>
                </div>
                <button id="fechar-gerenciador-unidades" class="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
            </div>
            <div class="flex-1 overflow-y-auto p-6">
                <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                    <div class="relative w-full sm:w-80"><input type="text" id="pesquisa-unidades" placeholder="🔍 Pesquisar unidade..." class="w-full p-2 pl-8 border rounded-lg text-sm"></div>
                    <div class="flex gap-3">
                        <button id="btn-importar-unidades-massa" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"><span>📁</span> Importar em Massa</button>
                        <button id="btn-nova-unidade" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"><span>➕</span> Nova Unidade</button>
                    </div>
                </div>
                <div id="lista-unidades-admin" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
            </div>
            <div class="bg-slate-50 px-6 py-4 flex justify-end border-t shrink-0"><button id="fechar-gerenciador-unidades-footer" class="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg">Fechar</button></div>
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

const abrirModalFormUnidade = async (db, unidade = null, onClose) => {
    const isEdicao = !!unidade;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/60 z-[800] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div class="bg-slate-800 px-6 py-4 sticky top-0 flex justify-between items-center">
                <h3 class="text-white font-black text-lg">${isEdicao ? 'Editar Unidade' : 'Nova Unidade'}</h3>
                <button class="fechar-form-unidade text-white/60 hover:text-white text-3xl leading-none">&times;</button>
            </div>
            <div class="p-6 space-y-4">
                <div><label class="block text-sm font-bold text-slate-700 mb-1">Nome da Unidade *</label><input type="text" id="unidade-nome" value="${unidade?.nome || ''}" class="w-full p-3 border rounded-lg text-sm" placeholder="Ex: Defensoria Pública - Duque de Caxias"></div>
                <div><label class="block text-sm font-bold text-slate-700 mb-1">Sigla</label><input type="text" id="unidade-sigla" value="${unidade?.sigla || ''}" class="w-full p-3 border rounded-lg text-sm" placeholder="Ex: DP Caxias"></div>
                <div><label class="block text-sm font-bold text-slate-700 mb-1">Endereço</label><input type="text" id="unidade-endereco" value="${unidade?.endereco || ''}" class="w-full p-3 border rounded-lg text-sm" placeholder="Endereço completo"></div>
                <div><label class="block text-sm font-bold text-slate-700 mb-1">Telefone</label><input type="text" id="unidade-telefone" value="${unidade?.telefone || ''}" class="w-full p-3 border rounded-lg text-sm" placeholder="(21) 1234-5678"></div>
                <div><label class="block text-sm font-bold text-slate-700 mb-1">E-mail</label><input type="email" id="unidade-email" value="${unidade?.email || ''}" class="w-full p-3 border rounded-lg text-sm" placeholder="contato@dperj.br"></div>
            </div>
            <div class="bg-slate-50 px-6 py-4 flex justify-end gap-3 sticky bottom-0">
                <button class="fechar-form-unidade bg-gray-300 px-4 py-2 rounded-lg">Cancelar</button>
                <button id="btn-salvar-unidade" class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold">${isEdicao ? 'Salvar' : 'Criar'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const fechar = () => modal.remove();
    modal.querySelectorAll('.fechar-form-unidade').forEach(btn => btn.addEventListener('click', fechar));
    document.getElementById('btn-salvar-unidade')?.addEventListener('click', async () => {
        const nome = document.getElementById('unidade-nome').value.trim();
        if (!nome) { showNotification("Nome da unidade é obrigatório", "error"); return; }
        const dados = { nome, sigla: document.getElementById('unidade-sigla').value.trim(), endereco: document.getElementById('unidade-endereco').value.trim(), telefone: document.getElementById('unidade-telefone').value.trim(), email: document.getElementById('unidade-email').value.trim() };
        if (isEdicao) await atualizarUnidade(db, unidade.id, dados);
        else await criarUnidade(db, dados);
        fechar();
        if (onClose) onClose();
    });
};

// ============================================================
// MÓDULO DE GERENCIAMENTO DE USUÁRIOS (PAGINAÇÃO, BUSCA E FILTROS)
// ============================================================

function renderPagination(containerId, currentPage, totalPages, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '<div class="flex items-center justify-center gap-2 mt-4">';
    html += `<button class="pag-btn px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold transition" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled style="opacity:50%;cursor:not-allowed"' : ''}>◀ Anterior</button>`;
    html += `<span class="px-3 py-1 text-xs font-bold text-gray-600">Página ${currentPage} de ${totalPages}</span>`;
    html += `<button class="pag-btn px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold transition" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled style="opacity:50%;cursor:not-allowed"' : ''}>Próxima ▶</button>`;
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
            <span class="text-xs text-gray-500">Mostrar:</span>
            <select id="page-size-select-${containerId}" class="text-xs border rounded-lg px-2 py-1 bg-white">
                <option value="5" ${currentSize === 5 ? 'selected' : ''}>5</option>
                <option value="10" ${currentSize === 10 ? 'selected' : ''}>10</option>
                <option value="15" ${currentSize === 15 ? 'selected' : ''}>15</option>
                <option value="20" ${currentSize === 20 ? 'selected' : ''}>20</option>
            </select>
            <span class="text-xs text-gray-500">itens</span>
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
            <input type="text" id="search-input-${containerId}" placeholder="${placeholder}" class="w-full p-2 pl-8 border rounded-lg text-sm">
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <button id="clear-search-${containerId}" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hidden">✕</button>
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

export const loadUsersList = async (db) => {
    try {
        const snapshot = await getDocs(collection(db, "users"));
        const allUsers = [];
        snapshot.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
        
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
        pendingList.innerHTML = '<div class="text-center py-8 text-gray-400 bg-gray-50 rounded-xl">✅ Nenhum usuário pendente</div>';
        document.getElementById('pagination-pendentes')?.classList.add('hidden');
        return;
    }
    
    pendingList.innerHTML = paginated.map(user => `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white rounded-xl border mb-3 shadow-sm gap-3">
            <div class="flex-1">
                <p class="font-bold text-orange-600 flex items-center gap-2">⏳ ${escapeHTML(user.name || 'Sem nome')} <span class="bg-yellow-100 text-yellow-800 text-[9px] px-2 py-0.5 rounded-full">Pendente</span></p>
                <p class="text-xs text-gray-500 mt-0.5">${escapeHTML(user.email)}</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <select id="role-select-${user.id}" class="text-[10px] border rounded p-1 bg-gray-50">
                    <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário</option>
                    <option value="apoio" ${user.role === 'apoio' ? 'selected' : ''}>Apoio</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
                    <option value="suspended" ${user.role === 'suspended' ? 'selected' : ''}>⚠️ Suspenso</option>
                </select>
                <button onclick="window.approveUser('${user.id}')" class="bg-green-600 text-white px-3 py-1.5 rounded text-[10px] font-bold">APROVAR</button>
                <button onclick="window.deleteUser('${user.id}')" class="text-red-500 text-[10px] hover:underline">REJEITAR</button>
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
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">Nenhum usuário encontrado</td></tr>';
        document.getElementById('pagination-usuarios')?.classList.add('hidden');
        return;
    }
    
    tableBody.innerHTML = paginated.map(user => {
        const unidadesCount = user.unidades?.length || 0;
        const statusBadge = user.role === 'suspended' ? '<span class="bg-red-100 text-red-800 text-[9px] px-2 py-0.5 rounded-full ml-2">Suspenso</span>' : '<span class="bg-green-100 text-green-800 text-[9px] px-2 py-0.5 rounded-full ml-2">Ativo</span>';
        
        return `
            <tr class="border-b hover:bg-gray-50 transition">
                <td class="px-3 py-3"><p class="font-bold text-gray-800 text-sm">${escapeHTML(user.name || 'Sem nome')}</p>${statusBadge}</td>
                <td class="px-3 py-3 text-xs text-gray-500">${escapeHTML(user.email)}</td>
                <td class="px-3 py-3 text-center">
                    <button class="btn-gerenciar-unidades bg-indigo-600 text-white px-3 py-1.5 rounded text-[10px] hover:bg-indigo-700 flex items-center gap-1 mx-auto"
                        data-userid="${user.id}">
                        🏢 ${unidadesCount}
                    </button>
                </td>
                <td class="px-3 py-3 text-center">
                    <select id="role-select-${user.id}" class="text-[10px] border rounded p-1 bg-gray-50">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário</option>
                        <option value="apoio" ${user.role === 'apoio' ? 'selected' : ''}>Apoio</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
                        <option value="suspended" ${user.role === 'suspended' ? 'selected' : ''}>⚠️ Suspenso</option>
                    </select>
                </td>
                <td class="px-3 py-3 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="window.updateUserRole('${user.id}')" class="bg-blue-600 text-white px-2 py-1 rounded text-[9px] font-bold">SALVAR</button>
                        <button onclick="window.deleteUser('${user.id}')" class="bg-gray-100 text-red-500 px-2 py-1 rounded text-[9px] font-bold">EXCLUIR</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    tableBody.querySelectorAll('.btn-gerenciar-unidades').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.dataset.userid;
            if (globalApp) {
                abrirGerenciarUnidades(globalApp, userId);
            } else {
                showNotification("Erro: app não inicializado", "error");
            }
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
        await updateDoc(doc(db, "users", userId), { status: 'approved', role: role, approvedAt: new Date().toISOString() });
        showNotification("Usuário aprovado!");
        await loadUsersList(db);
    } catch (e) { showNotification("Erro ao aprovar.", "error"); }
};

export const updateUserRole = async (db, userId) => {
    try {
        const role = document.getElementById(`role-select-${userId}`)?.value || 'user';
        await updateDoc(doc(db, "users", userId), { role: role, status: role === 'suspended' ? 'suspended' : 'approved' });
        showNotification(`Cargo atualizado!`);
        await loadUsersList(db);
    } catch (e) { showNotification("Erro ao atualizar.", "error"); }
};

export const deleteUser = async (db, userId) => {
    if (!confirm("Excluir este usuário?")) return;
    try {
        await deleteDoc(doc(db, "users", userId));
        showNotification("Usuário removido.");
        await loadUsersList(db);
    } catch (e) { showNotification("Erro ao remover.", "error"); }
};

// ============================================================
// MÓDULO DE AUDITORIA (COM PAGINAÇÃO E BUSCA)
// ============================================================

export const loadLogFilters = async (db) => {
    try {
        const userSelect = document.getElementById('filter-log-user');
        const actionSelect = document.getElementById('filter-log-action');
        if (userSelect) {
            const usersSnap = await getDocs(collection(db, "users"));
            userSelect.innerHTML = '<option value="all">Todos os usuários</option>';
            usersSnap.forEach(doc => { const user = doc.data(); if (user.email) userSelect.appendChild(new Option(user.name || user.email, user.email)); });
        }
        if (actionSelect) {
            const logsSnap = await getDocs(collection(db, "audit_logs"));
            const actions = new Set();
            logsSnap.forEach(doc => { const action = doc.data().action; if (action) actions.add(action); });
            actionSelect.innerHTML = '<option value="all">Todas as ações</option>';
            Array.from(actions).sort().forEach(action => actionSelect.appendChild(new Option(action, action)));
        }
    } catch (error) { console.error("Erro ao carregar filtros de log:", error); }
};

export const loadAuditLogs = async (db) => {
    const logsContainer = document.getElementById('audit-logs-container');
    const tableBody = document.getElementById('audit-logs-table-body');
    const pdfBtn = document.getElementById('export-audit-pdf-btn');
    const filterSection = document.getElementById('audit-filters-section');
    
    if (!logsContainer || !tableBody) return;
    if (filterSection) filterSection.classList.remove('hidden');
    logsContainer.classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8"><p class="text-xs text-gray-400 mt-2">Buscando histórico...</p></td></table>';
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

        let filteredLogs = [];
        snapshot.forEach((docSnap) => {
            const log = docSnap.data();
            if (!log.timestamp) return;
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
        console.error("Erro ao carregar logs:", error);
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-500">Erro ao carregar registros</td></tr>`;
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
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400 text-xs">Nenhum registro encontrado</td></tr>';
        document.getElementById('pagination-logs')?.classList.add('hidden');
        return;
    }
    
    tableBody.innerHTML = paginated.map(log => {
        let formattedDate = 'Data inválida';
        try {
            const date = new Date(log.timestamp);
            if (!isNaN(date.getTime())) formattedDate = date.toLocaleString('pt-BR');
        } catch (e) {}
        
        let actionColor = 'bg-indigo-100 text-indigo-700 border border-indigo-200';
        const action = (log.action || '').toLowerCase();
        if (action.includes('erro') || action.includes('error') || action.includes('falha')) actionColor = 'bg-red-600 text-white border border-red-700 font-black animate-pulse';
        else if (action.includes('delete') || action.includes('apagou') || action.includes('remove')) actionColor = 'bg-red-100 text-red-700 border border-red-200';
        else if (action.includes('create') || action.includes('criou') || action.includes('add')) actionColor = 'bg-green-100 text-green-700 border border-green-200';
        else if (action.includes('update') || action.includes('edit') || action.includes('atualiz')) actionColor = 'bg-blue-100 text-blue-700 border border-blue-200';
        
        return `
            <tr class="border-b hover:bg-gray-50 transition">
                <td class="px-3 py-2 whitespace-nowrap text-[10px] text-gray-600">${escapeHTML(formattedDate)}</td>
                <td class="px-3 py-2"><p class="font-bold text-gray-800 text-[11px]">${escapeHTML(log.userName || log.userEmail || 'Desconhecido')}</p></td>
                <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded text-[9px] ${actionColor} uppercase shadow-sm">${escapeHTML(log.action || 'AÇÃO')}</span></td>
                <td class="px-3 py-2 text-[10px] text-gray-600 max-w-xs break-words">${escapeHTML(log.details || '-')}${log.pautaId && log.pautaId !== 'N/A' ? `<br><span class="text-[8px] text-gray-400">Pauta: ${escapeHTML(log.pautaId.substring(0,8))}</span>` : ''}</td>
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
    renderSearchInput('search-pendentes', 'Buscar usuário pendente...', (val) => {
        adminFilters.pendentes.search = val;
        adminFilters.pendentes.page = 1;
        if (globalApp) loadUsersList(globalApp.db);
    });
    renderSearchInput('search-usuarios', 'Buscar usuário...', (val) => {
        adminFilters.usuarios.search = val;
        adminFilters.usuarios.page = 1;
        if (globalApp) loadUsersList(globalApp.db);
    });
    renderSearchInput('search-logs', 'Buscar logs...', (val) => {
        adminFilters.logs.search = val;
        adminFilters.logs.page = 1;
        if (globalApp) renderLogsTable(globalApp.db);
    });
};

export const exportAuditLogsPDF = async (db) => {
    showNotification("Gerando PDF da Auditoria...", "info");
    try {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF({ orientation: 'landscape' });
        const logs = cachedLogs;
        if (logs.length === 0) { showNotification("Nenhum log para exportar.", "warning"); return; }
        docPDF.setFontSize(18); docPDF.setTextColor(55, 65, 81);
        docPDF.text("Relatorio de Auditoria - SIGEP", 14, 20);
        
        const body = logs.slice(0, 500).map(log => [
            log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'Invalida',
            `${log.userName || log.userEmail || 'Desconhecido'}`,
            log.action || '-',
            (log.details || '-').substring(0, 100)
        ]);
        docPDF.autoTable({ head: [['Data/Hora', 'Usuario', 'Acao', 'Detalhes']], body: body, startY: 45, theme: 'striped' });
        docPDF.save(`Auditoria_SIGEP_${new Date().toISOString().slice(0,10)}.pdf`);
        showNotification("PDF gerado!");
    } catch (error) { showNotification("Erro ao gerar PDF.", "error"); }
};

export const cleanupOldData = async (db) => {
    if (!confirm("Isso apagará dados com mais de 7 dias. Confirmar?")) return;
    try {
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 7);
        const pautas = await getDocs(collection(db, "pautas"));
        let count = 0; let statsCount = 0;
        for (const pautaDoc of pautas.docs) {
            const pautaData = pautaDoc.data();
            const attRef = collection(db, "pautas", pautaDoc.id, "attendances");
            const q = query(attRef, where("createdAt", "<", limitDate.toISOString()));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const stats = { pautaName: pautaData.name || 'Sem nome', creatorEmail: pautaData.ownerEmail || pautaData.memberEmails?.[0] || 'Desconhecido', dataReferencia: limitDate.toISOString(), diaSemana: limitDate.getDay(), total: snapshot.size, atendidos: snapshot.docs.filter(d => d.data().status === 'atendido').length, faltosos: snapshot.docs.filter(d => d.data().status === 'faltoso').length, assuntos: {}, atendentes: {} };
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
        showNotification(`Sucesso! ${count} registros limpos.`);
        if (window.loadDashboardData) window.loadDashboardData();
    } catch (error) { showNotification("Erro: " + error.message, "error"); }
};

export const loadDashboardData = async (db) => {
    const start = document.getElementById('stats-filter-start')?.value;
    const end = document.getElementById('stats-filter-end')?.value;
    const userFilter = document.getElementById('stats-filter-user')?.value;
    const attendantFilter = document.getElementById('stats-filter-attendant')?.value;
    
    const resultsArea = document.getElementById('dashboard-results');
    if (!resultsArea) return;

    // A MÁGICA ACONTECE AQUI: Remove a classe que deixa o BI invisível!
    resultsArea.classList.remove('hidden');

    resultsArea.innerHTML = '<div class="text-center py-8"><div class="loader-small mx-auto mb-4"></div><p class="text-gray-600 mt-2">Carregando dados do BI...</p></div>';
    
    try {
        const snapshot = await getDocs(collection(db, "estatisticas_permanentes"));
        if (snapshot.empty) {
            resultsArea.innerHTML = `<div class="text-center py-12 bg-white rounded-lg border shadow-sm"><h3 class="text-xl font-bold text-gray-800 mb-2">BI ainda vazio!</h3><p class="text-sm text-gray-500">Nenhum dado permanente foi gerado ainda.</p></div>`;
            return;
        }
        
        let rawData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        let filteredData = [...rawData];
        
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
                <div class="p-4 bg-blue-50 rounded-lg text-center border border-blue-100 shadow-sm">
                    <p class="text-[9px] text-blue-600 font-bold uppercase tracking-widest">Demandado</p>
                    <h4 class="text-2xl font-black text-blue-800 mt-1">${totalGeral}</h4>
                </div>
                <div class="p-4 bg-green-50 rounded-lg text-center border border-green-100 shadow-sm">
                    <p class="text-[9px] text-green-600 font-bold uppercase tracking-widest">Atendidos</p>
                    <h4 class="text-2xl font-black text-green-800 mt-1">${totalAtendidos}</h4>
                </div>
                <div class="p-4 bg-orange-50 rounded-lg text-center border border-orange-100 shadow-sm">
                    <p class="text-[9px] text-orange-600 font-bold uppercase tracking-widest">Absenteísmo</p>
                    <h4 class="text-2xl font-black text-orange-800 mt-1">${taxa}%</h4>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div class="border border-slate-200 rounded-xl p-5 bg-white shadow-sm">
                    <h5 class="text-[10px] font-black mb-4 uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-3">Top Assuntos</h5>
                    <div id="dash-subjects-list" class="space-y-3 text-xs"></div>
                </div>
                <div class="border border-slate-200 rounded-xl p-5 bg-white shadow-sm">
                    <h5 class="text-[10px] font-black mb-4 uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-3">Produtividade da Equipe</h5>
                    <div id="dash-users-list" class="space-y-3 text-xs"></div>
                </div>
            </div>
        `;
        
        const renderRanking = (elementId, dataMap) => {
            const el = document.getElementById(elementId);
            const sorted = Object.entries(dataMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
            if (sorted.length === 0) { el.innerHTML = '<p class="text-center text-slate-400 py-4 italic">Sem dados suficientes.</p>'; return; }
            el.innerHTML = sorted.map(([name, count]) => `
                <div class="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                    <span class="truncate pr-2 font-bold text-slate-700">${escapeHTML(name)}</span>
                    <span class="font-black text-indigo-700 bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-md text-[10px]">${count}</span>
                </div>
            `).join('');
        };
        
        renderRanking('dash-subjects-list', mapAssuntos);
        renderRanking('dash-users-list', mapUsers);
        
    } catch (error) { 
        console.error("Erro no BI:", error);
        resultsArea.innerHTML = `<div class="text-center py-8 text-red-500 font-bold border border-red-200 bg-red-50 rounded-xl">Erro ao processar dados: ${error.message}</div>`; 
    }
};


export const populateUserFilter = async (db) => {
    const select = document.getElementById('stats-filter-user');
    if (!select) return;
    try {
        const snapshot = await getDocs(collection(db, "users"));
        select.innerHTML = '<option value="all">Todos os Usuários</option>';
        snapshot.forEach(d => { if (d.data().email) select.appendChild(new Option(d.data().name || d.data().email, d.data().email)); });
    } catch (e) {}
};

// ============================================================
// SETUP DOS EVENTOS DO ADMIN
// ============================================================

export const setupAdminEvents = (app) => {
    globalApp = app;
};


// ============================================================
// VINCULAÇÕES GLOBAIS DO ESCOPO WINDOW
// ============================================================

window.approveUser = (userId) => {
    if (globalApp) approveUser(globalApp.db, userId);
    else console.error("App não inicializado");
};

window.updateUserRole = (userId) => {
    if (globalApp) updateUserRole(globalApp.db, userId);
    else console.error("App não inicializado");
};

window.deleteUser = (userId) => {
    if (globalApp) deleteUser(globalApp.db, userId);
    else console.error("App não inicializado");
};

window.gerenciarUnidades = (userId) => {
    if (globalApp) abrirGerenciarUnidades(globalApp, userId);
    else console.error("App não inicializado");
};

window.abrirGerenciadorUnidades = () => {
    if (globalApp) abrirGerenciadorUnidades(globalApp.db);
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

window.abrirModalNovaRecepcao = (options) => {
    if (globalApp) abrirModalNovaRecepcao(globalApp, options);
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

// ============================================================
// EXPORTAÇÃO DO SERVIÇO ADMIN
// ============================================================

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
    deleteUser,
    setupAdminEvents,
    abrirModalNovaRecepcao,
    renderEstruturaAtual
};

console.log("✅ AdminService registrado no window com sucesso.");
console.log("✅ Módulo admin.js atualizado e acoplado com todos os componentes (novaRecepcao, estruturaAtual, gerenciarUnidadesUsuario).");
