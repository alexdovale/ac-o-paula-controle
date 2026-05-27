/**
 * novaRecepcao.js
 * SIGEP — Modal "+ Nova Recepção" melhorado
 *
 * Uso:
 *   import { abrirModalNovaRecepcao } from './novaRecepcao.js';
 *   await abrirModalNovaRecepcao(app, { unidadeId, unidadeNome, orgaoId });
 *
 * Coleções Firestore:
 *   /recepcoes/{id}            — salva a nova recepção
 *   /configuracoes/assuntos    — doc com campo lista:string[] (assuntos customizáveis pelo admin)
 *
 * Estrutura do documento criado em /recepcoes:
 * {
 *   nome, tipo, unidadeId, orgaoId,
 *   salas: string[],         // array de salas
 *   assuntos: string[],      // array de assuntos
 *   verTudo: bool,
 *   ativo: bool,
 *   criadoEm: Timestamp,
 *   criadoPor: uid
 * }
 */

import {
    collection, doc, addDoc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

// ─── ASSUNTOS PADRÃO ──────────────────────────────────────────────────────────

const ASSUNTOS_PADRAO = [
    'Família',
    'Cível',
    'Criminal',
    'Fazenda Pública',
    'Consumidor',
    'Saúde',
    'Infância e Juventude',
    'Direitos Humanos',
    'Moradia e Urbanismo',
    'Previdenciário',
    'Registros Públicos',
    'Tutela Coletiva',
    'Mediação e Conciliação',
];

// ─── TIPOS DE RECEPÇÃO ────────────────────────────────────────────────────────

const TIPOS = [
    {
        value: 'central',
        label: 'Central',
        emoji: '🏛️',
        cor: '#EEEDFE',
        corTexto: '#3C3489',
        descricao: 'Painel principal da unidade. Exibe e gerencia <strong>todas</strong> as filas e áreas. Indicado para a recepção geral ou secretaria.',
    },
    {
        value: 'especializada',
        label: 'Especializada',
        emoji: '⚖️',
        cor: '#FAEEDA',
        corTexto: '#633806',
        descricao: 'Focada em um <strong>único assunto</strong> (ex: Família, Criminal). Exibe apenas a fila e os casos da sua área específica.',
    },
    {
        value: 'mista',
        label: 'Mista',
        emoji: '📋',
        cor: '#E6F1FB',
        corTexto: '#0C447C',
        descricao: 'Agrupa <strong>duas ou mais áreas diferentes</strong> no mesmo ponto de atendimento. Útil quando uma equipe atende múltiplos assuntos.',
    },
    {
        value: 'generalista',
        label: 'Generalista',
        emoji: '🗂️',
        cor: '#EAF3DE',
        corTexto: '#27500A',
        descricao: 'Focada em <strong>triagem inicial</strong>. Serve para recepcionar casos novos, dar orientações e fazer encaminhamentos para as filas corretas.',
    },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Carrega assuntos personalizados salvos no Firestore.
 * Se o documento não existir, usa os padrões.
 */
async function carregarAssuntos(db) {
    try {
        const snap = await getDoc(doc(db, 'configuracoes', 'assuntos'));
        if (snap.exists() && Array.isArray(snap.data().lista)) {
            return snap.data().lista;
        }
    } catch (e) {
        console.warn('Não foi possível carregar assuntos customizados, usando padrão.', e);
    }
    return [...ASSUNTOS_PADRAO];
}

/**
 * Salva a lista de assuntos customizados no Firestore.
 */
async function salvarAssuntos(db, lista) {
    await setDoc(doc(db, 'configuracoes', 'assuntos'), { lista }, { merge: true });
}

// ─── CHIP INPUT ──────────────────────────────────────────────────────────────
// Componente de tags para salas e assuntos

function buildChipInput({ containerId, inputId, initialValues = [], placeholder = '' }) {
    const container = document.getElementById(containerId);
    const inputEl   = document.getElementById(inputId);
    let values = [...initialValues];

    function renderChips() {
        // Remove chips existentes (não o input)
        container.querySelectorAll('.chip-tag').forEach(c => c.remove());
        values.forEach(v => {
            const chip = document.createElement('span');
            chip.className = 'chip-tag';
            chip.style.cssText = `
                display:inline-flex;align-items:center;gap:4px;padding:3px 8px;
                background:var(--color-background-secondary,#f9fafb);
                border:0.5px solid var(--color-border-secondary,#d1d5db);
                border-radius:20px;font-size:12px;color:var(--color-text-primary,#111)
            `;
            chip.innerHTML = `${escapeHTML(v)} <button type="button" data-val="${escapeHTML(v)}" style="
                background:none;border:none;cursor:pointer;font-size:14px;
                color:var(--color-text-secondary,#6b7280);padding:0;line-height:1;margin-left:2px
            ">×</button>`;
            chip.querySelector('button').onclick = () => {
                values = values.filter(x => x !== v);
                renderChips();
            };
            container.insertBefore(chip, inputEl);
        });
    }

    inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = inputEl.value.trim().replace(/,$/, '');
            if (val && !values.includes(val)) {
                values.push(val);
                renderChips();
            }
            inputEl.value = '';
        }
        // Backspace remove último chip
        if (e.key === 'Backspace' && !inputEl.value) {
            values.pop();
            renderChips();
        }
    });
    inputEl.addEventListener('blur', () => {
        const val = inputEl.value.trim().replace(/,$/, '');
        if (val && !values.includes(val)) {
            values.push(val);
            renderChips();
        }
        inputEl.value = '';
    });

    renderChips();
    return {
        getValues: () => values,
        addValue:  v => { if (v && !values.includes(v)) { values.push(v); renderChips(); } },
        setValues: newVals => { values = [...newVals]; renderChips(); },
    };
}

// ─── MODAL PRINCIPAL ──────────────────────────────────────────────────────────

export async function abrirModalNovaRecepcao(app, { unidadeId, unidadeNome, orgaoId } = {}) {
    const { db, currentUser } = app;

    document.getElementById('modal-nova-recepcao')?.remove();

    // Carrega assuntos (pode incluir customizados)
    const assuntosDisponiveis = await carregarAssuntos(db);

    // ── Monta overlay ──────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'modal-nova-recepcao';
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        z-index:9000;padding:16px;font-family:inherit
    `;

    overlay.innerHTML = `
        <div style="background:var(--color-background-primary,#fff);border-radius:16px;
                    width:100%;max-width:680px;max-height:92vh;overflow:hidden;
                    display:flex;flex-direction:column;box-shadow:0 4px 32px rgba(0,0,0,.18)">

            <!-- Cabeçalho -->
            <div style="padding:20px 24px 16px;border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb);
                        display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
                <div>
                    <h2 style="font-size:16px;font-weight:500;color:var(--color-text-primary,#111)">+ Nova Recepção</h2>
                    ${unidadeNome ? `<p style="font-size:12px;color:var(--color-text-secondary,#6b7280);margin-top:2px">Unidade: ${escapeHTML(unidadeNome)}</p>` : ''}
                </div>
                <button id="nr-fechar" style="width:32px;height:32px;border-radius:8px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                         background:transparent;cursor:pointer;font-size:18px;color:var(--color-text-secondary,#6b7280);
                         display:flex;align-items:center;justify-content:center">×</button>
            </div>

            <!-- Corpo com scroll -->
            <div style="padding:20px 24px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:20px">

                <!-- Nome -->
                <div>
                    <label style="display:block;font-size:12px;font-weight:500;color:var(--color-text-secondary,#6b7280);margin-bottom:6px">
                        Nome da Recepção <span style="color:#A32D2D">*</span>
                    </label>
                    <input type="text" id="nr-nome" placeholder="Ex: Recepção Principal"
                        style="width:100%;font-size:14px;padding:9px 12px;
                               border:0.5px solid var(--color-border-secondary,#d1d5db);border-radius:8px;
                               background:var(--color-background-secondary,#f9fafb);
                               color:var(--color-text-primary,#111);outline:none;box-sizing:border-box">
                </div>

                <!-- Tipo -->
                <div>
                    <label style="display:block;font-size:12px;font-weight:500;color:var(--color-text-secondary,#6b7280);margin-bottom:8px">
                        Tipo <span style="color:#A32D2D">*</span>
                    </label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="nr-tipos">
                        ${TIPOS.map(t => `
                            <label data-tipo="${t.value}" style="display:flex;flex-direction:column;gap:4px;padding:10px 12px;
                                   border:0.5px solid var(--color-border-tertiary,#e5e7eb);border-radius:10px;cursor:pointer;
                                   transition:border-color .15s,background .15s" class="nr-tipo-card">
                                <div style="display:flex;align-items:center;gap:8px">
                                    <input type="radio" name="nr-tipo" value="${t.value}" style="accent-color:#1e293b">
                                    <span style="font-size:13px;font-weight:500;color:var(--color-text-primary,#111)">${t.emoji} ${t.label}</span>
                                </div>
                                <p style="font-size:11px;color:var(--color-text-secondary,#6b7280);line-height:1.5;margin-left:22px">
                                    ${t.descricao}
                                </p>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <!-- Assuntos -->
                <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                        <label style="font-size:12px;font-weight:500;color:var(--color-text-secondary,#6b7280)">
                            Assuntos atendidos
                            <span style="font-size:10px;font-weight:400;margin-left:4px">(separados por vírgula ou Enter)</span>
                        </label>
                        ${['admin','superadmin'].includes(currentUser?.role) ? `
                            <button id="nr-btn-gerenciar-assuntos" type="button"
                                style="font-size:11px;padding:3px 8px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                                       border-radius:6px;background:transparent;cursor:pointer;color:var(--color-text-secondary,#6b7280)">
                                ⚙️ Gerenciar lista
                            </button>
                        ` : ''}
                    </div>

                    <!-- Dropdown de assuntos pré-definidos -->
                    <div style="position:relative;margin-bottom:8px">
                        <select id="nr-select-assunto"
                            style="width:100%;font-size:13px;padding:8px 10px;
                                   border:0.5px solid var(--color-border-secondary,#d1d5db);border-radius:8px;
                                   background:var(--color-background-secondary,#f9fafb);
                                   color:var(--color-text-primary,#111)">
                            <option value="">— Selecionar assunto da lista —</option>
                            ${assuntosDisponiveis.map(a => `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Chip input para assuntos -->
                    <div id="nr-assuntos-chips"
                        style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:6px 8px;
                               border:0.5px solid var(--color-border-secondary,#d1d5db);border-radius:8px;
                               background:var(--color-background-secondary,#f9fafb);min-height:40px;cursor:text"
                        onclick="document.getElementById('nr-assunto-input').focus()">
                        <input id="nr-assunto-input" type="text" placeholder="Ou digite um assunto…"
                            style="flex:1;min-width:120px;border:none;background:transparent;outline:none;
                                   font-size:13px;color:var(--color-text-primary,#111)">
                    </div>
                </div>

                <!-- Salas -->
                <div>
                    <label style="display:block;font-size:12px;font-weight:500;color:var(--color-text-secondary,#6b7280);margin-bottom:4px">
                        Salas
                        <span style="font-size:10px;font-weight:400;margin-left:4px">(separadas por vírgula ou Enter)</span>
                    </label>
                    <p style="font-size:11px;color:var(--color-text-secondary,#6b7280);margin-bottom:8px;line-height:1.5">
                        Informe os locais físicos de atendimento — ex: <em>Sala 01, Sala 02, Balcão A, Gabinete 3</em>.
                        As salas ficam disponíveis para vincular às pautas e aparecem no painel público de chamada.
                    </p>
                    <div id="nr-salas-chips"
                        style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:6px 8px;
                               border:0.5px solid var(--color-border-secondary,#d1d5db);border-radius:8px;
                               background:var(--color-background-secondary,#f9fafb);min-height:40px;cursor:text"
                        onclick="document.getElementById('nr-sala-input').focus()">
                        <input id="nr-sala-input" type="text" placeholder="Ex: Sala 01, Balcão A…"
                            style="flex:1;min-width:120px;border:none;background:transparent;outline:none;
                                   font-size:13px;color:var(--color-text-primary,#111)">
                    </div>
                </div>

                <!-- Ver tudo -->
                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
                    <input type="checkbox" id="nr-vertudo" style="margin-top:3px;accent-color:#1e293b">
                    <div>
                        <p style="font-size:13px;font-weight:500;color:var(--color-text-primary,#111)">Ver todas as pautas</p>
                        <p style="font-size:11px;color:var(--color-text-secondary,#6b7280);margin-top:2px">
                            Quando ativado, esta recepção exibirá as pautas de <strong>todas</strong> as áreas da unidade,
                            independente do tipo ou dos assuntos configurados.
                        </p>
                    </div>
                </label>

                <!-- Erro -->
                <div id="nr-erro" style="display:none;padding:10px 12px;background:#FCEBEB;border:0.5px solid #F09595;
                     border-radius:8px;font-size:13px;color:#791F1F"></div>

            </div>

            <!-- Rodapé -->
            <div style="padding:12px 24px;border-top:0.5px solid var(--color-border-tertiary,#e5e7eb);
                        display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
                <button id="nr-cancelar" type="button"
                    style="padding:9px 20px;border-radius:8px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                           background:transparent;cursor:pointer;font-size:13px;color:var(--color-text-primary,#111)">
                    Cancelar
                </button>
                <button id="nr-salvar" type="button"
                    style="padding:9px 20px;border-radius:8px;border:none;
                           background:#1e293b;color:#fff;cursor:pointer;font-size:13px;font-weight:500">
                    Criar Recepção
                </button>
            </div>
        </div>

        <!-- Sub-modal gerenciar assuntos (inserido dinamicamente) -->
        <div id="nr-sub-assuntos" style="display:none"></div>
    `;

    document.body.appendChild(overlay);

    // Fecha ao clicar fora
    overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
    document.getElementById('nr-fechar').onclick   = fechar;
    document.getElementById('nr-cancelar').onclick = fechar;

    function fechar() { overlay.remove(); }

    // ── Highlight no card de tipo ao selecionar ────────────────────────────────
    document.querySelectorAll('.nr-tipo-card input[type=radio]').forEach(radio => {
        radio.onchange = () => {
            document.querySelectorAll('.nr-tipo-card').forEach(card => {
                card.style.borderColor = 'var(--color-border-tertiary,#e5e7eb)';
                card.style.background  = 'transparent';
            });
            const label = radio.closest('.nr-tipo-card');
            const tipo  = TIPOS.find(t => t.value === radio.value);
            if (tipo) {
                label.style.borderColor = tipo.cor;
                label.style.background  = tipo.cor + '30';
            }
        };
    });

    // ── Chip input para assuntos ───────────────────────────────────────────────
    const assuntosCtrl = buildChipInput({
        containerId:   'nr-assuntos-chips',
        inputId:       'nr-assunto-input',
        initialValues: [],
        placeholder:   'Ou digite um assunto…',
    });

    // Dropdown adiciona tag
    document.getElementById('nr-select-assunto').onchange = function () {
        if (this.value) {
            assuntosCtrl.addValue(this.value);
            this.value = '';
        }
    };

    // ── Chip input para salas ──────────────────────────────────────────────────
    const salasCtrl = buildChipInput({
        containerId:   'nr-salas-chips',
        inputId:       'nr-sala-input',
        initialValues: [],
    });

    // ── Botão gerenciar assuntos (admin) ───────────────────────────────────────
    document.getElementById('nr-btn-gerenciar-assuntos')?.addEventListener('click', () => {
        abrirSubModalAssuntos(db, assuntosDisponiveis, (novaLista) => {
            // Atualiza dropdown
            const sel = document.getElementById('nr-select-assunto');
            sel.innerHTML = `<option value="">— Selecionar assunto da lista —</option>` +
                novaLista.map(a => `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`).join('');
            assuntosDisponiveis.length = 0;
            novaLista.forEach(a => assuntosDisponiveis.push(a));
        });
    });

    // ── Salvar ─────────────────────────────────────────────────────────────────
    document.getElementById('nr-salvar').onclick = async () => {
        const nome   = document.getElementById('nr-nome').value.trim();
        const tipo   = document.querySelector('#nr-tipos input[type=radio]:checked')?.value;
        const vertudo = document.getElementById('nr-vertudo').checked;
        const assuntos = assuntosCtrl.getValues();
        const salas    = salasCtrl.getValues();

        // Validação
        if (!nome) {
            mostrarErro('O nome da recepção é obrigatório.');
            return;
        }
        if (!tipo) {
            mostrarErro('Selecione um tipo de recepção.');
            return;
        }

        const btn = document.getElementById('nr-salvar');
        btn.disabled = true;
        btn.textContent = 'Salvando…';
        limparErro();

        try {
            const novo = {
                nome,
                tipo,
                unidadeId:  unidadeId  || null,
                orgaoId:    orgaoId    || null,
                salas,
                assuntos,
                verTudo:    vertudo,
                ativo:      true,
                criadoEm:   serverTimestamp(),
                criadoPor:  currentUser?.uid || null,
            };

            await addDoc(collection(db, 'recepcoes'), novo);

            fechar();
            if (typeof showNotification === 'function') {
                showNotification('Recepção criada com sucesso!', 'success');
            }
        } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Criar Recepção';
            mostrarErro('Erro ao salvar: ' + err.message);
        }
    };

    function mostrarErro(msg) {
        const el = document.getElementById('nr-erro');
        el.textContent = msg;
        el.style.display = 'block';
    }
    function limparErro() {
        document.getElementById('nr-erro').style.display = 'none';
    }
}

// ─── SUB-MODAL GERENCIAR ASSUNTOS ─────────────────────────────────────────────

function abrirSubModalAssuntos(db, listaAtual, onSalvar) {
    const existing = document.getElementById('nr-modal-assuntos');
    if (existing) existing.remove();

    let editaveis = [...listaAtual];
    let novoAssunto = '';

    const modal = document.createElement('div');
    modal.id = 'nr-modal-assuntos';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;
        z-index:9100;padding:16px;font-family:inherit
    `;

    function renderModal() {
        modal.innerHTML = `
            <div style="background:var(--color-background-primary,#fff);border-radius:14px;
                        width:100%;max-width:440px;max-height:85vh;overflow:hidden;
                        display:flex;flex-direction:column;box-shadow:0 4px 32px rgba(0,0,0,.25)">
                <div style="padding:16px 20px;border-bottom:0.5px solid var(--color-border-tertiary,#e5e7eb);
                            display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
                    <h3 style="font-size:14px;font-weight:500;color:var(--color-text-primary,#111)">⚙️ Gerenciar assuntos</h3>
                    <button id="nra-fechar" style="width:28px;height:28px;border-radius:6px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                             background:transparent;cursor:pointer;font-size:16px;color:var(--color-text-secondary,#6b7280);
                             display:flex;align-items:center;justify-content:center">×</button>
                </div>
                <div style="padding:14px 20px;overflow-y:auto;flex:1">
                    <div style="display:flex;gap:8px;margin-bottom:12px">
                        <input type="text" id="nra-novo" value="${escapeHTML(novoAssunto)}"
                            placeholder="Novo assunto…"
                            style="flex:1;font-size:13px;padding:7px 10px;
                                   border:0.5px solid var(--color-border-secondary,#d1d5db);border-radius:8px;
                                   background:var(--color-background-secondary,#f9fafb);
                                   color:var(--color-text-primary,#111);outline:none">
                        <button id="nra-add"
                            style="padding:7px 12px;border-radius:8px;border:none;
                                   background:#1e293b;color:#fff;cursor:pointer;font-size:13px;font-weight:500">
                            + Adicionar
                        </button>
                    </div>
                    <div id="nra-lista">
                        ${editaveis.map((a, i) => `
                            <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;
                                        border:0.5px solid var(--color-border-tertiary,#e5e7eb);border-radius:8px;
                                        margin-bottom:4px;background:var(--color-background-primary,#fff)">
                                <span style="flex:1;font-size:13px;color:var(--color-text-primary,#111)">${escapeHTML(a)}</span>
                                <button data-idx="${i}" class="nra-del"
                                    style="width:24px;height:24px;border-radius:5px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                                           background:transparent;cursor:pointer;font-size:13px;color:var(--color-text-secondary,#6b7280);
                                           display:flex;align-items:center;justify-content:center">×</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div style="padding:12px 20px;border-top:0.5px solid var(--color-border-tertiary,#e5e7eb);
                            display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
                    <button id="nra-cancelar"
                        style="padding:8px 16px;border-radius:8px;border:0.5px solid var(--color-border-secondary,#d1d5db);
                               background:transparent;cursor:pointer;font-size:13px;color:var(--color-text-primary,#111)">
                        Cancelar
                    </button>
                    <button id="nra-salvar"
                        style="padding:8px 16px;border-radius:8px;border:none;
                               background:#1e293b;color:#fff;cursor:pointer;font-size:13px;font-weight:500">
                        Salvar lista
                    </button>
                </div>
            </div>
        `;

        document.getElementById('nra-fechar').onclick   = () => modal.remove();
        document.getElementById('nra-cancelar').onclick = () => modal.remove();

        const inputNovo = document.getElementById('nra-novo');
        inputNovo.oninput = e => { novoAssunto = e.target.value; };
        inputNovo.onkeydown = e => { if (e.key === 'Enter') document.getElementById('nra-add').click(); };

        document.getElementById('nra-add').onclick = () => {
            const v = document.getElementById('nra-novo').value.trim();
            if (v && !editaveis.includes(v)) {
                editaveis.push(v);
                novoAssunto = '';
                renderModal();
            }
        };

        modal.querySelectorAll('.nra-del').forEach(btn => {
            btn.onclick = () => {
                editaveis.splice(parseInt(btn.dataset.idx), 1);
                renderModal();
            };
        });

        document.getElementById('nra-salvar').onclick = async () => {
            const btn = document.getElementById('nra-salvar');
            btn.disabled = true;
            btn.textContent = 'Salvando…';
            try {
                await salvarAssuntos(db, editaveis);
                onSalvar(editaveis);
                modal.remove();
                if (typeof showNotification === 'function') {
                    showNotification('Lista de assuntos atualizada!', 'success');
                }
            } catch (err) {
                btn.disabled = false;
                btn.textContent = 'Salvar lista';
                alert('Erro: ' + err.message);
            }
        };
    }

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    renderModal();
}
