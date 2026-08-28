// router.js
// Sistema de roteamento SPA completo para o SIGEP - Cobertura Total de Telas, Modais e Menus de Ação

export const ROUTES = {
    LOGIN:                  'login',
    MODO_SELECTION:         'modo-selection',
    PAUTA_SELECTION:        'pauta-selection',
    APP:                    'app',                
    DASHBOARD:              'dashboard',          
    ADMIN:                  'admin',              
    RECEPCAO_CENTRAL:       'recepcao-central',   
    PAINEL_PUBLICO:         'painel-publico',     
    MEU_PERFIL:             'meu-perfil',         
    ATENDIMENTO_EXTERNO:    'atendimento-externo',
    DETALHES_CASO:          'detalhes-caso',      
    CAPTACAO_EXTERNA:       'captacao-externa',   
    RELATORIO_PDF:          'relatorio-pdf',      
    CONFIGURACAO_PAUTA:     'configuracao-pauta',
    FILTRO_PAUTA:           'filtro-pauta',
    // --- NOVAS ROTAS DO MENU DE AÇÕES E MODAIS ---
    MONITOR_EQUIPE:         'monitor-equipe',
    COMPARTILHAMENTO:       'compartilhamento',
    TOTEM:                  'totem',
    ESTATISTICAS:           'estatisticas',
    EDITAR_NOME_PAUTA:      'editar-nome-pauta',
    COMPARTILHAR_PAUTA:     'compartilhar-pauta',
    COLABORADORES_PAUTA:    'colaboradores-pauta',
    ANOTACOES_PAUTA:        'anotacoes-pauta'
};

const ROUTE_GUARDS = {
    [ROUTES.LOGIN]:               { requiresAuth: false },
    [ROUTES.MODO_SELECTION]:      { requiresAuth: true },
    [ROUTES.PAUTA_SELECTION]:     { requiresAuth: true },
    [ROUTES.APP]:                 { requiresAuth: true },
    [ROUTES.DASHBOARD]:           { requiresAuth: true },
    [ROUTES.ADMIN]:               { requiresAuth: true, roles: ['admin', 'superadmin'] },
    [ROUTES.RECEPCAO_CENTRAL]:    { requiresAuth: true }, 
    [ROUTES.PAINEL_PUBLICO]:      { requiresAuth: false },
    [ROUTES.ATENDIMENTO_EXTERNO]: { requiresAuth: true },
    [ROUTES.MEU_PERFIL]:          { requiresAuth: true },
    [ROUTES.DETALHES_CASO]:       { requiresAuth: true },
    [ROUTES.CAPTACAO_EXTERNA]:    { requiresAuth: false },
    [ROUTES.RELATORIO_PDF]:       { requiresAuth: true },
    [ROUTES.CONFIGURACAO_PAUTA]:  { requiresAuth: true },
    [ROUTES.FILTRO_PAUTA]:        { requiresAuth: true },
    [ROUTES.MONITOR_EQUIPE]:      { requiresAuth: true },
    [ROUTES.COMPARTILHAMENTO]:    { requiresAuth: true },
    [ROUTES.TOTEM]:               { requiresAuth: true },
    [ROUTES.ESTATISTICAS]:        { requiresAuth: true },
    [ROUTES.EDITAR_NOME_PAUTA]:   { requiresAuth: true },
    [ROUTES.COMPARTILHAR_PAUTA]:  { requiresAuth: true },
    [ROUTES.COLABORADORES_PAUTA]: { requiresAuth: true },
    [ROUTES.ANOTACOES_PAUTA]:     { requiresAuth: true }
};

const ALL_SCREEN_IDS = [
    'login-container',
    'modo-selection-screen',
    'pauta-selection-container',
    'app-container',
    'dashboard-container',
    'admin-container',
    'recepcao-central-container',
    'painel-publico-container',
    'meu-perfil-container',
    'atendimento-externo-container',
    'assisted-details-modal'
];

export class SIGEPRouter {
    constructor(app, deps) {
        this._app  = app;
        this._deps = deps;
        this._currentRoute  = null;
        this._currentParams = {};
        this._handlers = this._buildHandlers();
        this._listening = false;
    }

    init() {
        if (this._listening) return;
        this._listening = true;

        window.addEventListener('popstate', (e) => {
            const state = e.state;
            if (state?.route) {
                this._execute(state.route, state.params || {}, false);
            } else {
                const urlParams = new URLSearchParams(window.location.search);
                const routeFromUrl = urlParams.get('r') || ROUTES.MODO_SELECTION;
                const params = Object.fromEntries(urlParams.entries());
                this._execute(routeFromUrl, params, false);
            }
        });
    }

    async navigate(route, params = {}, replace = false) {
        const targetRoute = ROUTE_GUARDS[route] ? route : ROUTES.PAUTA_SELECTION;
        const redirected = this._guard(targetRoute, params);
        if (redirected) return this.navigate(redirected, {}, replace);
        
        this._pushHistory(targetRoute, params, replace);
        await this._execute(targetRoute, params, true);
    }

    async resolveInitialRoute() {
        const urlParams = new URLSearchParams(window.location.search);
        
        const urlRoute = urlParams.get('r');
        if (urlRoute && ROUTE_GUARDS[urlRoute]) {
            const params = Object.fromEntries(urlParams.entries());
            await this.navigate(urlRoute, params, true);
            return;
        }

        if (urlParams.get('painel') === 'true') {
            await this._execute(ROUTES.PAINEL_PUBLICO, {}, false);
            return;
        }

        const savedScreen = localStorage.getItem('sigep_active_screen');
        const pautaId     = localStorage.getItem('lastPautaId');
        const pautaName   = localStorage.getItem('lastPautaName');
        const pautaType   = localStorage.getItem('lastPautaType');

        const routeMap = {
            'app': async () => {
                if (pautaId && pautaName) await this.navigate(ROUTES.APP, { pautaId, pautaName, pautaType }, true);
                else await this.navigate(ROUTES.PAUTA_SELECTION, {}, true);
            },
            'pauta-selection':    () => this.navigate(ROUTES.PAUTA_SELECTION, {}, true),
            'dashboard':          () => this.navigate(ROUTES.DASHBOARD, {}, true),
            'recepcao-central':   () => this.navigate(ROUTES.RECEPCAO_CENTRAL, {}, true),
            'admin':              () => this.navigate(ROUTES.ADMIN, {}, true),
        };

        if (savedScreen && routeMap[savedScreen]) await routeMap[savedScreen]();
        else await this.navigate(ROUTES.MODO_SELECTION, {}, true);
    }

    get currentRoute()  { return this._currentRoute; }
    get currentParams() { return this._currentParams; }

    _hideAllScreens() {
        ALL_SCREEN_IDS.forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });
    }

    _guard(route, params = {}) {
        const guard = ROUTE_GUARDS[route];
        if (!guard) return null;

        const app        = this._app;
        const user       = app.currentUser;
        const isAuth     = !!app.auth?.currentUser;
        const isApproved = user?.status === 'approved';

        if (guard.requiresAuth && (!isAuth || !isApproved)) return ROUTES.LOGIN;

        if (guard.roles && !guard.roles.includes(user?.role)) {
            this._deps.showNotification('Acesso não permitido para seu perfil.', 'error');
            return ROUTES.PAUTA_SELECTION;
        }

        return null;
    }

    _pushHistory(route, params, replace) {
        const state = { route, params };
        const url   = this._buildUrl(route, params);
        if (replace) window.history.replaceState(state, '', url);
        else         window.history.pushState(state, '', url);
    }

    _buildUrl(route, params) {
        const base = window.location.pathname;
        const qs   = new URLSearchParams(window.location.search);
        
        qs.set('r', route);
        
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                qs.set(key, params[key]);
            } else if (params[key] === null) {
                qs.delete(key);
            }
        });

        return `${base}?${qs.toString()}`;
    }

    async _execute(route, params, saveToStorage) {
        this._currentRoute  = route;
        this._currentParams = params;
        if (saveToStorage) this._persistRoute(route, params);
        
        const handler = this._handlers[route];
        if (!handler) { 
            await this.navigate(ROUTES.PAUTA_SELECTION, {}, true);
            return; 
        }
        
        try {
            await handler(params);
        } catch (error) {
            console.error(`[SIGEPRouter] Falha na rota ${route}:`, error);
        }
    }

    _persistRoute(route, params) {
        const screenMap = {
            [ROUTES.LOGIN]:               'login',
            [ROUTES.MODO_SELECTION]:      'modo-selection',
            [ROUTES.PAUTA_SELECTION]:     'pauta-selection',
            [ROUTES.APP]:                 'app',
            [ROUTES.DASHBOARD]:           'dashboard',
            [ROUTES.ADMIN]:               'admin',
            [ROUTES.RECEPCAO_CENTRAL]:    'recepcao-central',
            [ROUTES.ATENDIMENTO_EXTERNO]: 'atendimento-externo',
            [ROUTES.MEU_PERFIL]:          'meu-perfil'
        };
        if (screenMap[route]) localStorage.setItem('sigep_active_screen', screenMap[route]);
        if (route === ROUTES.APP && params.pautaId) {
            localStorage.setItem('lastPautaId',    params.pautaId);
            localStorage.setItem('lastPautaName', params.pautaName || '');
            localStorage.setItem('lastPautaType', params.pautaType || 'normal');
        }
    }

    _buildHandlers() {
        const app  = this._app;
        const deps = this._deps;

        return {
            [ROUTES.LOGIN]: async () => {
                this._hideAllScreens();
                document.getElementById('login-container')?.classList.remove('hidden');
            },
            [ROUTES.MODO_SELECTION]: async () => {
                this._hideAllScreens();
                document.getElementById('modo-selection-screen')?.classList.remove('hidden');
                app.applyRoleBasedUI();
            },
            [ROUTES.PAUTA_SELECTION]: async () => {
                if (app.currentPauta) app._teardownPauta();
                this._hideAllScreens();
                document.getElementById('pauta-selection-container')?.classList.remove('hidden');
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
                    this._hideAllScreens();
                    document.getElementById('app-container')?.classList.remove('hidden');
                } else {
                    await this.navigate(ROUTES.PAUTA_SELECTION, {}, true);
                }
            },
            [ROUTES.DASHBOARD]: async () => {
                this._hideAllScreens();
                deps.DashboardService.showDashboardScreen();
                localStorage.setItem('sigep_active_screen', 'dashboard');
            },
            [ROUTES.ADMIN]: async () => {
                this._hideAllScreens();
                document.getElementById('admin-container')?.classList.remove('hidden');
                app.renderAdminContent();
            },
            [ROUTES.RECEPCAO_CENTRAL]: async () => {
                this._hideAllScreens();
                await deps.RecepçãoCentralService.abrir(app);
            },
            [ROUTES.PAINEL_PUBLICO]: async () => {
                this._hideAllScreens();
                const { PainelPublicoService } = await import('./painelPublico.js');
                await PainelPublicoService.init(app);
            },
            [ROUTES.MEU_PERFIL]: async () => {
                this._hideAllScreens();
                document.getElementById('meu-perfil-container')?.classList.remove('hidden');
                if (deps.PerfilService) await deps.PerfilService.carregarDados(app);
            },
            [ROUTES.ATENDIMENTO_EXTERNO]: async (params) => {
                this._hideAllScreens();
                document.getElementById('atendimento-externo-container')?.classList.remove('hidden');
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
            [ROUTES.CONFIGURACAO_PAUTA]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                document.getElementById('edit-pauta-config-btn')?.click();
            },
            [ROUTES.FILTRO_PAUTA]: async (params) => {
                if (params.filter && app) {
                    app.currentPautaFilter = params.filter;
                    await app.loadPautasWithFilter();
                }
            },
            // --- HANDLERS PARA O MENU VERDE DE AÇÕES ---
            [ROUTES.MONITOR_EQUIPE]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                document.getElementById('btn-painel-geral-externo')?.click();
            },
            [ROUTES.COMPARTILHAMENTO]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                document.getElementById('share-pauta-btn')?.click();
            },
            [ROUTES.TOTEM]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                document.getElementById('open-totem-btn')?.click();
            },
            [ROUTES.ESTATISTICAS]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                document.getElementById('view-stats-btn')?.click();
            },
            [ROUTES.EDITAR_NOME_PAUTA]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                document.getElementById('edit-pauta-name-btn')?.click();
            },
            [ROUTES.COMPARTILHAR_PAUTA]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                document.getElementById('manage-members-btn')?.click();
            },
            [ROUTES.COLABORADORES_PAUTA]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                document.getElementById('manage-collaborators-btn')?.click();
            },
            [ROUTES.ANOTACOES_PAUTA]: async (params) => {
                await this._handlers[ROUTES.APP](params);
                document.getElementById('notes-btn')?.click();
            }
        };
    }
}
