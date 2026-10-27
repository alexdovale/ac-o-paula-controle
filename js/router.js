// js/router.js
// Roteamento SPA do SIGEP - URLs são a fonte da verdade (deep linking).
//
// Principais garantias:
//  - Navegações são enfileiradas (nenhuma é descartada) e os redirecionamentos internos funcionam.
//  - O botão "voltar" do navegador passa pelas mesmas regras de acesso (guard) das demais navegações.
//  - Rotas de modal (estatísticas, totem, colaboradores...) abrem e FECHAM de verdade:
//    fechar o modal volta a URL para a pauta; sair da rota fecha o modal.
//  - Telas Admin e Coletas passam pelo router, com limpeza ao sair.

export const ROUTES = {
    LOGIN:                  'login',
    MODO_SELECTION:         'modo-selection',
    PAUTA_SELECTION:        'pauta-selection',
    APP:                    'app',
    DASHBOARD:              'dashboard',
    ADMIN:                  'admin',
    COLETAS:                'coletas',
    RECEPCAO_CENTRAL:       'recepcao-central',
    PAINEL_PUBLICO:         'painel-publico',
    MEU_PERFIL:             'meu-perfil',
    ATENDIMENTO_EXTERNO:    'atendimento-externo',
    DETALHES_CASO:          'detalhes-caso',
    CAPTACAO_EXTERNA:       'captacao-externa',
    RELATORIO_PDF:          'relatorio-pdf',
    CONFIGURACAO_PAUTA:     'configuracao-pauta',
    FILTRO_PAUTA:           'filtro-pauta',

    // --- ROTAS DO MENU DE AÇÕES (abrem modais dentro da pauta) ---
    MONITOR_EQUIPE:         'monitor-equipe',
    COMPARTILHAMENTO:       'compartilhamento',     // link público da pauta
    TOTEM:                  'totem',
    ESTATISTICAS:           'estatisticas',
    EDITAR_NOME_PAUTA:      'editar-nome-pauta',
    COMPARTILHAR_PAUTA:     'compartilhar-pauta',   // convidar membros
    COLABORADORES_PAUTA:    'colaboradores-pauta',
    ANOTACOES_PAUTA:        'anotacoes-pauta'
};

// perm: chave em permissoes.js (configurável no Painel Administrador)
// roles: restrição fixa de perfil, usada quando não há serviço de permissões
const ROUTE_GUARDS = {
    [ROUTES.LOGIN]:               { requiresAuth: false },
    [ROUTES.MODO_SELECTION]:      { requiresAuth: true },
    [ROUTES.PAUTA_SELECTION]:     { requiresAuth: true },
    [ROUTES.APP]:                 { requiresAuth: true },
    [ROUTES.DASHBOARD]:           { requiresAuth: true, perm: 'dashboard', fora: true },
    [ROUTES.ADMIN]:               { requiresAuth: true, perm: 'adminPanel', fora: true, roles: ['admin', 'superadmin', 'superadmin_global'] },
    [ROUTES.COLETAS]:             { requiresAuth: true, perm: 'modColetas', fora: true },
    [ROUTES.RECEPCAO_CENTRAL]:    { requiresAuth: true, perm: 'recepcaoCentral', fora: true },
    [ROUTES.PAINEL_PUBLICO]:      { requiresAuth: false },
    [ROUTES.ATENDIMENTO_EXTERNO]: { requiresAuth: true },
    [ROUTES.MEU_PERFIL]:          { requiresAuth: true },
    [ROUTES.DETALHES_CASO]:       { requiresAuth: true },
    [ROUTES.CAPTACAO_EXTERNA]:    { requiresAuth: false },
    [ROUTES.RELATORIO_PDF]:       { requiresAuth: true },
    [ROUTES.CONFIGURACAO_PAUTA]:  { requiresAuth: true, perm: 'configPauta' },
    [ROUTES.FILTRO_PAUTA]:        { requiresAuth: true },
    [ROUTES.MONITOR_EQUIPE]:      { requiresAuth: true, perm: 'monitorEquipe' },
    [ROUTES.COMPARTILHAMENTO]:    { requiresAuth: true, perm: 'linkPublico' },
    [ROUTES.TOTEM]:               { requiresAuth: true, perm: 'totem' },
    [ROUTES.ESTATISTICAS]:        { requiresAuth: true, perm: 'estatisticas' },
    [ROUTES.EDITAR_NOME_PAUTA]:   { requiresAuth: true, perm: 'renomearPauta' },
    [ROUTES.COMPARTILHAR_PAUTA]:  { requiresAuth: true, perm: 'membros' },
    [ROUTES.COLABORADORES_PAUTA]: { requiresAuth: true, perm: 'colaboradores' },
    [ROUTES.ANOTACOES_PAUTA]:     { requiresAuth: true, perm: 'anotacoes' }
};

// Rotas que abrem um modal sobre a pauta.
// modalIds: quando todos ficam ocultos, a URL volta para a pauta.
// (sem modalIds = ação pontual, como abrir o totem em outra aba)
const MODAL_ROUTES = {
    [ROUTES.MONITOR_EQUIPE]:      { modalIds: ['painel-geral-externo-modal'] },
    [ROUTES.COMPARTILHAMENTO]:    { modalIds: ['share-modal'] },
    [ROUTES.TOTEM]:               { modalIds: [] },
    [ROUTES.ESTATISTICAS]:        { modalIds: ['statistics-modal'] },
    [ROUTES.EDITAR_NOME_PAUTA]:   { modalIds: ['edit-pauta-modal'] },
    [ROUTES.COMPARTILHAR_PAUTA]:  { modalIds: ['members-modal'] },
    [ROUTES.COLABORADORES_PAUTA]: { modalIds: ['collaborators-modal'] },
    [ROUTES.ANOTACOES_PAUTA]:     { modalIds: ['notes-modal'] },
    [ROUTES.CONFIGURACAO_PAUTA]:  { modalIds: ['edit-pauta-config-modal'] }
};

const ALL_SCREEN_IDS = [
    'login-container',
    'modo-selection-screen',
    'pauta-selection-container',
    'app-container',
    'dashboard-container',
    'admin-container',
    'coletas-container',
    'recepcao-central-container',
    'painel-publico-container',
    'meu-perfil-container',
    'atendimento-externo-container',
    'assisted-details-modal'
];

// Telas que podem ser restauradas depois de um F5
const RESTAURAVEIS = ['pauta-selection', 'dashboard', 'recepcao-central', 'admin', 'coletas', 'meu-perfil'];

export class SIGEPRouter {
    constructor(app, deps) {
        this._app  = app;
        this._deps = deps;
        this._currentRoute  = null;
        this._currentParams = {};
        this._listening = false;
        this._fila = Promise.resolve();      // navegações em série
        this._vigia = null;                  // acompanha o fechamento do modal da rota
        this._handlers = this._buildHandlers();
    }

    get currentRoute()  { return this._currentRoute; }
    get currentParams() { return this._currentParams; }
    isModalRoute(route = this._currentRoute) { return !!MODAL_ROUTES[route]; }

    init() {
        if (this._listening) return;
        this._listening = true;

        // Botão voltar/avançar do navegador: mesmas regras de acesso, sem criar novo histórico
        window.addEventListener('popstate', (e) => {
            let route, params;
            if (e.state?.route) {
                route = e.state.route; params = e.state.params || {};
            } else {
                const qs = new URLSearchParams(window.location.search);
                route = qs.get('r') || ROUTES.MODO_SELECTION;
                params = Object.fromEntries(qs.entries());
            }
            this._enfileirar(() => this._navegar(route, params, 'none'));
        });
    }

    // ---------- API pública ----------
    // Todas as chamadas entram numa fila: nenhuma navegação é perdida.
    navigate(route, params = {}, replace = false) {
        return this._enfileirar(() => this._navegar(route, params, replace ? 'replace' : 'push'));
    }

    _enfileirar(tarefa) {
        const proxima = this._fila.then(tarefa, tarefa);
        this._fila = proxima.catch(() => { });
        return proxima;
    }

    // ---------- núcleo ----------
    async _navegar(route, params, modo) {
        if (!ROUTE_GUARDS[route]) {
            console.warn(`[SIGEPRouter] Rota desconhecida "${route}". Indo para a seleção de pautas.`);
            route = ROUTES.PAUTA_SELECTION; params = {};
            if (modo === 'push') modo = 'replace';
        }

        const redirecionar = this._guard(route);
        if (redirecionar) {
            // Redirecionamento substitui a entrada atual do histórico
            return this._navegar(redirecionar, {}, 'replace');
        }

        await this._aoSair(this._currentRoute, route);

        if (modo !== 'none') this._pushHistory(route, params, modo === 'replace');
        await this._execute(route, params, modo !== 'none');
    }

    // Limpezas ao sair de uma rota
    async _aoSair(origem, destino) {
        if (!origem || origem === destino) return;
        const app = this._app;

        if (origem === ROUTES.COLETAS) {
            try { app.fecharColetas?.(); } catch (e) { console.warn(e); }
        }
        if (MODAL_ROUTES[origem]) {
            this._pararVigia();
            try { app.closePautaModals?.(); } catch (e) { console.warn(e); }
        }
    }

    async resolveInitialRoute() {
        const urlParams = new URLSearchParams(window.location.search);

        // 1. URL explícita (?r=...) manda em tudo
        const urlRoute = urlParams.get('r');
        if (urlRoute && ROUTE_GUARDS[urlRoute]) {
            const params = Object.fromEntries(urlParams.entries());
            await this.navigate(urlRoute, params, true);
            return;
        }

        // 1.5 Painel público antigo via parâmetro
        if (urlParams.get('painel') === 'true') {
            await this._enfileirar(() => this._execute(ROUTES.PAINEL_PUBLICO, {}, false));
            return;
        }

        // 2. Recarregamento (F5): volta para onde estava
        const isReload = window.performance &&
            window.performance.getEntriesByType('navigation').some(nav => nav.type === 'reload');

        const savedScreen = localStorage.getItem('sigep_active_screen');
        if (isReload && savedScreen) {
            if (savedScreen === 'app') {
                const pautaId   = localStorage.getItem('lastPautaId');
                const pautaName = localStorage.getItem('lastPautaName');
                const pautaType = localStorage.getItem('lastPautaType');
                if (pautaId && pautaName) {
                    await this.navigate(ROUTES.APP, { pautaId, pautaName, pautaType }, true);
                } else {
                    await this.navigate(ROUTES.PAUTA_SELECTION, {}, true);
                }
                return;
            }
            if (RESTAURAVEIS.includes(savedScreen) && ROUTE_GUARDS[savedScreen]) {
                await this.navigate(savedScreen, {}, true);
                return;
            }
        }

        // 3. Acesso limpo: tela inicial padrão
        await this.navigate(ROUTES.MODO_SELECTION, {}, true);
    }

    // ---------- telas ----------
    _hideAllScreens() {
        ALL_SCREEN_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                el.classList.remove('animate-fade-in');
            }
        });
    }

    _showScreen(id) {
        this._hideAllScreens();
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('hidden');
            el.classList.add('animate-fade-in');
        }
    }

    // ---------- regras de acesso ----------
    _guard(route) {
        const guard = ROUTE_GUARDS[route];
        if (!guard) return null;

        const app        = this._app;
        const user       = app.currentUser;
        const isAuth     = !!app.auth?.currentUser;
        const isApproved = user?.status === 'approved';
        const bloquear   = () => this._deps.showNotification?.('Acesso bloqueado: seu perfil não tem permissão para acessar esta área.', 'error');

        if (guard.requiresAuth && (!isAuth || !isApproved)) {
            return ROUTES.LOGIN;
        }

        if (route === ROUTES.LOGIN && isAuth && isApproved) {
            const salva = localStorage.getItem('sigep_active_screen');
            return (salva && salva !== ROUTES.LOGIN && ROUTE_GUARDS[salva]) ? salva : ROUTES.MODO_SELECTION;
        }

        if (guard.requiresAuth) {
            const ehSuper = user?.role === 'superadmin' || user?.role === 'superadmin_global';
            if (!ehSuper) {
                // Permissão configurável no Painel Administrador tem prioridade
                const perm = this._deps.Permissoes;
                const negado = (guard.perm && perm)
                    ? !perm.can(user, guard.perm)
                    : (guard.roles && !guard.roles.includes(user?.role));
                if (negado) {
                    bloquear();
                    return guard.fora ? ROUTES.PAUTA_SELECTION : ROUTES.APP;
                }
            }
        }

        return null;
    }

    // ---------- histórico / URL ----------
    _pushHistory(route, params, replace) {
        const state = { route, params };
        const url   = this._buildUrl(route, params);
        if (replace) window.history.replaceState(state, '', url);
        else window.history.pushState(state, '', url);
    }

    _buildUrl(route, params) {
        const base = window.location.pathname;
        const qs   = new URLSearchParams(window.location.search);
        qs.set('r', route);
        Object.keys(params).forEach(key => {
            if (key === 'r') return;
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') qs.set(key, params[key]);
            else if (params[key] === null) qs.delete(key);
        });
        return `${base}?${qs.toString()}`;
    }

    async _execute(route, params, saveToStorage) {
        this._currentRoute  = route;
        this._currentParams = params;
        if (saveToStorage) this._persistRoute(route, params);

        const handler = this._handlers[route];
        if (!handler) {
            await this._navegar(ROUTES.PAUTA_SELECTION, {}, 'replace');
            return;
        }

        try {
            await handler(params);
        } catch (error) {
            console.error(`[SIGEPRouter] Falha na rota ${route}:`, error);
            this._deps.showNotification?.('Erro ao carregar a tela solicitada.', 'error');
            this._showScreen('pauta-selection-container');
        }
    }

    _persistRoute(route, params) {
        const telas = {
            [ROUTES.LOGIN]:               'login',
            [ROUTES.MODO_SELECTION]:      'modo-selection',
            [ROUTES.PAUTA_SELECTION]:     'pauta-selection',
            [ROUTES.APP]:                 'app',
            [ROUTES.DASHBOARD]:           'dashboard',
            [ROUTES.ADMIN]:               'admin',
            [ROUTES.COLETAS]:             'coletas',
            [ROUTES.RECEPCAO_CENTRAL]:    'recepcao-central',
            [ROUTES.ATENDIMENTO_EXTERNO]: 'atendimento-externo',
            [ROUTES.MEU_PERFIL]:          'meu-perfil'
        };
        if (telas[route]) localStorage.setItem('sigep_active_screen', telas[route]);

        if (route === ROUTES.APP && params.pautaId) {
            localStorage.setItem('lastPautaId',   params.pautaId);
            localStorage.setItem('lastPautaName', params.pautaName || '');
            localStorage.setItem('lastPautaType', params.pautaType || 'normal');
        }
    }

    // ---------- modais por rota ----------
    _pararVigia() {
        if (this._vigia) { clearInterval(this._vigia); this._vigia = null; }
    }

    // Quando o usuário fecha o modal, a URL volta para a pauta (sem empilhar histórico)
    _vigiarFechamento(route) {
        this._pararVigia();
        const ids = MODAL_ROUTES[route]?.modalIds || [];

        const voltarParaPauta = () => {
            this._pararVigia();
            if (this._currentRoute !== route) return;
            const p = this._currentParams || {};
            const pauta = this._app.currentPauta;
            this.navigate(ROUTES.APP, {
                pautaId:   p.pautaId   || pauta?.id,
                pautaName: p.pautaName || pauta?.name,
                pautaType: p.pautaType || pauta?.type
            }, true);
        };

        if (ids.length === 0) { voltarParaPauta(); return; }

        const aberto = () => ids.some(id => {
            const el = document.getElementById(id);
            return el && el.isConnected && !el.classList.contains('hidden');
        });

        // O modal pode demorar um instante para aparecer: dá uma folga antes de vigiar
        let folga = 15;
        this._vigia = setInterval(() => {
            if (this._currentRoute !== route) { this._pararVigia(); return; }
            if (aberto()) { folga = 0; return; }
            if (folga > 0) { folga--; return; }
            voltarParaPauta();
        }, 200);
    }

    // ---------- handlers ----------
    _buildHandlers() {
        const app  = this._app;
        const deps = this._deps;

        // Abre a pauta e depois o modal da rota
        const rotaModal = (route) => async (params) => {
            await this._handlers[ROUTES.APP](params);
            if (this._currentRoute !== route || !app.currentPauta) return;   // houve redirecionamento
            await app.openPautaModal?.(route);
            this._vigiarFechamento(route);
        };

        return {
            [ROUTES.LOGIN]: async () => {
                this._showScreen('login-container');
            },

            [ROUTES.MODO_SELECTION]: async () => {
                this._showScreen('modo-selection-screen');
                app.applyRoleBasedUI();
            },

            [ROUTES.PAUTA_SELECTION]: async () => {
                if (app.currentPauta) app._teardownPauta();
                this._showScreen('pauta-selection-container');

                if (deps.UIService?.renderPautaFilters) {
                    deps.UIService.renderPautaFilters(
                        'filters-container',
                        app.currentPautaFilter || 'all',
                        (val) => {
                            app.currentPautaFilter = val;
                            app.loadPautasWithFilter();
                            this.navigate(ROUTES.FILTRO_PAUTA, { filter: val }, false);
                        },
                        app
                    );
                }
                await app.loadPautasWithFilter();
                app.applyRoleBasedUI();
            },

            [ROUTES.APP]: async ({ pautaId, pautaName, pautaType } = {}) => {
                const id   = pautaId   || localStorage.getItem('lastPautaId');
                const name = pautaName || localStorage.getItem('lastPautaName');
                const type = pautaType || localStorage.getItem('lastPautaType');

                if (id && name) {
                    if (!app.currentPauta || app.currentPauta.id !== id) {
                        await app.loadPauta(id, name, type);
                    }
                    this._showScreen('app-container');
                } else {
                    // Sem pauta: redireciona dentro do mesmo ciclo (não é descartado)
                    await this._navegar(ROUTES.PAUTA_SELECTION, {}, 'replace');
                }
            },

            [ROUTES.DASHBOARD]: async () => {
                this._showScreen('dashboard-container');
                deps.DashboardService.showDashboardScreen();
            },

            [ROUTES.ADMIN]: async () => {
                this._showScreen('admin-container');
                await app.renderAdminContent();
            },

            [ROUTES.COLETAS]: async () => {
                this._showScreen('coletas-container');
                document.getElementById('container-construtor-coleta')?.classList.add('hidden');
                await app.listarColetas();
            },

            [ROUTES.RECEPCAO_CENTRAL]: async () => {
                this._showScreen('recepcao-central-container');
                await deps.RecepçãoCentralService.abrir(app);
            },

            [ROUTES.PAINEL_PUBLICO]: async () => {
                this._showScreen('painel-publico-container');
                const { PainelPublicoService } = await import('./painelPublico.js');
                await PainelPublicoService.init(app);
            },

            [ROUTES.MEU_PERFIL]: async () => {
                this._showScreen('meu-perfil-container');
                if (deps.PerfilService) await deps.PerfilService.carregarDados(app);
            },

            [ROUTES.ATENDIMENTO_EXTERNO]: async (params) => {
                this._showScreen('atendimento-externo-container');
                const { AtendimentoExternoService } = await import('./atendimentoExternoService.js');
                AtendimentoExternoService.db = app.db;
                AtendimentoExternoService.auth = app.auth;
                AtendimentoExternoService.pautaId = params.pautaId || localStorage.getItem('lastPautaId');
                AtendimentoExternoService.colaboradorNome = params.colab || localStorage.getItem('lastColabName');
                AtendimentoExternoService.modoVisualizacao = params.modo || 'abas';
                await AtendimentoExternoService.init();
            },

            [ROUTES.DETALHES_CASO]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                if (params.assistidoId && window.openDetailsModal) {
                    window.openDetailsModal({
                        assistedId: params.assistidoId,
                        pautaId: params.pautaId,
                        allAssisted: app.allAssisted,
                        db: app.db
                    });
                }
            },

            [ROUTES.FILTRO_PAUTA]: async (params) => {
                if (params.filter && app) {
                    app.currentPautaFilter = params.filter;
                    await app.loadPautasWithFilter();
                }
            },

            // --- Rotas do menu de Ações: abrem e fecham o modal de verdade ---
            [ROUTES.MONITOR_EQUIPE]:      rotaModal(ROUTES.MONITOR_EQUIPE),
            [ROUTES.COMPARTILHAMENTO]:    rotaModal(ROUTES.COMPARTILHAMENTO),
            [ROUTES.TOTEM]:               rotaModal(ROUTES.TOTEM),
            [ROUTES.ESTATISTICAS]:        rotaModal(ROUTES.ESTATISTICAS),
            [ROUTES.EDITAR_NOME_PAUTA]:   rotaModal(ROUTES.EDITAR_NOME_PAUTA),
            [ROUTES.COMPARTILHAR_PAUTA]:  rotaModal(ROUTES.COMPARTILHAR_PAUTA),
            [ROUTES.COLABORADORES_PAUTA]: rotaModal(ROUTES.COLABORADORES_PAUTA),
            [ROUTES.ANOTACOES_PAUTA]:     rotaModal(ROUTES.ANOTACOES_PAUTA),
            [ROUTES.CONFIGURACAO_PAUTA]:  rotaModal(ROUTES.CONFIGURACAO_PAUTA)
        };
    }
}
