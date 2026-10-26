// js/permissoes.js - PERMISSÕES POR PERFIL (SIGEP)
// O administrador define, por perfil, o que aparece nos menus (dentro e fora da pauta).
// A configuração fica no Firestore: config_permissoes/{orgaoId}
// Superadmin e Superadmin Global sempre enxergam tudo.

import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';
import { ico } from './icons.js';

// Perfis configuráveis (superadmins não entram: têm acesso total)
export const PERFIS = [
    { id: 'user',  label: 'Usuário' },
    { id: 'apoio', label: 'Apoio' },
    { id: 'admin', label: 'Administrador' }
];

const TODOS = { user: true, apoio: true, admin: true };

// Catálogo de tudo que pode ser liberado/bloqueado.
// ids: elementos da tela que somem quando o perfil não tem permissão.
export const CATALOGO = [
    {
        grupo: 'Telas e módulos',
        descricao: 'Botões e áreas que ficam fora da pauta.',
        itens: [
            { key: 'adminPanel',      icone: 'shield',   label: 'Painel Administrador',  desc: 'Usuários, unidades, recepções e auditoria.', ids: ['admin-panel-btn', 'admin-btn-main'], padrao: { user: false, apoio: false, admin: true }, fixo: { admin: true } },
            { key: 'modColetas',      icone: 'clipboard', label: 'Módulo Coletas',        desc: 'Formulários e coletas estatísticas (BI).',   ids: ['btn-modulo-coletas'] },
            { key: 'recepcaoCentral', icone: 'building', label: 'Recepção Central',      desc: 'Visão geral da recepção e chegadas.',        ids: ['btn-recepcao-central'] },
            { key: 'dashboard',       icone: 'chart',    label: 'Dashboard',             desc: 'Indicadores gerais das pautas.',             ids: ['view-dashboard-btn'] }
        ]
    },
    {
        grupo: 'Menu de Ações (dentro da pauta)',
        descricao: 'Itens do menu Ações que aparece ao abrir uma pauta.',
        itens: [
            { key: 'monitorEquipe',  icone: 'users',     label: 'Monitor da equipe',        desc: 'Painel geral da equipe e dos atendimentos.', ids: ['btn-painel-geral-externo'] },
            { key: 'monitorGlobal',  icone: 'activity',  label: 'Monitor da pauta (global)', desc: 'Acompanhamento geral e histórico.',          ids: ['btn-monitor-pauta-global'] },
            { key: 'linkPublico',    icone: 'link',      label: 'Link público',             desc: 'Compartilhar acompanhamento da pauta.',      ids: ['share-pauta-btn'] },
            { key: 'totem',          icone: 'smartphone', label: 'Totem de autoatendimento', desc: 'Abrir o totem de chegada.',                  ids: ['open-totem-btn'] },
            { key: 'estatisticas',   icone: 'chart',     label: 'Estatísticas e relatórios', desc: 'Resumos e PDFs da pauta.',                  ids: ['view-stats-btn'] },
            { key: 'renomearPauta',  icone: 'pencil',    label: 'Renomear pauta',           desc: 'Alterar o nome da pauta.',                   ids: ['edit-pauta-name-btn'] },
            { key: 'configPauta',    icone: 'settings',  label: 'Configurações da pauta',   desc: 'Tolerância, fluxos, BI e links.',            ids: ['edit-pauta-config-btn'] },
            { key: 'membros',        icone: 'userPlus',  label: 'Convidar membros',         desc: 'Gerenciar quem acessa a pauta.',             ids: ['manage-members-btn'] },
            { key: 'colaboradores',  icone: 'briefcase', label: 'Colaboradores e presença', desc: 'Equipe, presença e ata social.',             ids: ['manage-collaborators-btn'] },
            { key: 'anotacoes',      icone: 'fileText',  label: 'Anotações',                desc: 'Bloco de notas da pauta.',                   ids: ['notes-btn'] },
            { key: 'painelTv',       icone: 'tv',        label: 'Painel da TV / Fila',      desc: 'Local de chamada e configuração da TV.',     ids: ['tv-panel-actions-group'] }
        ]
    },
    {
        grupo: 'Ações sensíveis da pauta',
        descricao: 'Operações que alteram ou encerram a pauta.',
        itens: [
            { key: 'fecharPauta',    icone: 'lock',      label: 'Fechar e reabrir pauta',   desc: 'Encerrar ou reabrir (exige senha do dono).', ids: ['close-pauta-btn', 'reopen-pauta-btn'] },
            { key: 'zerarPauta',     icone: 'trash',     label: 'Zerar pauta',              desc: 'Apagar todos os atendimentos.',              ids: ['reset-all-btn'], padrao: { user: true, apoio: false, admin: true } },
            { key: 'voltarAtendido', icone: 'arrowLeft', label: 'Voltar assistido atendido', desc: 'Devolver o atendido para a etapa anterior.', ids: [], padrao: { user: true, apoio: false, admin: true } }
        ]
    }
];

const INDICE = {};
CATALOGO.forEach(g => g.itens.forEach(i => { INDICE[i.key] = i; }));

const perfilDe = (role) => (role === 'admin' ? 'admin' : role === 'apoio' ? 'apoio' : 'user');
const ehSuper = (role) => role === 'superadmin' || role === 'superadmin_global';

export const PermissoesService = {
    config: null,          // { perfis: { user:{}, apoio:{}, admin:{} } }
    _unsub: null,
    _orgao: null,

    // ---------- leitura ----------
    padrao(key, perfil) {
        const item = INDICE[key];
        return (item?.padrao || TODOS)[perfil] ?? true;
    },

    can(user, key) {
        const role = user?.role;
        if (ehSuper(role)) return true;
        if (!role || role === 'suspended') return false;
        const item = INDICE[key];
        if (!item) return true;
        const perfil = perfilDe(role);
        if (item.fixo && item.fixo[perfil] !== undefined) return item.fixo[perfil];
        const salvo = this.config?.perfis?.[perfil]?.[key];
        return salvo !== undefined ? !!salvo : this.padrao(key, perfil);
    },

    // ---------- carga e aplicação na tela ----------
    async carregar(app) {
        const orgaoId = app?.currentUser?.orgaoId || 'padrao_dprj';
        if (this._unsub && this._orgao === orgaoId) { this.aplicarUI(app.currentUser); return; }
        if (this._unsub) { this._unsub(); this._unsub = null; }
        this._orgao = orgaoId;
        try {
            const ref = doc(app.db, 'config_permissoes', orgaoId);
            const snap = await getDoc(ref);
            this.config = snap.exists() ? snap.data() : null;
            // Atualiza ao vivo quando o admin altera a matriz
            this._unsub = onSnapshot(ref, (s) => {
                this.config = s.exists() ? s.data() : null;
                this.aplicarUI(app.currentUser);
            }, () => { });
        } catch (e) {
            console.warn('Permissões: usando padrões (sem acesso à configuração).', e?.code || e);
            this.config = null;
        }
        this.aplicarUI(app.currentUser);
    },

    _estilo() {
        if (document.getElementById('perm-style')) return;
        const s = document.createElement('style');
        s.id = 'perm-style';
        s.textContent = '.perm-blocked{display:none !important}';
        document.head.appendChild(s);
    },

    // Esconde (ou mostra) os elementos de cada permissão. Pode ser chamado quantas vezes quiser.
    aplicarUI(user) {
        this._estilo();
        CATALOGO.forEach(g => g.itens.forEach(item => {
            const liberado = this.can(user, item.key);
            (item.ids || []).forEach(id => document.getElementById(id)?.classList.toggle('perm-blocked', !liberado));
        }));
    },

    limpar() {
        if (this._unsub) { this._unsub(); this._unsub = null; }
        this.config = null; this._orgao = null;
    },

    // ---------- tela do Administrador ----------
    async salvar(app, perfis) {
        const orgaoId = app?.currentUser?.orgaoId || 'padrao_dprj';
        const dados = {
            perfis,
            orgaoId,
            atualizadoEm: new Date().toISOString(),
            atualizadoPor: app?.currentUser?.email || app?.auth?.currentUser?.email || ''
        };
        await setDoc(doc(app.db, 'config_permissoes', orgaoId), dados);
        this.config = dados;
        this.aplicarUI(app.currentUser);
    },

    renderAdmin(container, app) {
        if (!container) return;
        const efetivo = (key, perfil) => {
            const item = INDICE[key];
            if (item.fixo && item.fixo[perfil] !== undefined) return item.fixo[perfil];
            const salvo = this.config?.perfis?.[perfil]?.[key];
            return salvo !== undefined ? !!salvo : this.padrao(key, perfil);
        };

        const toggle = (key, perfil) => {
            const item = INDICE[key];
            const travado = item.fixo && item.fixo[perfil] !== undefined;
            return `
                <label class="relative inline-block w-10 h-5 ${travado ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}" title="${travado ? 'Bloqueado pelo sistema' : ''}">
                    <input type="checkbox" class="perm-check sr-only peer" data-key="${key}" data-perfil="${perfil}" ${efetivo(key, perfil) ? 'checked' : ''} ${travado ? 'disabled' : ''}>
                    <span class="absolute inset-0 rounded-full bg-slate-300 peer-checked:bg-emerald-500 transition-colors"></span>
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
                </label>`;
        };

        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-3">
                    <div class="mr-auto">
                        <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2"><span class="text-slate-500">${ico('shield', 'w-[18px] h-[18px]')}</span> Permissões por perfil</h3>
                        <p class="text-xs text-slate-500 mt-0.5">Defina o que cada perfil enxerga nos menus. Superadmins sempre têm acesso total.</p>
                    </div>
                    <button id="perm-restaurar" class="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold px-3 py-2 rounded-lg text-xs border border-slate-200 transition">${ico('refresh', 'w-3.5 h-3.5')} Restaurar padrão</button>
                    <button id="perm-salvar" class="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold px-4 py-2 rounded-lg text-xs transition shadow-sm">${ico('check', 'w-3.5 h-3.5')} Salvar permissões</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                        <thead class="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50">
                            <tr>
                                <th class="text-left px-5 py-2.5 font-bold">Recurso</th>
                                ${PERFIS.map(p => `<th class="px-3 py-2.5 font-bold text-center w-28">${p.label}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${CATALOGO.map(g => `
                                <tr><td colspan="${PERFIS.length + 1}" class="px-5 py-2 bg-slate-100/70 border-y border-slate-200">
                                    <span class="font-black text-slate-700 text-[11px] uppercase tracking-wide">${escapeHTML(g.grupo)}</span>
                                    <span class="text-slate-400 font-normal normal-case ml-2">${escapeHTML(g.descricao)}</span>
                                </td></tr>
                                ${g.itens.map(i => `
                                    <tr class="border-b border-slate-100 hover:bg-slate-50/60">
                                        <td class="px-5 py-3">
                                            <div class="flex items-center gap-3">
                                                <div class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico(i.icone, 'w-4 h-4')}</div>
                                                <div class="min-w-0">
                                                    <p class="font-bold text-slate-800">${escapeHTML(i.label)}</p>
                                                    <p class="text-[11px] text-slate-400">${escapeHTML(i.desc)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        ${PERFIS.map(p => `<td class="px-3 py-3 text-center">${toggle(i.key, p.id)}</td>`).join('')}
                                    </tr>`).join('')}
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;

        const lerMatriz = () => {
            const perfis = {};
            PERFIS.forEach(p => { perfis[p.id] = {}; });
            container.querySelectorAll('.perm-check').forEach(cb => {
                perfis[cb.dataset.perfil][cb.dataset.key] = cb.checked;
            });
            return perfis;
        };

        container.querySelector('#perm-salvar').onclick = async (e) => {
            const btn = e.currentTarget;
            const original = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `${ico('loader', 'w-3.5 h-3.5 animate-spin')} Salvando...`;
            try {
                await this.salvar(app, lerMatriz());
                showNotification('Permissões salvas e aplicadas.', 'success');
            } catch (err) {
                console.error(err);
                showNotification('Não foi possível salvar as permissões. Verifique as regras do Firestore (config_permissoes).', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = original;
            }
        };

        container.querySelector('#perm-restaurar').onclick = () => {
            if (!confirm('Restaurar as permissões padrão? Você ainda precisa clicar em "Salvar permissões".')) return;
            container.querySelectorAll('.perm-check').forEach(cb => {
                if (!cb.disabled) cb.checked = this.padrao(cb.dataset.key, cb.dataset.perfil);
            });
        };
    }
};

window.PermissoesService = PermissoesService;
export default PermissoesService;
