// js/recepcaoConfig.js - CONFIGURAÇÃO HIERÁRQUICA DE RECEPÇÕES (SIGEP) · UI REFINADA

import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';
import { injetarEstilos, ico } from './rcDesign.js';
import { icoFrom, nomeIcone } from './icons.js';

const PAINEL_BASE_URL = 'acompanhamento-recepcao.html';

// bg/text/light/border mantidos por compatibilidade (getContextoRecepcao).
// hex/tint/line alimentam a nova interface.
const CORES = {
    rose:    { bg: 'bg-rose-700',    text: 'text-rose-700',    light: 'bg-rose-50',    border: 'border-rose-200',    hex: '#be123c', tint: '#fff1f2', line: '#fecdd3' },
    blue:    { bg: 'bg-blue-700',    text: 'text-blue-700',    light: 'bg-blue-50',    border: 'border-blue-200',    hex: '#1d4ed8', tint: '#eff6ff', line: '#bfdbfe' },
    green:   { bg: 'bg-green-700',   text: 'text-green-700',   light: 'bg-green-50',   border: 'border-green-200',   hex: '#15803d', tint: '#f0fdf4', line: '#bbf7d0' },
    purple:  { bg: 'bg-purple-700',  text: 'text-purple-700',  light: 'bg-purple-50',  border: 'border-purple-200',  hex: '#7e22ce', tint: '#faf5ff', line: '#e9d5ff' },
    amber:   { bg: 'bg-amber-600',   text: 'text-amber-600',   light: 'bg-amber-50',   border: 'border-amber-200',   hex: '#d97706', tint: '#fffbeb', line: '#fde68a' },
    cyan:    { bg: 'bg-cyan-700',    text: 'text-cyan-700',    light: 'bg-cyan-50',    border: 'border-cyan-200',    hex: '#0e7490', tint: '#ecfeff', line: '#a5f3fc' },
    slate:   { bg: 'bg-slate-700',   text: 'text-slate-700',   light: 'bg-slate-50',   border: 'border-slate-200',   hex: '#334155', tint: '#f8fafc', line: '#e2e8f0' },
    indigo:  { bg: 'bg-indigo-700',  text: 'text-indigo-700',  light: 'bg-indigo-50',  border: 'border-indigo-200',  hex: '#4338ca', tint: '#eef2ff', line: '#c7d2fe' },
};

const ICONES_SUGERIDOS = {
    familia:  'users',
    civel:    'scale',
    criminal: 'alertCircle',
    infancia: 'baby',
    fazenda:  'landmark',
    cejusc:   'userPlus',
    default:  'clipboard',
};

const MODOS_LABEL = {
    fila:  { icone: 'list',      label: 'Fila (lista)'  },
    tv:    { icone: 'tv',        label: 'TV chamados'   },
    video: { icone: 'video',     label: 'TV + vídeo'    },
};

const corDe = (rec) => CORES[rec?.cor] || CORES.slate;

export const RecepcaoConfigService = {

    // ═══════════════════════════════════════════════════════════════════════════
    // DADOS (lógica inalterada)
    // ═══════════════════════════════════════════════════════════════════════════

    async criarRecepcao(db, dados, criadorUid) {
        try {
            const id = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const recepcao = {
                id,
                nome:               dados.nome,
                icone:              dados.icone || ICONES_SUGERIDOS.default,
                cor:                dados.cor || 'slate',
                unidadesVinculadas: dados.unidadesVinculadas || [],
                unidadeId:          dados.unidadesVinculadas?.[0]?.id || '',
                unidadeNome:        dados.unidadesVinculadas?.[0]?.nome || '',
                andar:              dados.andar || '',
                tipo:               dados.tipo || 'especializada',
                grupos:             dados.grupos || [],
                membros:            dados.membros || [criadorUid],
                verTudo:            dados.verTudo || false,
                modoVisualizacao:   dados.modoVisualizacao || 'fila',
                videoUrl:           dados.videoUrl || '',
                somPadrao:          dados.somPadrao !== undefined ? dados.somPadrao : true,
                ativo:              true,
                criadoPor:          criadorUid,
                criadoEm:           new Date().toISOString(),
            };
            await setDoc(doc(db, "recepcoes", id), recepcao);
            showNotification(`Recepção "${dados.nome}" criada com sucesso!`, "success");
            return recepcao;
        } catch (err) {
            console.error("Erro ao criar recepção:", err);
            showNotification("Erro ao criar recepção.", "error");
            return null;
        }
    },

    async atualizarRecepcao(db, recepcaoId, updates) {
        try {
            await updateDoc(doc(db, "recepcoes", recepcaoId), {
                ...updates,
                atualizadoEm: new Date().toISOString(),
            });
            showNotification("Recepção atualizada!", "success");
            return true;
        } catch (err) {
            console.error("Erro ao atualizar recepção:", err);
            showNotification("Erro ao atualizar recepção.", "error");
            return false;
        }
    },

    async excluirRecepcao(db, recepcaoId) {
        try {
            await deleteDoc(doc(db, "recepcoes", recepcaoId));
            showNotification("Recepção excluída permanentemente do sistema.", "success");
            return true;
        } catch (err) {
            console.error("Erro ao excluir recepção:", err);
            showNotification("Erro ao excluir a recepção.", "error");
            return false;
        }
    },

    async buscarTodasRecepcoesAdmin(db) {
        try {
            const snap = await getDocs(collection(db, "recepcoes"));
            return snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.ativo !== false);
        } catch (err) {
            console.error("Erro ao buscar todas as recepções:", err);
            return [];
        }
    },

    async buscarRecepcoesUnidade(db, unidadeId) {
        try {
            const snap = await getDocs(collection(db, "recepcoes"));
            return snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.ativo !== false &&
                    (r.unidadeId === unidadeId || (r.unidadesVinculadas && r.unidadesVinculadas.some(u => u.id === unidadeId)))
                );
        } catch (err) {
            console.error("Erro ao buscar recepções:", err);
            return [];
        }
    },

    async buscarRecepcoesDoUsuario(db, userId, role) {
        try {
            const snap  = await getDocs(collection(db, "recepcoes"));
            const todas = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.ativo !== false);

            if (role === 'superadmin' || role === 'admin') return todas;

            return todas.filter(r => r.membros && r.membros.includes(userId));
        } catch (err) {
            console.error("Erro ao buscar recepções do usuário:", err);
            return [];
        }
    },

    iniciarCache(db, userId, role, onChange) {
        return onSnapshot(collection(db, "recepcoes"), (snap) => {
            const todas = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.ativo !== false);

            this._cache = {
                recepcoes: (role === 'superadmin' || role === 'admin')
                    ? todas
                    : todas.filter(r => r.membros && r.membros.includes(userId)),
                carregadoEm: Date.now()
            };
            onChange?.(this._cache.recepcoes);
        });
    },

    async adicionarMembro(db, recepcaoId, userId) {
        try {
            const ref  = doc(db, "recepcoes", recepcaoId);
            const snap = await getDoc(ref);
            if (!snap.exists()) return false;
            const membros = snap.data().membros || [];
            if (!membros.includes(userId)) {
                membros.push(userId);
                await updateDoc(ref, { membros });
            }
            return true;
        } catch (err) {
            return false;
        }
    },

    async removerMembro(db, recepcaoId, userId) {
        try {
            const ref  = doc(db, "recepcoes", recepcaoId);
            const snap = await getDoc(ref);
            if (!snap.exists()) return false;
            const membros = (snap.data().membros || []).filter(id => id !== userId);
            await updateDoc(ref, { membros });
            return true;
        } catch (err) {
            return false;
        }
    },

    gerarLinkPainel(recepcao, pautaIds = []) {
        const base   = window.location.origin + '/' + PAINEL_BASE_URL;
        const params = new URLSearchParams();
        if (pautaIds.length > 0)                                               params.set('pautas', pautaIds.join(','));
        if (recepcao.modoVisualizacao && recepcao.modoVisualizacao !== 'fila') params.set('modo', recepcao.modoVisualizacao);
        if (recepcao.videoUrl)                                                 params.set('video', recepcao.videoUrl);
        if (recepcao.nome)                                                     params.set('nome', encodeURIComponent(recepcao.nome));
        return `${base}?${params.toString()}`;
    },

    async copiarLinkPainel(recepcao, pautaIds = []) {
        try {
            const link = this.gerarLinkPainel(recepcao, pautaIds);
            await navigator.clipboard.writeText(link);
            showNotification("Link do painel copiado!", "success");
            return link;
        } catch (err) {
            showNotification("Não foi possível copiar o link.", "error");
            return null;
        }
    },

    filtrarPautasPorRecepcao(pautas, recepcao) {
        if (!recepcao) return [];

        const unidadesPermitidas = recepcao.unidadesVinculadas && recepcao.unidadesVinculadas.length > 0
            ? recepcao.unidadesVinculadas.map(u => u.id)
            : [recepcao.unidadeId];

        let pautasDaUnidade = pautas.filter(p => unidadesPermitidas.includes(p.unidadeId));

        if (recepcao.tipo === 'central' || recepcao.verTudo === true) {
            return pautasDaUnidade;
        }

        const grupos = recepcao.grupos || [];
        if (grupos.length === 0) return pautasDaUnidade;

        return pautasDaUnidade.filter(p => {
            if (!p.grupoRecepcao) return false;
            if (Array.isArray(p.grupoRecepcao)) return p.grupoRecepcao.some(g => grupos.includes(g));
            return grupos.includes(p.grupoRecepcao);
        });
    },

    getContextoRecepcao(recepcao) {
        if (!recepcao) {
            return { icone: 'landmark', titulo: 'Recepção', subtitulo: '', cor: 'bg-slate-800' };
        }
        const corConfig = corDe(recepcao);

        let subNome = recepcao.unidadeNome;
        if (recepcao.unidadesVinculadas && recepcao.unidadesVinculadas.length > 1) {
            subNome = `${recepcao.unidadesVinculadas.length} unidades vinculadas`;
        }

        return {
            icone:     recepcao.icone || ICONES_SUGERIDOS.default,
            titulo:    escapeHTML(recepcao.nome || ''),
            subtitulo: escapeHTML([subNome, recepcao.andar].filter(Boolean).join(' · ')),
            cor:       corConfig.bg,
            corLight:  corConfig.light,
            corBorder: corConfig.border,
            corText:   corConfig.text,
        };
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SELETOR DE RECEPÇÕES
    // ═══════════════════════════════════════════════════════════════════════════

    renderSelectorRecepcoes(recepcoes) {
        injetarEstilos();

        if (!recepcoes || recepcoes.length === 0) {
            return `<p class="text-center py-10 text-sm" style="color:var(--rc-faint)">Nenhuma recepção disponível ou vinculada à sua conta.</p>`;
        }

        const porUnidade = {};
        for (const rec of recepcoes) {
            const multi = rec.unidadesVinculadas?.length > 1;
            const key = multi ? 'multi' : (rec.unidadeId || 'sem_unidade');
            const nomeGrupo = multi ? 'Recepções multi-unidades' : (rec.unidadeNome || 'Sem unidade');

            if (!porUnidade[key]) porUnidade[key] = { nome: nomeGrupo, recepcoes: [] };
            porUnidade[key].recepcoes.push(rec);
        }

        const tiposUnicos = [...new Set(recepcoes.map(r => r.tipo || 'especializada'))];

        const gruposHtml = Object.entries(porUnidade).map(([unidadeId, unidade]) => `
            <div class="rc-grupo-unidade" data-unidade="${escapeHTML(unidadeId)}">
                <button type="button" class="rc-group-toggle rc-toggle-unidade" data-unidade="${escapeHTML(unidadeId)}" aria-expanded="true">
                    <span class="flex items-center gap-2.5 min-w-0">
                        <span style="color:var(--rc-faint)">${ico('building', 16)}</span>
                        <span class="rc-eyebrow truncate" style="color:inherit">${escapeHTML(unidade.nome)}</span>
                        <span class="rc-count rc-badge-count">${unidade.recepcoes.length}</span>
                    </span>
                    <span class="rc-chevron">${ico('chevron', 16)}</span>
                </button>
                <div class="rc-unidade-body grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 pb-6" data-unidade="${escapeHTML(unidadeId)}">
                    ${unidade.recepcoes.map(rec => this._cardSelectorBusca(rec)).join('')}
                </div>
            </div>
        `).join('');

        return `
            <div class="rc-wrap max-w-5xl mx-auto" id="rc-selector-root">
                <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                    <div class="rc-surface flex items-center gap-3 flex-1" style="padding:2px 6px 2px 14px">
                        <span style="color:var(--rc-faint)">${ico('search', 17)}</span>
                        <input type="text" id="rc-busca-input" autocomplete="off"
                            class="w-full bg-transparent border-none outline-none text-sm py-2.5"
                            placeholder="Buscar por nome, grupo ou andar">
                        <button type="button" id="rc-busca-limpar" class="rc-btn rc-btn--ghost rc-btn--sm rc-btn--icon hidden" style="width:28px;height:28px" aria-label="Limpar busca">${ico('x', 14)}</button>
                    </div>
                    <div class="rc-seg shrink-0">
                        <button type="button" class="rc-sel-filtro is-active" data-tipo="todos">Todas</button>
                        ${tiposUnicos.map(tipo => `
                            <button type="button" class="rc-sel-filtro" data-tipo="${escapeHTML(tipo)}">${tipo === 'central' ? 'Central' : 'Especializada'}</button>
                        `).join('')}
                    </div>
                </div>

                <div id="rc-sem-resultados" class="hidden rc-empty">
                    <p class="font-bold" style="color:var(--rc-text)">Nenhuma recepção encontrada</p>
                    <p class="text-sm mt-1" style="color:var(--rc-muted)">Ajuste a busca ou o filtro de tipo.</p>
                </div>

                <div id="rc-grupos-wrapper">${gruposHtml}</div>
            </div>
        `;
    },

    _cardSelectorBusca(rec) {
        const cor = corDe(rec);
        const subInfo = (rec.unidadesVinculadas && rec.unidadesVinculadas.length > 1)
            ? `${rec.unidadesVinculadas.length} unidades`
            : (rec.andar || '');
        const grupos = rec.grupos || [];

        return `
            <button type="button"
                class="rc-selector-recepcao rc-card-buscavel rc-sel-card"
                style="--c:${cor.hex};--tint:${cor.tint};--line:${cor.line}"
                data-recepcao-id="${escapeHTML(rec.id)}"
                data-unidade-id="${escapeHTML(rec.unidadeId || '')}"
                data-search="${escapeHTML([rec.nome, ...grupos, rec.andar || '', rec.tipo].join(' ').toLowerCase())}"
                data-tipo="${escapeHTML(rec.tipo || 'especializada')}">
                <span class="rc-tile">${icoFrom(rec.icone || ICONES_SUGERIDOS.default, 'w-5 h-5')}</span>
                <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-2">
                        <span class="font-extrabold text-[15px] leading-tight truncate" style="color:var(--rc-text)">${escapeHTML(rec.nome)}</span>
                        ${rec.tipo === 'central' ? `<span class="rc-badge rc-badge--info shrink-0" title="Recepção central">Central</span>` : ''}
                    </span>
                    ${subInfo ? `<span class="block rc-eyebrow mt-1">${escapeHTML(subInfo)}</span>` : ''}
                    ${grupos.length > 0 ? `
                        <span class="flex flex-wrap gap-1 mt-2">
                            ${grupos.slice(0, 3).map(g => `<span class="rc-badge" style="background:${cor.tint};border-color:${cor.line};color:${cor.hex}">${escapeHTML(g)}</span>`).join('')}
                            ${grupos.length > 3 ? `<span class="text-[11px] font-semibold" style="color:var(--rc-faint)">+${grupos.length - 3}</span>` : ''}
                        </span>` : ''}
                </span>
            </button>
        `;
    },

    initSelectorEventos() {
        const input     = document.getElementById('rc-busca-input');
        const limpar    = document.getElementById('rc-busca-limpar');
        const semResult = document.getElementById('rc-sem-resultados');
        const wrapper   = document.getElementById('rc-grupos-wrapper');
        if (!input || !wrapper) return;

        const atualizar = () => {
            const q         = input.value.trim().toLowerCase();
            const tipoAtivo = document.querySelector('.rc-sel-filtro.is-active')?.dataset?.tipo || 'todos';

            limpar.classList.toggle('hidden', q.length === 0);

            let totalVisiveis = 0;
            wrapper.querySelectorAll('.rc-grupo-unidade').forEach(grupo => {
                let visiveisNoGrupo = 0;
                grupo.querySelectorAll('.rc-card-buscavel').forEach(card => {
                    const matchBusca = !q || card.dataset.search.includes(q);
                    const matchTipo  = tipoAtivo === 'todos' || card.dataset.tipo === tipoAtivo;
                    const visivel    = matchBusca && matchTipo;
                    card.style.display = visivel ? '' : 'none';
                    if (visivel) visiveisNoGrupo++;
                });
                grupo.style.display = visiveisNoGrupo > 0 ? '' : 'none';
                const badge = grupo.querySelector('.rc-badge-count');
                if (badge) badge.textContent = visiveisNoGrupo;
                totalVisiveis += visiveisNoGrupo;
            });

            semResult?.classList.toggle('hidden', totalVisiveis > 0);
        };

        input.addEventListener('input', atualizar);
        limpar.addEventListener('click', () => { input.value = ''; atualizar(); input.focus(); });

        document.querySelectorAll('.rc-sel-filtro').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.rc-sel-filtro').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                atualizar();
            });
        });

        document.querySelectorAll('.rc-toggle-unidade').forEach(btn => {
            btn.addEventListener('click', () => {
                const id   = btn.dataset.unidade;
                const body = document.querySelector(`.rc-unidade-body[data-unidade="${CSS.escape(id)}"]`);
                const chev = btn.querySelector('.rc-chevron');
                if (!body) return;
                const aberto = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', String(!aberto));
                body.style.display   = aberto ? 'none' : '';
                chev.style.transform = aberto ? 'rotate(-90deg)' : '';
            });
        });
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PAINEL ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    renderPainelAdmin(recepcoes, unidades) {
        injetarEstilos();

        const totalAtivas  = recepcoes.length;
        const totalCentral = recepcoes.filter(r => r.tipo === 'central').length;

        const linhas = recepcoes.map(rec => {
            const cor      = corDe(rec);
            const modoInfo = MODOS_LABEL[rec.modoVisualizacao || 'fila'] || MODOS_LABEL.fila;
            const somAtivo = rec.somPadrao !== false;
            const unidade  = rec.unidadesVinculadas?.length > 1
                ? `${rec.unidadesVinculadas.length} unidades vinculadas`
                : (rec.unidadeNome || '');
            const grupos = rec.grupos || [];

            return `
                <tr class="rc-admin-row"
                    data-search="${escapeHTML([rec.nome, rec.unidadeNome || '', ...grupos, rec.andar || ''].join(' ').toLowerCase())}">
                    <td>
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="rc-tile" style="--tint:${cor.tint};--line:${cor.line};width:38px;height:38px;font-size:19px">${icoFrom(rec.icone || ICONES_SUGERIDOS.default, 'w-5 h-5')}</span>
                            <div class="min-w-0">
                                <p class="font-bold text-sm truncate" style="max-width:200px">${escapeHTML(rec.nome)}</p>
                                <p class="text-xs truncate" style="max-width:200px;color:var(--rc-muted)">${escapeHTML([unidade, rec.andar].filter(Boolean).join(' · ')) || '—'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="hidden sm:table-cell">
                        <div class="flex flex-wrap gap-1">
                            ${grupos.slice(0, 3).map(g => `<span class="rc-badge" style="background:${cor.tint};border-color:${cor.line};color:${cor.hex}">${escapeHTML(g)}</span>`).join('')}
                            ${grupos.length > 3 ? `<span class="text-[11px]" style="color:var(--rc-faint)">+${grupos.length - 3}</span>` : ''}
                            ${grupos.length === 0 ? `<span style="color:var(--rc-faint)">—</span>` : ''}
                        </div>
                    </td>
                    <td class="hidden md:table-cell">
                        <span class="rc-badge ${rec.tipo === 'central' ? 'rc-badge--info' : ''}">${rec.tipo === 'central' ? 'Central' : 'Especializada'}</span>
                    </td>
                    <td class="hidden lg:table-cell">
                        <div class="flex items-center gap-1.5">
                            <span class="rc-badge">${ico(modoInfo.icone, 12)} ${modoInfo.label}</span>
                            <span class="rc-badge ${somAtivo ? 'rc-badge--ok' : ''}" title="${somAtivo ? 'Som ativado' : 'Silencioso'}">${ico(somAtivo ? 'volume' : 'volumeOff', 12)}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex gap-1 justify-end">
                            <button class="btn-editar-recepcao rc-btn rc-btn--ghost rc-btn--icon" style="width:32px;height:32px"
                                data-recepcao-id="${escapeHTML(rec.id)}" title="Editar" aria-label="Editar">${ico('edit', 16)}</button>
                            <button class="btn-link-recepcao rc-btn rc-btn--ghost rc-btn--icon" style="width:32px;height:32px"
                                data-recepcao-id="${escapeHTML(rec.id)}" title="Copiar link do painel" aria-label="Copiar link do painel">${ico('link', 16)}</button>
                            <button class="btn-excluir-recepcao rc-btn rc-btn--ghost rc-btn--icon" style="width:32px;height:32px;color:var(--rc-danger)"
                                data-recepcao-id="${escapeHTML(rec.id)}" data-nome="${escapeHTML(rec.nome)}" title="Excluir definitivamente" aria-label="Excluir">${ico('trash', 16)}</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="rc-wrap space-y-5">
                <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div class="flex-1">
                        <h3 class="text-lg font-extrabold tracking-tight">Gerenciar recepções</h3>
                        <p class="text-sm mt-0.5" style="color:var(--rc-muted)">${totalAtivas} ativas · ${totalCentral} central · ${totalAtivas - totalCentral} especializadas</p>
                    </div>
                    <button id="btn-nova-recepcao" class="rc-btn rc-btn--primary shrink-0">${ico('plus', 15)} Nova recepção</button>
                </div>

                ${recepcoes.length === 0
                    ? `<div class="rc-empty">
                           <p class="font-bold">Nenhuma recepção criada ainda</p>
                           <p class="text-sm mt-1" style="color:var(--rc-muted)">Crie a primeira para começar a organizar os atendimentos.</p>
                       </div>`
                    : `
                    <div class="rc-surface flex items-center gap-3" style="padding:2px 14px">
                        <span style="color:var(--rc-faint)">${ico('search', 17)}</span>
                        <input type="text" id="rc-admin-busca" autocomplete="off"
                            class="w-full bg-transparent border-none outline-none text-sm py-2.5"
                            placeholder="Filtrar por nome, unidade ou grupo">
                    </div>

                    <div class="rc-surface overflow-hidden">
                        <div style="overflow-x:auto">
                            <table class="rc-table">
                                <thead>
                                    <tr>
                                        <th>Recepção</th>
                                        <th class="hidden sm:table-cell">Grupos</th>
                                        <th class="hidden md:table-cell">Tipo</th>
                                        <th class="hidden lg:table-cell">Painel</th>
                                        <th style="text-align:right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="rc-admin-tbody">${linhas}</tbody>
                            </table>
                        </div>
                        <div style="padding:10px 16px;border-top:1px solid var(--rc-line);background:#fafbfc">
                            <span id="rc-admin-count" class="text-xs font-semibold" style="color:var(--rc-muted)">${recepcoes.length} recepç${recepcoes.length === 1 ? 'ão' : 'ões'}</span>
                        </div>
                    </div>`
                }
            </div>
        `;
    },

    initAdminBuscaEventos() {
        const input = document.getElementById('rc-admin-busca');
        const tbody = document.getElementById('rc-admin-tbody');
        const count = document.getElementById('rc-admin-count');
        if (!input || !tbody) return;

        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            let visiveis = 0;
            tbody.querySelectorAll('.rc-admin-row').forEach(row => {
                const match = !q || row.dataset.search.includes(q);
                row.style.display = match ? '' : 'none';
                if (match) visiveis++;
            });
            if (count) count.textContent = `${visiveis} recepç${visiveis === 1 ? 'ão' : 'ões'}${q ? ' encontrada' + (visiveis === 1 ? '' : 's') : ''}`;
        });
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // FORMULÁRIO
    // ═══════════════════════════════════════════════════════════════════════════

    _tagGrupoHtml(g) {
        const s = escapeHTML(g);
        return `<span class="rc-tag">${s}<button type="button" class="btn-remove-grupo" data-grupo="${s}" aria-label="Remover ${s}">×</button></span>`;
    },

    renderFormRecepcao(recepcao = null, unidadesDeContexto = []) {
        injetarEstilos();

        const isEdicao = !!recepcao;
        const titulo   = isEdicao ? 'Editar recepção' : 'Nova recepção';

        const corAtual   = recepcao?.cor || 'slate';
        const iconeAtual = nomeIcone(recepcao?.icone || ICONES_SUGERIDOS.default);

        const coresHtml = Object.entries(CORES).map(([key, val]) => `
            <button type="button" class="color-option rc-swatch ${corAtual === key ? 'is-selected' : ''}"
                style="background:${val.hex}" data-cor="${key}" title="${key}" aria-label="Cor ${key}"></button>
        `).join('');

        const iconesHtml = Object.values(ICONES_SUGERIDOS).map(icone => `
            <button type="button" class="icone-option rc-icon-opt ${iconeAtual === icone ? 'is-selected' : ''}" data-icone="${icone}">${icoFrom(icone, 'w-5 h-5')}</button>
        `).join('');

        const modoAtual = recepcao?.modoVisualizacao || 'fila';
        const somPadrao = recepcao?.somPadrao !== false;
        const videoUrl  = recepcao?.videoUrl || '';

        let defaultVinculadas = recepcao?.unidadesVinculadas || [];
        if (defaultVinculadas.length === 0 && recepcao?.unidadeId) {
            defaultVinculadas = [{ id: recepcao.unidadeId, nome: recepcao.unidadeNome }];
        } else if (defaultVinculadas.length === 0 && unidadesDeContexto.length > 0) {
            defaultVinculadas = [{ id: unidadesDeContexto[0].id, nome: unidadesDeContexto[0].nome }];
        }
        const jsonVinculadas = escapeHTML(JSON.stringify(defaultVinculadas));

        const opcaoModo = (valor, icone, titulo, desc) => `
            <label class="rc-option form-rec-modo-card ${modoAtual === valor ? 'is-selected' : ''}">
                <input type="radio" name="form-rec-modo" value="${valor}" ${modoAtual === valor ? 'checked' : ''}>
                <span style="color:var(--rc-brand)">${ico(icone, 18)}</span>
                <span>${titulo}<br><span class="text-[11px] font-medium" style="color:var(--rc-muted)">${desc}</span></span>
            </label>`;

        const opcaoSom = (valor, ativo, icone, titulo, desc) => `
            <label class="rc-option form-rec-som-card flex-1 ${ativo ? 'is-selected' : ''}">
                <input type="radio" name="form-rec-som" value="${valor}" ${ativo ? 'checked' : ''}>
                <span style="color:var(--rc-brand)">${ico(icone, 18)}</span>
                <span>${titulo}<br><span class="text-[11px] font-medium" style="color:var(--rc-muted)">${desc}</span></span>
            </label>`;

        return `
            <div class="rc-wrap space-y-5">
                <h3 class="text-lg font-extrabold tracking-tight pb-3" style="border-bottom:1px solid var(--rc-line)">${titulo}</h3>

                <div>
                    <label class="rc-label" for="form-rec-nome">Nome da recepção <span style="color:var(--rc-danger)">*</span></label>
                    <input type="text" id="form-rec-nome" value="${escapeHTML(recepcao?.nome || '')}" class="rc-input" placeholder="Ex.: Família — 2º andar">
                </div>

                <div>
                    <label class="rc-label" for="form-rec-busca-unidade">Unidades vinculadas <span style="color:var(--rc-danger)">*</span></label>
                    <div class="relative mb-2">
                        <span class="absolute" style="left:12px;top:50%;transform:translateY(-50%);color:var(--rc-faint)">${ico('search', 15)}</span>
                        <input type="text" id="form-rec-busca-unidade" class="rc-input" style="padding-left:34px" placeholder="Buscar por nome, sigla ou endereço" autocomplete="off">
                    </div>
                    <div id="form-rec-unidades-lista" class="rc-unit-list">
                        <p class="text-xs text-center py-5" style="color:var(--rc-faint)">Carregando unidades…</p>
                    </div>
                    <p class="text-xs mt-1.5" style="color:var(--rc-muted)">Marque todas as unidades de onde esta recepção deve extrair as pautas.</p>
                    <input type="hidden" id="form-rec-unidades-vinculadas-data" value="${jsonVinculadas}">
                </div>

                <div>
                    <label class="rc-label" for="form-rec-andar">Andar / localização</label>
                    <input type="text" id="form-rec-andar" value="${escapeHTML(recepcao?.andar || '')}" class="rc-input" placeholder="Ex.: 2º andar — corredor B">
                </div>

                <div>
                    <span class="rc-label">Tipo de triagem</span>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label class="rc-option form-rec-tipo-card ${!recepcao || recepcao.tipo === 'especializada' ? 'is-selected' : ''}">
                            <input type="radio" name="form-rec-tipo" value="especializada" ${!recepcao || recepcao.tipo === 'especializada' ? 'checked' : ''}>
                            Especializada
                        </label>
                        <label class="rc-option form-rec-tipo-card ${recepcao?.tipo === 'central' ? 'is-selected' : ''}">
                            <input type="radio" name="form-rec-tipo" value="central" ${recepcao?.tipo === 'central' ? 'checked' : ''}>
                            <span>Central<br><span class="text-[11px] font-medium" style="color:var(--rc-muted)">Vê todas as pautas</span></span>
                        </label>
                    </div>
                </div>

                <div id="form-rec-grupos-wrap" ${recepcao?.tipo === 'central' ? 'class="hidden"' : ''}>
                    <label class="rc-label" for="form-rec-grupo-input">Grupos / áreas (tags das pautas) <span style="color:var(--rc-danger)">*</span></label>
                    <p class="text-xs mb-2" style="color:var(--rc-muted)">Digite a tag e pressione Enter. A recepção exibirá as pautas que contenham estas tags.</p>
                    <div class="flex gap-2 mb-3">
                        <input type="text" id="form-rec-grupo-input" class="rc-input" placeholder="Ex.: familia, civel, triagem">
                        <button type="button" id="btn-add-grupo" class="rc-btn rc-btn--dark shrink-0">${ico('plus', 14)} Adicionar</button>
                    </div>
                    <div id="form-rec-grupos-lista" class="flex flex-wrap gap-2" style="min-height:32px">
                        ${(recepcao?.grupos || []).map(g => this._tagGrupoHtml(g)).join('')}
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <span class="rc-label">Ícone de exibição</span>
                        <div class="flex flex-wrap gap-2">${iconesHtml}</div>
                        <input type="hidden" id="form-rec-icone" value="${escapeHTML(iconeAtual)}">
                    </div>
                    <div>
                        <span class="rc-label">Cor do cartão</span>
                        <div class="flex gap-3 flex-wrap">${coresHtml}</div>
                        <input type="hidden" id="form-rec-cor" value="${escapeHTML(corAtual)}">
                    </div>
                </div>

                <label class="rc-callout" for="form-rec-vertudo" style="cursor:pointer">
                    <input type="checkbox" id="form-rec-vertudo" ${recepcao?.verTudo ? 'checked' : ''} class="w-4 h-4 mt-0.5 cursor-pointer">
                    <span>
                        <span class="block text-sm font-bold" style="color:#92400e">Ignorar filtro de grupos</span>
                        <span class="block text-xs mt-0.5" style="color:var(--rc-warn)">Se marcado, mostra todas as pautas das unidades vinculadas, sem restrição de tags.</span>
                    </span>
                </label>

                <div class="rc-form-section space-y-5">
                    <div class="flex items-center gap-2" style="color:var(--rc-text)">
                        <span style="color:var(--rc-brand)">${ico('tv', 18)}</span>
                        <h4 class="text-sm font-extrabold">Painel público da TV</h4>
                    </div>

                    <div>
                        <span class="rc-label">Modo de visualização padrão</span>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            ${opcaoModo('fila',  'list',      'Fila (lista)', 'Fila e chamados')}
                            ${opcaoModo('tv',    'tv',        'TV chamados',  'Histórico completo')}
                            ${opcaoModo('video', 'video',     'TV + vídeo',   'Vídeo na tela principal')}
                        </div>
                    </div>

                    <div id="form-rec-video-wrap" style="${modoAtual !== 'video' ? 'display:none' : ''}">
                        <label class="rc-label" for="form-rec-video">Link do YouTube / vídeo .mp4</label>
                        <input type="text" id="form-rec-video" value="${escapeHTML(videoUrl)}" class="rc-input" placeholder="https://www.youtube.com/watch?v=…">
                    </div>

                    <div>
                        <span class="rc-label">Avisos sonoros</span>
                        <div class="flex gap-3">
                            ${opcaoSom('ativo',     somPadrao,  'volume',    'Som ativado', 'Aviso ao chamar')}
                            ${opcaoSom('desligado', !somPadrao, 'volumeOff', 'Silencioso',  'Sem nenhum som')}
                        </div>
                    </div>
                </div>

                <div class="flex gap-3 pt-2">
                    <button type="button" id="btn-cancelar-form-rec" class="rc-btn flex-1">Cancelar</button>
                    <button type="button" id="btn-salvar-recepcao" class="rc-btn rc-btn--primary flex-1" data-recepcao-id="${escapeHTML(recepcao?.id || '')}">
                        ${isEdicao ? 'Salvar configurações' : 'Concluir e criar'}
                    </button>
                </div>
            </div>
        `;
    },

    initFormRecepcaoEventos(onSalvar, onCancelar) {
        let gruposAtivos = [];

        // 1. LISTA DE UNIDADES (multi-seleção com busca)
        const unidadesContainer = document.getElementById('form-rec-unidades-lista');
        if (unidadesContainer && window.app?.db) {
            const db = window.app.db;

            Promise.all([
                getDocs(collection(db, "unidades")).catch(() => ({ docs: [] })),
                getDocs(collection(db, "orgaos")).catch(() => ({ docs: [] })),
                getDocs(collection(db, "estrutura_unidades")).catch(() => ({ docs: [] }))
            ]).then(([snapUnidades, snapOrgaos, snapEstrutura]) => {
                const mapUnidades = new Map();

                const processarDocs = (docs) => {
                    docs.forEach(d => {
                        const data = d.data();
                        if (data.ativo === false || data.status === 'inativo') return;

                        const nome     = data.nome || data.name || data.titulo || data.descricao || d.id;
                        const sigla    = data.sigla || '';
                        const endereco = data.endereco || '';

                        mapUnidades.set(d.id, { id: d.id, nome, sigla, endereco });
                    });
                };

                processarDocs(snapUnidades.docs);
                processarDocs(snapOrgaos.docs);
                processarDocs(snapEstrutura.docs);

                const todas = Array.from(mapUnidades.values());
                todas.sort((a, b) => a.nome.localeCompare(b.nome));

                const vinculadasRaw = document.getElementById('form-rec-unidades-vinculadas-data')?.value || '[]';
                let vinculadasIds = [];
                try { vinculadasIds = JSON.parse(vinculadasRaw).map(v => v.id); } catch (e) { /* ignora */ }

                if (todas.length === 0) {
                    unidadesContainer.innerHTML = `
                        <div class="rc-callout" style="margin:6px">
                            <span>
                                <span class="block text-sm font-bold" style="color:#92400e">Nenhuma unidade encontrada</span>
                                <span class="block text-xs mt-0.5" style="color:var(--rc-warn)">Crie uma unidade/órgão primeiro para vinculá-la à recepção.</span>
                            </span>
                        </div>`;
                    return;
                }

                unidadesContainer.innerHTML = todas.map(u => {
                    const textoBusca = `${u.nome} ${u.sigla} ${u.endereco}`.toLowerCase();
                    return `
                    <label class="item-unidade-cb rc-unit-item" data-busca="${escapeHTML(textoBusca)}">
                        <input type="checkbox" class="form-rec-unidade-cb w-4 h-4 mt-0.5 shrink-0"
                            value="${escapeHTML(u.id)}" data-nome="${escapeHTML(u.nome)}" ${vinculadasIds.includes(u.id) ? 'checked' : ''}>
                        <span class="min-w-0 flex-1">
                            <span class="flex items-center gap-2 text-sm font-semibold leading-tight">
                                <span class="truncate">${escapeHTML(u.nome)}</span>
                                ${u.sigla ? `<span class="rc-badge rc-badge--mono shrink-0">${escapeHTML(u.sigla)}</span>` : ''}
                            </span>
                            ${u.endereco ? `<span class="flex items-center gap-1 text-xs mt-1 truncate" style="color:var(--rc-muted)">${ico('pin', 12)} ${escapeHTML(u.endereco)}</span>` : ''}
                        </span>
                    </label>`;
                }).join('');

                document.getElementById('form-rec-busca-unidade')?.addEventListener('input', (e) => {
                    const termo = e.target.value.toLowerCase().trim();
                    unidadesContainer.querySelectorAll('.item-unidade-cb').forEach(label => {
                        label.style.display = (label.getAttribute('data-busca') || '').includes(termo) ? '' : 'none';
                    });
                });
            });
        }

        // 2. GRUPOS EXISTENTES
        document.querySelectorAll('#form-rec-grupos-lista .btn-remove-grupo').forEach(btn => {
            if (btn.dataset.grupo) gruposAtivos.push(btn.dataset.grupo);
        });

        // 3. INSERÇÃO / REMOÇÃO DE GRUPOS
        document.getElementById('btn-add-grupo')?.addEventListener('click', () => {
            const input = document.getElementById('form-rec-grupo-input');
            const val   = input.value.trim().toLowerCase().replace(/\s+/g, '_');
            if (!val) return;
            if (gruposAtivos.includes(val)) { showNotification("Grupo já adicionado.", "warning"); return; }
            gruposAtivos.push(val);
            this._renderGruposLista(gruposAtivos);
            input.value = '';
            input.focus();
        });

        document.getElementById('form-rec-grupo-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-add-grupo')?.click(); }
        });

        document.getElementById('form-rec-grupos-lista')?.addEventListener('click', (e) => {
            const alvo = e.target.closest('.btn-remove-grupo');
            if (alvo) {
                gruposAtivos = gruposAtivos.filter(x => x !== alvo.dataset.grupo);
                this._renderGruposLista(gruposAtivos);
            }
        });

        // 4. ÍCONES E CORES
        document.querySelectorAll('.icone-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.icone-option').forEach(b => b.classList.remove('is-selected'));
                btn.classList.add('is-selected');
                const inp = document.getElementById('form-rec-icone');
                if (inp) inp.value = btn.dataset.icone;
            });
        });

        document.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-option').forEach(b => b.classList.remove('is-selected'));
                btn.classList.add('is-selected');
                const inp = document.getElementById('form-rec-cor');
                if (inp) inp.value = btn.dataset.cor;
            });
        });

        // 5. RADIOS (destaque visual padronizado via .is-selected)
        const ligarRadios = (name, cardSelector, aoMudar) => {
            document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
                radio.addEventListener('change', () => {
                    document.querySelectorAll(cardSelector).forEach(c => c.classList.remove('is-selected'));
                    radio.closest(cardSelector)?.classList.add('is-selected');
                    aoMudar?.(radio);
                });
            });
        };

        ligarRadios('form-rec-tipo', '.form-rec-tipo-card', (radio) => {
            document.getElementById('form-rec-grupos-wrap')?.classList.toggle('hidden', radio.value === 'central');
        });

        ligarRadios('form-rec-modo', '.form-rec-modo-card', (radio) => {
            const videoWrap = document.getElementById('form-rec-video-wrap');
            if (videoWrap) videoWrap.style.display = radio.value === 'video' ? 'block' : 'none';
        });

        ligarRadios('form-rec-som', '.form-rec-som-card');

        // 6. AÇÕES
        document.getElementById('btn-cancelar-form-rec')?.addEventListener('click', onCancelar);

        document.getElementById('btn-salvar-recepcao')?.addEventListener('click', () => {
            const nome       = document.getElementById('form-rec-nome')?.value.trim();
            const andar      = document.getElementById('form-rec-andar')?.value.trim();
            const tipo       = document.querySelector('input[name="form-rec-tipo"]:checked')?.value || 'especializada';
            const icone      = document.getElementById('form-rec-icone')?.value || ICONES_SUGERIDOS.default;
            const cor        = document.getElementById('form-rec-cor')?.value || 'slate';
            const verTudo    = document.getElementById('form-rec-vertudo')?.checked || false;
            const recepcaoId = document.getElementById('btn-salvar-recepcao')?.dataset.recepcaoId || '';

            const modoVisualizacao = document.querySelector('input[name="form-rec-modo"]:checked')?.value || 'fila';
            const videoUrl         = document.getElementById('form-rec-video')?.value.trim() || '';
            const somPadrao        = document.querySelector('input[name="form-rec-som"]:checked')?.value !== 'desligado';

            const cbUnidades = document.querySelectorAll('.form-rec-unidade-cb:checked');
            const unidadesVinculadas = Array.from(cbUnidades).map(cb => ({ id: cb.value, nome: cb.dataset.nome }));

            if (!nome) {
                showNotification("Preencha o nome da recepção.", "error");
                return;
            }
            if (unidadesVinculadas.length === 0) {
                showNotification("Marque pelo menos uma unidade para esta recepção atuar.", "error");
                return;
            }
            if (tipo === 'especializada' && gruposAtivos.length === 0 && !verTudo) {
                showNotification("Adicione ao menos uma tag (grupo) para esta recepção filtrar.", "error");
                return;
            }
            if (modoVisualizacao === 'video' && !videoUrl) {
                showNotification("Informe o link do vídeo para o modo TV + vídeo.", "error");
                return;
            }

            onSalvar({
                id: recepcaoId || undefined,
                nome,
                andar,
                tipo,
                grupos: gruposAtivos,
                icone,
                cor,
                verTudo,
                modoVisualizacao,
                videoUrl,
                somPadrao,
                unidadesVinculadas
            }, recepcaoId);
        });
    },

    _renderGruposLista(grupos) {
        const lista = document.getElementById('form-rec-grupos-lista');
        if (!lista) return;
        lista.innerHTML = grupos.map(g => this._tagGrupoHtml(g)).join('');
    }
};

export default RecepcaoConfigService;
