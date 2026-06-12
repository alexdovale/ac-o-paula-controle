// js/admin.js - MÓDULO DE AUDITORIA, SEGURANÇA, REGISTROS DO BI E GERENCIAMENTO DE UNIDADES (SIGEP)

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
                batch.update(userDoc.ref, { unidades: novasUnidades, updatedAt: new Date().toISOString() });
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
                        <div class="bg-slate-50 rounded-xl p-4 max-h-60 overflow-y-auto">
                            <table class="w-full text-sm"><thead class="bg-slate-200"><tr><th class="p-2">Nome</th><th class="p-2">Sigla</th></tr></thead><tbody id="preview-unidades-tbody"></tbody></table>
                        </div>
                    </div>
                </div>
                <div id="painel-modelo-unidades" class="hidden space-y-4">
                    <div class="bg-slate-50 rounded-xl p-6">
                        <h3 class="font-bold text-lg mb-4">📄 Formato Esperado</h3>
                        <pre class="bg-gray-800 text-white p-4 rounded-lg overflow-x-auto text-xs"><code>nome,sigla,endereco,telefone,email\n"DP Caxias","Defensoria Pública - Duque de Caxias","Av. Presidente Kennedy...</code></pre>
                    </div>
                </div>
                <div id="painel-manual-unidades" class="hidden space-y-4">
                    <div class="bg-slate-50 rounded-xl p-6">
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
            document.getElementById('info-arquivo-unidades-detalhes').textContent = `Arquivo: ${file.name} | ${unidades.length} unidade(s)`;
            document.getElementById('info-arquivo-unidades').classList.remove('hidden');
        } catch (error) { showNotification("Erro ao ler arquivo", "error"); }
    });
    
    document.getElementById('btn-previsualizar-unidades')?.addEventListener('click', () => {
        if (!dadosImportados?.length) return;
        document.getElementById('preview-unidades-tbody').innerHTML = dadosImportados.slice(0, 10).map(u => `<tr class="border-b"><td class="p-2">${escapeHTML(u.nome)}</td><td class="p-2">${escapeHTML(u.sigla || '-')}</td></tr>`).join('');
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
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh] animate-fadeIn">
                <div class="bg-gradient-to-r from-emerald-700 to-emerald-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="font-black text-lg">Usuários Vinculados</h3>
                        <p class="text-emerald-100 text-sm mt-1">${escapeHTML(unidadeNome)}</p>
                    </div>
                    <button id="fechar-usuarios-unidade" class="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
                </div>
                <div class="p-4 overflow-y-auto flex-1">
                    ${usuariosVinculados.length > 0 
                        ? `<div class="space-y-2">
                            ${usuariosVinculados.map(u => `
                            <div class="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center">
                                <div>
                                    <p class="font-bold text-gray-800 text-sm">${escapeHTML(u.name || 'Sem nome')}</p>
                                    <p class="text-xs text-gray-500">${escapeHTML(u.email || '')}</p>
                                </div>
                                <span class="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full uppercase">${u.role || 'user'}</span>
                            </div>`).join('')}
                          </div>`
                        : '<div class="text-center py-12 text-gray-400">Nenhum usuário.</div>'
                    }
                </div>
                <div class="p-4 border-t bg-gray-50 flex justify-end shrink-0">
                    <button id="fechar-usuarios-unidade-footer" class="bg-gray-200 hover:bg-gray-300 px-5 py-2 rounded-xl text-sm font-bold">Fechar</button>
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
                    <div class="flex gap-1 flex-wrap justify-end max-w-[120px]">
                        <button class="btn-ver-usuarios text-emerald-600 hover:text-emerald-800 p-1.5 rounded-full hover:bg-emerald-50 transition-all" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" title="Ver usuários vinculados">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        </button>
                        <button class="btn-editar-unidade text-blue-500 hover:text-blue-700 p-1.5 rounded-full hover:bg-blue-50 transition-all" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" data-sigla="${escapeHTML(unidade.sigla || '')}" 
                                data-endereco="${escapeHTML(unidade.endereco || '')}" data-telefone="${escapeHTML(unidade.telefone || '')}" data-email="${escapeHTML(unidade.email || '')}" title="Editar Unidade">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button class="btn-excluir-unidade text-red-500 hover:text-red-700 p-1.5 rounded-full hover:bg-red-50 transition-all" 
                                data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" title="Excluir Unidade">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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
    modal.className = 'fixed inset-0 bg-black/70 z-[700] flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex justify-between items-center shrink-0">
                <div>
                    <h2 class="text-xl font-black text-white flex items-center gap-2">Gerenciar Unidades / Órgãos</h2>
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

// ============================================================
// MÓDULO: GERENCIAR RECEPÇÕES GLOBAIS (UNIDADES DE APOIO)
// ============================================================

const abrirModalGerenciarRecepcoesGlobal = async (app) => {
    const { db } = app;
    const { RecepcaoConfigService } = await import('./recepcaoConfig.js');

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 z-[800] flex items-center justify-center p-4 overflow-y-auto backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
        <div class="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col relative animate-fade-in">
            <div class="bg-gradient-to-r from-purple-900 to-indigo-800 px-8 py-6 flex justify-between items-center shrink-0">
                <div>
                    <h2 class="text-2xl font-black text-white flex items-center gap-3"><span>🏛️</span> Unidades de Apoio (Recepções)</h2>
                    <p class="text-slate-300 text-sm mt-1">Crie e gerencie Recepções que atuam como Hubs para várias Unidades/DPs</p>
                </div>
                <button id="fechar-gerenciador-recepcoes" class="text-white/60 hover:text-white text-4xl leading-none transition-colors">&times;</button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-8" id="painel-conteudo-recepcoes">
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
        const container = document.getElementById('painel-conteudo-recepcoes');
        if (!container) return;

        const recepcoes = await RecepcaoConfigService.buscarTodasRecepcoesAdmin(db);

        let html = `
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                    <h3 class="font-black text-slate-800 text-xl">Gestão Global de Recepções</h3>
                    <p class="text-sm text-slate-500 mt-1">Defina quais unidades cada Recepção atende e quem são os servidores lotados nelas.</p>
                </div>
                <button id="btn-nova-recepcao-custom" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 shrink-0">
                    <span class="text-lg">+</span> Nova Recepção (Apoio)
                </button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${recepcoes.length === 0 ? `
                    <div class="col-span-full flex flex-col items-center justify-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                        <span class="text-6xl mb-4">🪑</span>
                        <h4 class="text-lg font-bold text-slate-700">Nenhuma Unidade de Apoio configurada</h4>
                        <p class="text-slate-500 text-sm mt-1">Clique em "Nova Recepção" para criar a primeira.</p>
                    </div>
                ` : recepcoes.map(rec => `
                    <div class="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all relative flex flex-col h-full group">
                        <div class="absolute top-4 right-4">
                            <span class="text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-sm border
                                ${rec.tipo === 'central' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors'}">
                                ${rec.tipo === 'central' ? '🏛️ Central' : '⚡ Espec'}
                            </span>
                        </div>
                        
                        <div class="flex items-center gap-4 mb-5">
                            <div class="w-14 h-14 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform">
                                ${rec.icone || '📋'}
                            </div>
                            <div class="flex-1 min-w-0 pr-16">
                                <h4 class="font-black text-slate-800 text-lg leading-tight truncate">${escapeHTML(rec.nome)}</h4>
                                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">${rec.andar ? escapeHTML(rec.andar) : 'Apoio Global'}</p>
                            </div>
                        </div>
                        
                        <div class="mb-6 flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                            <div class="mb-3">
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><span>🏢</span> Unidades Atendidas</p>
                                <div class="flex flex-wrap gap-1.5">
                                    ${(rec.unidadesVinculadas || []).length > 0 
                                        ? `<span class="bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm">${rec.unidadesVinculadas.length} Unidade(s)</span>`
                                        : (rec.unidadeNome ? `<span class="bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm truncate max-w-full">${escapeHTML(rec.unidadeNome)}</span>` : '<span class="text-xs text-slate-400 italic">Nenhuma unidade vinculada</span>')}
                                </div>
                            </div>
                            <div class="mb-3">
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><span>🏷️</span> Grupos</p>
                                <div class="flex flex-wrap gap-1.5">
                                    ${(rec.grupos || []).length > 0 
                                        ? rec.grupos.slice(0,3).map(g => `<span class="bg-white text-slate-600 border border-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase shadow-sm">${escapeHTML(g)}</span>`).join('') + (rec.grupos.length > 3 ? `<span class="text-[10px] text-slate-400">...</span>` : '')
                                        : '<span class="text-xs text-slate-400 italic">Todos</span>'}
                                </div>
                            </div>
                            <div class="pt-3 border-t border-slate-200 flex justify-between items-center">
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Servidores Lotados</p>
                                <span class="bg-green-100 text-green-700 font-black px-2.5 py-0.5 rounded-full text-xs">${(rec.membros || []).length}</span>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-2 mt-auto">
                            <button class="btn-vincular-usuarios bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-sm col-span-2 flex items-center justify-center gap-2" data-id="${rec.id}" data-nome="${escapeHTML(rec.nome)}">
                                <span>👥</span> Lotar Servidores (Acessos)
                            </button>
                            <button class="btn-editar-recepcao bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-sm transition flex items-center justify-center gap-1.5" data-id="${rec.id}">
                                <span>✏️</span> Editar
                            </button>
                            <div class="flex gap-2">
                                <button class="btn-link-recepcao flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-2 rounded-xl text-sm transition flex items-center justify-center" data-id="${rec.id}" title="Copiar Link da TV">🔗</button>
                                <button class="btn-excluir-recepcao flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2 rounded-xl text-sm transition flex items-center justify-center" data-id="${rec.id}" data-nome="${escapeHTML(rec.nome)}" title="Excluir Recepção">🗑️</button>
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
                    if (confirm(`Tem certeza que deseja excluir permanentemente a Unidade de Apoio "${btn.dataset.nome}"?`)) {
                        try {
                            await deleteDoc(doc(db, "recepcoes", btn.dataset.id));
                            showNotification("Recepção excluída com sucesso!", "success");
                            renderizarTelaAdmin();
                        } catch (error) {
                            console.error("Erro ao excluir:", error);
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
            
            container.innerHTML = `
                <div class="max-w-3xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
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
            modalVinculo.className = 'fixed inset-0 bg-slate-900/80 z-[900] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
            modalVinculo.innerHTML = `
                <div class="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[85vh]">
                    <div class="bg-indigo-600 px-6 py-5 flex justify-between items-center shrink-0">
                        <div>
                            <h3 class="font-black text-white text-lg">Lotar Servidores: ${escapeHTML(recepcao.nome)}</h3>
                            <p class="text-indigo-200 text-xs mt-0.5">Selecione quem pode acessar e trabalhar nesta unidade de apoio.</p>
                        </div>
                        <button class="fechar-vinculo text-white/60 hover:text-white text-3xl leading-none">&times;</button>
                    </div>
                    
                    <div class="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                            <input type="text" id="busca-membros-recepcao" placeholder="Buscar usuário pelo nome ou email..." 
                                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm">
                        </div>
                    </div>

                    <div class="flex-1 overflow-y-auto p-4 bg-slate-50/50" id="lista-usuarios-vinculo">
                        <div class="flex justify-center items-center h-full"><div class="loader-small"></div></div>
                    </div>
                    
                    <div class="bg-white border-t border-slate-200 p-4 flex justify-between items-center shrink-0">
                        <span id="contagem-membros" class="text-sm font-bold text-slate-500"></span>
                        <div class="flex gap-3">
                            <button class="fechar-vinculo bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl transition text-sm">Cancelar</button>
                            <button id="salvar-vinculo" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl transition text-sm shadow-md">Salvar Lotação</button>
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
                    const container = document.getElementById('lista-usuarios-vinculo');
                    const q = termo.toLowerCase();
                    const filtrados = todosUsuarios.filter(u => 
                        (u.name || '').toLowerCase().includes(q) || 
                        (u.email || '').toLowerCase().includes(q)
                    );

                    if (filtrados.length === 0) {
                        container.innerHTML = '<p class="text-center text-slate-400 py-10 font-bold">Nenhum usuário encontrado.</p>';
                        return;
                    }

                    container.innerHTML = `
                        <div class="space-y-2">
                            ${filtrados.map(u => {
                                const isChecked = membrosAtuais.includes(u.id);
                                return `
                                    <label class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 transition-colors ${isChecked ? 'ring-1 ring-indigo-500 border-indigo-500 bg-indigo-50/20' : ''}">
                                        <input type="checkbox" class="cb-membro w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" value="${u.id}" ${isChecked ? 'checked' : ''}>
                                        <div class="flex-1 min-w-0">
                                            <p class="font-bold text-slate-800 text-sm truncate">${escapeHTML(u.name || 'Sem nome')}</p>
                                            <p class="text-[10px] text-slate-500 truncate">${escapeHTML(u.email)}</p>
                                        </div>
                                        <span class="text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${u.role === 'admin' || u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}">${u.role || 'user'}</span>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    `;

                    container.querySelectorAll('.cb-membro').forEach(cb => {
                        cb.addEventListener('change', (e) => {
                            const label = cb.closest('label');
                            if (cb.checked) {
                                label.classList.add('ring-1', 'ring-indigo-500', 'border-indigo-500', 'bg-indigo-50/20');
                                if (!membrosAtuais.includes(cb.value)) membrosAtuais.push(cb.value);
                            } else {
                                label.classList.remove('ring-1', 'ring-indigo-500', 'border-indigo-500', 'bg-indigo-50/20');
                                membrosAtuais = membrosAtuais.filter(id => id !== cb.value);
                            }
                            atualizarContador();
                        });
                    });
                };

                const atualizarContador = () => {
                    document.getElementById('contagem-membros').textContent = `${membrosAtuais.length} servidor(es) lotado(s)`;
                };

                renderUsuarios();
                atualizarContador();

                document.getElementById('busca-membros-recepcao').addEventListener('input', (e) => renderUsuarios(e.target.value));

                document.getElementById('salvar-vinculo').addEventListener('click', async () => {
                    const btn = document.getElementById('salvar-vinculo');
                    btn.disabled = true;
                    btn.textContent = 'Salvando...';

                    try {
                        await updateDoc(doc(db, "recepcoes", recepcao.id), { membros: membrosAtuais });
                        showNotification("Lotação atualizada com sucesso!", "success");
                        fecharVinculo();
                        renderizarTelaAdmin();
                    } catch (error) {
                        showNotification("Erro ao salvar.", "error");
                        btn.disabled = false;
                        btn.textContent = 'Salvar Lotação';
                    }
                });

            } catch (err) {
                document.getElementById('lista-usuarios-vinculo').innerHTML = '<p class="text-center text-red-500 py-10 font-bold">Erro ao carregar usuários.</p>';
            }
        };

        await renderizarTelaAdmin();
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
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Nenhum usuário encontrado</td></tr>';
        document.getElementById('pagination-usuarios')?.classList.add('hidden');
        return;
    }

    const roleConfig = {
        'superadmin': { label: '⭐ Superadmin', color: 'bg-purple-100 text-purple-800 border-purple-300' },
        'admin':      { label: '🛡️ Admin',      color: 'bg-blue-100 text-blue-800 border-blue-300'   },
        'user':       { label: '👤 Usuário',    color: 'bg-green-100 text-green-800 border-green-300' },
        'apoio':      { label: '🤝 Apoio',      color: 'bg-amber-100 text-amber-800 border-amber-300' },
        'suspended':  { label: '🚫 Suspenso',   color: 'bg-red-100 text-red-800 border-red-300'       },
    };

    tableBody.innerHTML = paginated.map(user => {
        const cfg = roleConfig[user.role] || roleConfig['user'];
        const unidadesCount = user.unidades?.length || 0;
        const isSuspended = user.role === 'suspended' || user.status === 'suspended';
        const rowClass = isSuspended ? 'opacity-60 bg-red-50' : 'hover:bg-gray-50';

        return `
            <tr class="border-b ${rowClass} transition">
                <td class="px-3 py-3">
                    <p class="font-bold text-gray-800 text-sm">${escapeHTML(user.name || 'Sem nome')}</p>
                    <p class="text-xs text-gray-400">${escapeHTML(user.email)}</p>
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border mt-1 ${cfg.color}">
                        ${cfg.label}
                    </span>
                </td>
                <td class="px-3 py-3 text-center">
                    <button class="btn-gerenciar-unidades bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 mx-auto transition"
                        data-userid="${user.id}" title="Gerenciar unidades vinculadas">
                        🏢 ${unidadesCount} unidade(s)
                    </button>
                </td>
                <td class="px-3 py-3">
                    <select id="role-select-${user.id}" class="w-full text-xs border rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold cursor-pointer">
                        <option value="user"       ${user.role === 'user'       ? 'selected' : ''}>👤 Usuário</option>
                        <option value="apoio"      ${user.role === 'apoio'      ? 'selected' : ''}>🤝 Apoio</option>
                        <option value="admin"      ${user.role === 'admin'      ? 'selected' : ''}>🛡️ Admin</option>
                        <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>⭐ Superadmin</option>
                        <option value="suspended"  ${user.role === 'suspended'  ? 'selected' : ''}>🚫 Suspenso</option>
                    </select>
                </td>
                <td class="px-3 py-3">
                    <div class="flex flex-col gap-1.5 min-w-[110px]">
                        <button
                            class="btn-salvar-perfil bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold w-full transition shadow-sm"
                            data-userid="${user.id}">
                            💾 Salvar Perfil
                        </button>
                        <button
                            class="btn-toggle-suspend ${isSuspended
                                ? 'bg-green-100 hover:bg-green-200 text-green-700 border-green-300'
                                : 'bg-orange-100 hover:bg-orange-200 text-orange-700 border-orange-300'} border px-3 py-1.5 rounded-lg text-[10px] font-bold w-full transition"
                            data-userid="${user.id}"
                            data-suspended="${isSuspended}">
                            ${isSuspended ? '✅ Reativar' : '⏸️ Suspender'}
                        </button>
                        <button
                            class="btn-deletar-usuario bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-[10px] font-bold w-full transition"
                            data-userid="${user.id}">
                            🗑️ Excluir
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // ── Event listeners via delegação — sem onclick inline ──────────────────
    tableBody.querySelectorAll('.btn-salvar-perfil').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!globalApp) {
                showNotification("Erro interno: app não inicializado. Recarregue a página.", "error");
                console.error("[btn-salvar-perfil] globalApp é null");
                return;
            }
            updateUserRole(globalApp.db, btn.dataset.userid);
        });
    });

    tableBody.querySelectorAll('.btn-toggle-suspend').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!globalApp) {
                showNotification("Erro interno: app não inicializado. Recarregue a página.", "error");
                return;
            }
            const isSuspended = btn.dataset.suspended === 'true';
            toggleSuspendUser(globalApp.db, btn.dataset.userid, isSuspended);
        });
    });

    tableBody.querySelectorAll('.btn-deletar-usuario').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!globalApp) {
                showNotification("Erro interno: app não inicializado. Recarregue a página.", "error");
                return;
            }
            deleteUser(globalApp.db, btn.dataset.userid);
        });
    });

    tableBody.querySelectorAll('.btn-gerenciar-unidades').forEach(btn => {
        btn.addEventListener('click', () => {
            if (globalApp) abrirGerenciarUnidadesUsuario(globalApp, btn.dataset.userid);
            else showNotification("Erro: app não inicializado", "error");
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
        await updateDoc(doc(db, "users", userId), {
            status: 'approved',
            role: role,
            approvedAt: new Date().toISOString()
        });
        showNotification("Usuário aprovado!", "success");
        await loadUsersList(db);
    } catch (e) {
        console.error("[approveUser]", e);
        showNotification("Erro ao aprovar: " + e.message, "error");
    }
};

// ── CORREÇÃO PRINCIPAL: busca o select com segurança e loga erros ──────────
export const updateUserRole = async (db, userId) => {
    try {
        const select = document.getElementById(`role-select-${userId}`);

        if (!select) {
            showNotification("Erro: elemento de perfil não encontrado. Recarregue a lista.", "error");
            console.error(`[updateUserRole] #role-select-${userId} não encontrado no DOM`);
            return;
        }

        const role = select.value;

        if (!role) {
            showNotification("Selecione um perfil válido.", "error");
            return;
        }

        await updateDoc(doc(db, "users", userId), {
            role: role,
            status: role === 'suspended' ? 'suspended' : 'ap