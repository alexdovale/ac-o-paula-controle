/**
 * estruturaAtual.js
 * SIGEP — Aba "Estrutura Atual" melhorada no Importador/Gerenciador de Órgãos
 *
 * Exporta:
 *   renderEstruturaAtual(app, containerEl)
 *     — renderiza dentro de containerEl as três abas: Estrutura | Hierarquia | Usuários
 *
 * Coleções Firestore usadas:
 *   /orgaos/{id}              — { nome, sigla, ordem? }
 *   /unidades/{id}            — { nome, orgaoId, orgaoNome, ordem? }
 *   /recepcoes/{id}           — { nome, unidadeId, orgaoId, tipo, salas?, assuntos? }
 *   /usuarios/{id}            — { nome, email, role, unidades:[{unidadeId,role}] }
 */

import {
    collection, getDocs, doc, updateDoc, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML } from './utils.js';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function initials(name = '') {
    return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

const TIPO_LABEL = {
    central:      'Central',
    especializada:'Especializada',
    mista:        'Mista',
    generalista:  'Generalista',
};
const TIPO_STYLE = {
    central:      'background:#EEEDFE;color:#3C3489;border:0.5px solid #AFA9EC',
    especializada:'background:#FAEEDA;color:#633806;border:0.5px solid #EF9F27',
    mista:        'background:#E6F1FB;color:#0C447C;border:0.5px solid #85B7EB',
    generalista:  'background:#EAF3DE;color:#27500A;border:0.5px solid #97C459',
};
const ROLE_STYLE = {
    apoio:      'background:#EEEDFE;color:#3C3489;border:0.5px solid #AFA9EC',
    admin:      'background:#FAEEDA;color:#633806;border:0.5px solid #FAC775',
    superadmin: 'background:#FCEBEB;color:#791F1F;border:0.5px solid #F09595',
};

// ─── BUSCA DE DADOS ────────────────────────────────────────────────────────────

async function carregarEstrutura(db) {
    const [orgSnap, unSnap, recSnap, usrSnap] = await Promise.all([
        getDocs(collection(db, 'orgaos')),
        getDocs(collection(db, 'unidades')),
        getDocs(collection(db, 'recepcoes')),
        getDocs(collection(db, 'users')),
    ]);

    const orgaos    = orgSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
    const unidades  = unSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
    const recepcoes = recSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const usuarios  = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return { orgaos, unidades, recepcoes, usuarios };
}

// ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────────

export async function renderEstruturaAtual(app, containerEl) {
    containerEl.innerHTML = `
        <div style="padding:8px 0;font-family:inherit">
            <p style="font-size:13px;color:var(--color-text-secondary,#6b7280);text-align:center;padding:24px">
                Carregando estrutura…
            </p>
        </div>
    `;

    let dados;
    try {
        dados = await carregarEstrutura(app.db);
    } catch (err) {
        containerEl.innerHTML = `
            <p style="color:#A32D2D;font-size:13px;padding:24px;text-align:center">
                Erro ao carregar estrutura: ${err.message}
            </p>
        `;
        return;
    }

    // Estado de abertura dos acordeões
    const openOrgs  = new Set(dados.orgaos.map(o => o.id));
    const openUnits = new Set();
    // Cópia local da ordem das unidades (para hierarquia)
    let unidadesOrdem = [...dados.unidades];

    let abaAtiva = 'estrutura';
    let filtroBusca = '';
    let filtroRole  = '';

    // ── Monta o shell com abas ─────────────────────────────────────────────────
    containerEl.innerHTML = `
        <div style="font-family:inherit">
            <!-- Stats -->
            <div id="ea-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px"></div>

            <!-- Tabs -->
            <div style="display:flex;gap:4px;border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb);margin-bottom:16px" id="ea-tabs"></div>

            <!-- Panes -->
            <div id="ea-pane"></div>
        </div>
    `;

    // Stats
    function renderStats() {
        const totalUsr = dados.usuarios.length;
        document.getElementById('ea-stats').innerHTML = [
            { n: dados.orgaos.length,    l: 'Órgãos'    },
            { n: dados.unidades.length,  l: 'Unidades'  },
            { n: dados.recepcoes.length, l: 'Recepções' },
            { n: totalUsr,               l: 'Usuários'  },
        ].map(s => `
            <div style="background:var(--color-background-secondary,#f9fafb);border-radius:8px;padding:10px 12px;text-align:center">
                <div style="font-size:20px;font-weight:500;color:var(--color-text-primary,#111)">${s.n}</div>
                <div style="font-size:10px;color:var(--color-text-secondary,#6b7280);margin-top:2px">${s.l}</div>
            </div>
        `).join('');
    }

    // Tabs
    function renderTabs() {
        const tabs = [
            { id: 'estrutura',  label: '🏛️ Estrutura'  },
            { id: 'hierarquia', label: '🗂️ Hierarquia' },
            { id: 'usuarios',   label: '👥 Usuários'   },
        ];
        document.getElementById('ea-tabs').innerHTML = tabs.map(t => `
            <button data-tab="${t.id}" style="
                padding:8px 14px;font-size:13px;cursor:pointer;
                border-radius:8px 8px 0 0;border:0.5px solid ${t.id === abaAtiva ? 'var(--color-border-tertiary,#e5e7eb)' : 'transparent'};
                border-bottom:${t.id === abaAtiva ? '0.5px solid var(--color-background-primary,#fff)' : 'none'};
                color:${t.id === abaAtiva ? 'var(--color-text-primary,#111)' : 'var(--color-text-secondary,#6b7280)'};
                font-weight:${t.id === abaAtiva ? '500' : '400'};
                background:${t.id === abaAtiva ? 'var(--color-background-primary,#fff)' : 'transparent'};
                margin-bottom:${t.id === abaAtiva ? '-0.5px' : '0'};
                transition:all .15s">${t.label}</button>
        `).join('');

        document.querySelectorAll('#ea-tabs [data-tab]').forEach(btn => {
            btn.onclick = () => {
                abaAtiva = btn.dataset.tab;
                renderTabs();
                renderPane();
            };
        });
    }

    // ── ABA ESTRUTURA ──────────────────────────────────────────────────────────
    function renderEstrutura() {
        const pane = document.getElementById('ea-pane');

        if (dados.orgaos.length === 0) {
            pane.innerHTML = `<p style="font-size:13px;color:var(--color-text-secondary,#6b7280);text-align:center;padding:32px">Nenhum órgão cadastrado.</p>`;
            return;
        }

        pane.innerHTML = dados.orgaos.map(org => {
            const unids = unidadesOrdem.filter(u => u.orgaoId === org.id);
            const recTotal = unids.reduce((a, u) => a + dados.recepcoes.filter(r => r.unidadeId === u.id).length, 0);
            const usrTotal = dados.usuarios.filter(us =>
                Array.isArray(us.unidades) && us.unidades.some(v => unids.find(u => u.id === (v.unidadeId || v.id)))
            ).length;
            const isOpen = openOrgs.has(org.id);

            return `
            <div style="background:var(--color-background-primary,#fff);border:0.5px solid var(--color-border-tertiary,#e5e7eb);
                        border-radius:12px;overflow:hidden;margin-bottom:12px">
                <div data-toggle-org="${org.id}" style="display:flex;align-items:center;gap:10px;padding:12px 16px;
                     background:var(--color-background-secondary,#f9fafb);border-bottom:${isOpen ? '0.5px solid var(--color-border-tertiary,#e5e7eb)' : 'none'};
                     cursor:pointer;user-select:none">
                    <div style="width:32px;height:32px;border-radius:8px;background:#EEEDFE;color:#3C3489;
                                display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">🏛️</div>
                    <div style="flex:1;min-width:0">
                        <p style="font-size:14px;font-weight:500;color:var(--color-text-primary,#111)">${escapeHTML(org.nome || '')}</p>
                        <p style="font-size:11px;color:var(--color-text-secondary,#6b7280)">${escapeHTML(org.sigla || '')} · ${unids.length} unid. · ${recTotal} recep. · ${usrTotal} usuários</p>
                    </div>
                    <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#EEEDFE;color:#3C3489;
                                 border:0.5px solid #AFA9EC;margin-right:6px">${usrTotal} usuários</span>
                    <span style="font-size:12px;color:var(--color-text-secondary,#6b7280);transition:transform .2s;
                                 transform:rotate(${isOpen ? '180' : '0'}deg)">▾</span>
                </div>
                ${isOpen ? `
                <div style="padding:12px 16px">
                    ${unids.length === 0 ? `
                        <p style="font-size:12px;color:var(--color-text-secondary,#6b7280);font-style:italic;padding:8px 0">
                            Nenhuma unidade neste órgão.
                        </p>
                    ` : unids.map(u => {
                        const recs = dados.recepcoes.filter(r => r.unidadeId === u.id);
                        const usrs = dados.usuarios.filter(us =>
                            Array.isArray(us.unidades) && us.unidades.some(v => (v.unidadeId || v.id) === u.id)
                        );
                        const isUOpen = openUnits.has(u.id);
                        return `
                        <div style="border:0.5px solid var(--color-border-tertiary,#e5e7eb);border-radius:10px;overflow:hidden;margin-bottom:8px">
                            <div data-toggle-unit="${u.id}" style="display:flex;align-items:center;gap:8px;padding:9px 12px;
                                 background:var(--color-background-secondary,#f9fafb);
                                 border-bottom:${isUOpen ? '0.5px solid var(--color-border-tertiary,#e5e7eb)' : 'none'};
                                 cursor:pointer;user-select:none">
                                <div style="width:24px;height:24px;border-radius:5px;background:#E6F1FB;color:#185FA5;
                                            display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">🚪</div>
                                <div style="flex:1;min-width:0">
                                    <p style="font-size:13px;font-weight:500;color:var(--color-text-primary,#111)">${escapeHTML(u.nome || '')}</p>
                                </div>
                                <span style="font-size:10px;padding:1px 6px;border-radius:9px;background:#E1F5EE;color:#085041;
                                             border:0.5px solid #5DCAA5;margin-right:4px">${recs.length} rec.</span>
                                <span style="font-size:10px;padding:1px 6px;border-radius:9px;background:#EEEDFE;color:#3C3489;
                                             border:0.5px solid #AFA9EC;margin-right:4px">${usrs.length} usu.</span>
                                <span style="font-size:11px;color:var(--color-text-secondary,#6b7280);
                                             transform:rotate(${isUOpen ? '180' : '0'}deg);transition:transform .2s">▾</span>
                            </div>
                            ${isUOpen ? `
                            <div style="padding:10px 12px">

                                <!-- RECEPÇÕES -->
                                <p style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;
                                          color:var(--color-text-secondary,#6b7280);margin-bottom:6px">
                                    🚪 Recepções (${recs.length})
                                </p>
                                ${recs.length === 0 ? `
                                    <p style="font-size:11px;color:var(--color-text-secondary,#6b7280);font-style:italic;margin-bottom:10px">
                                        Nenhuma recepção.
                                    </p>
                                ` : recs.map(r => `
                                    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;
                                                border:0.5px solid var(--color-border-tertiary,#e5e7eb);border-radius:8px;
                                                background:var(--color-background-primary,#fff)">
                                        <div style="width:20px;height:20px;border-radius:4px;background:#E1F5EE;color:#085041;
                                                    display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0">📋</div>
                                        <span style="font-size:12px;color:var(--color-text-primary,#111);flex:1">${escapeHTML(r.nome || '')}</span>
                                        ${r.sala ? `<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#EEEDFE;color:#3C3489;border:0.5px solid #AFA9EC">🏠 ${escapeHTML(r.sala)}</span>` : ''}
                                        <span style="font-size:10px;padding:1px 6px;border-radius:8px;font-weight:500;
                                                     ${TIPO_STYLE[r.tipo] || 'background:#f3f4f6;color:#374151;border:0.5px solid #d1d5db'}">
                                            ${TIPO_LABEL[r.tipo] || r.tipo || '—'}
                                        </span>
                                    </div>
                                `).join('')}

                                <!-- USUÁRIOS -->
                                <p style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;
                                          color:var(--color-text-secondary,#6b7280);margin:10px 0 6px">
                                    👥 Usuários (${usrs.length})
                                </p>
                                <div style="border:0.5px solid var(--color-border-tertiary,#e5e7eb);border-radius:8px;overflow:hidden">
                                    ${usrs.length === 0 ? `
                                        <p style="font-size:11px;color:var(--color-text-secondary,#6b7280);
                                                  font-style:italic;padding:8px 10px">Nenhum usuário.</p>
                                    ` : usrs.map(us => {
                                        const vinculo = (us.unidades || []).find(v => (v.unidadeId || v.id) === u.id);
                                        const roleLocal = vinculo?.role || us.role || 'apoio';
                                        return `
                                        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;
                                                    border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb)">
                                            <div style="width:26px;height:26px;border-radius:50%;background:#E6F1FB;color:#185FA5;
                                                        display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:500;flex-shrink:0">
                                                ${initials(us.nome || us.displayName || '?')}
                                            </div>
                                            <div style="flex:1;min-width:0">
                                                <p style="font-size:12px;font-weight:500;color:var(--color-text-primary,#111)">${escapeHTML(us.nome || us.displayName || '')}</p>
                                                <p style="font-size:10px;color:var(--color-text-secondary,#6b7280)">${escapeHTML(us.email || '')}</p>
                                            </div>
                                            <span style="font-size:10px;padding:1px 6px;border-radius:9px;font-weight:500;
                                                         ${ROLE_STYLE[roleLocal] || ''}">
                                                ${roleLocal}
                                            </span>
                                        </div>`;
                                    }).join('')}
                                </div>

                            </div>
                            ` : ''}
                        </div>`;
                    }).join('')}
                </div>
                ` : ''}
            </div>`;
        }).join('');

        // Toggle acordeões
        pane.querySelectorAll('[data-toggle-org]').forEach(el => {
            el.onclick = () => {
                const id = el.dataset.toggleOrg;
                openOrgs.has(id) ? openOrgs.delete(id) : openOrgs.add(id);
                renderEstrutura();
            };
        });
        pane.querySelectorAll('[data-toggle-unit]').forEach(el => {
            el.onclick = () => {
                const id = el.dataset.toggleUnit;
                openUnits.has(id) ? openUnits.delete(id) : openUnits.add(id);
                renderEstrutura();
            };
        });
    }

    // ── ABA HIERARQUIA ─────────────────────────────────────────────────────────
    function renderHierarquia() {
        const pane = document.getElementById('ea-pane');
        pane.innerHTML = `
            <p style="font-size:11px;color:var(--color-text-secondary,#6b7280);margin-bottom:12px;
                      display:flex;align-items:center;gap:5px">
                ℹ️ Use as setas para reordenar unidades dentro de cada órgão. A ordem é salva automaticamente.
            </p>
            ${dados.orgaos.map(org => {
                const unids = unidadesOrdem.filter(u => u.orgaoId === org.id);
                return `
                <div style="margin-bottom:16px">
                    <div style="display:flex;align-items:center;gap:8px;padding:8px 0 6px;
                                border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb);margin-bottom:6px">
                        <div style="width:28px;height:28px;border-radius:7px;background:#EEEDFE;color:#3C3489;
                                    display:flex;align-items:center;justify-content:center;font-size:13px">🏛️</div>
                        <span style="font-size:14px;font-weight:500;color:var(--color-text-primary,#111)">${escapeHTML(org.nome || '')}</span>
                        <span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#EEEDFE;color:#3C3489;border:0.5px solid #AFA9EC">${escapeHTML(org.sigla || '')}</span>
                    </div>
                    <div style="padding-left:20px;border-left:0.5px solid var(--color-border-tertiary,#e5e7eb);margin-left:12px">
                        ${unids.map((u, ui) => {
                            const recs = dados.recepcoes.filter(r => r.unidadeId === u.id);
                            return `
                            <div style="border:0.5px solid var(--color-border-tertiary,#e5e7eb);border-radius:10px;
                                        padding:8px 10px;margin:4px 0;background:var(--color-background-primary,#fff);
                                        display:flex;align-items:center;gap:8px">
                                <span style="font-size:14px;color:var(--color-text-secondary,#6b7280);cursor:grab">⠿</span>
                                <div style="width:22px;height:22px;border-radius:4px;background:#E6F1FB;color:#185FA5;
                                            display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0">🚪</div>
                                <span style="flex:1;font-size:13px;color:var(--color-text-primary,#111)">${escapeHTML(u.nome || '')}</span>
                                <span style="font-size:10px;color:var(--color-text-secondary,#6b7280);margin-right:8px">${recs.length} rec.</span>
                                <div style="display:flex;gap:3px">
                                    <button data-org="${org.id}" data-idx="${ui}" data-dir="-1"
                                        style="width:24px;height:24px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                                               border-radius:4px;background:transparent;cursor:pointer;font-size:11px;
                                               color:var(--color-text-secondary,#6b7280);display:flex;align-items:center;justify-content:center"
                                        class="ea-move-btn" title="Mover acima">▲</button>
                                    <button data-org="${org.id}" data-idx="${ui}" data-dir="1"
                                        style="width:24px;height:24px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                                               border-radius:4px;background:transparent;cursor:pointer;font-size:11px;
                                               color:var(--color-text-secondary,#6b7280);display:flex;align-items:center;justify-content:center"
                                        class="ea-move-btn" title="Mover abaixo">▼</button>
                                </div>
                            </div>
                            <div style="padding-left:20px;border-left:0.5px solid var(--color-border-tertiary,#e5e7eb);margin-left:12px">
                                ${recs.map(r => `
                                    <div style="display:flex;align-items:center;gap:7px;padding:5px 8px;margin:3px 0;
                                                border:0.5px solid var(--color-border-tertiary,#e5e7eb);border-radius:8px;
                                                background:var(--color-background-primary,#fff)">
                                        <div style="width:18px;height:18px;border-radius:3px;background:#E1F5EE;color:#085041;
                                                    display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">📋</div>
                                        <span style="font-size:12px;color:var(--color-text-primary,#111);flex:1">${escapeHTML(r.nome || '')}</span>
                                        <span style="font-size:10px;padding:1px 5px;border-radius:8px;font-weight:500;
                                                     ${TIPO_STYLE[r.tipo] || ''}">
                                            ${TIPO_LABEL[r.tipo] || r.tipo || '—'}
                                        </span>
                                    </div>
                                `).join('')}
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }).join('')}
        `;

        pane.querySelectorAll('.ea-move-btn').forEach(btn => {
            btn.onclick = async () => {
                const orgId = btn.dataset.org;
                const idx   = parseInt(btn.dataset.idx);
                const dir   = parseInt(btn.dataset.dir);
                const orgUnits = unidadesOrdem.filter(u => u.orgaoId === orgId);
                const newIdx = idx + dir;
                if (newIdx < 0 || newIdx >= orgUnits.length) return;
                // Troca na array global
                const idxA = unidadesOrdem.indexOf(orgUnits[idx]);
                const idxB = unidadesOrdem.indexOf(orgUnits[newIdx]);
                [unidadesOrdem[idxA], unidadesOrdem[idxB]] = [unidadesOrdem[idxB], unidadesOrdem[idxA]];
                // Persiste ordem no Firestore
                try {
                    await Promise.all([
                        updateDoc(doc(app.db, 'unidades', orgUnits[idx].id),    { ordem: newIdx }),
                        updateDoc(doc(app.db, 'unidades', orgUnits[newIdx].id), { ordem: idx }),
                    ]);
                } catch (e) { console.warn('Erro ao salvar ordem:', e); }
                renderHierarquia();
            };
        });
    }

    // ── ABA USUÁRIOS ───────────────────────────────────────────────────────────
    function renderUsuarios() {
        const pane = document.getElementById('ea-pane');

        // Monta lista plana com contexto
        const rows = [];
        dados.usuarios.forEach(us => {
            const vincs = Array.isArray(us.unidades) ? us.unidades : [];
            if (vincs.length === 0) {
                rows.push({ us, unidade: null, orgao: null, role: us.role || 'apoio' });
            } else {
                vincs.forEach(v => {
                    const unidade = dados.unidades.find(u => u.id === (v.unidadeId || v.id));
                    const orgao   = unidade ? dados.orgaos.find(o => o.id === unidade.orgaoId) : null;
                    rows.push({ us, unidade, orgao, role: v.role || us.role || 'apoio' });
                });
            }
        });

        pane.innerHTML = `
            <div style="display:flex;gap:8px;margin-bottom:12px">
                <input type="search" id="ea-srch-usr" placeholder="Buscar por nome, e-mail ou unidade…"
                    style="flex:1;font-size:13px;padding:7px 10px;
                           border:0.5px solid var(--color-border-secondary,#d1d5db);border-radius:8px;
                           background:var(--color-background-secondary,#f9fafb);
                           color:var(--color-text-primary,#111);outline:none">
                <select id="ea-flt-role"
                    style="font-size:13px;padding:7px 8px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                           border-radius:8px;background:var(--color-background-secondary,#f9fafb);
                           color:var(--color-text-primary,#111)">
                    <option value="">Todos os perfis</option>
                    <option value="apoio">apoio</option>
                    <option value="admin">admin</option>
                    <option value="superadmin">superadmin</option>
                </select>
                <select id="ea-flt-org"
                    style="font-size:13px;padding:7px 8px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                           border-radius:8px;background:var(--color-background-secondary,#f9fafb);
                           color:var(--color-text-primary,#111)">
                    <option value="">Todos os órgãos</option>
                    ${dados.orgaos.map(o => `<option value="${o.id}">${escapeHTML(o.sigla || o.nome || '')}</option>`).join('')}
                </select>
            </div>
            <div style="background:var(--color-background-primary,#fff);border:0.5px solid var(--color-border-tertiary,#e5e7eb);
                        border-radius:12px;overflow:hidden">
                <div style="display:grid;grid-template-columns:2.5fr 2fr 1.2fr 1fr;padding:8px 14px;
                            background:var(--color-background-secondary,#f9fafb);
                            border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb)">
                    ${['Usuário','Unidade','Órgão','Perfil'].map(h =>
                        `<span style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-secondary,#6b7280)">${h}</span>`
                    ).join('')}
                </div>
                <div id="ea-usr-rows"></div>
            </div>
        `;

        function filtrar() {
            const q    = (document.getElementById('ea-srch-usr')?.value || '').toLowerCase();
            const role = document.getElementById('ea-flt-role')?.value || '';
            const org  = document.getElementById('ea-flt-org')?.value  || '';
            const filtrado = rows.filter(r => {
                const matchQ = !q ||
                    (r.us.nome || '').toLowerCase().includes(q) ||
                    (r.us.email || '').toLowerCase().includes(q) ||
                    (r.unidade?.nome || '').toLowerCase().includes(q);
                const matchR = !role || r.role === role;
                const matchO = !org  || r.orgao?.id === org;
                return matchQ && matchR && matchO;
            });
            const el = document.getElementById('ea-usr-rows');
            if (!el) return;
            if (filtrado.length === 0) {
                el.innerHTML = `<div style="padding:20px;text-align:center;font-size:13px;color:var(--color-text-secondary,#6b7280)">Nenhum usuário encontrado.</div>`;
                return;
            }
            el.innerHTML = filtrado.map(r => `
                <div style="display:grid;grid-template-columns:2.5fr 2fr 1.2fr 1fr;padding:9px 14px;align-items:center;
                            border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb)">
                    <div style="display:flex;align-items:center;gap:8px">
                        <div style="width:28px;height:28px;border-radius:50%;background:#E6F1FB;color:#185FA5;
                                    display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:500;flex-shrink:0">
                            ${initials(r.us.nome || r.us.displayName || '?')}
                        </div>
                        <div style="min-width:0">
                            <p style="font-size:12px;font-weight:500;color:var(--color-text-primary,#111);
                                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(r.us.nome || r.us.displayName || '')}</p>
                            <p style="font-size:10px;color:var(--color-text-secondary,#6b7280);
                                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(r.us.email || '')}</p>
                        </div>
                    </div>
                    <span style="font-size:12px;color:var(--color-text-primary,#111);
                                 white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${r.unidade ? escapeHTML(r.unidade.nome || '') : '—'}
                    </span>
                    <span style="font-size:11px;color:var(--color-text-secondary,#6b7280)">
                        ${r.orgao ? escapeHTML(r.orgao.sigla || r.orgao.nome || '') : '—'}
                    </span>
                    <span style="font-size:10px;padding:2px 7px;border-radius:9px;font-weight:500;
                                 ${ROLE_STYLE[r.role] || ''}">
                        ${r.role}
                    </span>
                </div>
            `).join('');
        }

        document.getElementById('ea-srch-usr').oninput  = filtrar;
        document.getElementById('ea-flt-role').onchange = filtrar;
        document.getElementById('ea-flt-org').onchange  = filtrar;
        filtrar();
    }

    // ── Dispatch ───────────────────────────────────────────────────────────────
    function renderPane() {
        if (abaAtiva === 'estrutura')  renderEstrutura();
        if (abaAtiva === 'hierarquia') renderHierarquia();
        if (abaAtiva === 'usuarios')   renderUsuarios();
    }

    renderStats();
    renderTabs();
    renderPane();
}
