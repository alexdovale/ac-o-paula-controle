
// js/admin.js - MÓDULO DE AUDITORIA, SEGURANÇA, REGISTROS DO BI E GERENCIAMENTO DE UNIDADES (SIGEP)

import { 
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc, 
    query, orderBy, limit, where, writeBatch, setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

/**
 * Grava uma ação no log de auditoria
 */
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

// =========================================================================
// MÓDULO DE GERENCIAMENTO DE UNIDADES/ÓRGÃOS (CRUD + IMPORTAÇÃO + PESQUISA)
// =========================================================================

/**
 * Carrega lista de unidades disponíveis (coleção unificada: estrutura_unidades)
 */
export const carregarUnidades = async (db) => {
    try {
        const snapshot = await getDocs(collection(db, "estrutura_unidades"));
        if (!snapshot.empty) {
            return snapshot.docs.filter(d => d.data().ativo !== false).map(doc => ({ id: doc.id, ...doc.data() }));
        }
        return [];
    } catch (error) {
        console.error("Erro ao carregar unidades:", error);
        return [];
    }
};

/**
 * Cria uma nova unidade (com ID gerado a partir do nome, igual ao importador)
 */
export const criarUnidade = async (db, dados) => {
    try {
        const nomeNormalizado = dados.nome.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const unidadeId = nomeNormalizado;
        const unidadeRef = doc(db, "estrutura_unidades", unidadeId);
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

/**
 * Atualiza uma unidade existente
 */
export const atualizarUnidade = async (db, unidadeId, dados) => {
    try {
        await updateDoc(doc(db, "estrutura_unidades", unidadeId), {
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

/**
 * Exclui (desativa) uma unidade
 */
export const excluirUnidade = async (db, unidadeId, unidadeNome) => {
    if (!confirm(`Tem certeza que deseja excluir a unidade "${unidadeNome}"?\n\nUsuários vinculados a esta unidade perderão acesso.`)) return false;
    
    try {
        await updateDoc(doc(db, "estrutura_unidades", unidadeId), { ativo: false, excluidoEm: new Date().toISOString() });
        showNotification(`Unidade "${unidadeNome}" desativada!`, "info");
        return true;
    } catch (error) {
        showNotification("Erro ao excluir unidade: " + error.message, "error");
        return false;
    }
};

/**
 * Salva as unidades permitidas para um usuário
 */
export const salvarUnidadesUsuario = async (db, userId, unidadesSelecionadas) => {
    try {
        await updateDoc(doc(db, "users", userId), {
            unidadesPermitidas: unidadesSelecionadas,
            updatedAt: new Date().toISOString()
        });
        showNotification("Unidades do usuário atualizadas!", "success");
        return true;
    } catch (error) {
        showNotification("Erro ao salvar unidades: " + error.message, "error");
        return false;
    }
};

// =========================================================================
// MÓDULO DE IMPORTAÇÃO EM MASSA DE UNIDADES (ADAPTADO PARA ESTRUTURA_UNIDADES)
// =========================================================================

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

const baixarModeloCSVUnidades = () => {
    const csvContent = `nome,sigla,endereco,telefone,email
"Defensoria Pública - Duque de Caxias","DP Caxias","Av. Presidente Kennedy, s/n - Centro, Duque de Caxias - RJ","(21) 2675-1234","caxias@dperj.br"
"Defensoria Pública - Belford Roxo","DP Belford Roxo","Rua Gerson Costa, s/n - Centro, Belford Roxo - RJ","(21) 2661-4321","belfordroxo@dperj.br"
"Defensoria Pública - Nova Iguaçu","DP Nova Iguaçu","Rua Getúlio Vargas, s/n - Centro, Nova Iguaçu - RJ","(21) 2665-9876","ni@dperj.br"`;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'modelo_unidades.csv';
    link.click();
    URL.revokeObjectURL(link.href);
};

const baixarModeloJSONUnidades = () => {
    const jsonContent = [
        {
            nome: "Defensoria Pública - Duque de Caxias",
            sigla: "DP Caxias",
            endereco: "Av. Presidente Kennedy, s/n - Centro, Duque de Caxias - RJ",
            telefone: "(21) 2675-1234",
            email: "caxias@dperj.br"
        },
        {
            nome: "Defensoria Pública - Belford Roxo",
            sigla: "DP Belford Roxo",
            endereco: "Rua Gerson Costa, s/n - Centro, Belford Roxo - RJ",
            telefone: "(21) 2661-4321",
            email: "belfordroxo@dperj.br"
        }
    ];
    
    const blob = new Blob([JSON.stringify(jsonContent, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'modelo_unidades.json';
    link.click();
    URL.revokeObjectURL(link.href);
};

/**
 * Abre modal para importar unidades em massa
 */
export const abrirImportadorUnidades = async (db) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 z-[900] flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="bg-gradient-to-r from-blue-800 to-blue-700 px-6 py-4 flex justify-between items-center shrink-0">
                <div>
                    <h2 class="text-xl font-black text-white flex items-center gap-2">
                        <span>📁</span> Importar Unidades em Massa
                    </h2>
                    <p class="text-blue-100 text-sm mt-1">Importe múltiplas unidades de uma só vez via CSV ou JSON</p>
                </div>
                <button id="fechar-importador-unidades" class="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
                <div class="flex border-b">
                    <button class="tab-importador-unidades py-2 px-4 font-bold text-sm text-blue-600 border-b-2 border-blue-600" data-tab="upload">📤 Upload</button>
                    <button class="tab-importador-unidades py-2 px-4 font-bold text-sm text-gray-500" data-tab="modelo">📄 Modelo</button>
                    <button class="tab-importador-unidades py-2 px-4 font-bold text-sm text-gray-500" data-tab="manual">✏️ Manual</button>
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
                            <table class="w-full text-sm">
                                <thead class="bg-slate-200 sticky top-0"><tr><th class="p-2">Nome</th><th class="p-2">Sigla</th></tr></thead>
                                <tbody id="preview-unidades-tbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div id="painel-modelo-unidades" class="hidden space-y-4">
                    <div class="bg-slate-50 rounded-xl p-6">
                        <h3 class="font-bold text-lg mb-4">📄 Formato Esperado</h3>
                        <pre class="bg-gray-800 text-white p-4 rounded-lg overflow-x-auto text-xs"><code>nome,sigla,endereco,telefone,email
"DP Caxias","Defensoria Pública - Duque de Caxias","Av. Presidente Kennedy, s/n - Centro, Duque de Caxias - RJ","(21) 2675-1234","caxias@dperj.br"</code></pre>
                        <div class="mt-4 flex gap-3">
                            <button id="btn-baixar-modelo-csv-unidades" class="bg-blue-600 text-white px-4 py-2 rounded-lg">📥 CSV</button>
                            <button id="btn-baixar-modelo-json-unidades" class="bg-blue-600 text-white px-4 py-2 rounded-lg">📥 JSON</button>
                        </div>
                    </div>
                </div>
                
                <div id="painel-manual-unidades" class="hidden space-y-4">
                    <div class="bg-slate-50 rounded-xl p-6">
                        <h3 class="font-bold text-lg mb-4">✏️ Inserção Manual</h3>
                        <textarea id="manual-unidades-text" rows="6" class="w-full p-3 border rounded-lg font-mono text-sm" placeholder="sigla|nome|endereco|telefone|email"></textarea>
                        <button id="btn-importar-manual-unidades" class="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg font-bold">Importar</button>
                    </div>
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
            document.getElementById(`painel-${aba}-unidades`).classList.remove('hidden');
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
    
    document.getElementById('btn-baixar-modelo-csv-unidades')?.addEventListener('click', baixarModeloCSVUnidades);
    document.getElementById('btn-baixar-modelo-json-unidades')?.addEventListener('click', baixarModeloJSONUnidades);
};

/**
 * Abre modal para gerenciar todas as unidades (CRUD com pesquisa)
 */
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
            <div class="border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-slate-800 text-base">${escapeHTML(unidade.nome)}</h4>
                        <p class="text-xs text-slate-500">${escapeHTML(unidade.sigla || 'Sem sigla')}</p>
                        ${unidade.endereco ? `<p class="text-[10px] text-slate-400 mt-1">📍 ${escapeHTML(unidade.endereco)}</p>` : ''}
                    </div>
                    <div class="flex gap-2">
                        <button class="btn-editar-unidade text-blue-500 hover:text-blue-700 p-1" data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" data-sigla="${escapeHTML(unidade.sigla || '')}" data-endereco="${escapeHTML(unidade.endereco || '')}" data-telefone="${escapeHTML(unidade.telefone || '')}" data-email="${escapeHTML(unidade.email || '')}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                        <button class="btn-excluir-unidade text-red-500 hover:text-red-700 p-1" data-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.btn-editar-unidade').forEach(btn => {
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
        
        document.querySelectorAll('.btn-excluir-unidade').forEach(btn => {
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
                    <h2 class="text-xl font-black text-white flex items-center gap-2"><span>🏢</span> Gerenciar Unidades / Órgãos</h2>
                    <p class="text-slate-300 text-sm mt-1">Cadastre e gerencie as unidades que aparecerão no sistema</p>
                </div>
                <button id="fechar-gerenciador-unidades" class="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-6">
                <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                    <div class="relative w-full sm:w-80">
                        <input type="text" id="pesquisa-unidades" placeholder="🔍 Pesquisar unidade..." class="w-full p-2 pl-8 border rounded-lg text-sm">
                        <span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                    </div>
                    <div class="flex gap-3">
                        <button id="btn-importar-unidades-massa" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition shadow-md flex items-center gap-2">
                            <span>📁</span> Importar em Massa
                        </button>
                        <button id="btn-nova-unidade" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition shadow-md flex items-center gap-2">
                            <span>➕</span> Nova Unidade
                        </button>
                    </div>
                </div>
                
                <div id="lista-unidades-admin" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
            </div>
            
            <div class="bg-slate-50 px-6 py-4 flex justify-end border-t shrink-0">
                <button id="fechar-gerenciador-unidades-footer" class="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg">Fechar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    renderLista();
    
    const fechar = () => modal.remove();
    document.getElementById('fechar-gerenciador-unidades')?.addEventListener('click', fechar);
    document.getElementById('fechar-gerenciador-unidades-footer')?.addEventListener('click', fechar);
    
    document.getElementById('pesquisa-unidades')?.addEventListener('input', (e) => {
        filtroTexto = e.target.value;
        renderLista();
    });
    
    document.getElementById('btn-nova-unidade')?.addEventListener('click', () => {
        abrirModalFormUnidade(db, null, () => {
            fechar();
            abrirGerenciadorUnidades(db);
        });
    });
    
    document.getElementById('btn-importar-unidades-massa')?.addEventListener('click', () => {
        fechar();
        abrirImportadorUnidades(db);
    });
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
        const dados = {
            nome, sigla: document.getElementById('unidade-sigla').value.trim(),
            endereco: document.getElementById('unidade-endereco').value.trim(),
            telefone: document.getElementById('unidade-telefone').value.trim(),
            email: document.getElementById('unidade-email').value.trim()
        };
        if (isEdicao) await atualizarUnidade(db, unidade.id, dados);
        else await criarUnidade(db, dados);
        fechar();
        if (onClose) onClose();
    });
};

/**
 * Abre modal para gerenciar unidades de um usuário (com pesquisa)
 */
export const gerenciarUnidadesUsuario = async (db, userId, userNome, userEmail, unidadesAtuais = []) => {
    let todasUnidades = await carregarUnidades(db);
    let filtroTexto = '';
    
    const renderUnidades = () => {
        const filtradas = todasUnidades.filter(u => 
            u.nome.toLowerCase().includes(filtroTexto.toLowerCase()) ||
            (u.sigla || '').toLowerCase().includes(filtroTexto.toLowerCase())
        );
        
        const container = document.getElementById('lista-unidades-checkbox');
        if (!container) return;
        
        container.innerHTML = filtradas.map(unidade => `
            <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                <input type="checkbox" name="unidade" value="${unidade.id}" 
                    ${unidadesAtuais.includes(unidade.id) ? 'checked' : ''}
                    class="h-4 w-4 text-green-600 rounded">
                <div>
                    <span class="font-bold text-gray-800">${escapeHTML(unidade.nome)}</span>
                    <p class="text-[10px] text-gray-400">${escapeHTML(unidade.sigla || '')}</p>
                </div>
            </label>
        `).join('');
        
        if (filtradas.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 py-4">Nenhuma unidade encontrada.</p>';
        }
    };
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/60 z-[600] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div class="bg-slate-800 px-6 py-4 flex justify-between items-center shrink-0">
                <div>
                    <h3 class="text-white font-black text-lg">Gerenciar Unidades</h3>
                    <p class="text-slate-300 text-xs mt-1">${escapeHTML(userNome)} (${escapeHTML(userEmail)})</p>
                </div>
                <button class="fechar-modal-unidades text-white/60 hover:text-white text-3xl leading-none">&times;</button>
            </div>
            <div class="flex-1 overflow-y-auto p-6">
                <div class="relative mb-4">
                    <input type="text" id="pesquisa-unidades-usuario" placeholder="🔍 Pesquisar unidade..." class="w-full p-2 pl-8 border rounded-lg text-sm">
                    <span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                </div>
                <p class="text-sm font-bold text-gray-700 mb-3">Selecione as unidades que este usuário pode acessar:</p>
                <div id="lista-unidades-checkbox" class="space-y-2 max-h-64 overflow-y-auto"></div>
                <div class="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p class="text-[10px] text-amber-700 font-bold">⚠️ Atenção:</p>
                    <p class="text-[9px] text-amber-600">Usuários só verão pautas das unidades selecionadas acima.</p>
                </div>
            </div>
            <div class="bg-slate-50 px-6 py-4 flex justify-end gap-3 shrink-0 border-t">
                <button class="fechar-modal-unidades bg-gray-300 px-4 py-2 rounded-lg">Cancelar</button>
                <button id="btn-salvar-unidades-usuario" class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold">Salvar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    renderUnidades();
    
    document.getElementById('pesquisa-unidades-usuario')?.addEventListener('input', (e) => {
        filtroTexto = e.target.value;
        renderUnidades();
    });
    
    const fechar = () => modal.remove();
    modal.querySelectorAll('.fechar-modal-unidades').forEach(btn => btn.addEventListener('click', fechar));
    
    document.getElementById('btn-salvar-unidades-usuario')?.addEventListener('click', async () => {
        const checkboxes = modal.querySelectorAll('input[name="unidade"]:checked');
        const unidadesSelecionadas = Array.from(checkboxes).map(cb => cb.value);
        await salvarUnidadesUsuario(db, userId, unidadesSelecionadas);
        fechar();
        setTimeout(() => loadUsersList(db), 500);
    });
};

// =========================================================================
// MÓDULO DE GERENCIAMENTO DE USUÁRIOS
// =========================================================================

export const loadUsersList = async (db) => {
    try {
        const snapshot = await getDocs(collection(db, "users"));
        const pendingList = document.getElementById('pending-users-list');
        const approvedList = document.getElementById('approved-users-list');
        
        if(!pendingList || !approvedList) return;

        pendingList.innerHTML = ''; 
        approvedList.innerHTML = '';

        if (snapshot.empty) {
            pendingList.innerHTML = '<p class="text-gray-400 text-xs text-center py-4">Nenhum usuário encontrado</p>';
            approvedList.innerHTML = '<p class="text-gray-400 text-xs text-center py-4">Nenhum usuário encontrado</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            try {
                const user = docSnap.data();
                const userId = docSnap.id;
                if (!user.email) return; 
                
                const row = document.createElement('div');
                row.className = "flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded border mb-2 shadow-sm gap-3";
                
                const statusBadge = user.status === 'pending' 
                    ? '<span class="bg-yellow-100 text-yellow-800 text-[8px] px-2 py-0.5 rounded-full ml-2">Pendente</span>'
                    : user.role === 'suspended'
                    ? '<span class="bg-red-100 text-red-800 text-[8px] px-2 py-0.5 rounded-full ml-2">Suspenso</span>'
                    : '<span class="bg-green-100 text-green-800 text-[8px] px-2 py-0.5 rounded-full ml-2">Ativo</span>';
                
                const roleSelector = `
                    <select id="role-select-${userId}" class="text-[10px] border rounded p-1 bg-gray-50 focus:ring-1 focus:ring-blue-500 outline-none">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário</option>
                        <option value="apoio" ${user.role === 'apoio' ? 'selected' : ''}>Apoio</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
                        <option value="suspended" ${user.role === 'suspended' ? 'selected' : ''}>⚠️ Suspenso</option>
                    </select>
                `;

                if (user.status === 'pending') {
                    row.innerHTML = `
                        <div class="text-xs flex-1">
                            <p class="font-bold text-orange-600 flex items-center">PENDENTE: ${escapeHTML(user.name || 'Sem nome')} ${statusBadge}</p>
                            <p class="text-gray-500">${escapeHTML(user.email)}</p>
                        </div>
                        <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                            ${roleSelector}
                            <button onclick="window.approveUser('${userId}')" class="bg-green-600 text-white px-3 py-1 rounded text-[10px] font-bold hover:bg-green-700 transition">APROVAR</button>
                            <button onclick="window.deleteUser('${userId}')" class="text-red-500 text-[10px] hover:underline">REJEITAR</button>
                        </div>`;
                    pendingList.appendChild(row);
                } else {
                    const unidadesCount = user.unidadesPermitidas?.length || 0;
                    const unidadesText = unidadesCount > 0 
                        ? `<p class="text-[9px] text-blue-500 mt-1">🏢 ${unidadesCount} unidade(s) permitida(s)</p>` 
                        : `<p class="text-[9px] text-gray-400 mt-1">🏢 Nenhuma unidade vinculada</p>`;
                    
                    row.innerHTML = `
                        <div class="text-xs flex-1">
                            <p class="font-bold text-gray-800 flex items-center">${escapeHTML(user.name || 'Sem nome')} ${statusBadge}</p>
                            <p class="text-gray-500">${escapeHTML(user.email)}</p>
                            ${unidadesText}
                        </div>
                        <div class="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                            <button onclick="window.gerenciarUnidades('${userId}', '${escapeHTML(user.name || 'Sem nome')}', '${escapeHTML(user.email)}', ${JSON.stringify(user.unidadesPermitidas || [])})" 
                                class="bg-indigo-600 text-white px-2 py-1 rounded text-[10px] hover:bg-indigo-700 transition">
                                🏢 UNIDADES
                            </button>
                            ${roleSelector}
                            <button onclick="window.updateUserRole('${userId}')" class="bg-blue-600 text-white px-2 py-1 rounded text-[10px] hover:bg-blue-700 transition">SALVAR</button>
                            <button onclick="window.deleteUser('${userId}')" class="bg-gray-100 text-red-500 px-2 py-1 rounded text-[10px] hover:bg-red-50 transition">EXCLUIR</button>
                        </div>`;
                    approvedList.appendChild(row);
                }
            } catch (rowError) { console.error(rowError); }
        });
    } catch (error) {
        showNotification("Erro ao carregar lista de usuários", "error");
    }
};

export const approveUser = async (db, userId) => {
    try {
        const role = document.getElementById(`role-select-${userId}`)?.value || 'user';
        await updateDoc(doc(db, "users", userId), { status: 'approved', role: role, approvedAt: new Date().toISOString() });
        showNotification("Usuário aprovado!"); loadUsersList(db);
    } catch (e) { showNotification("Erro ao aprovar.", "error"); }
};

export const updateUserRole = async (db, userId) => {
    try {
        const role = document.getElementById(`role-select-${userId}`)?.value || 'user';
        await updateDoc(doc(db, "users", userId), { role: role, status: role === 'suspended' ? 'suspended' : 'approved' });
        showNotification(`Cargo atualizado!`); loadUsersList(db);
    } catch (e) { showNotification("Erro ao atualizar.", "error"); }
};

export const deleteUser = async (db, userId) => {
    if (!confirm("Excluir este usuário?")) return;
    try {
        await deleteDoc(doc(db, "users", userId));
        showNotification("Usuário removido."); loadUsersList(db);
    } catch (e) { showNotification("Erro ao remover.", "error"); }
};

// Funções globais
window.approveUser = (userId) => approveUser(window.app?.db, userId);
window.updateUserRole = (userId) => updateUserRole(window.app?.db, userId);
window.deleteUser = (userId) => deleteUser(window.app?.db, userId);
window.gerenciarUnidades = (userId, userNome, userEmail, unidadesAtuais) => gerenciarUnidadesUsuario(window.app?.db, userId, userNome, userEmail, unidadesAtuais);
window.abrirGerenciadorUnidades = () => abrirGerenciadorUnidades(window.app?.db);
window.abrirImportadorUnidades = () => abrirImportadorUnidades(window.app?.db);

// =========================================================================
// MÓDULO DE AUDITORIA, FILTROS E ERROS
// =========================================================================

export const loadLogFilters = async (db) => {
    try {
        const userSelect = document.getElementById('filter-log-user');
        const actionSelect = document.getElementById('filter-log-action');
        
        if (userSelect) {
            const usersSnap = await getDocs(collection(db, "users"));
            userSelect.innerHTML = '<option value="all">Todos os usuários</option>';
            usersSnap.forEach(doc => {
                const user = doc.data();
                if (user.email) {
                    const option = document.createElement('option');
                    option.value = user.email;
                    option.textContent = user.name || user.email;
                    userSelect.appendChild(option);
                }
            });
        }
        
        if (actionSelect) {
            const logsSnap = await getDocs(collection(db, "audit_logs"));
            const actions = new Set();
            logsSnap.forEach(doc => {
                const action = doc.data().action;
                if (action) actions.add(action);
            });
            
            actionSelect.innerHTML = '<option value="all">Todas as ações</option>';
            Array.from(actions).sort().forEach(action => {
                const option = document.createElement('option');
                option.value = action;
                option.textContent = action;
                actionSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Erro ao carregar filtros de log:", error);
    }
};

export const loadAuditLogs = async (db) => {
    const logsContainer = document.getElementById('audit-logs-container');
    const tableBody = document.getElementById('audit-logs-table-body');
    const pdfBtn = document.getElementById('export-audit-pdf-btn');
    const filterSection = document.getElementById('audit-filters-section');
    
    if (!logsContainer || !tableBody) return;

    if (filterSection) filterSection.classList.remove('hidden');
    logsContainer.classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8"><div class="loader-small mx-auto"></div><p class="text-xs text-gray-400 mt-2">Buscando histórico...</p></td></tr>';
    if (pdfBtn) pdfBtn.classList.add('hidden');

    try {
        if (document.getElementById('filter-log-user')?.options.length <= 1) await loadLogFilters(db);

        const logsRef = collection(db, "audit_logs");
        const userFilter = document.getElementById('filter-log-user')?.value;
        const actionFilter = document.getElementById('filter-log-action')?.value;
        const startDate = document.getElementById('filter-log-start')?.value;
        const endDate = document.getElementById('filter-log-end')?.value;

        const q = query(logsRef, orderBy("timestamp", "desc"), limit(1500));
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

        if (filteredLogs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400 text-xs">Nenhum registro encontrado.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        if (pdfBtn) pdfBtn.classList.remove('hidden');

        filteredLogs.slice(0, 200).forEach((log) => {
            let formattedDate = 'Data inválida';
            try {
                const date = new Date(log.timestamp);
                if (!isNaN(date.getTime())) {
                    formattedDate = date.toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                    });
                }
            } catch (e) {}
            
            const row = document.createElement('tr');
            row.className = "border-b hover:bg-gray-50 transition-colors";
            
            let actionColor = 'bg-indigo-100 text-indigo-700 border border-indigo-200';
            const action = (log.action || '').toLowerCase();
            if (action.includes('erro') || action.includes('error') || action.includes('falha')) actionColor = 'bg-red-600 text-white border border-red-700 font-black animate-pulse';
            else if (action.includes('delete') || action.includes('apagou') || action.includes('remove')) actionColor = 'bg-red-100 text-red-700 border border-red-200';
            else if (action.includes('create') || action.includes('criou') || action.includes('add')) actionColor = 'bg-green-100 text-green-700 border border-green-200';
            else if (action.includes('update') || action.includes('edit') || action.includes('atualiz')) actionColor = 'bg-blue-100 text-blue-700 border border-blue-200';
            
            row.innerHTML = `
                <td class="px-3 py-2 whitespace-nowrap text-[10px] text-gray-600">${escapeHTML(formattedDate)}</td>
                <td class="px-3 py-2"><p class="font-bold text-gray-800 text-[11px]">${escapeHTML(log.userName || log.userEmail || 'Desconhecido')}</p></td>
                <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded text-[9px] ${actionColor} uppercase shadow-sm">${escapeHTML(log.action || 'AÇÃO')}</span></td>
                <td class="px-3 py-2 text-[10px] text-gray-600 max-w-xs break-words">${escapeHTML(log.details || '-')}${log.pautaId && log.pautaId !== 'N/A' ? `<br><span class="text-[8px] text-gray-400">Pauta: ${escapeHTML(log.pautaId.substring(0,8))}</span>` : ''}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Erro ao carregar logs:", error);
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-500 text-xs font-bold border border-red-200 bg-red-50">❌ Erro ao carregar registros</td></tr>`;
    }
};

export const exportAuditLogsPDF = async (db) => {
    showNotification("Gerando PDF da Auditoria...", "info");
    try {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF({ orientation: 'landscape' });
        const logsRef = collection(db, "audit_logs");
        
        const userFilter = document.getElementById('filter-log-user')?.value;
        const actionFilter = document.getElementById('filter-log-action')?.value;
        const startDate = document.getElementById('filter-log-start')?.value;
        const endDate = document.getElementById('filter-log-end')?.value;

        const q = query(logsRef, orderBy("timestamp", "desc"), limit(1500));
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

        if (filteredLogs.length === 0) {
            showNotification("Nenhum log para exportar.", "warning");
            return;
        }

        docPDF.setFontSize(18); docPDF.setTextColor(55, 65, 81);
        docPDF.text("Relatorio de Auditoria - SIGEP", 14, 20);
        docPDF.setFontSize(10); docPDF.setTextColor(100, 100, 100);
        docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
        docPDF.text(`Total: ${filteredLogs.length} registros`, 14, 34);
        
        const body = filteredLogs.map(log => [
            log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'Invalida',
            `${log.userName || log.userEmail || 'Desconhecido'}`,
            log.action || '-',
            (log.details || '-').substring(0, 100)
        ]);

        docPDF.autoTable({
            head: [['Data/Hora', 'Usuario', 'Acao', 'Detalhes']],
            body: body, startY: 45, theme: 'striped',
            headStyles: { fillColor: [55, 65, 81], fontSize: 8, halign: 'center' },
            styles: { fontSize: 7, cellPadding: 2 },
        });

        docPDF.save(`Auditoria_SIGEP_${new Date().toISOString().slice(0,10)}.pdf`);
        showNotification("PDF gerado!");
    } catch (error) { showNotification("Erro ao gerar PDF.", "error"); }
};

// =========================================================================
// MÓDULO DE LIMPEZA E BI
// =========================================================================

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
                const stats = {
                    pautaName: pautaData.name || 'Sem nome',
                    creatorEmail: pautaData.ownerEmail || pautaData.memberEmails?.[0] || 'Desconhecido',
                    dataReferencia: limitDate.toISOString(),
                    diaSemana: limitDate.getDay(),
                    total: snapshot.size,
                    atendidos: snapshot.docs.filter(d => d.data().status === 'atendido').length,
                    faltosos: snapshot.docs.filter(d => d.data().status === 'faltoso').length,
                    assuntos: {}, atendentes: {}
                };
                snapshot.docs.forEach(d => {
                    const data = d.data();
                    const sub = data.subject || 'Não informado';
                    stats.assuntos[sub] = (stats.assuntos[sub] || 0) + 1;
                    let profissionalNome = 'Não atribuído';
                    if (data.attendedBy) profissionalNome = typeof data.attendedBy === 'object' ? (data.attendedBy.nome || data.attendedBy.name) : data.attendedBy;
                    else if (data.attendant) profissionalNome = typeof data.attendant === 'object' ? (data.attendant.nome || data.attendant.name) : data.attendant;
                    else if (data.assignedCollaborator?.name) profissionalNome = data.assignedCollaborator.name;
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
        loadDashboardData(db);
    } catch (error) { showNotification("Erro: " + error.message, "error"); }
};

export const generateTestData = async (db) => {
    if (!confirm("Gerar dados de teste?")) return;
    try {
        const testData = [];
        const assuntosPool = ["ALIMENTOS", "DIVÓRCIO", "CURATELA", "URGÊNCIA"];
        const atendentesPool = ["Dra. Roberta", "Dr. Marcos", "Dra. Clarice"];
        for(let i=0; i<6; i++) {
            let totalCasos = Math.floor(Math.random() * 40) + 30;
            let atendidos = Math.floor(totalCasos * 0.85);
            const localAssuntos = {}, localAtendentes = {};
            for(let j=0; j<totalCasos; j++) {
                const ass = assuntosPool[Math.floor(Math.random() * assuntosPool.length)];
                localAssuntos[ass] = (localAssuntos[ass] || 0) + 1;
                const atb = atendentesPool[Math.floor(Math.random() * atendentesPool.length)];
                localAtendentes[atb] = (localAtendentes[atb] || 0) + 1;
            }
            testData.push({
                pautaName: `Pauta Simulada ${i+1}`,
                creatorEmail: i % 2 === 0 ? "admin@teste.com" : "user@teste.com",
                dataReferencia: new Date(Date.now() - (i*3)*24*60*60*1000).toISOString(),
                diaSemana: i + 1,
                total: totalCasos,
                atendidos: atendidos,
                faltosos: totalCasos - atendidos,
                assuntos: localAssuntos,
                atendentes: localAtendentes
            });
        }
        for (const data of testData) { await addDoc(collection(db, "estatisticas_permanentes"), data); }
        showNotification("✅ Dados de teste criados!");
        await loadDashboardData(db);
    } catch (error) { showNotification("Erro ao gerar dados", "error"); }
};

export const loadDashboardData = async (db) => {
    const start = document.getElementById('stats-filter-start')?.value;
    const end = document.getElementById('stats-filter-end')?.value;
    const userFilter = document.getElementById('stats-filter-user')?.value;
    const attendantFilter = document.getElementById('stats-filter-attendant')?.value;
    const resultsArea = document.getElementById('dashboard-results');
    if (!resultsArea) return;
    
    resultsArea.classList.remove('hidden');
    resultsArea.innerHTML = '<div class="text-center py-8"><div class="loader-small mx-auto"></div><p class="text-gray-600 mt-2">Carregando dados...</p></div>';

    try {
        const snapshot = await getDocs(collection(db, "estatisticas_permanentes"));
        if (snapshot.empty) {
            resultsArea.innerHTML = `
                <div class="text-center py-12 bg-white rounded-lg border shadow-sm">
                    <div class="text-5xl mb-4">📊</div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">BI ainda vazio!</h3>
                    <p class="text-gray-500 mb-6 text-sm">Execute a Limpeza Manual para gerar estatísticas.</p>
                    <button id="generate-test-data-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg text-sm font-bold">Inserir Dados de Teste</button>
                </div>`;
            document.getElementById('generate-test-data-btn')?.addEventListener('click', () => generateTestData(db));
            return;
        }
        
        let rawData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (document.getElementById('stats-filter-attendant')?.options.length <= 1) {
            const atendentesUnicos = new Set();
            rawData.forEach(d => { if (d.atendentes) Object.keys(d.atendentes).forEach(n => atendentesUnicos.add(n)); });
            const select = document.getElementById('stats-filter-attendant');
            if (select) {
                select.innerHTML = '<option value="all">Todos os Atendentes</option>';
                Array.from(atendentesUnicos).sort().forEach(n => select.appendChild(new Option(n, n)));
            }
        }

        let filteredData = [...rawData];
        if (start) filteredData = filteredData.filter(d => d.dataReferencia && d.dataReferencia >= start);
        if (end) filteredData = filteredData.filter(d => d.dataReferencia && d.dataReferencia <= end + "T23:59:59");
        if (userFilter && userFilter !== 'all') filteredData = filteredData.filter(d => d.creatorEmail === userFilter);
        if (attendantFilter && attendantFilter !== 'all') filteredData = filteredData.filter(d => d.atendentes && d.atendentes[attendantFilter] !== undefined);

        if (filteredData.length === 0) {
            resultsArea.innerHTML = '<div class="text-center py-8 text-gray-500 font-semibold bg-white rounded-lg border">Nenhum dado encontrado.</div>';
            return;
        }

        let totalGeral = 0, totalAtendidos = 0, totalFaltosos = 0;
        let mapAssuntos = {}, mapUsers = {};

        filteredData.forEach(d => {
            if (attendantFilter && attendantFilter !== 'all') {
                const prodAtendente = d.atendentes[attendantFilter] || 0;
                totalGeral += prodAtendente;
                totalAtendidos += prodAtendente;
            } else {
                totalGeral += d.total || 0; 
                totalAtendidos += d.atendidos || 0; 
                totalFaltosos += d.faltosos || 0;
            }
            if (d.assuntos) for (let [k, v] of Object.entries(d.assuntos)) mapAssuntos[k] = (mapAssuntos[k] || 0) + v;
            if (d.atendentes) for (let [k, v] of Object.entries(d.atendentes)) mapUsers[k] = (mapUsers[k] || 0) + v;
        });

        const taxa = totalGeral > 0 ? ((totalFaltosos / totalGeral) * 100).toFixed(1) : 0;

        resultsArea.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <div class="p-4 bg-blue-50 rounded-lg text-center"><p class="text-[9px] text-blue-600 font-bold uppercase">Demandado</p><h4 class="text-xl font-black text-blue-800">${totalGeral}</h4></div>
                <div class="p-4 bg-green-50 rounded-lg text-center"><p class="text-[9px] text-green-600 font-bold uppercase">Atendidos</p><h4 class="text-xl font-black text-green-800">${totalAtendidos}</h4></div>
                <div class="p-4 bg-orange-50 rounded-lg text-center"><p class="text-[9px] text-orange-600 font-bold uppercase">Absenteísmo</p><h4 class="text-xl font-black text-orange-800">${attendantFilter && attendantFilter !== 'all' ? '0.0' : taxa}%</h4></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div class="border rounded-lg p-4 bg-white"><h5 class="text-[10px] font-bold mb-4 uppercase text-gray-500 border-b pb-2">Top Assuntos</h5><div id="dash-subjects-list" class="space-y-2 text-xs"></div></div>
                <div class="border rounded-lg p-4 bg-white"><h5 class="text-[10px] font-bold mb-4 uppercase text-gray-500 border-b pb-2">Produtividade</h5><div id="dash-users-list" class="space-y-2 text-xs"></div></div>
            </div>
            <div class="flex justify-end gap-3 mt-6 border-t pt-4">
                 <button id="export-csv-btn" class="bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-bold">CSV</button>
                 <button id="export-bi-pdf-btn" class="bg-red-600 text-white px-5 py-2.5 rounded-lg font-bold">PDF</button>
            </div>
        `;

        const renderRanking = (elementId, dataMap) => {
            const el = document.getElementById(elementId);
            const sorted = Object.entries(dataMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
            if (sorted.length === 0) { el.innerHTML = '<p class="text-center text-gray-400 py-4">Sem dados.</p>'; return; }
            el.innerHTML = sorted.map(([name, count]) => `<div class="flex justify-between items-center border-b border-dashed pb-1 pt-1"><span class="truncate pr-2 font-medium">${escapeHTML(name)}</span><span class="font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-md">${count}</span></div>`).join('');
        };
        renderRanking('dash-subjects-list', mapAssuntos);
        renderRanking('dash-users-list', mapUsers);

        document.getElementById('export-bi-pdf-btn')?.addEventListener('click', () => exportBIDashboardPDF(totalGeral, totalAtendidos, taxa, mapAssuntos));
        document.getElementById('export-csv-btn')?.addEventListener('click', () => exportCSV(totalGeral, totalAtendidos, taxa, mapAssuntos));
        showNotification("Dashboard atualizado!", "success");
    } catch (error) {
        resultsArea.innerHTML = `<div class="text-center py-8 text-red-500">Erro: ${error.message}</div>`;
    }
};

const exportCSV = (totalGeral, totalAtendidos, taxa, mapAssuntos) => {
    let csvContent = "data:text/csv;charset=utf-8,RELATORIO EXECUTIVO\n\nMETRICA;VALOR\n";
    csvContent += `Total Demandado;${totalGeral}\nTotal Atendido;${totalAtendidos}\nTaxa Absenteismo;${taxa}%\n\nASSUNTO;QUANTIDADE\n`;
    Object.entries(mapAssuntos).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => { csvContent += `${k};${v}\n`; });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Relatorio_BI_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

export const exportBIDashboardPDF = (totalGeral, totalAtendidos, taxaFalta, mapAssuntos) => {
    try {
        const docPDF = new window.jspdf.jsPDF();
        docPDF.setFontSize(18); docPDF.setTextColor(22, 163, 74); docPDF.text("Relatorio Executivo de BI - SIGEP", 14, 20);
        docPDF.setFontSize(10); docPDF.setTextColor(100, 100, 100); docPDF.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
        docPDF.setFontSize(14); docPDF.setTextColor(0, 0, 0); docPDF.text("Resumo Geral", 14, 45);
        docPDF.setFontSize(11); docPDF.setTextColor(50, 50, 50);
        docPDF.text(`Total Demandado: ${totalGeral}`, 14, 55);
        docPDF.text(`Atendimentos Efetivos: ${totalAtendidos}`, 14, 62);
        docPDF.text(`Taxa de Faltas: ${taxaFalta}%`, 14, 69);
        docPDF.setFontSize(14); docPDF.setTextColor(0, 0, 0); docPDF.text("Principais Demandas", 14, 85);
        let y = 95;
        Object.entries(mapAssuntos).sort((a,b) => b[1] - a[1]).slice(0,10).forEach(([k,v]) => { docPDF.text(`${k}: ${v} atendimentos`, 14, y); y += 7; });
        docPDF.save(`Relatorio_BI_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e) { showNotification("Erro ao gerar PDF", "error"); }
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

// Listeners
document.getElementById('filter-log-user')?.addEventListener('change', () => loadAuditLogs(window.app?.db));
document.getElementById('filter-log-action')?.addEventListener('change', () => loadAuditLogs(window.app?.db));
document.getElementById('filter-log-start')?.addEventListener('change', () => loadAuditLogs(window.app?.db));
document.getElementById('filter-log-end')?.addEventListener('change', () => loadAuditLogs(window.app?.db));

// Globais
window.cleanupOldData = () => cleanupOldData(window.app?.db);
window.loadDashboardData = () => loadDashboardData(window.app?.db);
window.populateUserFilter = () => populateUserFilter(window.app?.db);
window.generateTestData = () => generateTestData(window.app?.db);
window.loadAuditLogs = () => loadAuditLogs(window.app?.db);
window.exportAuditLogsPDF = () => exportAuditLogsPDF(window.app?.db);
window.abrirGerenciadorUnidades = () => abrirGerenciadorUnidades(window.app?.db);
window.abrirImportadorUnidades = () => abrirImportadorUnidades(window.app?.db);

console.log("✅ Módulo admin.js carregado com sucesso (coleção unificada estrutura_unidades, cores profissionalizadas)");