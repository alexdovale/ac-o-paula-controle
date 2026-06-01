// js/recepcaoConfig.js - CONFIGURAÇÃO HIERÁRQUICA DE RECEPÇÕES (SIGEP)
// Responsabilidades:
// - Definir estrutura de unidades, andares, recepções e grupos de pautas
// - Controlar quem vê o quê (isolamento total entre recepções)
// - Salvar/carregar configurações no Firestore
// - Renderizar seletores hierárquicos com busca e colapsável
// - Filtrar pautas por recepção
// - Configurar preferências do painel público (modo, vídeo e som)

import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';

// ─── ESTRUTURA DE DADOS ────────────────────────────────────────────────────────
//
// Firestore:
//   recepcoes/{recepcaoId}
//     nome: "Família - 2º Andar"
//     icone: "👨‍👩‍👧"
//     cor: "slate"
//     unidadeId: "dp-duque-caxias"
//     unidadeNome: "Defensoria Duque de Caxias"
//     andar: "2º Andar"
//     tipo: "especializada"        // 'central' | 'especializada'
//     grupos: ["familia", "cejusc"]
//     membros: ["uid1", "uid2"]
//     verTudo: false
//     modoVisualizacao: "fila"     // 'fila' | 'tv' | 'video'
//     videoUrl: "https://..."      // YouTube ou arquivo direto
//     somPadrao: true              // som ativo ao abrir o painel
//     ativo: true
//     criadoPor: "uid"
//     criadoEm: timestamp
//
// Pautas precisam ter o campo:
//   grupoRecepcao: "familia"
//   unidadeId: "dp-duque-caxias"
// ──────────────────────────────────────────────────────────────────────────────

const PAINEL_BASE_URL = 'acompanhamento-recepcao.html';

const CORES = {
    rose:    { bg: 'bg-rose-700',    text: 'text-rose-700',    light: 'bg-rose-50',    border: 'border-rose-200'    },
    blue:    { bg: 'bg-blue-700',    text: 'text-blue-700',    light: 'bg-blue-50',    border: 'border-blue-200'    },
    green:   { bg: 'bg-green-700',   text: 'text-green-700',   light: 'bg-green-50',   border: 'border-green-200'   },
    purple:  { bg: 'bg-purple-700',  text: 'text-purple-700',  light: 'bg-purple-50',  border: 'border-purple-200'  },
    amber:   { bg: 'bg-amber-600',   text: 'text-amber-600',   light: 'bg-amber-50',   border: 'border-amber-200'   },
    cyan:    { bg: 'bg-cyan-700',    text: 'text-cyan-700',    light: 'bg-cyan-50',    border: 'border-cyan-200'    },
    slate:   { bg: 'bg-slate-700',   text: 'text-slate-700',   light: 'bg-slate-50',   border: 'border-slate-200'   },
    indigo:  { bg: 'bg-indigo-700',  text: 'text-indigo-700',  light: 'bg-indigo-50',  border: 'border-indigo-200'  },
};

const ICONES_SUGERIDOS = {
    familia:  '👨‍👩‍👧',
    civel:    '⚖️',
    criminal: '🔫',
    infancia: '🧒',
    fazenda:  '🏛️',
    cejusc:   '🤝',
    default:  '📋',
};

const MODOS_LABEL = {
    fila:  { icone: '📋', label: 'Fila (Lista)'   },
    tv:    { icone: '📺', label: 'TV Chamados'     },
    video: { icone: '🎬', label: 'TV + Vídeo'      },
};

export const RecepcaoConfigService = {

    // ─── CRUD DE RECEPÇÕES ────────────────────────────────────────────────────

    async criarRecepcao(db, dados, criadorUid) {
        try {
            const id = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const recepcao = {
                id,
                nome:             dados.nome,
                icone:            dados.icone || ICONES_SUGERIDOS.default,
                cor:              dados.cor || 'slate',
                unidadeId:        dados.unidadeId,
                unidadeNome:      dados.unidadeNome,
                andar:            dados.andar || '',
                tipo:             dados.tipo || 'especializada',
                grupos:           dados.grupos || [],
                membros:          dados.membros || [criadorUid],
                verTudo:          dados.verTudo || false,
                modoVisualizacao: dados.modoVisualizacao || 'fila',
                videoUrl:         dados.videoUrl || '',
                somPadrao:        dados.somPadrao !== undefined ? dados.somPadrao : true,
                ativo:            true,
                criadoPor:        criadorUid,
                criadoEm:         new Date().toISOString(),
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
            await updateDoc(doc(db, "recepcoes", recepcaoId), { ativo: false });
            showNotification("Recepção desativada.", "info");
            return true;
        } catch (err) {
            console.error("Erro ao excluir recepção:", err);
            return false;
        }
    },

    async buscarRecepcoesUnidade(db, unidadeId) {
        try {
            const q = query(
                collection(db, "recepcoes"),
                where("unidadeId", "==", unidadeId),
                where("ativo", "==", true)
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
                .filter(r => r.ativo === true);
            if (role === 'superadmin') return todas;
            return todas.filter(r => r.membros?.includes(userId));
        } catch (err) {
            console.error("Erro ao buscar recepções do usuário:", err);
            return [];
        }
    },

    iniciarCache(db, userId, role, onChange) {
        return onSnapshot(collection(db, "recepcoes"), (snap) => {
            const todas = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.ativo === true);
            this._cache = {
                recepcoes: role === 'superadmin' ? todas : todas.filter(r =>
                    r.membros?.includes(userId)
                ),
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
            console.error("Erro ao adicionar membro:", err);
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
            console.error("Erro ao remover membro:", err);
            return false;
        }
    },

    // ─── LINK DO PAINEL PÚBLICO ───────────────────────────────────────────────

    gerarLinkPainel(recepcao, pautaIds = []) {
        const base   = window.location.origin + '/' + PAINEL_BASE_URL;
        const params = new URLSearchParams();
        if (pautaIds.length > 0)                                   params.set('pautas', pautaIds.join(','));
        if (recepcao.modoVisualizacao && recepcao.modoVisualizacao !== 'fila') params.set('modo', recepcao.modoVisualizacao);
        if (recepcao.videoUrl)                                     params.set('video', recepcao.videoUrl);
        if (recepcao.nome)                                         params.set('nome', encodeURIComponent(recepcao.nome));
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

    // ─── FILTRAGEM DE PAUTAS ──────────────────────────────────────────────────

    filtrarPautasPorRecepcao(pautas, recepcao) {
        if (!recepcao) return pautas;
        if (recepcao.tipo === 'central' || recepcao.verTudo === true) {
            if (recepcao.unidadeId) return pautas.filter(p => !p.unidadeId || p.unidadeId === recepcao.unidadeId);
            return pautas;
        }
        const grupos = recepcao.grupos || [];
        if (grupos.length === 0) return pautas;
        return pautas.filter(p => {
            if (!p.grupoRecepcao) return false;
            if (Array.isArray(p.grupoRecepcao)) return p.grupoRecepcao.some(g => grupos.includes(g));
            return grupos.includes(p.grupoRecepcao);
        });
    },

    // ─── CONTEXTO VISUAL DA RECEPÇÃO ──────────────────────────────────────────

    getContextoRecepcao(recepcao) {
        if (!recepcao) {
            return { icone: '🏛️', titulo: 'Recepção', subtitulo: '', cor: 'bg-slate-800' };
        }
        const corConfig = CORES[recepcao.cor] || CORES.slate;
        return {
            icone:     recepcao.icone || ICONES_SUGERIDOS.default,
            titulo:    recepcao.nome,
            subtitulo: [recepcao.unidadeNome, recepcao.andar].filter(Boolean).join(' · '),
            cor:       corConfig.bg,
            corLight:  corConfig.light,
            corBorder: corConfig.border,
            corText:   corConfig.text,
        };
    },

    // ─── RENDER DO SELETOR HIERÁRQUICO ────────────────────────────────────────
    // Com busca live, filtro por tipo e grupos colapsáveis por unidade.

    renderSelectorRecepcoes(recepcoes) {
        if (!recepcoes || recepcoes.length === 0) {
            return `<p class="text-center text-slate-400 py-8">Nenhuma recepção disponível.</p>`;
        }

        const porUnidade = {};
        for (const rec of recepcoes) {
            const key = rec.unidadeId || 'sem_unidade';
            if (!porUnidade[key]) porUnidade[key] = { nome: rec.unidadeNome || 'Sem Unidade', recepcoes: [] };
            porUnidade[key].recepcoes.push(rec);
        }

        const tiposUnicos = [...new Set(recepcoes.map(r => r.tipo || 'especializada'))];

        const cardsHtml = Object.entries(porUnidade).map(([unidadeId, unidade]) => {
            const cards = unidade.recepcoes.map(rec => this._cardSelectorBusca(rec)).join('');
            const total = unidade.recepcoes.length;
            return `
                <div class="rc-grupo-unidade mb-2" data-unidade="${unidadeId}">
                    <button type="button"
                        class="rc-toggle-unidade w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group"
                        data-unidade="${unidadeId}" aria-expanded="true">
                        <span class="flex items-center gap-2.5 min-w-0">
                            <span class="text-xs font-black text-amber-600 uppercase tracking-widest truncate">${unidade.nome}</span>
                            <span class="rc-badge-count text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">${total}</span>
                        </span>
                        <span class="rc-chevron text-slate-400 group-hover:text-slate-600 transition-transform duration-200 text-xs">▼</span>
                    </button>
                    <div class="rc-unidade-body mt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 px-1" data-unidade="${unidadeId}">
                        ${cards}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="max-w-5xl mx-auto" id="rc-selector-root">
                <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                    <div class="flex-1">
                        <h2 class="text-xl font-black text-slate-800 uppercase tracking-tight">Selecionar Recepção</h2>
                        <p class="text-slate-400 text-xs mt-0.5">${recepcoes.length} recepções disponíveis</p>
                    </div>
                    <div class="flex gap-1.5 flex-shrink-0">
                        <button type="button" class="rc-filtro-tipo active text-[10px] font-black px-3 py-1.5 rounded-full border border-slate-300 bg-slate-800 text-white transition" data-tipo="todos">Todas</button>
                        ${tiposUnicos.map(tipo => `
                            <button type="button" class="rc-filtro-tipo text-[10px] font-black px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition" data-tipo="${tipo}">
                                ${tipo === 'central' ? '🏛️ Central' : '⚡ Especializada'}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="relative mb-4">
                    <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
                    <input type="text" id="rc-busca-input"
                        class="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-slate-300"
                        placeholder="Buscar por nome, grupo ou andar...">
                    <span id="rc-busca-limpar" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 cursor-pointer hover:text-slate-600 text-lg hidden" title="Limpar">×</span>
                </div>

                <div id="rc-sem-resultados" class="hidden text-center py-12">
                    <p class="text-4xl mb-2">🔎</p>
                    <p class="text-slate-400 text-sm font-semibold">Nenhuma recepção encontrada</p>
                    <p class="text-slate-300 text-xs mt-1">Tente outros termos ou limpe o filtro</p>
                </div>

                <div id="rc-grupos-wrapper" class="space-y-2">
                    ${cardsHtml}
                </div>
            </div>
        `;
    },

    _cardSelectorBusca(rec) {
        const corConfig = CORES[rec.cor] || CORES.slate;
        return `
            <button type="button"
                class="rc-selector-recepcao rc-card-buscavel group w-full text-left bg-white border-2 ${corConfig.border}
                       hover:${corConfig.bg} rounded-xl p-3 shadow-sm hover:shadow-md transition-all duration-150"
                data-recepcao-id="${rec.id}"
                data-unidade-id="${rec.unidadeId}"
                data-search="${[rec.nome, ...(rec.grupos || []), rec.andar || '', rec.tipo].join(' ').toLowerCase()}"
                data-tipo="${rec.tipo || 'especializada'}">
                <div class="flex items-center gap-2.5">
                    <span class="text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">${rec.icone || '📋'}</span>
                    <div class="min-w-0 flex-1">
                        <p class="font-black text-slate-800 group-hover:text-white text-sm truncate leading-tight">${rec.nome}</p>
                        ${rec.andar ? `<p class="text-[9px] font-bold text-slate-400 group-hover:text-white/70 uppercase tracking-wider">${rec.andar}</p>` : ''}
                        ${rec.grupos && rec.grupos.length > 0
                            ? `<div class="flex flex-wrap gap-1 mt-1.5">${rec.grupos.slice(0, 3).map(g =>
                                `<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full ${corConfig.light} ${corConfig.text}
                                       group-hover:bg-white/20 group-hover:text-white border ${corConfig.border}
                                       group-hover:border-white/30 transition-colors uppercase">${g}</span>`
                              ).join('')}${rec.grupos.length > 3 ? `<span class="text-[8px] text-slate-400 group-hover:text-white/60">+${rec.grupos.length - 3}</span>` : ''}</div>`
                            : ''}
                    </div>
                    ${rec.tipo === 'central' ? `<span class="text-base flex-shrink-0 opacity-60 group-hover:opacity-100" title="Recepção Central">🏛️</span>` : ''}
                </div>
            </button>
        `;
    },

    // ─── EVENTOS DO SELETOR ───────────────────────────────────────────────────
    // Chamar APÓS inserir o HTML do seletor no DOM.

    initSelectorEventos() {
        const input     = document.getElementById('rc-busca-input');
        const limpar    = document.getElementById('rc-busca-limpar');
        const semResult = document.getElementById('rc-sem-resultados');
        const wrapper   = document.getElementById('rc-grupos-wrapper');
        if (!input || !wrapper) return;

        const atualizar = () => {
            const q         = input.value.trim().toLowerCase();
            const tipoAtivo = document.querySelector('.rc-filtro-tipo.active')?.dataset?.tipo || 'todos';

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

        // Filtros por tipo
        document.querySelectorAll('.rc-filtro-tipo').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.rc-filtro-tipo').forEach(b => {
                    b.classList.remove('active', 'bg-slate-800', 'text-white');
                    b.classList.add('bg-white', 'text-slate-600');
                });
                btn.classList.add('active', 'bg-slate-800', 'text-white');
                btn.classList.remove('bg-white', 'text-slate-600');
                atualizar();
            });
        });

        // Colapsável por unidade
        document.querySelectorAll('.rc-toggle-unidade').forEach(btn => {
            btn.addEventListener('click', () => {
                const id   = btn.dataset.unidade;
                const body = document.querySelector(`.rc-unidade-body[data-unidade="${id}"]`);
                const chev = btn.querySelector('.rc-chevron');
                if (!body) return;
                const aberto = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', !aberto);
                body.style.display   = aberto ? 'none' : '';
                chev.style.transform = aberto ? 'rotate(-90deg)' : '';
            });
        });
    },

    // ─── RENDER DO PAINEL DE ADMIN ────────────────────────────────────────────
    // Layout em tabela com busca live e colunas responsivas.

    renderPainelAdmin(recepcoes, unidades) {
        const totalAtivas  = recepcoes.length;
        const totalCentral = recepcoes.filter(r => r.tipo === 'central').length;

        const linhas = recepcoes.map(rec => {
            const corConfig = CORES[rec.cor] || CORES.slate;
            const modoInfo  = MODOS_LABEL[rec.modoVisualizacao || 'fila'];
            const somAtivo  = rec.somPadrao !== false;
            return `
                <tr class="rc-admin-row border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    data-search="${[rec.nome, rec.unidadeNome || '', ...(rec.grupos || []), rec.andar || ''].join(' ').toLowerCase()}">
                    <td class="py-3 pl-4 pr-2">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <span class="text-xl flex-shrink-0">${rec.icone || '📋'}</span>
                            <div class="min-w-0">
                                <p class="font-bold text-slate-800 text-sm truncate max-w-[160px]">${rec.nome}</p>
                                <p class="text-[9px] text-slate-400 uppercase tracking-wider truncate max-w-[160px]">${rec.unidadeNome || ''} ${rec.andar ? '· ' + rec.andar : ''}</p>
                            </div>
                        </div>
                    </td>
                    <td class="py-3 px-2 hidden sm:table-cell">
                        <div class="flex flex-wrap gap-1">
                            ${(rec.grupos || []).slice(0, 3).map(g =>
                                `<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full ${corConfig.light} ${corConfig.text} border ${corConfig.border} uppercase">${g}</span>`
                            ).join('')}
                            ${(rec.grupos || []).length > 3 ? `<span class="text-[9px] text-slate-400">+${rec.grupos.length - 3}</span>` : ''}
                            ${(rec.grupos || []).length === 0 ? `<span class="text-[9px] text-slate-300 italic">—</span>` : ''}
                        </div>
                    </td>
                    <td class="py-3 px-2 hidden md:table-cell">
                        <span class="text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${rec.tipo === 'central' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}">
                            ${rec.tipo === 'central' ? '🏛️ Central' : '⚡ Espec.'}
                        </span>
                    </td>
                    <td class="py-3 px-2 hidden lg:table-cell">
                        <div class="flex items-center gap-1.5">
                            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">
                                ${modoInfo.icone} ${modoInfo.label}
                            </span>
                            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full ${somAtivo ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}">
                                ${somAtivo ? '🔔' : '🔇'}
                            </span>
                        </div>
                    </td>
                    <td class="py-3 pr-4 pl-2">
                        <div class="flex gap-1.5 justify-end">
                            <button class="btn-editar-recepcao p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition text-xs"
                                data-recepcao-id="${rec.id}" title="Editar">✏️</button>
                            <button class="btn-link-recepcao p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition text-xs"
                                data-recepcao-id="${rec.id}" title="Copiar link do painel">🔗</button>
                            <button class="btn-excluir-recepcao p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition text-xs"
                                data-recepcao-id="${rec.id}" data-nome="${rec.nome}" title="Desativar">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div class="flex-1">
                        <h3 class="font-black text-slate-800 text-lg">Gerenciar Recepções</h3>
                        <p class="text-xs text-slate-400 mt-0.5">${totalAtivas} ativas · ${totalCentral} central · ${totalAtivas - totalCentral} especializadas</p>
                    </div>
                    <button id="btn-nova-recepcao"
                        class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition shadow-sm flex-shrink-0">
                        + Nova Recepção
                    </button>
                </div>

                ${recepcoes.length === 0
                    ? `<div class="text-center py-12">
                           <p class="text-4xl mb-2">🏛️</p>
                           <p class="text-slate-400 text-sm font-semibold">Nenhuma recepção criada ainda.</p>
                       </div>`
                    : `
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
                        <input type="text" id="rc-admin-busca"
                            class="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400 placeholder:text-slate-300"
                            placeholder="Filtrar por nome, unidade ou grupo...">
                    </div>

                    <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b border-slate-100 bg-slate-50">
                                    <th class="py-2.5 pl-4 pr-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Recepção</th>
                                    <th class="py-2.5 px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Grupos</th>
                                    <th class="py-2.5 px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden md:table-cell">Tipo</th>
                                    <th class="py-2.5 px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden lg:table-cell">Painel</th>
                                    <th class="py-2.5 pr-4 pl-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="rc-admin-tbody">
                                ${linhas}
                            </tbody>
                        </table>
                        <div class="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                            <span id="rc-admin-count" class="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                                ${recepcoes.length} recepções
                            </span>
                            <span class="text-[9px] text-slate-300">🏛️ Central · ⚡ Especializada</span>
                        </div>
                    </div>
                    `
                }
            </div>
        `;
    },

    // ─── EVENTOS DO PAINEL ADMIN ──────────────────────────────────────────────
    // Chamar APÓS inserir o HTML do painel no DOM.

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
            if (count) count.textContent = `${visiveis} recepç${visiveis === 1 ? 'ão' : 'ões'}${q ? ' encontradas' : ''}`;
        });
    },

    // ─── RENDER DO FORMULÁRIO DE RECEPÇÃO ─────────────────────────────────────

    renderFormRecepcao(recepcao = null, unidades = []) {
        const isEdicao = !!recepcao;
        const titulo   = isEdicao ? 'Editar Recepção' : 'Nova Recepção';

        const coresHtml = Object.entries(CORES).map(([key, val]) => `
            <button type="button" class="color-option w-8 h-8 rounded-full ${val.bg} ring-offset-2 transition-transform hover:scale-110 ${recepcao?.cor === key ? 'ring-2 ring-offset-2 scale-110 shadow-md' : ''}"
                data-cor="${key}"></button>
        `).join('');

        const iconesHtml = Object.entries(ICONES_SUGERIDOS).map(([key, icone]) => `
            <button type="button" class="icone-option text-2xl p-2 rounded-xl hover:bg-slate-100 transition ${recepcao?.icone === icone ? 'bg-slate-100 ring-2 ring-slate-300' : ''}"
                data-icone="${icone}">${icone}</button>
        `).join('');

        const modoAtual = recepcao?.modoVisualizacao || 'fila';
        const somPadrao = recepcao?.somPadrao !== false;
        const videoUrl  = recepcao?.videoUrl || '';

        return `
            <div class="space-y-5">
                <h3 class="font-black text-slate-800 text-lg border-b pb-3">${titulo}</h3>

                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Nome da Recepção *</label>
                    <input type="text" id="form-rec-nome" value="${recepcao?.nome || ''}"
                        class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="Ex: Família - 2º Andar">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Unidade / DP *</label>
                        <input type="text" id="form-rec-unidade-nome" value="${recepcao?.unidadeNome || ''}"
                            class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="Ex: DP Duque de Caxias">
                        <input type="hidden" id="form-rec-unidade-id" value="${recepcao?.unidadeId || ''}">
                    </div>
                    <div>
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Andar / Localização</label>
                        <input type="text" id="form-rec-andar" value="${recepcao?.andar || ''}"
                            class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="Ex: 2º Andar">
                    </div>
                </div>

                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Tipo</label>
                    <div class="flex gap-3">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="form-rec-tipo" value="especializada"
                                ${!recepcao || recepcao.tipo === 'especializada' ? 'checked' : ''} class="text-green-600">
                            <span class="text-sm font-semibold text-slate-700">Especializada</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="form-rec-tipo" value="central"
                                ${recepcao?.tipo === 'central' ? 'checked' : ''} class="text-green-600">
                            <span class="text-sm font-semibold text-slate-700">Central (vê tudo)</span>
                        </label>
                    </div>
                </div>

                <div id="form-rec-grupos-wrap" ${recepcao?.tipo === 'central' ? 'class="hidden"' : ''}>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Grupos / Áreas (tags das pautas) *</label>
                    <p class="text-xs text-slate-400 mb-2">As pautas precisam ter o mesmo grupo para aparecer nesta recepção.</p>
                    <div class="flex gap-2 mb-2">
                        <input type="text" id="form-rec-grupo-input"
                            class="flex-1 p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="Ex: familia, civel, criminal...">
                        <button type="button" id="btn-add-grupo" class="bg-slate-800 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-slate-900 transition">
                            + Adicionar
                        </button>
                    </div>
                    <div id="form-rec-grupos-lista" class="flex flex-wrap gap-2 min-h-[32px]">
                        ${(recepcao?.grupos || []).map(g => `
                            <span class="bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                                ${g}
                                <button type="button" class="btn-remove-grupo text-slate-400 hover:text-red-500 transition font-black" data-grupo="${g}">×</button>
                            </span>
                        `).join('')}
                    </div>
                </div>

                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Ícone</label>
                    <div class="flex flex-wrap gap-1">${iconesHtml}</div>
                    <input type="hidden" id="form-rec-icone" value="${recepcao?.icone || ICONES_SUGERIDOS.default}">
                </div>

                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Cor</label>
                    <div class="flex gap-3 flex-wrap">${coresHtml}</div>
                    <input type="hidden" id="form-rec-cor" value="${recepcao?.cor || 'slate'}">
                </div>

                <div class="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <input type="checkbox" id="form-rec-vertudo" ${recepcao?.verTudo ? 'checked' : ''}
                        class="w-4 h-4 text-amber-600 rounded cursor-pointer">
                    <div>
                        <label for="form-rec-vertudo" class="text-sm font-bold text-amber-800 cursor-pointer">Ver todas as pautas da unidade</label>
                        <p class="text-[10px] text-amber-600">Ignora os grupos e mostra todas as pautas desta unidade.</p>
                    </div>
                </div>

                <!-- PAINEL PÚBLICO -->
                <div class="mt-2 pt-4 border-t-2 border-slate-100">
                    <div class="flex items-center gap-2 mb-4">
                        <span class="text-lg">📺</span>
                        <h4 class="text-sm font-black text-slate-800 uppercase tracking-widest">Painel Público da TV</h4>
                    </div>

                    <div class="mb-4">
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Modo de Visualização Padrão</label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <label class="flex items-center gap-2.5 p-3 border-2 rounded-xl cursor-pointer transition-all hover:border-slate-400
                                ${modoAtual === 'fila' ? 'border-slate-800 bg-slate-50' : 'border-slate-200 bg-white'}">
                                <input type="radio" name="form-rec-modo" value="fila"
                                    ${modoAtual === 'fila' ? 'checked' : ''} class="text-slate-800 w-4 h-4">
                                <div>
                                    <p class="text-xs font-black text-slate-800">📋 Fila (Lista)</p>
                                    <p class="text-[10px] text-slate-400 mt-0.5">Mostra a fila e chamados em cards</p>
                                </div>
                            </label>
                            <label class="flex items-center gap-2.5 p-3 border-2 rounded-xl cursor-pointer transition-all hover:border-green-400
                                ${modoAtual === 'tv' ? 'border-green-600 bg-green-50' : 'border-slate-200 bg-white'}">
                                <input type="radio" name="form-rec-modo" value="tv"
                                    ${modoAtual === 'tv' ? 'checked' : ''} class="text-green-600 w-4 h-4">
                                <div>
                                    <p class="text-xs font-black text-slate-800">📺 TV Chamados</p>
                                    <p class="text-[10px] text-slate-400 mt-0.5">Painel verde com histórico</p>
                                </div>
                            </label>
                            <label class="flex items-center gap-2.5 p-3 border-2 rounded-xl cursor-pointer transition-all hover:border-indigo-400
                                ${modoAtual === 'video' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'}">
                                <input type="radio" name="form-rec-modo" value="video"
                                    ${modoAtual === 'video' ? 'checked' : ''} class="text-indigo-600 w-4 h-4">
                                <div>
                                    <p class="text-xs font-black text-slate-800">🎬 TV + Vídeo</p>
                                    <p class="text-[10px] text-slate-400 mt-0.5">Vídeo + banner de chamado</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div class="mb-4" id="form-rec-video-wrap" style="${modoAtual !== 'video' ? 'display:none' : ''}">
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Link do YouTube / Vídeo</label>
                        <input type="text" id="form-rec-video" value="${videoUrl}"
                            class="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            placeholder="Ex: https://www.youtube.com/watch?v=...">
                        <p class="text-[10px] text-slate-400 mt-1">Cole o link do YouTube ou URL direta de um arquivo de vídeo (.mp4).</p>
                    </div>

                    <div class="mb-4">
                        <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Som ao Abrir o Painel</label>
                        <div class="flex gap-3">
                            <label class="flex items-center gap-2.5 flex-1 p-3 border-2 rounded-xl cursor-pointer transition-all
                                ${somPadrao ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-white'} hover:border-green-400">
                                <input type="radio" name="form-rec-som" value="ativo"
                                    ${somPadrao ? 'checked' : ''} class="text-green-600 w-4 h-4">
                                <div>
                                    <p class="text-xs font-black text-slate-800">🔔 Ativado</p>
                                    <p class="text-[10px] text-slate-400 mt-0.5">Toca ding-dong ao chamar</p>
                                </div>
                            </label>
                            <label class="flex items-center gap-2.5 flex-1 p-3 border-2 rounded-xl cursor-pointer transition-all
                                ${!somPadrao ? 'border-slate-500 bg-slate-50' : 'border-slate-200 bg-white'} hover:border-slate-400">
                                <input type="radio" name="form-rec-som" value="desligado"
                                    ${!somPadrao ? 'checked' : ''} class="text-slate-600 w-4 h-4">
                                <div>
                                    <p class="text-xs font-black text-slate-800">🔇 Desligado</p>
                                    <p class="text-[10px] text-slate-400 mt-0.5">Sem som automático</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    ${isEdicao ? `
                    <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Link do Painel Público</p>
                        <div class="flex gap-2 items-center">
                            <input type="text" id="form-rec-link-preview" readonly
                                class="flex-1 p-2 border border-slate-200 rounded-lg text-[10px] mono text-slate-500 bg-white truncate"
                                value="${this.gerarLinkPainel(recepcao)}">
                            <button type="button" id="btn-copiar-link-form"
                                class="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3 py-2 rounded-lg transition flex-shrink-0"
                                data-recepcao-id="${recepcao.id}">
                                🔗 Copiar
                            </button>
                        </div>
                        <p class="text-[9px] text-slate-400 mt-1.5">O link é atualizado automaticamente ao salvar as configurações.</p>
                    </div>
                    ` : `
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <p class="text-[10px] text-blue-600 font-bold">💡 O link do painel ficará disponível após criar a recepção.</p>
                    </div>
                    `}
                </div>

                <div class="flex gap-3 pt-2">
                    <button type="button" id="btn-cancelar-form-rec"
                        class="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition text-sm">
                        Cancelar
                    </button>
                    <button type="button" id="btn-salvar-recepcao"
                        class="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition text-sm shadow"
                        data-recepcao-id="${recepcao?.id || ''}">
                        ${isEdicao ? 'Salvar Alterações' : 'Criar Recepção'}
                    </button>
                </div>
            </div>
        `;
    },

    // ─── EVENTOS DO FORMULÁRIO ────────────────────────────────────────────────

    initFormRecepcaoEventos(onSalvar, onCancelar) {
        let gruposAtivos = [];

        document.querySelectorAll('#form-rec-grupos-lista span').forEach(span => {
            const g = span.querySelector('button')?.dataset?.grupo;
            if (g) gruposAtivos.push(g);
        });

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
            if (e.target.classList.contains('btn-remove-grupo')) {
                gruposAtivos = gruposAtivos.filter(x => x !== e.target.dataset.grupo);
                this._renderGruposLista(gruposAtivos);
            }
        });

        document.querySelectorAll('.icone-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.icone-option').forEach(b => b.classList.remove('bg-slate-100', 'ring-2', 'ring-slate-300'));
                btn.classList.add('bg-slate-100', 'ring-2', 'ring-slate-300');
                const inp = document.getElementById('form-rec-icone');
                if (inp) inp.value = btn.dataset.icone;
            });
        });

        document.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-option').forEach(b => b.classList.remove('ring-2', 'scale-110', 'shadow-md'));
                btn.classList.add('ring-2', 'scale-110', 'shadow-md');
                const inp = document.getElementById('form-rec-cor');
                if (inp) inp.value = btn.dataset.cor;
            });
        });

        document.querySelectorAll('input[name="form-rec-tipo"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const wrap = document.getElementById('form-rec-grupos-wrap');
                if (wrap) wrap.classList.toggle('hidden', radio.value === 'central' && radio.checked);
            });
        });

        document.querySelectorAll('input[name="form-rec-modo"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const videoWrap = document.getElementById('form-rec-video-wrap');
                if (videoWrap) videoWrap.style.display = radio.value === 'video' ? 'block' : 'none';

                document.querySelectorAll('input[name="form-rec-modo"]').forEach(r => {
                    const label = r.closest('label');
                    if (!label) return;
                    label.classList.remove(
                        'border-slate-800', 'bg-slate-50',
                        'border-green-600',  'bg-green-50',
                        'border-indigo-600', 'bg-indigo-50'
                    );
                    if (r.checked) {
                        if (r.value === 'fila')  label.classList.add('border-slate-800', 'bg-slate-50');
                        if (r.value === 'tv')    label.classList.add('border-green-600',  'bg-green-50');
                        if (r.value === 'video') label.classList.add('border-indigo-600', 'bg-indigo-50');
                    }
                });
            });
        });

        document.querySelectorAll('input[name="form-rec-som"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.querySelectorAll('input[name="form-rec-som"]').forEach(r => {
                    const label = r.closest('label');
                    if (!label) return;
                    label.classList.remove('border-green-500', 'bg-green-50', 'border-slate-500', 'bg-slate-50');
                    if (r.checked) {
                        if (r.value === 'ativo')     label.classList.add('border-green-500', 'bg-green-50');
                        if (r.value === 'desligado') label.classList.add('border-slate-500', 'bg-slate-50');
                    }
                });
            });
        });

        document.getElementById('btn-copiar-link-form')?.addEventListener('click', () => {
            const inp = document.getElementById('form-rec-link-preview');
            if (inp?.value) {
                navigator.clipboard.writeText(inp.value)
                    .then(() => showNotification("Link copiado!", "success"))
                    .catch(()  => showNotification("Não foi possível copiar.", "error"));
            }
        });

        document.getElementById('btn-cancelar-form-rec')?.addEventListener('click', onCancelar);

        document.getElementById('btn-salvar-recepcao')?.addEventListener('click', () => {
            const nome      = document.getElementById('form-rec-nome')?.value.trim();
            const unidNome  = document.getElementById('form-rec-unidade-nome')?.value.trim();
            const unidadeId = document.getElementById('form-rec-unidade-id')?.value
                || unidNome?.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            const andar     = document.getElementById('form-rec-andar')?.value.trim();
            const tipo      = document.querySelector('input[name="form-rec-tipo"]:checked')?.value || 'especializada';
            const icone     = document.getElementById('form-rec-icone')?.value || ICONES_SUGERIDOS.default;
            const cor       = document.getElementById('form-rec-cor')?.value || 'slate';
            const verTudo   = document.getElementById('form-rec-vertudo')?.checked || false;
            const recepcaoId = document.getElementById('btn-salvar-recepcao')?.dataset.recepcaoId || '';

            const modoVisualizacao = document.querySelector('input[name="form-rec-modo"]:checked')?.value || 'fila';
            const videoUrl         = document.getElementById('form-rec-video')?.value.trim() || '';
            const somPadrao        = document.querySelector('input[name="form-rec-som"]:checked')?.value !== 'desligado';

            if (!nome || !unidNome) {
                showNotification("Preencha o Nome e a Unidade.", "error");
                return;
            }
            if (tipo === 'especializada' && gruposAtivos.length === 0 && !verTudo) {
                showNotification("Adicione ao menos um grupo para recepção especializada.", "error");
                return;
            }
            if (modoVisualizacao === 'video' && !videoUrl) {
                showNotification("Informe o link do vídeo para o modo TV + Vídeo.", "error");
                return;
            }

            onSalvar({
                id: recepcaoId || undefined,
                nome, unidadeNome: unidNome, unidadeId, andar, tipo,
                grupos: gruposAtivos, icone, cor, verTudo,
                modoVisualizacao, videoUrl, somPadrao,
            }, recepcaoId);
        });
    },

    _renderGruposLista(grupos) {
        const lista = document.getElementById('form-rec-grupos-lista');
        if (!lista) return;
        lista.innerHTML = grupos.map(g => `
            <span class="bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                ${g}
                <button type="button" class="btn-remove-grupo text-slate-400 hover:text-red-500 transition font-black" data-grupo="${g}">×</button>
            </span>
        `).join('');
    },

    // ─── HELPERS PARA recepcaoCentral.js ──────────────────────────────────────

    getRecepcoesDoUsuario(currentUser) {
        return this._cache?.recepcoes || [];
    },

    async carregarRecepcoes(db, userId, role) {
        const recepcoes = await this.buscarRecepcoesDoUsuario(db, userId, role);
        this._cache = { recepcoes, carregadoEm: Date.now() };
        return recepcoes;
    },

    getUnidadePorRecepcao(recepcaoId) {
        const rec = (this._cache?.recepcoes || []).find(r => r.id === recepcaoId);
        if (!rec) return null;
        return { recepcao: rec, unidade: { id: rec.unidadeId, nome: rec.unidadeNome } };
    },

    // ─── VINCULAÇÃO DE PAUTA A RECEPÇÃO ───────────────────────────────────────

    async vincularPautaRecepcao(db, pautaId, grupoRecepcao, unidadeId) {
        try {
            await updateDoc(doc(db, "pautas", pautaId), { grupoRecepcao, unidadeId });
            return true;
        } catch (err) {
            console.error("Erro ao vincular pauta à recepção:", err);
            return false;
        }
    },

    // ─── CONSTANTES EXPORTADAS ────────────────────────────────────────────────

    CORES,
    ICONES_SUGERIDOS,
    MODOS_LABEL,
    _cache: null,
};

export default RecepcaoConfigService;
