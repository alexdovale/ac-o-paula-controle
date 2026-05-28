// js/recepcaoConfig.js - CONFIGURAÇÃO HIERÁRQUICA DE RECEPÇÕES (SIGEP)
// Responsabilidades:
// - Definir estrutura de unidades, andares, recepções e grupos de pautas
// - Controlar quem vê o quê (isolamento total entre recepções)
// - Salvar/carregar configurações no Firestore
// - Renderizar seletores hierárquicos
// - Filtrar pautas por recepção

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
//     cor: "bg-rose-700"
//     unidadeId: "dp-duque-caxias"
//     unidadeNome: "Defensoria Duque de Caxias"
//     andar: "2º Andar"
//     tipo: "especializada"  // 'central' | 'especializada'
//     grupos: ["familia", "cejusc"]   // tags que as pautas devem ter
//     membros: ["uid1", "uid2"]        // usuários com acesso
//     verTudo: false                   // se true, vê todas as pautas da unidade
//     ativo: true
//     criadoPor: "uid"
//     criadoEm: timestamp
//
// Pautas precisam ter o campo:
//   grupoRecepcao: "familia"   // tag que vincula à recepção
//   unidadeId: "dp-duque-caxias"
// ──────────────────────────────────────────────────────────────────────────────

// Cores disponíveis para recepções
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

// Ícones sugeridos por área
const ICONES_SUGERIDOS = {
    familia:  '👨‍👩‍👧',
    civel:    '⚖️',
    criminal: '🔫',
    infancia: '🧒',
    fazenda:  '🏛️',
    cejusc:   '🤝',
    default:  '📋',
};

export const RecepcaoConfigService = {

    // ─── CRUD DE RECEPÇÕES ────────────────────────────────────────────────────

    /**
     * Cria uma nova recepção no Firestore.
     */
    async criarRecepcao(db, dados, criadorUid) {
        try {
            const id = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const recepcao = {
                id,
                nome:        dados.nome,
                icone:       dados.icone || ICONES_SUGERIDOS.default,
                cor:         dados.cor || 'slate',
                unidadeId:   dados.unidadeId,
                unidadeNome: dados.unidadeNome,
                andar:       dados.andar || '',
                tipo:        dados.tipo || 'especializada',
                grupos:      dados.grupos || [],
                membros:     dados.membros || [criadorUid],
                verTudo:     dados.verTudo || false,
                ativo:       true,
                criadoPor:   criadorUid,
                criadoEm:    new Date().toISOString(),
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

    /**
     * Atualiza uma recepção existente.
     */
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

    /**
     * Exclui (desativa) uma recepção.
     */
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

    /**
     * Busca todas as recepções ativas de uma unidade (com query otimizada).
     */
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

    /**
     * Busca todas as recepções às quais um usuário tem acesso.
     */
    async buscarRecepcoesDoUsuario(db, userId, role) {
        try {
            const snap = await getDocs(collection(db, "recepcoes"));
            const todas = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.ativo === true); // Padronizado com === true

            if (role === 'superadmin') return todas;

            return todas.filter(r =>
                r.membros?.includes(userId) ||
                r.tipo === 'central' ||
                role === 'admin'
            );
        } catch (err) {
            console.error("Erro ao buscar recepções do usuário:", err);
            return [];
        }
    },

    /**
     * Inicia cache em tempo real com onSnapshot.
     * Retorna função de unsubscribe para limpar quando necessário.
     */
    iniciarCache(db, userId, role, onChange) {
        return onSnapshot(collection(db, "recepcoes"), (snap) => {
            const todas = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.ativo === true);
            
            this._cache = {
                recepcoes: role === 'superadmin' ? todas : todas.filter(r =>
                    r.membros?.includes(userId) || r.tipo === 'central' || role === 'admin'
                ),
                carregadoEm: Date.now()
            };
            
            onChange?.(this._cache.recepcoes);
        });
    },

    /**
     * Adiciona um membro a uma recepção.
     */
    async adicionarMembro(db, recepcaoId, userId) {
        try {
            const ref = doc(db, "recepcoes", recepcaoId);
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

    /**
     * Remove um membro de uma recepção.
     */
    async removerMembro(db, recepcaoId, userId) {
        try {
            const ref = doc(db, "recepcoes", recepcaoId);
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

    // ─── FILTRAGEM DE PAUTAS ──────────────────────────────────────────────────

    /**
     * Filtra uma lista de pautas pela recepção selecionada.
     * Usa o campo `grupoRecepcao` das pautas para cruzar com os `grupos` da recepção.
     * Pautas sem `grupoRecepcao` só aparecem em recepções `verTudo` ou `central`.
     */
    filtrarPautasPorRecepcao(pautas, recepcao) {
        if (!recepcao) return pautas;

        // Recepção central ou verTudo: vê tudo da unidade
        if (recepcao.tipo === 'central' || recepcao.verTudo === true) {
            if (recepcao.unidadeId) {
                return pautas.filter(p =>
                    !p.unidadeId || p.unidadeId === recepcao.unidadeId
                );
            }
            return pautas;
        }

        // Recepção especializada: filtra pelos grupos
        const grupos = recepcao.grupos || [];
        if (grupos.length === 0) return pautas;

        return pautas.filter(p => {
            if (!p.grupoRecepcao) return false;
            // Suporta tanto string quanto array
            if (Array.isArray(p.grupoRecepcao)) {
                return p.grupoRecepcao.some(g => grupos.includes(g));
            }
            return grupos.includes(p.grupoRecepcao);
        });
    },

    // ─── CONTEXTO VISUAL DA RECEPÇÃO ──────────────────────────────────────────

    /**
     * Retorna os dados visuais de uma recepção para o header da tela.
     */
    getContextoRecepcao(recepcao) {
        if (!recepcao) {
            return {
                icone: '🏛️',
                titulo: 'Recepção',
                subtitulo: '',
                cor: 'bg-slate-800',
            };
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

    // ─── RENDER DO SELETOR HIERÁRQUICO (VERSÃO COMPACTADA) ────────────────────

    /**
     * Renderiza o HTML do seletor de recepções agrupado por unidade.
     * Versão compactada: agrupa por região, mostra unidades com poucas recepções em linha horizontal
     */
    renderSelectorRecepcoes(recepcoes) {
        if (!recepcoes || recepcoes.length === 0) {
            return `<p class="text-center text-slate-400 py-8">Nenhuma recepção disponível.</p>`;
        }

        // Agrupar por unidade
        const porUnidade = {};
        for (const rec of recepcoes) {
            const key = rec.unidadeId || 'sem_unidade';
            if (!porUnidade[key]) {
                porUnidade[key] = {
                    nome: rec.unidadeNome || 'Sem Unidade',
                    recepcoes: [],
                };
            }
            porUnidade[key].recepcoes.push(rec);
        }

        // Extrair região do nome da unidade (padrão: "1º Núcleo Regional... - Região Norte Fluminense")
        const extrairRegiao = (unidadeNome) => {
            const match = unidadeNome?.match(/- (Região .+)$/);
            return match ? match[1] : 'Outras Regiões';
        };

        // Agrupar unidades por região
        const porRegiao = {};
        for (const [unidadeId, unidade] of Object.entries(porUnidade)) {
            const regiao = extrairRegiao(unidade.nome);
            if (!porRegiao[regiao]) porRegiao[regiao] = [];
            porRegiao[regiao].push({ id: unidadeId, ...unidade });
        }

        let html = `
            <div class="max-w-6xl mx-auto">
                <div class="text-center mb-8">
                    <h2 class="text-2xl font-black text-slate-800 uppercase tracking-tight">🏛️ Selecionar Recepção</h2>
                    <p class="text-slate-500 text-sm mt-1">Escolha a recepção que deseja gerenciar hoje</p>
                </div>
        `;

        for (const [regiaoNome, unidades] of Object.entries(porRegiao)) {
            html += `
                <div class="mb-10">
                    <h3 class="text-xs font-black text-amber-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span class="w-8 h-px bg-amber-300"></span>
                        📍 ${regiaoNome}
                        <span class="w-8 h-px bg-amber-300 flex-1"></span>
                    </h3>
            `;

            for (const unidade of unidades) {
                const qtdeRecs = unidade.recepcoes.length;
                const isPoucasRecs = qtdeRecs <= 2;
                
                if (isPoucasRecs) {
                    // Formato compacto: linha horizontal
                    html += `
                        <div class="mb-4">
                            <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 pl-1">${unidade.nome}</h4>
                            <div class="flex flex-wrap gap-2">
                    `;
                    for (const rec of unidade.recepcoes) {
                        html += this._cardSelectorCompacto(rec);
                    }
                    html += `</div></div>`;
                } else {
                    // Formato expandido: grid para unidades com muitas recepções
                    html += `
                        <div class="mb-6">
                            <h4 class="text-sm font-bold text-slate-600 mb-3 pl-1 border-l-4 border-amber-400">${unidade.nome}</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    `;
                    for (const rec of unidade.recepcoes) {
                        html += this._cardSelectorRecepcao(rec);
                    }
                    html += `</div></div>`;
                }
            }
            html += `</div>`;
        }

        // Guia por tipo no rodapé
        html += `
            <div class="mt-10 pt-6 border-t border-slate-200">
                <p class="text-[10px] text-slate-400 text-center uppercase tracking-wider font-semibold">
                    📋 Recepções Especializadas · 🏛️ Recepções Centrais
                </p>
            </div>
        </div>`;
        
        return html;
    },

    /**
     * Card compacto para unidades com poucas recepções (formato linha horizontal)
     */
    _cardSelectorCompacto(rec) {
        const corConfig = CORES[rec.cor] || CORES.slate;
        return `
            <button class="rc-selector-recepcao group flex items-center gap-2 bg-white border ${corConfig.border} hover:${corConfig.bg} rounded-full px-4 py-2 shadow-sm hover:shadow-md transition-all duration-200"
                data-recepcao-id="${rec.id}"
                data-unidade-id="${rec.unidadeId}">
                <span class="text-xl group-hover:scale-110 transition-transform">${rec.icone || ICONES_SUGERIDOS.default}</span>
                <span class="font-bold text-sm text-slate-700 group-hover:text-white truncate max-w-[150px]">${rec.nome}</span>
                ${rec.tipo === 'central' ? '<span class="text-[10px] ml-1">🏛️</span>' : ''}
            </button>
        `;
    },

    /**
     * Card padrão para unidades com muitas recepções (formato grid)
     */
    _cardSelectorRecepcao(rec) {
        const corConfig = CORES[rec.cor] || CORES.slate;
        const tipoTag = rec.tipo === 'central' 
            ? '<span class="text-[8px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Central</span>'
            : '';
        
        return `
            <button class="rc-selector-recepcao group text-left bg-white border-2 ${corConfig.border} hover:${corConfig.bg} rounded-2xl p-4 shadow-sm hover:shadow-lg transition-all duration-200"
                data-recepcao-id="${rec.id}"
                data-unidade-id="${rec.unidadeId}">
                <div class="flex items-start gap-3">
                    <span class="text-3xl group-hover:scale-110 transition-transform">${rec.icone || ICONES_SUGERIDOS.default}</span>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <p class="font-black text-slate-800 group-hover:text-white text-base truncate">${rec.nome}</p>
                            ${tipoTag}
                        </div>
                        ${rec.andar ? `<p class="text-[10px] font-bold text-slate-400 group-hover:text-white/70 uppercase tracking-wider mt-0.5">${rec.andar}</p>` : ''}
                        ${rec.grupos && rec.grupos.length > 0 ? `
                            <div class="flex flex-wrap gap-1 mt-2">
                                ${rec.grupos.map(g => this._tagGrupo(g, corConfig)).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </button>
        `;
    },

    /**
     * Tag de grupo para exibição nos cards
     */
    _tagGrupo(grupo, corConfig) {
        return `
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${corConfig.light} ${corConfig.text} group-hover:bg-white/20 group-hover:text-white border ${corConfig.border} group-hover:border-white/30 transition-colors uppercase">
                ${grupo}
            </span>
        `;
    },

    // ─── RENDER DO PAINEL DE CONFIGURAÇÃO (para Admin) ────────────────────────

    /**
     * Renderiza o painel de gerenciamento de recepções (para admins).
     * Deve ser chamado dentro de uma modal ou tela dedicada.
     */
    renderPainelAdmin(recepcoes, unidades) {
        return `
            <div class="space-y-4">
                <div class="flex justify-between items-center">
                    <h3 class="font-black text-slate-800 text-lg">Gerenciar Recepções</h3>
                    <button id="btn-nova-recepcao" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition shadow">
                        + Nova Recepção
                    </button>
                </div>

                ${recepcoes.length === 0
                    ? `<p class="text-slate-400 text-sm text-center py-8">Nenhuma recepção criada ainda.</p>`
                    : recepcoes.map(rec => {
                        const corConfig = CORES[rec.cor] || CORES.slate;
                        return `
                            <div class="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm">
                                <div class="flex items-center gap-3 min-w-0">
                                    <span class="text-2xl">${rec.icone || '📋'}</span>
                                    <div class="min-w-0">
                                        <p class="font-bold text-slate-800 truncate">${rec.nome}</p>
                                        <p class="text-[10px] text-slate-400 uppercase tracking-wider">${rec.unidadeNome || ''} ${rec.andar ? '· ' + rec.andar : ''}</p>
                                        <div class="flex flex-wrap gap-1 mt-1">
                                            ${(rec.grupos || []).map(g => `<span class="text-[9px] px-1.5 py-0.5 rounded ${corConfig.light} ${corConfig.text} border ${corConfig.border} font-bold uppercase">${g}</span>`).join('')}
                                        </div>
                                    </div>
                                </div>
                                <div class="flex gap-2 shrink-0">
                                    <button class="btn-editar-recepcao bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg transition"
                                        data-recepcao-id="${rec.id}">✏️ Editar</button>
                                    <button class="btn-excluir-recepcao bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs px-3 py-1.5 rounded-lg transition"
                                        data-recepcao-id="${rec.id}" data-nome="${rec.nome}">🗑️</button>
                                </div>
                            </div>
                        `;
                    }).join('')
                }
            </div>
        `;
    },

    /**
     * Renderiza o formulário de criação/edição de recepção.
     */
    renderFormRecepcao(recepcao = null, unidades = []) {
        const isEdicao = !!recepcao;
        const titulo = isEdicao ? 'Editar Recepção' : 'Nova Recepção';

        const coresHtml = Object.entries(CORES).map(([key, val]) => `
            <button type="button" class="color-option w-8 h-8 rounded-full ${val.bg} ring-offset-2 transition-transform hover:scale-110 ${recepcao?.cor === key ? 'ring-2 ring-offset-2 scale-110 shadow-md' : ''}"
                data-cor="${key}"></button>
        `).join('');

        const iconesHtml = Object.entries(ICONES_SUGERIDOS).map(([key, icone]) => `
            <button type="button" class="icone-option text-2xl p-2 rounded-xl hover:bg-slate-100 transition ${recepcao?.icone === icone ? 'bg-slate-100 ring-2 ring-slate-300' : ''}"
                data-icone="${icone}">${icone}</button>
        `).join('');

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
                            <input type="radio" name="form-rec-tipo" value="especializada" ${!recepcao || recepcao.tipo === 'especializada' ? 'checked' : ''} class="text-green-600">
                            <span class="text-sm font-semibold text-slate-700">Especializada</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="form-rec-tipo" value="central" ${recepcao?.tipo === 'central' ? 'checked' : ''} class="text-green-600">
                            <span class="text-sm font-semibold text-slate-700">Central (vê tudo)</span>
                        </label>
                    </div>
                </div>

                <div id="form-rec-grupos-wrap">
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                        Grupos / Áreas (tags das pautas) *
                    </label>
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

                <div class="flex gap-3 pt-2">
                    <button type="button" id="btn-cancelar-form-rec" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm">
                        Cancelar
                    </button>
                    <button type="button" id="btn-salvar-recepcao" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition text-sm shadow"
                        data-recepcao-id="${recepcao?.id || ''}">
                        ${isEdicao ? 'Salvar Alterações' : 'Criar Recepção'}
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Inicializa os eventos do formulário de recepção.
     * Chamar depois de renderizar com renderFormRecepcao().
     */
    initFormRecepcaoEventos(onSalvar, onCancelar) {
        let gruposAtivos = [];

        // Ler grupos existentes do DOM
        document.querySelectorAll('#form-rec-grupos-lista span').forEach(span => {
            const g = span.querySelector('button')?.dataset?.grupo;
            if (g) gruposAtivos.push(g);
        });

        // Adicionar grupo
        document.getElementById('btn-add-grupo')?.addEventListener('click', () => {
            const input = document.getElementById('form-rec-grupo-input');
            const val = input.value.trim().toLowerCase().replace(/\s+/g, '_');
            if (!val || gruposAtivos.includes(val)) {
                if (gruposAtivos.includes(val)) showNotification("Grupo já adicionado.", "warning");
                return;
            }
            gruposAtivos.push(val);
            this._renderGruposLista(gruposAtivos);
            input.value = '';
            input.focus();
        });

        document.getElementById('form-rec-grupo-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('btn-add-grupo')?.click();
            }
        });

        // Remover grupo (delegação)
        document.getElementById('form-rec-grupos-lista')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-grupo')) {
                const g = e.target.dataset.grupo;
                gruposAtivos = gruposAtivos.filter(x => x !== g);
                this._renderGruposLista(gruposAtivos);
            }
        });

        // Selecionar ícone
        document.querySelectorAll('.icone-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.icone-option').forEach(b => b.classList.remove('bg-slate-100', 'ring-2', 'ring-slate-300'));
                btn.classList.add('bg-slate-100', 'ring-2', 'ring-slate-300');
                const input = document.getElementById('form-rec-icone');
                if (input) input.value = btn.dataset.icone;
            });
        });

        // Selecionar cor
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-option').forEach(b => b.classList.remove('ring-2', 'scale-110', 'shadow-md'));
                btn.classList.add('ring-2', 'scale-110', 'shadow-md');
                const input = document.getElementById('form-rec-cor');
                if (input) input.value = btn.dataset.cor;
            });
        });

        // Tipo: esconde grupos se for central
        document.querySelectorAll('input[name="form-rec-tipo"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const wrap = document.getElementById('form-rec-grupos-wrap');
                if (wrap) wrap.classList.toggle('hidden', radio.value === 'central' && radio.checked);
            });
        });

        // Cancelar
        document.getElementById('btn-cancelar-form-rec')?.addEventListener('click', onCancelar);

        // Salvar
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

            if (!nome || !unidNome) {
                showNotification("Preencha o Nome e a Unidade.", "error");
                return;
            }
            if (tipo === 'especializada' && gruposAtivos.length === 0 && !verTudo) {
                showNotification("Adicione ao menos um grupo para recepção especializada.", "error");
                return;
            }

            const dados = {
                id:          recepcaoId || undefined,
                nome,
                unidadeNome: unidNome,
                unidadeId,
                andar,
                tipo,
                grupos:      gruposAtivos,
                icone,
                cor,
                verTudo,
            };

            onSalvar(dados, recepcaoId);
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

    // ─── HELPERS PARA O recepcaoCentral.js ────────────────────────────────────

    /**
     * Retorna as recepções do usuário de forma síncrona (cache local).
     * Use buscarRecepcoesDoUsuario() para busca assíncrona no Firestore.
     */
    getRecepcoesDoUsuario(currentUser) {
        // Retorna do cache se disponível
        return this._cache?.recepcoes || [];
    },

    /**
     * Carrega e cacheia as recepções do usuário.
     * Deve ser chamado durante a inicialização.
     */
    async carregarRecepcoes(db, userId, role) {
        const recepcoes = await this.buscarRecepcoesDoUsuario(db, userId, role);
        this._cache = { recepcoes, carregadoEm: Date.now() };
        return recepcoes;
    },

    getUnidadePorRecepcao(recepcaoId) {
        const rec = (this._cache?.recepcoes || []).find(r => r.id === recepcaoId);
        if (!rec) return null;
        return {
            recepcao: rec,
            unidade: { id: rec.unidadeId, nome: rec.unidadeNome },
        };
    },

    // ─── VINCULAÇÃO DE PAUTA A RECEPÇÃO ───────────────────────────────────────

    /**
     * Atualiza o grupoRecepcao e unidadeId de uma pauta.
     * Chamado no pautaConfig.js ao criar ou editar uma pauta.
     */
    async vincularPautaRecepcao(db, pautaId, grupoRecepcao, unidadeId) {
        try {
            await updateDoc(doc(db, "pautas", pautaId), {
                grupoRecepcao,
                unidadeId,
            });
            return true;
        } catch (err) {
            console.error("Erro ao vincular pauta à recepção:", err);
            return false;
        }
    },

    // ─── CONSTANTES EXPORTADAS ────────────────────────────────────────────────

    CORES,
    ICONES_SUGERIDOS,

    // Cache interno
    _cache: null,
};

export default RecepcaoConfigService;
