/**
 * gerenciarUnidadesUsuario.js
 * SIGEP — Modal "Gerenciar Unidades" do usuário individual
 *
 * Uso:
 *   import { abrirGerenciarUnidades } from './gerenciarUnidadesUsuario.js';
 *   await abrirGerenciarUnidades(app, usuarioId);
 *
 * Dependências esperadas em app:
 *   app.db          — instância Firestore
 *   app.currentUser — { uid, role }
 *
 * Coleções Firestore usadas:
 *   /usuarios/{uid}                    — doc do usuário (campo unidades: [{unidadeId, role}])
 *   /unidades/{uid}                    — doc da unidade (campos: nome, orgaoNome, orgaoId)
 *   /orgaos/{orgaoId}                  — doc do órgão (campo: nome)
 */

import {
    doc, getDoc, getDocs, collection,
    updateDoc, arrayUnion, arrayRemove
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
    const snap = await getDoc(doc(db, 'usuarios', uid));
    if (!snap.exists()) throw new Error('Usuário não encontrado');
    return { id: snap.id, ...snap.data() };
}

async function buscarTodasUnidades(db) {
    console.log("🔍 Buscando unidades...");
    console.log("Usuário autenticado?", window.app.auth.currentUser?.uid);
    
    try {
        const snap = await getDocs(collection(db, 'unidades'));
        console.log("✅ Unidades encontradas:", snap.docs.length);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error("❌ Erro ao buscar unidades:", error.code, error.message);
        throw error;
    }
}

// ─── PERSISTÊNCIA ─────────────────────────────────────────────────────────────

/**
 * Salva o array completo de vínculos no documento do usuário.
 * Estrutura: usuario.unidades = [{ unidadeId, role }, ...]
 */
async function salvarVinculos(db, uid, vinculos) {
    await updateDoc(doc(db, 'usuarios', uid), { unidades: vinculos });
}

// ─── RENDERIZAÇÃO DO MODAL ────────────────────────────────────────────────────

export async function abrirGerenciarUnidades(app, usuarioId) {
    const { db } = app;

    // Remove modal anterior se existir
    document.getElementById('modal-gerenciar-unidades')?.remove();

    // Overlay de carregamento
    const overlay = document.createElement('div');
    overlay.id = 'modal-gerenciar-unidades';
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        z-index:9000;padding:16px;font-family:inherit
    `;
    overlay.innerHTML = `
        <div style="background:var(--color-background-primary,#fff);border-radius:16px;
                    width:100%;max-width:760px;max-height:90vh;overflow:hidden;
                    display:flex;flex-direction:column;box-shadow:0 4px 32px rgba(0,0,0,.18)">
            <div style="padding:20px 24px 16px;border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb);
                        display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
                <div style="display:flex;align-items:center;gap:12px">
                    <div id="guu-avatar" style="width:40px;height:40px;border-radius:50%;
                         background:#E6F1FB;color:#185FA5;display:flex;align-items:center;
                         justify-content:center;font-size:14px;font-weight:500"></div>
                    <div>
                        <p id="guu-nome" style="font-size:15px;font-weight:500;color:var(--color-text-primary,#111)"></p>
                        <p id="guu-email" style="font-size:12px;color:var(--color-text-secondary,#6b7280)"></p>
                    </div>
                </div>
                <button id="guu-fechar" style="width:32px;height:32px;border-radius:8px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                         background:transparent;cursor:pointer;font-size:18px;color:var(--color-text-secondary,#6b7280);
                         display:flex;align-items:center;justify-content:center">×</button>
            </div>
            <div style="padding:16px 24px;overflow-y:auto;flex:1" id="guu-body">
                <p style="color:var(--color-text-secondary,#6b7280);font-size:13px;text-align:center;padding:32px 0">
                    Carregando…
                </p>
            </div>
            <div style="padding:12px 24px;border-top:0.5px solid var(--color-border-tertiary,#e5e7eb);
                        display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
                <button id="guu-cancelar" style="padding:8px 20px;border-radius:8px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                         background:transparent;cursor:pointer;font-size:13px;color:var(--color-text-primary,#111)">Cancelar</button>
                <button id="guu-salvar" style="padding:8px 20px;border-radius:8px;border:none;
                         background:#1e293b;color:#fff;cursor:pointer;font-size:13px;font-weight:500">Salvar Vínculos</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Fechar ao clicar fora
    overlay.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });
    document.getElementById('guu-fechar').onclick   = fecharModal;
    document.getElementById('guu-cancelar').onclick = fecharModal;

    function fecharModal() {
        overlay.remove();
    }

    // ── Carrega dados ──────────────────────────────────────────────────────────
    let usuario, todasUnidades;
    try {
        [usuario, todasUnidades] = await Promise.all([
            buscarUsuario(db, usuarioId),
            buscarTodasUnidades(db),
        ]);
    } catch (err) {
        document.getElementById('guu-body').innerHTML =
            `<p style="color:#A32D2D;font-size:13px;padding:24px;text-align:center">Erro ao carregar dados: ${err.message}</p>`;
        return;
    }

    // Preenche cabeçalho
    document.getElementById('guu-avatar').textContent = initials(usuario.nome || usuario.displayName || '?');
    document.getElementById('guu-nome').textContent   = usuario.nome || usuario.displayName || 'Usuário';
    document.getElementById('guu-email').textContent  = usuario.email || '';

    // Estado local de vínculos: [{ unidadeId, role }]
    let vinculos = Array.isArray(usuario.unidades)
        ? usuario.unidades.map(v => ({ unidadeId: v.unidadeId || v.id, role: v.role || 'apoio' }))
        : [];

    let filtroDisponivel = '';

    // ── Renderiza corpo ────────────────────────────────────────────────────────
    function render() {
        const body = document.getElementById('guu-body');
        const linkedIds = vinculos.map(v => v.unidadeId);
        const disponiveis = todasUnidades.filter(u =>
            !linkedIds.includes(u.id) &&
            (!filtroDisponivel ||
             (u.nome || '').toLowerCase().includes(filtroDisponivel.toLowerCase()) ||
             (u.orgaoNome || '').toLowerCase().includes(filtroDisponivel.toLowerCase()))
        );

        body.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

                <!-- VINCULADAS -->
                <div>
                    <div style="font-size:11px;color:var(--color-text-secondary,#6b7280);text-transform:uppercase;
                                letter-spacing:.06em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
                        <span>🔗 Unidades vinculadas</span>
                        <span style="background:var(--color-background-secondary,#f9fafb);border:0.5px solid var(--color-border-secondary,#d1d5db);
                                     border-radius:10px;padding:1px 7px;font-size:10px">${vinculos.length}</span>
                    </div>
                    <div style="border:0.5px solid var(--color-border-tertiary,#e5e7eb);border-radius:12px;overflow:hidden">
                        ${vinculos.length === 0 ? `
                            <div style="padding:24px;text-align:center;font-size:13px;color:var(--color-text-secondary,#6b7280)">
                                Nenhuma unidade vinculada
                            </div>
                        ` : vinculos.map(v => {
                            const unidade = todasUnidades.find(u => u.id === v.unidadeId);
                            if (!unidade) return '';
                            return `
                            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                                        border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb)"
                                 class="guu-linked-item">
                                <div style="width:30px;height:30px;border-radius:6px;background:#EAF3DE;color:#27500A;
                                            display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">🏛️</div>
                                <div style="flex:1;min-width:0">
                                    <p style="font-size:13px;font-weight:500;color:var(--color-text-primary,#111);
                                              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(unidade.nome || '')}</p>
                                    <p style="font-size:11px;color:var(--color-text-secondary,#6b7280);
                                              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(unidade.orgaoNome || '')}</p>
                                </div>
                                <select data-uid="${v.unidadeId}" class="guu-role-select"
                                    style="font-size:11px;padding:2px 5px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                                           border-radius:6px;background:var(--color-background-secondary,#f9fafb);
                                           color:var(--color-text-primary,#111);cursor:pointer;max-width:95px">
                                    ${ROLE_OPTIONS.map(r =>
                                        `<option value="${r}"${r === v.role ? ' selected' : ''}>${r}</option>`
                                    ).join('')}
                                </select>
                                <button data-uid="${v.unidadeId}" class="guu-btn-remover"
                                    style="width:28px;height:28px;border-radius:6px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                                           background:transparent;cursor:pointer;font-size:14px;color:var(--color-text-secondary,#6b7280);
                                           display:flex;align-items:center;justify-content:center;flex-shrink:0"
                                    title="Remover vínculo">🔗</button>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <!-- DISPONÍVEIS -->
                <div>
                    <div style="font-size:11px;color:var(--color-text-secondary,#6b7280);text-transform:uppercase;
                                letter-spacing:.06em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
                        <span>🏢 Disponíveis para vincular</span>
                        <span style="background:var(--color-background-secondary,#f9fafb);border:0.5px solid var(--color-border-secondary,#d1d5db);
                                     border-radius:10px;padding:1px 7px;font-size:10px">${disponiveis.length}</span>
                    </div>
                    <div style="border:0.5px solid var(--color-border-tertiary,#e5e7eb);border-radius:12px;overflow:hidden">
                        <div style="padding:8px 12px;border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb)">
                            <input type="search" id="guu-filtro-disp" value="${escapeHTML(filtroDisponivel)}"
                                placeholder="Buscar unidade ou órgão..."
                                style="width:100%;font-size:13px;padding:6px 10px;
                                       border:0.5px solid var(--color-border-secondary,#d1d5db);border-radius:8px;
                                       background:var(--color-background-secondary,#f9fafb);
                                       color:var(--color-text-primary,#111);outline:none">
                        </div>
                        <div style="max-height:260px;overflow-y:auto">
                            ${disponiveis.length === 0 ? `
                                <div style="padding:24px;text-align:center;font-size:13px;color:var(--color-text-secondary,#6b7280)">
                                    ${filtroDisponivel ? 'Nenhum resultado.' : 'Todas as unidades já vinculadas.'}
                                </div>
                            ` : disponiveis.map(u => `
                                <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                                            border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb)">
                                    <div style="width:30px;height:30px;border-radius:6px;background:#E6F1FB;color:#0C447C;
                                                display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">🏢</div>
                                    <div style="flex:1;min-width:0">
                                        <p style="font-size:13px;font-weight:500;color:var(--color-text-primary,#111);
                                                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(u.nome || '')}</p>
                                        <p style="font-size:11px;color:var(--color-text-secondary,#6b7280);
                                                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(u.orgaoNome || '')}</p>
                                    </div>
                                    <button data-uid="${u.id}" class="guu-btn-vincular"
                                        style="width:28px;height:28px;border-radius:6px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                                               background:transparent;cursor:pointer;font-size:16px;color:var(--color-text-secondary,#6b7280);
                                               display:flex;align-items:center;justify-content:center;flex-shrink:0"
                                        title="Vincular unidade">+</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Eventos
        body.querySelectorAll('.guu-btn-remover').forEach(btn => {
            btn.onclick = () => {
                vinculos = vinculos.filter(v => v.unidadeId !== btn.dataset.uid);
                render();
            };
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
        document.getElementById('guu-filtro-disp').oninput = e => {
            filtroDisponivel = e.target.value;
            render();
        };
    }

    render();

    // ── Salvar ─────────────────────────────────────────────────────────────────
    document.getElementById('guu-salvar').onclick = async () => {
        const btn = document.getElementById('guu-salvar');
        btn.disabled = true;
        btn.textContent = 'Salvando…';
        try {
            await salvarVinculos(db, usuarioId, vinculos);
            fecharModal();
            // Notificação opcional (usa window.showNotification se disponível)
            if (typeof window.showNotification === 'function') {
                window.showNotification('Vínculos salvos com sucesso!', 'success');
            }
        } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Salvar Vínculos';
            alert('Erro ao salvar: ' + err.message);
        }
    };
}
