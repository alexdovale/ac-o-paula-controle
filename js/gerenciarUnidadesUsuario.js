/**
 * gerenciarUnidadesUsuario.js
 * SIGEP — Modal "Gerenciar Unidades" do usuário individual
 *
 * Coleções Firestore usadas:
 * /users/{uid}                       — doc do usuário (campo unidades: [{unidadeId, role}])
 * /estrutura_unidades/{id}           — doc da unidade (nova arquitetura)
 */

import {
    doc, getDoc, getDocs, collection, query, where,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML } from './utils.js';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function initials(name = '') {
    return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

const ROLE_OPTIONS = ['apoio', 'admin', 'superadmin'];
const ROLE_STYLE = {
    apoio:      'background:#EEEDFE;color:#3C3489;border:0.5px solid #AFA9EC',
    admin:      'background:#FAEEDA;color:#633806;border:0.5px solid #FAC775',
    superadmin: 'background:#FCEBEB;color:#791F1F;border:0.5px solid #F09595',
};

// ─── BUSCA DE DADOS ────────────────────────────────────────────────────────────

async function buscarUsuario(db, uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) throw new Error('Usuário não encontrado');
    return { id: snap.id, ...snap.data() };
}

async function buscarTodasUnidades(db) {
    console.log("🔍 Buscando unidades da NOVA estrutura...");
    try {
        // A MÁGICA ESTÁ AQUI: Lendo da coleção nova criada pelo importadorOrgaos
        const unidadesRef = collection(db, 'estrutura_unidades');
        const snap = await getDocs(unidadesRef);

        console.log("✅ Unidades encontradas:", snap.docs.length);
        // Filtra para não mostrar unidades excluídas logicamente
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.ativo !== false);
    } catch (error) {
        console.error("❌ Erro ao buscar unidades:", error.code, error.message);
        throw error;
    }
}

// ─── PERSISTÊNCIA ─────────────────────────────────────────────────────────────

async function salvarVinculos(db, uid, vinculos) {
    await updateDoc(doc(db, 'users', uid), { unidades: vinculos });
}

// ─── RENDERIZAÇÃO DO MODAL ────────────────────────────────────────────────────

export async function abrirGerenciarUnidades(app, usuarioId) {
    const { db } = app;

    document.getElementById('modal-gerenciar-unidades')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'modal-gerenciar-unidades';
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;
        z-index:9000;padding:16px;font-family:inherit; backdrop-filter: blur(4px);
    `;
    overlay.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-fade-in">
            <div class="bg-gradient-to-r from-indigo-900 to-slate-800 padding px-6 py-4 flex items-center justify-between shrink-0">
                <div class="flex items-center gap-4">
                    <div id="guu-avatar" class="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center text-lg font-black shadow-inner"></div>
                    <div>
                        <h2 class="text-xl font-black text-white flex items-center gap-2">Vincular Unidades</h2>
                        <p id="guu-nome-email" class="text-indigo-200 text-sm mt-0.5"></p>
                    </div>
                </div>
                <button id="guu-fechar" class="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
            </div>
            
            <div class="p-6 overflow-y-auto flex-1 bg-slate-50" id="guu-body">
                <div class="flex justify-center py-12"><div class="loader-small border-indigo-600"></div></div>
            </div>
            
            <div class="bg-white px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                <button id="guu-cancelar" class="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition">Cancelar</button>
                <button id="guu-salvar" class="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-black shadow-md hover:bg-indigo-700 transition flex items-center gap-2">💾 Salvar Vínculos</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });
    document.getElementById('guu-fechar').onclick   = fecharModal;
    document.getElementById('guu-cancelar').onclick = fecharModal;

    function fecharModal() { overlay.remove(); }

    let usuario, todasUnidades;
    try {
        [usuario, todasUnidades] = await Promise.all([
            buscarUsuario(db, usuarioId),
            buscarTodasUnidades(db),
        ]);
    } catch (err) {
        document.getElementById('guu-body').innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-xl border border-red-200 font-bold text-center">Erro ao carregar: ${err.message}</div>`;
        return;
    }

    document.getElementById('guu-avatar').textContent = initials(usuario.name || usuario.nome || usuario.email || '?');
    document.getElementById('guu-nome-email').textContent = `${usuario.name || usuario.nome || 'Usuário'} · ${usuario.email || ''}`;

    let vinculos = Array.isArray(usuario.unidades)
        ? usuario.unidades.map(v => ({ unidadeId: v.unidadeId || v.id, role: v.role || 'apoio' }))
        : [];

    let filtroDisponivel = '';

    function render() {
        const body = document.getElementById('guu-body');
        const linkedIds = vinculos.map(v => v.unidadeId);
        
        // Filtra as que ainda não estão vinculadas
        const disponiveis = todasUnidades.filter(u =>
            !linkedIds.includes(u.id) &&
            (!filtroDisponivel ||
             (u.nome || '').toLowerCase().includes(filtroDisponivel.toLowerCase()) ||
             (u.sigla || '').toLowerCase().includes(filtroDisponivel.toLowerCase()))
        );

        body.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div class="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="bg-indigo-50 border-b border-indigo-100 px-4 py-3 flex justify-between items-center">
                        <span class="font-black text-indigo-900 uppercase tracking-widest text-[11px]">🔗 Unidades Vinculadas</span>
                        <span class="bg-indigo-200 text-indigo-800 text-[10px] font-black px-2 py-0.5 rounded-full">${vinculos.length}</span>
                    </div>
                    <div class="p-3 flex-1 overflow-y-auto max-h-[400px]">
                        ${vinculos.length === 0 ? `
                            <div class="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                                <span class="text-4xl mb-2">🏢</span>
                                <p class="text-sm font-bold">Nenhum vínculo ativo</p>
                            </div>
                        ` : vinculos.map(v => {
                            const unidade = todasUnidades.find(u => u.id === v.unidadeId);
                            if (!unidade) return '';
                            return `
                            <div class="mb-2 p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3 hover:border-indigo-300 transition shadow-sm">
                                <div class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg shrink-0">🏢</div>
                                <div class="flex-1 min-w-0">
                                    <p class="font-bold text-slate-800 text-sm truncate">${escapeHTML(unidade.nome || '')}</p>
                                    <p class="text-[10px] text-slate-400 uppercase tracking-wider">${escapeHTML(unidade.sigla || 'Sem sigla')}</p>
                                </div>
                                <div class="flex flex-col gap-1 shrink-0 items-end">
                                    <select data-uid="${v.unidadeId}" class="guu-role-select text-[10px] font-bold uppercase px-2 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 outline-none cursor-pointer hover:bg-slate-200 transition">
                                        ${ROLE_OPTIONS.map(r => `<option value="${r}"${r === v.role ? ' selected' : ''}>Cargo: ${r}</option>`).join('')}
                                    </select>
                                    <button data-uid="${v.unidadeId}" class="guu-btn-remover text-[10px] text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded hover:bg-red-50 transition">Remover ✕</button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <div class="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="bg-slate-100 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
                        <span class="font-black text-slate-600 uppercase tracking-widest text-[11px]">➕ Adicionar Vínculo</span>
                        <span class="bg-slate-200 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full">${disponiveis.length}</span>
                    </div>
                    
                    <div class="p-3 border-b border-slate-100 bg-white">
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                            <input type="search" id="guu-filtro-disp" value="${escapeHTML(filtroDisponivel)}"
                                placeholder="Buscar unidade por nome ou sigla..."
                                class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition">
                        </div>
                    </div>

                    <div class="p-3 flex-1 overflow-y-auto max-h-[345px]">
                        ${disponiveis.length === 0 ? `
                            <div class="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                                <p class="text-sm font-bold">${filtroDisponivel ? 'Nenhuma unidade encontrada.' : 'Todas as unidades já foram vinculadas.'}</p>
                            </div>
                        ` : disponiveis.map(u => `
                            <div class="mb-2 p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:border-slate-400 transition">
                                <div class="flex-1 min-w-0">
                                    <p class="font-bold text-slate-700 text-sm truncate">${escapeHTML(u.nome || '')}</p>
                                    <p class="text-[10px] text-slate-400 uppercase tracking-wider">${escapeHTML(u.sigla || 'Sem sigla')}</p>
                                </div>
                                <button data-uid="${u.id}" class="guu-btn-vincular shrink-0 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm">
                                    Adicionar +
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        body.querySelectorAll('.guu-btn-remover').forEach(btn => {
            btn.onclick = () => { vinculos = vinculos.filter(v => v.unidadeId !== btn.dataset.uid); render(); };
        });
        body.querySelectorAll('.guu-btn-vincular').forEach(btn => {
            btn.onclick = () => {
                if (!vinculos.find(v => v.unidadeId === btn.dataset.uid)) {
                    vinculos.push({ unidadeId: btn.dataset.uid, role: 'apoio' });
                    render();
                }
            };
        });
        body.querySelectorAll('.guu-role-select').forEach(sel => {
            sel.onchange = () => {
                const v = vinculos.find(x => x.unidadeId === sel.dataset.uid);
                if (v) v.role = sel.value;
            };
        });
        document.getElementById('guu-filtro-disp').oninput = e => { filtroDisponivel = e.target.value; render(); };
    }

    render();

    document.getElementById('guu-salvar').onclick = async () => {
        const btn = document.getElementById('guu-salvar');
        btn.disabled = true;
        btn.innerHTML = '<div class="loader-small border-white mr-2"></div> Salvando...';
        try {
            await salvarVinculos(db, usuarioId, vinculos);
            fecharModal();
            if (typeof window.showNotification === 'function') {
                window.showNotification('Vínculos atualizados com sucesso!', 'success');
            }
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '💾 Salvar Vínculos';
            alert('Erro ao salvar: ' + err.message);
        }
    };
}
