// js/permissoes.js - PERMISSÕES (SIGEP)
//
// Duas camadas, configuradas no Painel Administrador:
//  1) Por PERFIL (Usuário / Apoio / Administrador): matriz salva em config_permissoes/{orgaoId}.
//  2) Por USUÁRIO (permissões granulares): campo users/{uid}.permissoesDetalhadas.
//     Quando o administrador salva as permissões de uma pessoa, o que está marcado ali
//     tem prioridade sobre o perfil.
//
// Superadmin e Superadmin Global sempre enxergam tudo.

import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';
import { ico } from './icons.js';

// Perfis configuráveis (superadmins não entram: têm acesso total)
export const PERFIS = [
    { id: 'user',  label: 'Usuário' },
    { id: 'apoio', label: 'Apoio' },
    { id: 'admin', label: 'Administrador' }
];

const TODOS = { user: true, apoio: true, admin: true };

// ---------------------------------------------------------------------------
// Catálogo do que pode ser liberado/bloqueado.
//   key        identificador usado pelo sistema (can(user, key))
//   userKey    nome do campo em users/{uid}.permissoesDetalhadas
//   ids        elementos da tela que somem quando não há permissão
//   seletores  seletores CSS extras (opcional)
//   padrao     valor padrão por perfil (quando nada foi configurado)
//   fixo       valor imposto pelo sistema (não pode ser alterado)
// ---------------------------------------------------------------------------
export const CATALOGO = [
    {
        grupo: 'Telas e módulos',
        descricao: 'Botões e áreas que ficam fora da pauta.',
        itens: [
            { key: 'adminPanel',      userKey: 'menu_admin',            icone: 'shield',    label: 'Painel Administrador', desc: 'Usuários, unidades, recepções e auditoria.', ids: ['admin-panel-btn', 'admin-btn-main'], padrao: { user: false, apoio: false, admin: true }, fixo: { user: false, apoio: false, admin: true } },
            { key: 'modColetas',      userKey: 'menu_coletor_bi',       icone: 'clipboard', label: 'Módulo Coletas / BI',  desc: 'Formulários e coletas estatísticas.',        ids: ['btn-modulo-coletas'] },
            { key: 'recepcaoCentral', userKey: 'menu_recepcao_central', icone: 'building',  label: 'Recepção Central',     desc: 'Visão geral da recepção e chegadas.',        ids: ['btn-recepcao-central'] },
            { key: 'dashboard',       userKey: 'menu_dashboard',        icone: 'chart',     label: 'Dashboard',            desc: 'Indicadores gerais das pautas.',             ids: ['view-dashboard-btn'] }
        ]
    },
    {
        grupo: 'Menu de Ações (dentro da pauta)',
        descricao: 'Itens do menu Ações que aparece ao abrir uma pauta.',
        itens: [
            { key: 'monitorEquipe',  userKey: 'pauta_monitor_equipe',  icone: 'users',      label: 'Monitor da equipe',         desc: 'Painel geral da equipe e dos atendimentos.', ids: ['btn-painel-geral-externo'] },
            { key: 'monitorGlobal',  userKey: 'pauta_monitor_equipe',  icone: 'activity',   label: 'Monitor da pauta (global)', desc: 'Acompanhamento geral e histórico.',          ids: ['btn-monitor-pauta-global'] },
            { key: 'linkPublico',    userKey: 'pauta_link_publico',    icone: 'link',       label: 'Link público',              desc: 'Compartilhar acompanhamento da pauta.',      ids: ['share-pauta-btn'] },
            { key: 'totem',          userKey: 'pauta_totem',           icone: 'smartphone', label: 'Totem de autoatendimento',  desc: 'Abrir o totem de chegada.',                  ids: ['open-totem-btn'] },
            { key: 'estatisticas',   userKey: 'pauta_estatisticas',    icone: 'chart',      label: 'Estatísticas e relatórios', desc: 'Resumos e PDFs da pauta.',                   ids: ['view-stats-btn'] },
            { key: 'renomearPauta',  userKey: 'pauta_renomear',        icone: 'pencil',     label: 'Renomear pauta',            desc: 'Alterar o nome da pauta.',                   ids: ['edit-pauta-name-btn'] },
            { key: 'configPauta',    userKey: 'pauta_configuracoes',   icone: 'settings',   label: 'Configurações da pauta',    desc: 'Modo operante, tolerância e fluxos.',        ids: ['edit-pauta-config-btn'] },
            { key: 'membros',        userKey: 'pauta_convidar_pessoas', icone: 'userPlus',  label: 'Convidar membros',          desc: 'Gerenciar quem acessa a pauta.',             ids: ['manage-members-btn'] },
            { key: 'colaboradores',  userKey: 'colaboradores_ver',     icone: 'briefcase',  label: 'Colaboradores e presença',  desc: 'Abrir a equipe e a lista de presença.',      ids: ['manage-collaborators-btn'] },
            { key: 'anotacoes',      userKey: 'pauta_anotacoes',       icone: 'fileText',   label: 'Anotações',                 desc: 'Bloco de notas da pauta.',                   ids: ['notes-btn'] },
            { key: 'painelTv',       userKey: null,                    icone: 'tv',         label: 'Painel da TV / Fila',       desc: 'Local de chamada e configuração da TV.',     ids: ['tv-panel-actions-group'] }
        ]
    },
    {
        grupo: 'Equipe (colaboradores)',
        descricao: 'O que dá para fazer dentro da lista de presença.',
        itens: [
            { key: 'colabAdicionar', userKey: 'colaboradores_adicionar',       icone: 'plus',     label: 'Adicionar colaborador',   desc: 'Cadastrar novos membros na equipe.',       ids: ['add-collaborator-btn-modal'] },
            { key: 'colabExcluir',   userKey: 'colaboradores_excluir',         icone: 'trash',    label: 'Excluir colaborador',     desc: 'Remover membros da equipe.',               ids: [], padrao: { user: false, apoio: false, admin: true } },
            { key: 'colabPresenca',  userKey: 'colaboradores_marcar_presenca', icone: 'check',    label: 'Marcar presença',         desc: 'Alterar presença e horário.',              ids: [] },
            { key: 'colabPdf',       userKey: 'colaboradores_gerar_pdf',       icone: 'fileText', label: 'Gerar PDF da equipe',     desc: 'Exportar a lista de presença.',            ids: ['download-collaborators-pdf-modal', 'export-pdf-custom-btn'] },
            { key: 'colabAta',       userKey: 'colaboradores_gerar_ata',       icone: 'clipboard', label: 'Gerar Ata Social',       desc: 'Emitir a ata de ação social.',             ids: ['btn-gerar-ata-social'] }
        ]
    },
    {
        grupo: 'Colunas do atendimento (Kanban)',
        descricao: 'Quais colunas aparecem na tela da pauta.',
        itens: [
            { key: 'colunaPauta',         userKey: 'coluna_pauta',          icone: 'clipboard', label: 'Coluna Pauta (fila inicial)', desc: 'Assistidos agendados.',        ids: ['pauta-column'] },
            { key: 'colunaAguardando',    userKey: 'coluna_aguardando',     icone: 'clock',    label: 'Coluna Aguardando',     desc: 'Quem já chegou e espera.',            ids: ['aguardando-column'] },
            { key: 'colunaEmAtendimento', userKey: 'coluna_em_atendimento', icone: 'users',    label: 'Coluna Em Atendimento', desc: 'Atendimentos em andamento.',          ids: ['em-atendimento-column'] },
            { key: 'colunaDistribuicao',  userKey: 'coluna_distribuicao',   icone: 'refresh',  label: 'Coluna Distribuição',   desc: 'Distribuição para o defensor.',       ids: ['distribuicao-column'] },
            { key: 'colunaAtendidos',     userKey: 'coluna_atendidos',      icone: 'checkCircle', label: 'Coluna Atendidos',   desc: 'Atendimentos concluídos.',            ids: ['atendidos-column'] },
            { key: 'colunaFaltosos',      userKey: 'coluna_faltosos',       icone: 'userX',    label: 'Coluna Faltosos',       desc: 'Quem não compareceu.',                ids: ['faltosos-column'] }
        ]
    },
    {
        grupo: 'Operações e zona de risco',
        descricao: 'Relatórios, importação e ações que alteram a pauta.',
        itens: [
            { key: 'pdfAtendidos',   userKey: 'pauta_gerar_pdf_atendidos', icone: 'fileText', label: 'PDF de atendidos',      desc: 'Baixar a lista de atendidos.',               ids: ['download-pdf-btn'] },
            { key: 'pdfFaltosos',    userKey: 'pauta_gerar_pdf_faltosos',  icone: 'fileText', label: 'PDF de faltosos',       desc: 'Baixar a lista de faltosos.',                ids: ['download-faltosos-pdf-btn'] },
            { key: 'importarCsv',    userKey: 'pauta_importar_csv',        icone: 'upload',   label: 'Carregar / baixar CSV', desc: 'Importar a pauta por planilha.',             ids: [], seletores: ['label[for="file-upload"]'] },
            { key: 'fecharPauta',    userKey: 'pauta_zerar_pauta',         icone: 'lock',     label: 'Fechar e reabrir pauta', desc: 'Encerrar ou reabrir (exige senha do dono).', ids: ['close-pauta-btn', 'reopen-pauta-btn'] },
            { key: 'zerarPauta',     userKey: 'pauta_zerar_pauta',         icone: 'trash',    label: 'Zerar pauta',           desc: 'Apagar todos os atendimentos.',              ids: ['reset-all-btn'], padrao: { user: true, apoio: false, admin: true } },
            { key: 'voltarAtendido', userKey: null,                        icone: 'arrowLeft', label: 'Voltar assistido atendido', desc: 'Devolver o atendido para a etapa anterior.', ids: [], padrao: { user: true, apoio: false, admin: true } }
        ]
    }
];

const INDICE = {};
CATALOGO.forEach(g => g.itens.forEach(i => { INDICE[i.key] = i; }));

// ---------------------------------------------------------------------------
// Tela "Permissões granulares" de um usuário (as mesmas seções de sempre).
// padrao: valor mostrado quando o campo ainda não existe no cadastro da pessoa.
// ---------------------------------------------------------------------------
const SECOES_USUARIO = [
    { titulo: '1. Módulos do Menu Principal', colunas: 'md:grid-cols-4', itens: [
        ['menu_dashboard', 'Ver Dashboard', true], ['menu_recepcao_central', 'Recepção Central', true],
        ['menu_coletor_bi', 'Coletor BI / Coletas', false], ['menu_admin', 'Painel Admin', false] ] },
    { titulo: '2. Módulo de Colaboradores (Equipe)', colunas: 'md:grid-cols-3', itens: [
        ['colaboradores_ver', 'Ver Colaboradores', true], ['colaboradores_adicionar', 'Adicionar Colaborador', true],
        ['colaboradores_excluir', 'Excluir Colaborador', false], ['colaboradores_marcar_presenca', 'Marcar Presença / Status', true],
        ['colaboradores_gerar_pdf', 'Gerar PDF Equipe', true], ['colaboradores_gerar_ata', 'Gerar Ata Social', true] ] },
    { titulo: '3. Menu de Ações e Atalhos da Pauta', colunas: 'md:grid-cols-4', itens: [
        ['pauta_monitor_equipe', 'Monitor da Equipe', true], ['pauta_estatisticas', 'Ver Estatísticas', true],
        ['pauta_anotacoes', 'Anotações Internas', true], ['pauta_convidar_pessoas', 'Convidar Pessoas', false],
        ['pauta_link_publico', 'Link Público (Compartilhar)', true], ['pauta_totem', 'Acessar Totem', false],
        ['pauta_renomear', 'Renomear Pauta', true], ['pauta_configuracoes', 'Configurações da Pauta', false] ] },
    { titulo: '4. Colunas de Atendimento (Kanban)', colunas: 'md:grid-cols-3', itens: [
        ['coluna_pauta', 'Ver Coluna Pauta (Fila Inicial)', true], ['coluna_aguardando', 'Ver Coluna Aguardando', true],
        ['coluna_em_atendimento', 'Ver Coluna Em Atendimento', true], ['coluna_distribuicao', 'Ver Coluna Distribuição', true],
        ['coluna_atendidos', 'Ver Coluna Atendidos', true], ['coluna_faltosos', 'Ver Coluna Faltosos', true] ] },
    { titulo: '5. Operações e Zona de Risco', colunas: 'md:grid-cols-4', itens: [
        ['pauta_gerar_pdf_atendidos', 'Gerar PDF Atendidos', true], ['pauta_gerar_pdf_faltosos', 'Gerar PDF Faltosos', true],
        ['pauta_importar_csv', 'Carregar / Descarregar CSV', true], ['pauta_zerar_pauta', 'Zona de Risco (Zerar/Fechar)', false, true] ] }
];

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

    // Valor definido pela matriz de perfis (ou o padrão)
    _doPerfil(key, perfil) {
        const salvo = this.config?.perfis?.[perfil]?.[key];
        return salvo !== undefined ? !!salvo : this.padrao(key, perfil);
    },

    can(user, key) {
        const role = user?.role;
        if (ehSuper(role)) return true;
        if (!role || role === 'suspended') return false;
        const item = INDICE[key];
        if (!item) return true;
        const perfil = perfilDe(role);

        // Regras impostas pelo sistema (ex.: Painel Admin só para administradores)
        if (item.fixo && item.fixo[perfil] !== undefined) return item.fixo[perfil];

        // Permissão individual (salva na tela "Permissões" do usuário) vence o perfil
        const individual = user?.permissoesDetalhadas;
        if (item.userKey && individual && individual[item.userKey] !== undefined) return !!individual[item.userKey];

        return this._doPerfil(key, perfil);
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
            (item.seletores || []).forEach(sel => document.querySelectorAll(sel).forEach(el => el.classList.toggle('perm-blocked', !liberado)));
        }));
    },

    limpar() {
        if (this._unsub) { this._unsub(); this._unsub = null; }
        this.config = null; this._orgao = null;
    },

    // ---------- matriz por perfil (Painel Administrador) ----------
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
            return this._doPerfil(key, perfil);
        };

        const toggle = (key, perfil) => {
            const item = INDICE[key];
            const travado = item.fixo && item.fixo[perfil] !== undefined;
            return `
                <label class="relative inline-block w-10 h-5 ${travado ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}" title="${travado ? 'Definido pelo sistema' : ''}">
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
                        <p class="text-xs text-slate-500 mt-0.5">Padrão de cada perfil. Para liberar ou bloquear uma pessoa específica, use o botão <strong>Permissões</strong> na lista de usuários (ele tem prioridade sobre o perfil). Superadmins sempre têm acesso total.</p>
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
                if (!cb.disabled) perfis[cb.dataset.perfil][cb.dataset.key] = cb.checked;
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
    },

    // ---------- permissões granulares de UM usuário ----------
    async abrirModalUsuario(db, userId, userName, app = window.app) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm';

        let userData = {};
        try {
            const snap = await getDoc(doc(db, 'users', userId));
            if (snap.exists()) userData = snap.data();
        } catch (e) { /* segue com valores padrão */ }
        const p = userData.permissoesDetalhadas || {};
        const marcado = (key, padrao) => (p[key] === undefined ? padrao : p[key] === true);

        const secoes = SECOES_USUARIO.map(s => `
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 class="font-bold text-slate-700 uppercase tracking-wider mb-3 border-b pb-2">${escapeHTML(s.titulo)}</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 ${s.colunas} gap-3">
                    ${s.itens.map(([key, label, padrao, perigo]) => `
                        <label class="flex items-center gap-2 cursor-pointer p-2 ${perigo ? 'bg-red-50 border-red-200 text-red-900 font-bold' : 'bg-white border-slate-200'} rounded-lg border">
                            <input type="checkbox" class="perm-checkbox w-4 h-4 ${perigo ? 'text-red-600' : 'text-slate-900'} rounded" value="${key}" ${marcado(key, padrao) ? 'checked' : ''}> ${escapeHTML(label)}
                        </label>`).join('')}
                </div>
            </div>`).join('');

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
                <div class="bg-slate-900 px-6 py-4 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 class="font-bold text-sm tracking-wide flex items-center gap-2">${ico('shield')} Controle de Permissões Granulares</h3>
                        <p class="text-slate-400 text-xs mt-0.5">Usuário: <span class="text-white font-semibold">${escapeHTML(userName)}</span></p>
                    </div>
                    <button data-fechar class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition" aria-label="Fechar">${ico('x', 'w-5 h-5')}</button>
                </div>

                <div class="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                    <div class="bg-blue-50 border border-blue-100 p-3.5 rounded-xl text-blue-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <span>Marque ou desmarque exatamente o que esta pessoa pode ver ou executar. O que for salvo aqui tem prioridade sobre o perfil.</span>
                        <div class="flex gap-2 shrink-0">
                            <button type="button" id="btn-marcar-todos" class="bg-blue-600 text-white px-3 py-1 rounded font-bold hover:bg-blue-700">Marcar Todos</button>
                            <button type="button" id="btn-desmarcar-todos" class="bg-white border border-blue-300 text-blue-800 px-3 py-1 rounded font-bold hover:bg-blue-50">Desmarcar Todos</button>
                        </div>
                    </div>

                    ${secoes}

                    <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-200 shadow-sm">
                        <h4 class="font-bold text-indigo-900 uppercase tracking-wider mb-3 border-b border-indigo-200 pb-2 flex items-center gap-2">${ico('shield')} 6. Segurança da Conta (2FA)</h4>
                        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <label class="flex items-center gap-2 cursor-pointer p-2.5 bg-white rounded-lg border border-indigo-200 w-full sm:w-auto hover:bg-indigo-50 transition">
                                <input type="checkbox" class="perm-checkbox w-4 h-4 text-indigo-600 rounded" value="exigir_2fa" ${p.exigir_2fa === true ? 'checked' : ''}>
                                <span class="text-sm font-bold text-indigo-900">Exigir Autenticação 2FA (App)</span>
                            </label>
                            <button type="button" id="btn-reset-2fa" class="w-full sm:w-auto bg-white hover:bg-red-50 text-red-600 border border-red-200 px-4 py-2.5 rounded-lg font-bold text-xs transition flex items-center justify-center gap-2">${ico('refresh')} Resetar / Desativar 2FA</button>
                        </div>
                        <p class="text-[10px] text-indigo-700 mt-2 font-medium">* Se o usuário perder o celular, clique em "Resetar" para limpar o vínculo e permitir que ele configure novamente.</p>
                    </div>
                </div>

                <div class="p-4 bg-slate-50 border-t flex justify-end gap-2 shrink-0">
                    <button data-fechar class="px-4 py-2 bg-slate-200 rounded-lg font-semibold text-slate-700">Cancelar</button>
                    <button id="salvar-permissoes-btn" class="inline-flex items-center gap-1.5 px-5 py-2 bg-slate-900 text-white rounded-lg font-semibold shadow-sm">${ico('check', 'w-3.5 h-3.5')} Salvar Permissões</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        modal.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => modal.remove()));
        modal.querySelector('#btn-marcar-todos').onclick = () => modal.querySelectorAll('.perm-checkbox').forEach(cb => { cb.checked = true; });
        modal.querySelector('#btn-desmarcar-todos').onclick = () => modal.querySelectorAll('.perm-checkbox').forEach(cb => { cb.checked = false; });

        const btnReset = modal.querySelector('#btn-reset-2fa');
        btnReset.onclick = async () => {
            if (!confirm(`Atenção: você está prestes a desativar a exigência de 2FA para ${userName}. O usuário poderá logar apenas com a senha até configurar novamente. Confirma?`)) return;
            const original = btnReset.innerHTML;
            try {
                btnReset.disabled = true;
                btnReset.innerHTML = `${ico('loader', 'w-3.5 h-3.5 animate-spin')} Resetando...`;
                await updateDoc(doc(db, 'users', userId), {
                    'permissoesDetalhadas.exigir_2fa': false,
                    solicitacao_reset_2fa: true,
                    updatedAt: new Date().toISOString()
                });
                const cb = modal.querySelector('input[value="exigir_2fa"]');
                if (cb) cb.checked = false;
                showNotification('2FA desativado. O usuário já pode acessar e reconfigurar.', 'success');
            } catch (error) {
                showNotification('Erro ao resetar 2FA.', 'error');
            } finally {
                btnReset.disabled = false;
                btnReset.innerHTML = original;
            }
        };

        modal.querySelector('#salvar-permissoes-btn').onclick = async () => {
            const novas = {};
            modal.querySelectorAll('.perm-checkbox').forEach(cb => { novas[cb.value] = cb.checked; });
            try {
                await updateDoc(doc(db, 'users', userId), { permissoesDetalhadas: novas, updatedAt: new Date().toISOString() });
                showNotification('Permissões atualizadas com sucesso.', 'success');
                // Se a pessoa editada é quem está logado, aplica na hora
                if (app?.currentUser && (app.auth?.currentUser?.uid === userId)) {
                    app.currentUser.permissoesDetalhadas = novas;
                    this.aplicarUI(app.currentUser);
                }
                modal.remove();
            } catch (e) {
                showNotification('Erro ao salvar permissões.', 'error');
            }
        };
    }
};

window.PermissoesService = PermissoesService;
export default PermissoesService;
