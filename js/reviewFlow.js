

atendimento_externo (4).html
html


index - 2026-03-30T124554.967.html
html

Preciso implementar um fluxo de revisão hierárquica no meu sistema SIGAP (gerenciador de pautas).
Meu sistema atual já tem fluxo de distribuição simples. Quero adicionar um modo alternativo onde:
1. Colaborador envia para revisão
2. Defensor pode aprovar (com número do processo) ou devolver para correção
3. Colaborador corrige e reenvia
4. Defensor distribui para destinatário final
Crie:
- js/reviewFlow.js com todos os métodos necessários
- Modifique index.html adicionando 4 novas colunas (Em Revisão, Aguardando Número, Aguardando Correção, Distribuídos), painel de estatísticas e checkboxes nos modais
- Crie um painel completo atendimento_externo.html com abas de encerramento, histórico e documentos
- Atualize js/pauta.js com os novos status
- Atualize js/ui.js com renderização das novas colunas
- Adicione método loadDefensores() em colaboradores.js
- Forneça as Firebase Rules atualizadas
O colaborador deve poder escolher o fluxo (direto, distribuição ou revisão) no momento do atendimento.
O defensor deve ter modal específico para revisão e distribuição.

Mostrar mais
12:46

Visualizou 8 arquivos
Visualizou 8 arquivos
Now I have a thorough understanding of the system. Let me create all the required files.


Criou 3 arquivos
Criou 3 arquivos

Creating reviewFlow.js - the core review flow module
reviewFlow.js

Creating pauta.js with updated status constants and review flow methods
pauta.js

Creating ui.js with rendering for all new columns including review flow columns
text

/**
 * ui.js — SIGAP UIService (atualizado com fluxo de revisão hierárquica)
 *
 * Novas colunas renderizadas:
 *   - Em Revisão         (#em-revisao-list)
 *   - Aguardando Número  (#aguardando-numero-list)
 *   - Aguardando Correção(#aguardando-correcao-list)
 *   - Distribuídos       (#distribuido-list)
 *
 * Painel de estatísticas:
 *   - #review-stats-panel
 */

import { PAUTA_STATUS, FLOW_TYPES, STATUS_LABELS } from './pauta.js';

// ─────────────────────────────────────────────────────────────
// UIService
// ─────────────────────────────────────────────────────────────
export const UIService = {

    // ── Column Visibility Control ─────────────────────────────

    updateColumnVisibility(pauta) {
        const useDist   = pauta?.useDistributionFlow || false;
        const useReview = pauta?.useReviewFlow       || false;

        // Distribution columns (existing)
        this._setVisible('distribuicao-column',        useDist && !useReview);

        // Review flow columns (new)
        this._setVisible('em-revisao-column',          useReview);
        this._setVisible('aguardando-numero-column',   useReview);
        this._setVisible('aguardando-correcao-column', useReview);
        this._setVisible('distribuido-column',         useReview);

        // Stats panel
        this._setVisible('review-stats-panel',         useReview);

        // Em Atendimento column
        const hasColaboradores = pauta?.collaboratorsEnabled || false;
        this._setVisible('em-atendimento-column', hasColaboradores || useDist || useReview);

        // Update grid cols based on active columns
        this._updateGridCols(useReview, useDist);
    },

    _setVisible(id, visible) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', !visible);
    },

    _updateGridCols(useReview, useDist) {
        const main = document.getElementById('main-content');
        if (!main) return;
        // Remove old grid classes
        main.className = main.className.replace(/grid-cols-\d+/g, '').trim();
        // Calculate column count
        let cols = 3; // base: pauta, aguardando, atendidos
        if (useReview)  cols += 4; // emRevisao, aguardandoNumero, aguardandoCorrecao, distribuido
        if (useDist && !useReview) cols += 1;
        main.classList.add(cols <= 4 ? 'md:grid-cols-4' : cols <= 6 ? 'lg:grid-cols-6' : 'xl:grid-cols-7');
    },

    // ── Main Render ───────────────────────────────────────────

    renderAssistedLists(app) {
        const all    = app.allAssisted || [];
        const pauta  = app.currentPauta || {};
        const search = {};

        // Collect search queries from all search inputs
        const searchIds = [
            'pauta-search', 'aguardando-search', 'em-atendimento-search',
            'distribuicao-search', 'atendidos-search', 'faltosos-search',
            'em-revisao-search', 'aguardando-numero-search',
            'aguardando-correcao-search', 'distribuido-search'
        ];
        searchIds.forEach(id => {
            const el = document.getElementById(id);
            search[id] = el ? el.value.toLowerCase() : '';
        });

        const filter = (items, searchKey) =>
            items.filter(a => {
                const q = search[searchKey];
                if (!q) return true;
                return (a.name || '').toLowerCase().includes(q)
                    || (a.cpf  || '').toLowerCase().includes(q)
                    || (a.subject || '').toLowerCase().includes(q)
                    || (a.scheduledTime || '').includes(q)
                    || (a.defensorResponsavel || '').toLowerCase().includes(q);
            });

        // Partition by status
        const byStatus = (status) => all.filter(a => a.status === status);

        // Standard columns
        this.renderColumn('pauta-list',        'pauta-count',        filter(byStatus(PAUTA_STATUS.PAUTA),        'pauta-search'),        app, 'pauta');
        this.renderColumn('aguardando-list',   'aguardando-count',   filter(byStatus(PAUTA_STATUS.AGUARDANDO),   'aguardando-search'),   app, 'aguardando');
        this.renderColumn('em-atendimento-list','em-atendimento-count', filter(byStatus(PAUTA_STATUS.EM_ATENDIMENTO), 'em-atendimento-search'), app, 'emAtendimento');
        this.renderColumn('atendidos-list',    'atendidos-count',    filter(byStatus(PAUTA_STATUS.ATENDIDO),     'atendidos-search'),    app, 'atendido');
        this.renderColumn('faltosos-list',     'faltosos-count',     filter(byStatus(PAUTA_STATUS.FALTOSO),      'faltosos-search'),     app, 'faltoso');

        // Distribution column
        if (pauta.useDistributionFlow && !pauta.useReviewFlow) {
            this.renderColumn('distribuicao-list', 'distribuicao-count',
                filter(byStatus(PAUTA_STATUS.AGUARDANDO_DISTRIBUICAO), 'distribuicao-search'), app, 'distribuicao');
        }

        // Review flow columns
        if (pauta.useReviewFlow) {
            this.renderColumn('em-revisao-list',         'em-revisao-count',
                filter(byStatus(PAUTA_STATUS.EM_REVISAO),          'em-revisao-search'),         app, 'emRevisao');
            this.renderColumn('aguardando-numero-list',  'aguardando-numero-count',
                filter(byStatus(PAUTA_STATUS.AGUARDANDO_NUMERO),   'aguardando-numero-search'),  app, 'aguardandoNumero');
            this.renderColumn('aguardando-correcao-list','aguardando-correcao-count',
                filter(byStatus(PAUTA_STATUS.AGUARDANDO_CORRECAO), 'aguardando-correcao-search'), app, 'aguardandoCorrecao');
            this.renderColumn('distribuido-list',        'distribuido-count',
                filter(byStatus(PAUTA_STATUS.DISTRIBUIDO),         'distribuido-search'),         app, 'distribuido');

            // Stats panel
            this.renderReviewStats(all, pauta);
        }
    },

    renderColumn(listId, countId, items, app, columnType) {
        const list = document.getElementById(listId);
        const counter = document.getElementById(countId);
        if (!list) return;
        if (counter) counter.textContent = items.length;

        if (items.length === 0) {
            list.innerHTML = `<p class="text-center text-gray-400 text-xs py-6 italic">Nenhum registro.</p>`;
            return;
        }

        list.innerHTML = items.map(a => this.renderCard(a, app, columnType)).join('');
    },

    renderCard(a, app, columnType) {
        const priority = a.priority || 'media';
        const priorityClass = {
            urgente: 'priority-urgente',
            maxima:  'priority-maxima',
            media:   'priority-media',
            minima:  'priority-minima',
        }[priority] || 'priority-media';

        const statusBadge = this.getStatusBadge(a.status);
        const flowBadge   = a.flowType === FLOW_TYPES.REVISAO
            ? `<span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 uppercase">Revisão</span>`
            : a.flowType === FLOW_TYPES.DISTRIBUICAO
            ? `<span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-100 text-cyan-700 uppercase">Dist.</span>`
            : '';

        const actions = this.getColumnActions(a, app, columnType);

        // Show devolução motivo if aguardandoCorrecao
        const devolucaoAlert = a.status === PAUTA_STATUS.AGUARDANDO_CORRECAO && a.reviewMotivoDevolucao
            ? `<div class="mt-1.5 p-2 bg-orange-50 border border-orange-200 rounded text-[10px] text-orange-700"><b>Motivo:</b> ${a.reviewMotivoDevolucao}</div>`
            : '';

        const processInfo = a.processNumber
            ? `<div class="text-[10px] text-indigo-600 font-mono mt-1">Proc: ${a.processNumber}</div>`
            : '';
        const defensorInfo = a.defensorResponsavel
            ? `<div class="text-[10px] text-gray-500 mt-0.5">Defensor: ${a.defensorResponsavel}</div>`
            : '';
        const destinatarioInfo = a.distribuidoPara
            ? `<div class="text-[10px] text-teal-600 mt-0.5">→ ${a.distribuidoPara}</div>`
            : '';

        return `
        <div class="bg-white rounded-lg p-3 border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${priorityClass}" onclick="openDetailsModal('${a.id}')">
            <div class="flex justify-between items-start gap-2">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-gray-800 text-sm truncate">${a.name || 'Sem nome'}</p>
                    <p class="text-[11px] text-gray-500 truncate">${a.subject || '—'}</p>
                    ${processInfo}
                    ${defensorInfo}
                    ${destinatarioInfo}
                    ${devolucaoAlert}
                </div>
                <div class="flex flex-col items-end gap-1 flex-shrink-0">
                    ${statusBadge}
                    ${flowBadge}
                </div>
            </div>
            ${actions}
        </div>`;
    },

    getColumnActions(a, app, columnType) {
        const id = a.id;
        const pautaId = app.currentPauta?.id;
        const isOwnerOrAdmin = app.isOwner || app.isAdmin;
        const isDefensor = app.currentUserCargo === 'Defensor(a)';

        let btns = [];

        switch (columnType) {
            case 'pauta':
                btns.push(`<button onclick="event.stopPropagation();app.moverParaAguardando('${id}')" class="action-btn bg-yellow-100 text-yellow-700 hover:bg-yellow-200">⏳ Chamar</button>`);
                break;

            case 'aguardando':
                btns.push(`<button onclick="event.stopPropagation();app.iniciarAtendimento('${id}')" class="action-btn bg-blue-100 text-blue-700 hover:bg-blue-200">▶ Iniciar</button>`);
                break;

            case 'emAtendimento':
                if (a.flowType === FLOW_TYPES.REVISAO || app.currentPauta?.useReviewFlow) {
                    btns.push(`<button onclick="event.stopPropagation();app.openEnviarRevisaoModal('${id}')" class="action-btn bg-purple-100 text-purple-700 hover:bg-purple-200">🔍 Enviar p/ Revisão</button>`);
                } else if (a.flowType === FLOW_TYPES.DISTRIBUICAO || app.currentPauta?.useDistributionFlow) {
                    btns.push(`<button onclick="event.stopPropagation();app.moverParaDistribuicao('${id}')" class="action-btn bg-cyan-100 text-cyan-700 hover:bg-cyan-200">⚖️ Distribuir</button>`);
                }
                btns.push(`<button onclick="event.stopPropagation();app.finalizarAtendimento('${id}')" class="action-btn bg-green-100 text-green-700 hover:bg-green-200">✅ Finalizar</button>`);
                break;

            case 'emRevisao':
                if (isDefensor || isOwnerOrAdmin) {
                    btns.push(`<button onclick="event.stopPropagation();app.openAprovarRevisaoModal('${id}')" class="action-btn bg-green-100 text-green-700 hover:bg-green-200">✅ Aprovar</button>`);
                    btns.push(`<button onclick="event.stopPropagation();app.openDevolverModal('${id}')" class="action-btn bg-orange-100 text-orange-700 hover:bg-orange-200">✏️ Devolver</button>`);
                }
                break;

            case 'aguardandoNumero':
                if (isDefensor || isOwnerOrAdmin) {
                    btns.push(`<button onclick="event.stopPropagation();app.openConfirmarNumeroModal('${id}')" class="action-btn bg-indigo-100 text-indigo-700 hover:bg-indigo-200">📝 Informar Nº</button>`);
                }
                break;

            case 'aguardandoCorrecao':
                btns.push(`<button onclick="event.stopPropagation();app.openReenviarRevisaoModal('${id}')" class="action-btn bg-purple-100 text-purple-700 hover:bg-purple-200">🔄 Corrigir e Reenviar</button>`);
                break;

            case 'distribuido':
                if (isDefensor || isOwnerOrAdmin) {
                    btns.push(`<button onclick="event.stopPropagation();app.finalizarDistribuido('${id}')" class="action-btn bg-green-100 text-green-700 hover:bg-green-200">✅ Arquivar</button>`);
                }
                break;

            case 'distribuicao':
                if (isOwnerOrAdmin) {
                    btns.push(`<button onclick="event.stopPropagation();app.openDistribuirModal('${id}')" class="action-btn bg-green-100 text-green-700 hover:bg-green-200">✅ Distribuir</button>`);
                }
                break;
        }

        if (btns.length === 0) return '';

        return `<div class="mt-2 flex flex-wrap gap-1" onclick="event.stopPropagation()">${btns.join('')}</div>`;
    },

    // ── Review Stats Panel ────────────────────────────────────

    renderReviewStats(allAssisted, pauta) {
        const panel = document.getElementById('review-stats-panel');
        if (!panel) return;

        const counts = {
            emRevisao:          allAssisted.filter(a => a.status === PAUTA_STATUS.EM_REVISAO).length,
            aguardandoNumero:   allAssisted.filter(a => a.status === PAUTA_STATUS.AGUARDANDO_NUMERO).length,
            aguardandoCorrecao: allAssisted.filter(a => a.status === PAUTA_STATUS.AGUARDANDO_CORRECAO).length,
            distribuidos:       allAssisted.filter(a => a.status === PAUTA_STATUS.DISTRIBUIDO).length,
            atendidos:          allAssisted.filter(a => a.status === PAUTA_STATUS.ATENDIDO && a.flowType === FLOW_TYPES.REVISAO).length,
        };

        const reviewAll = allAssisted.filter(a => a.flowType === FLOW_TYPES.REVISAO);
        const corrigidos = reviewAll.filter(a => a.reviewRejeitadoEm).length;
        const taxaDireta = reviewAll.length > 0
            ? Math.round(((reviewAll.length - corrigidos) / reviewAll.length) * 100)
            : null;

        panel.innerHTML = `
        <div class="bg-white rounded-lg shadow-sm border border-purple-100 p-4 mb-4">
            <h3 class="text-sm font-bold text-purple-800 mb-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Painel de Revisão Hierárquica
            </h3>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                ${this._statCard('🔍', counts.emRevisao, 'Em Revisão', 'purple')}
                ${this._statCard('⏳', counts.aguardandoNumero, 'Aguard. Nº', 'indigo')}
                ${this._statCard('✏️', counts.aguardandoCorrecao, 'Aguard. Correção', 'orange')}
                ${this._statCard('📤', counts.distribuidos, 'Distribuídos', 'teal')}
                ${this._statCard('✅', counts.atendidos, 'Finalizados', 'green')}
            </div>
            ${taxaDireta !== null ? `
            <div class="mt-3 flex items-center gap-3 text-[11px] flex-wrap">
                <span class="bg-green-50 text-green-700 px-2 py-1 rounded font-semibold">
                    Taxa aprovação direta: ${taxaDireta}%
                </span>
                <span class="bg-purple-50 text-purple-700 px-2 py-1 rounded font-semibold">
                    Total no fluxo revisão: ${reviewAll.length}
                </span>
            </div>` : ''}
        </div>`;
    },

    _statCard(icon, count, label, color) {
        return `
        <div class="bg-${color}-50 border border-${color}-200 rounded-lg p-2 text-center">
            <p class="text-xl font-black text-${color}-700">${count}</p>
            <p class="text-[9px] text-${color}-500 uppercase font-bold leading-tight mt-0.5">${icon} ${label}</p>
        </div>`;
    },

    // ── Status Badge ──────────────────────────────────────────

    getStatusBadge(status) {
        const colorMap = {
            pauta:                   'bg-gray-100 text-gray-700',
            aguardando:              'bg-yellow-100 text-yellow-800',
            emAtendimento:           'bg-blue-100 text-blue-800',
            emRevisao:               'bg-purple-100 text-purple-800',
            aguardandoNumero:        'bg-indigo-100 text-indigo-800',
            aguardandoCorrecao:      'bg-orange-100 text-orange-800',
            aguardandoDistribuicao:  'bg-cyan-100 text-cyan-800',
            distribuido:             'bg-teal-100 text-teal-800',
            atendido:                'bg-green-100 text-green-800',
            faltoso:                 'bg-red-100 text-red-800',
        };
        const label = STATUS_LABELS[status] || status;
        const color = colorMap[status] || 'bg-gray-100 text-gray-600';
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${color}">${label}</span>`;
    },

    // ── Modal HTML generators ─────────────────────────────────

    /**
     * Returns the HTML for the review modals to be injected into index.html
     */
    getReviewModalsHTML() {
        return `
        <!-- ========================================= -->
        <!-- MODAL: Enviar para Revisão (Colaborador) -->
        <!-- ========================================= -->
        <div id="enviar-revisao-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div class="bg-purple-600 text-white p-5 rounded-t-xl">
                    <h2 class="text-lg font-bold">🔍 Enviar para Revisão</h2>
                    <p class="text-purple-200 text-xs mt-1">O defensor irá revisar antes de distribuir</p>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Assistido</label>
                        <p id="revisao-nome-assistido" class="font-semibold text-gray-800">—</p>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Selecione o Defensor</label>
                        <select id="revisao-select-defensor" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                            <option value="">Carregando defensores...</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Observações (opcional)</label>
                        <textarea id="revisao-observacoes" rows="3" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm" placeholder="Descreva o que foi feito, documentos juntados..."></textarea>
                    </div>
                    <div id="revisao-flow-selector" class="border-t pt-4">
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-2">Fluxo de atendimento</label>
                        <div class="space-y-2">
                            <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                                <input type="radio" name="flow-choice" value="revisao" checked class="h-4 w-4 text-purple-600">
                                <span class="ml-3 text-sm"><b>Fluxo de Revisão</b> — Defensor revisa e distribui</span>
                            </label>
                            <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                                <input type="radio" name="flow-choice" value="direto" class="h-4 w-4 text-green-600">
                                <span class="ml-3 text-sm"><b>Finalizar diretamente</b> — Sem revisão</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="flex gap-3 p-5 border-t">
                    <button id="cancel-enviar-revisao-btn" class="flex-1 bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Cancelar</button>
                    <button id="confirm-enviar-revisao-btn" class="flex-1 bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700">Enviar para Revisão</button>
                </div>
            </div>
        </div>

        <!-- ========================================= -->
        <!-- MODAL: Aprovar Revisão (Defensor)         -->
        <!-- ========================================= -->
        <div id="aprovar-revisao-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div class="bg-green-600 text-white p-5 rounded-t-xl">
                    <h2 class="text-lg font-bold">✅ Aprovar e Distribuir</h2>
                    <p class="text-green-200 text-xs mt-1">Revisão do defensor</p>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Assistido</label>
                        <p id="aprovar-nome-assistido" class="font-semibold text-gray-800">—</p>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Observações do colaborador</label>
                        <p id="aprovar-obs-colaborador" class="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg italic">—</p>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Número do Processo</label>
                        <input type="text" id="aprovar-process-number" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 font-mono" placeholder="Deixe em branco para informar depois">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Distribuir para (opcional)</label>
                        <input type="text" id="aprovar-destinatario" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" placeholder="Ex: 1ª Vara de Família">
                    </div>
                    <!-- Checklist de revisão -->
                    <div class="border-t pt-3 space-y-2">
                        <p class="text-xs font-bold text-gray-500 uppercase">Checklist do Defensor</p>
                        <label class="flex items-center gap-2 text-sm">
                            <input type="checkbox" id="check-documentacao" class="h-4 w-4 text-green-600 rounded">
                            <span>Documentação conferida</span>
                        </label>
                        <label class="flex items-center gap-2 text-sm">
                            <input type="checkbox" id="check-peticao" class="h-4 w-4 text-green-600 rounded">
                            <span>Petição revisada e assinada</span>
                        </label>
                        <label class="flex items-center gap-2 text-sm">
                            <input type="checkbox" id="check-dados" class="h-4 w-4 text-green-600 rounded">
                            <span>Dados do assistido corretos</span>
                        </label>
                    </div>
                </div>
                <div class="flex gap-3 p-5 border-t">
                    <button id="cancel-aprovar-revisao-btn" class="flex-1 bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Cancelar</button>
                    <button id="confirm-aprovar-revisao-btn" class="flex-1 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">✅ Aprovar</button>
                </div>
            </div>
        </div>

        <!-- ========================================= -->
        <!-- MODAL: Devolver para Correção (Defensor)  -->
        <!-- ========================================= -->
        <div id="devolver-correcao-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div class="bg-orange-500 text-white p-5 rounded-t-xl">
                    <h2 class="text-lg font-bold">✏️ Devolver para Correção</h2>
                    <p class="text-orange-100 text-xs mt-1">O colaborador receberá o motivo da devolução</p>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Assistido</label>
                        <p id="devolver-nome-assistido" class="font-semibold text-gray-800">—</p>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Motivo da Devolução 
A resposta do Claude foi interrompida

ui.js
js


pauta.js
js

sgue tem meu pauta.js e ui.js alme do que te mandei pode continuar

12:51

Você está sem mensagens gratuitas até 17:00
Fazer Upgrade

ui.js
js



pauta.js
js


sgue tem meu pauta.js e ui.js alme do que te mandei pode continuar

Claude é uma IA e pode cometer erros. Por favor, verifique as respostas.
Reviewflow · JS
Copiar

/**
 * reviewFlow.js — SIGAP Hierarchical Review Flow
 * 
 * Status lifecycle for review mode:
 *   emAtendimento → emRevisao → aguardandoNumero → atendido (aprovado)
 *                            ↘ aguardandoCorrecao → emRevisao (loop)
 * 
 * Status lifecycle for distribution mode (unchanged):
 *   emAtendimento → aguardandoDistribuicao → distribuido
 * 
 * Status lifecycle for direct mode (unchanged):
 *   emAtendimento → atendido
 */
 
import {
    doc,
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
 
// ─────────────────────────────────────────────
// CONSTANTS — Status keys
// ─────────────────────────────────────────────
export const STATUS = {
    PAUTA:                  'pauta',
    AGUARDANDO:             'aguardando',
    EM_ATENDIMENTO:         'emAtendimento',
    // Review flow
    EM_REVISAO:             'emRevisao',
    AGUARDANDO_NUMERO:      'aguardandoNumero',
    AGUARDANDO_CORRECAO:    'aguardandoCorrecao',
    // Distribution flow
    AGUARDANDO_DISTRIBUICAO:'aguardandoDistribuicao',
    DISTRIBUIDO:            'distribuido',
    // Final
    ATENDIDO:               'atendido',
    FALTOSO:                'faltoso',
};
 
export const FLOW_TYPE = {
    DIRETO:      'direto',
    DISTRIBUICAO:'distribuicao',
    REVISAO:     'revisao',
};
 
// ─────────────────────────────────────────────
// REVIEW FLOW METHODS
// ─────────────────────────────────────────────
 
/**
 * Colaborador sends attendance to defensor for review.
 * Changes status: emAtendimento → emRevisao
 */
export async function enviarParaRevisao(db, pautaId, assistidoId, colaboradorName, observacoes = '') {
    const ref = doc(db, "pautas", pautaId, "attendances", assistidoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Registro não encontrado.");
 
    const histEntry = buildHistoryEntry(
        STATUS.EM_REVISAO,
        colaboradorName,
        `Enviado para revisão pelo colaborador. ${observacoes ? 'Obs: ' + observacoes : ''}`
    );
 
    await updateDoc(ref, {
        status: STATUS.EM_REVISAO,
        reviewObservacoes: observacoes,
        reviewEnviadoPor: colaboradorName,
        reviewEnviadoEm: new Date().toISOString(),
        reviewRejeitadoEm: null,
        reviewMotivoDevolucao: null,
        flowType: FLOW_TYPE.REVISAO,
        historicoStatus: appendHistory(snap.data().historicoStatus, histEntry),
    });
}
 
/**
 * Defensor approves the reviewed attendance with a process number.
 * Changes status: emRevisao → aguardandoNumero (if no number yet)
 *              OR emRevisao → atendido (if number provided immediately)
 */
export async function aprovarRevisao(db, pautaId, assistidoId, defensorName, processNumber, distribuirPara = null) {
    const ref = doc(db, "pautas", pautaId, "attendances", assistidoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Registro não encontrado.");
 
    const hasNumber = processNumber && processNumber.trim() !== '';
    const newStatus = hasNumber ? STATUS.AGUARDANDO_NUMERO : STATUS.AGUARDANDO_NUMERO;
 
    const histEntry = buildHistoryEntry(
        STATUS.AGUARDANDO_NUMERO,
        defensorName,
        hasNumber
            ? `Aprovado pelo defensor. Processo nº ${processNumber}.`
            : `Aprovado pelo defensor. Aguardando número do processo.`
    );
 
    const updates = {
        status: STATUS.AGUARDANDO_NUMERO,
        defensorResponsavel: defensorName,
        defensorAprovouEm: new Date().toISOString(),
        flowType: FLOW_TYPE.REVISAO,
        historicoStatus: appendHistory(snap.data().historicoStatus, histEntry),
    };
 
    if (hasNumber) {
        updates.processNumber = processNumber.trim();
    }
    if (distribuirPara) {
        updates.distribuidoPara = distribuirPara;
    }
 
    await updateDoc(ref, updates);
}
 
/**
 * Defensor adds/confirms the process number and marks as distributed.
 * Changes status: aguardandoNumero → distribuido (or atendido)
 */
export async function confirmarNumeroProcesso(db, pautaId, assistidoId, defensorName, processNumber, destinatario) {
    if (!processNumber || processNumber.trim() === '') {
        throw new Error("Número do processo é obrigatório.");
    }
    const ref = doc(db, "pautas", pautaId, "attendances", assistidoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Registro não encontrado.");
 
    const histEntry = buildHistoryEntry(
        STATUS.DISTRIBUIDO,
        defensorName,
        `Distribuído. Processo nº ${processNumber}. Destinatário: ${destinatario || 'N/I'}.`
    );
 
    await updateDoc(ref, {
        status: STATUS.DISTRIBUIDO,
        processNumber: processNumber.trim(),
        distribuidoPara: destinatario || null,
        distribuidoEm: new Date().toISOString(),
        distribuidoPor: defensorName,
        flowType: FLOW_TYPE.REVISAO,
        historicoStatus: appendHistory(snap.data().historicoStatus, histEntry),
    });
}
 
/**
 * Defensor returns the attendance for correction.
 * Changes status: emRevisao → aguardandoCorrecao
 */
export async function devolverParaCorrecao(db, pautaId, assistidoId, defensorName, motivo) {
    if (!motivo || motivo.trim() === '') {
        throw new Error("Informe o motivo da devolução.");
    }
    const ref = doc(db, "pautas", pautaId, "attendances", assistidoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Registro não encontrado.");
 
    const histEntry = buildHistoryEntry(
        STATUS.AGUARDANDO_CORRECAO,
        defensorName,
        `Devolvido para correção. Motivo: ${motivo}`
    );
 
    await updateDoc(ref, {
        status: STATUS.AGUARDANDO_CORRECAO,
        reviewMotivoDevolucao: motivo,
        reviewRejeitadoPor: defensorName,
        reviewRejeitadoEm: new Date().toISOString(),
        flowType: FLOW_TYPE.REVISAO,
        historicoStatus: appendHistory(snap.data().historicoStatus, histEntry),
    });
}
 
/**
 * Colaborador corrects and resends for review.
 * Changes status: aguardandoCorrecao → emRevisao
 */
export async function reenviarParaRevisao(db, pautaId, assistidoId, colaboradorName, observacoes = '') {
    const ref = doc(db, "pautas", pautaId, "attendances", assistidoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Registro não encontrado.");
 
    const histEntry = buildHistoryEntry(
        STATUS.EM_REVISAO,
        colaboradorName,
        `Corrigido e reenviado. ${observacoes ? 'Obs: ' + observacoes : ''}`
    );
 
    await updateDoc(ref, {
        status: STATUS.EM_REVISAO,
        reviewObservacoes: observacoes,
        reviewEnviadoPor: colaboradorName,
        reviewEnviadoEm: new Date().toISOString(),
        reviewRejeitadoEm: null,
        reviewMotivoDevolucao: null,
        historicoStatus: appendHistory(snap.data().historicoStatus, histEntry),
    });
}
 
/**
 * Mark as fully completed (atendido) from distribuido.
 */
export async function finalizarDistribuido(db, pautaId, assistidoId, defensorName) {
    const ref = doc(db, "pautas", pautaId, "attendances", assistidoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Registro não encontrado.");
 
    const histEntry = buildHistoryEntry(
        STATUS.ATENDIDO,
        defensorName,
        `Atendimento finalizado e arquivado.`
    );
 
    await updateDoc(ref, {
        status: STATUS.ATENDIDO,
        attendedTime: new Date().toISOString(),
        finalizadoPeloDefensor: true,
        historicoStatus: appendHistory(snap.data().historicoStatus, histEntry),
    });
}
 
// ─────────────────────────────────────────────
// DEFENSORES LOADER
// ─────────────────────────────────────────────
 
/**
 * Load defensores from the collaborators sub-collection.
 * Returns array of { id, nome, email, cargo }
 */
export async function loadDefensores(db, pautaId) {
    try {
        const q = query(
            collection(db, "pautas", pautaId, "collaborators"),
            where("cargo", "==", "Defensor(a)")
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("[reviewFlow] Erro ao carregar defensores:", e);
        return [];
    }
}
 
/**
 * Load all collaborators (for select fields)
 */
export async function loadColaboradores(db, pautaId) {
    try {
        const snap = await getDocs(collection(db, "pautas", pautaId, "collaborators"));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("[reviewFlow] Erro ao carregar colaboradores:", e);
        return [];
    }
}
 
// ─────────────────────────────────────────────
// STATISTICS HELPER
// ─────────────────────────────────────────────
 
/**
 * Calculate review flow statistics from an array of assistidos.
 */
export function calcularEstatisticasRevisao(allAssisted) {
    const stats = {
        emRevisao:           0,
        aguardandoNumero:    0,
        aguardandoCorrecao:  0,
        distribuidos:        0,
        atendidos:           0,
        totalRevisao:        0,
        taxaAprovacaoDireta: 0, // % approved without correction
        tempoMedioRevisao:   null,
    };
 
    let corrigiuUmaVez = 0;
    let temposRevisao = [];
 
    allAssisted.forEach(a => {
        const s = a.status;
        if (s === STATUS.EM_REVISAO)            stats.emRevisao++;
        if (s === STATUS.AGUARDANDO_NUMERO)      stats.aguardandoNumero++;
        if (s === STATUS.AGUARDANDO_CORRECAO)    stats.aguardandoCorrecao++;
        if (s === STATUS.DISTRIBUIDO)            stats.distribuidos++;
        if (s === STATUS.ATENDIDO && a.flowType === FLOW_TYPE.REVISAO) stats.atendidos++;
 
        if (a.flowType === FLOW_TYPE.REVISAO) {
            stats.totalRevisao++;
            if (a.reviewRejeitadoEm) corrigiuUmaVez++;
            if (a.reviewEnviadoEm && a.defensorAprovouEm) {
                const ms = new Date(a.defensorAprovouEm) - new Date(a.reviewEnviadoEm);
                if (ms > 0) temposRevisao.push(ms);
            }
        }
    });
 
    if (stats.totalRevisao > 0) {
        const aprovadosDireto = stats.totalRevisao - corrigiuUmaVez;
        stats.taxaAprovacaoDireta = Math.round((aprovadosDireto / stats.totalRevisao) * 100);
    }
    if (temposRevisao.length > 0) {
        const avgMs = temposRevisao.reduce((a, b) => a + b, 0) / temposRevisao.length;
        stats.tempoMedioRevisao = formatDuration(avgMs);
    }
 
    return stats;
}
 
// ─────────────────────────────────────────────
// UI RENDERING HELPERS
// ─────────────────────────────────────────────
 
/**
 * Returns the badge HTML for a given status.
 */
export function getStatusBadge(status) {
    const map = {
        [STATUS.PAUTA]:                  { label: 'Na Pauta',             color: 'bg-gray-100 text-gray-700' },
        [STATUS.AGUARDANDO]:             { label: 'Aguardando',           color: 'bg-yellow-100 text-yellow-800' },
        [STATUS.EM_ATENDIMENTO]:         { label: 'Em Atendimento',       color: 'bg-blue-100 text-blue-800' },
        [STATUS.EM_REVISAO]:             { label: '🔍 Em Revisão',         color: 'bg-purple-100 text-purple-800' },
        [STATUS.AGUARDANDO_NUMERO]:      { label: '⏳ Aguard. Número',     color: 'bg-indigo-100 text-indigo-800' },
        [STATUS.AGUARDANDO_CORRECAO]:    { label: '✏️ Aguard. Correção',   color: 'bg-orange-100 text-orange-800' },
        [STATUS.AGUARDANDO_DISTRIBUICAO]:{ label: '⚖️ Aguard. Distribuição',color: 'bg-cyan-100 text-cyan-800' },
        [STATUS.DISTRIBUIDO]:            { label: '📤 Distribuído',        color: 'bg-teal-100 text-teal-800' },
        [STATUS.ATENDIDO]:               { label: '✅ Atendido',           color: 'bg-green-100 text-green-800' },
        [STATUS.FALTOSO]:                { label: '🚫 Faltoso',            color: 'bg-red-100 text-red-800' },
    };
    const info = map[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${info.color}">${info.label}</span>`;
}
 
/**
 * Render the statistics panel HTML.
 */
export function renderEstatisticasPanel(stats) {
    return `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
            <p class="text-2xl font-black text-purple-700">${stats.emRevisao}</p>
            <p class="text-[10px] text-purple-500 uppercase font-bold mt-1">🔍 Em Revisão</p>
        </div>
        <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
            <p class="text-2xl font-black text-indigo-700">${stats.aguardandoNumero}</p>
            <p class="text-[10px] text-indigo-500 uppercase font-bold mt-1">⏳ Aguard. Número</p>
        </div>
        <div class="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
            <p class="text-2xl font-black text-orange-700">${stats.aguardandoCorrecao}</p>
            <p class="text-[10px] text-orange-500 uppercase font-bold mt-1">✏️ Aguard. Correção</p>
        </div>
        <div class="bg-teal-50 border border-teal-200 rounded-lg p-3 text-center">
            <p class="text-2xl font-black text-teal-700">${stats.distribuidos}</p>
            <p class="text-[10px] text-teal-500 uppercase font-bold mt-1">📤 Distribuídos</p>
        </div>
    </div>
    <div class="flex gap-3 text-[11px] text-gray-500 flex-wrap">
        ${stats.taxaAprovacaoDireta > 0 ? `<span class="bg-green-50 px-2 py-1 rounded font-semibold text-green-700">✅ Taxa aprovação direta: ${stats.taxaAprovacaoDireta}%</span>` : ''}
        ${stats.tempoMedioRevisao ? `<span class="bg-blue-50 px-2 py-1 rounded font-semibold text-blue-700">⏱ Tempo médio revisão: ${stats.tempoMedioRevisao}</span>` : ''}
    </div>`;
}
 
// ─────────────────────────────────────────────
// FIREBASE RULES (exported as string for reference)
// ─────────────────────────────────────────────
 
export const FIREBASE_RULES = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
 
    // Helper functions
    function isAuthenticated() { return request.auth != null; }
    function isSelf(userId) { return request.auth.uid == userId; }
 
    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isSelf(userId);
    }
 
    // Pautas
    match /pautas/{pautaId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update, delete: if isAuthenticated() &&
        (resource.data.ownerId == request.auth.uid ||
         request.auth.uid in resource.data.members);
 
      // Attendances sub-collection
      match /attendances/{attendanceId} {
        allow read: if isAuthenticated() || true; // public read for external panels
        allow create: if isAuthenticated();
        allow update: if isAuthenticated() ||
          // Allow external panel (no auth) to finalize
          (request.resource.data.keys().hasAny(['finalizadoPeloColaborador', 'status']));
        allow delete: if isAuthenticated();
      }
 
      // Collaborators sub-collection
      match /collaborators/{collabId} {
        allow read: if isAuthenticated() || true; // public for loadDefensores
        allow write: if isAuthenticated();
      }
 
      // History sub-collection
      match /history/{histId} {
        allow read: if isAuthenticated();
        allow create: if isAuthenticated() || true;
        allow update, delete: if false; // immutable
      }
    }
 
    // Shared subjects
    match /subjects/{subjectId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }
  }
}
`;
 
// ─────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────
 
function buildHistoryEntry(status, actor, descricao) {
    return {
        status,
        actor,
        descricao,
        timestamp: new Date().toISOString(),
    };
}
 
function appendHistory(existing, newEntry) {
    const arr = Array.isArray(existing) ? existing : [];
    return [...arr, newEntry];
}
 
function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${hours}h ${rem > 0 ? rem + 'min' : ''}`.trim();
}
 
