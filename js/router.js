// router.js
// Sistema de roteamento SPA para o SIGEP App
// Integra History API, guards de autenticação/papel e persistência via localStorage.

export const ROUTES = {
    LOGIN:              'login',
    MODO_SELECTION:     'modo-selection',
    PAUTA_SELECTION:    'pauta-selection',
    APP:                'app',
    DASHBOARD:          'dashboard',
    ADMIN:              'admin',
    RECEPCAO_CENTRAL:   'recepcao-central',
    PAINEL_PUBLICO:     'painel-publico',
};

// Define quais papéis podem acessar cada rota.
// undefined = qualquer usuário autenticado e aprovado.
const ROUTE_GUARDS = {
    [ROUTES.LOGIN]:             { requiresAuth: false },
    [ROUTES.MODO_SELECTION]:    { requiresAuth: true },
    [ROUTES.PAUTA_SELECTION]:   { requiresAuth: true },
    [ROUTES.APP]:               { requiresAuth: true },
    [ROUTES.DASHBOARD]:         { requiresAuth: true },
    [ROUTES.ADMIN]:             { requiresAuth: true, roles: ['admin', 'superadmin'] },
    [ROUTES.RECEPCAO_CENTRAL]:  { requiresAuth: true, roles: ['apoio', 'admin', 'superadmin'] },
    [ROUTES.PAINEL_PUBLICO]:    { requiresAuth: false },
};

export class SIGEPRouter {
    /**
     * @param {object} app  - Instância do SIGEPApp
     * @param {object} deps - Dependências Injetadas
     */
    constructor(app, deps) {
        this._app  = app;
        this._deps = deps;
        this._currentRoute  = null;
        this._currentParams = {};
        this._handlers = this._buildHandlers();
        this._listening = false;
    }

    // ------------------------------------------------------------------
    // API pública
    // ------------------------------------------------------------------

    init() {
        if (this._listening) return;
        this._listening = true;

        window.addEventListener('popstate', (e) => {
            const state = e.state;
            if (state?.route) {
                this._execute(state.route, state.params || {}, false);
            }
        });
    }

    async navigate(route, params = {}, replace = false) {
        const redirected = this._guard(route);
        if (redirected) {
            return this.navigate(redirected, {}, replace);
        }
        this._pushHistory(route, params, replace);
        await this._execute(route, params, true);
    }

    async resolveInitialRoute() {
        const url = new URLSearchParams(window.location.search);

        if (url.get('painel') === 'true') {
            await this._execute(ROUTES.PAINEL_PUBLICO, {}, false);
            return;
        }

        const app = this._app;
        const savedScreen = localStorage.getItem('sigep_active_screen');
        const pautaId     = localStorage.getItem('lastPautaId');
        const pautaName   = localStorage.getItem('lastPautaName');
        const pautaType   = localStorage.getItem('lastPautaType');

        const routeMap = {
            'app':               async () => {
                if (pautaId && pautaName) {
                    await this.navigate(ROUTES.APP, { pautaId, pautaName, pautaType }, true);
                } else {
                    await this.navigate(ROUTES.PAUTA_SELECTION, {}, true);
                }
            },
            'pauta-selection':   () => this.navigate(ROUTES.PAUTA_SELECTION, {}, true),
            'dashboard':         () => this.navigate(ROUTES.DASHBOARD, {}, true),
            'recepcao-central':  () => this.navigate(ROUTES.RECEPCAO_CENTRAL, {}, true),
            'admin':             () => this.navigate(ROUTES.ADMIN, {}, true),
        };

        if (savedScreen && routeMap[savedScreen]) {
            await routeMap[savedScreen]();
        } else {
            await this.navigate(ROUTES.MODO_SELECTION, {}, true);
        }
    }

    get currentRoute()  { return this._currentRoute; }
    get currentParams() { return this._currentParams; }

    // ------------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------------

    _guard(route) {
        const guard = ROUTE_GUARDS[route];
        if (!guard) return null;

        const app  = this._app;
        const user = app.currentUser;
        const isAuth     = !!app.auth?.currentUser;
        const isApproved = user?.status === 'approved';

        if (guard.requiresAuth && (!isAuth || !isApproved)) {
            return ROUTES.LOGIN;
        }

        if (guard.roles && !guard.roles.includes(user?.role)) {
            this._deps.showNotification('Acesso não permitido para seu perfil.', 'error');
            return ROUTES.PAUTA_SELECTION;
        }

        if (route === ROUTES.APP) {
            const savedType = localStorage.getItem('lastPautaType') || 'normal';
            const modoAtual = app.currentMode;
            const tiposEvento = ['mutirao', 'plantao', 'acao_social', 'mutirão', 'evento'];
            const isEvento = tiposEvento.includes(String(savedType).toLowerCase());
            if (modoAtual === 'normal' && isEvento)    return ROUTES.PAUTA_SELECTION;
            if (modoAtual === 'evento' && !isEvento)   return ROUTES.PAUTA_SELECTION;
        }

        return null;
    }

    _pushHistory(route, params, replace) {
        const state = { route, params };
        const url   = this._buildUrl(route, params);
        if (replace) {
            window.history.replaceState(state, '', url);
        } else {
            window.history.pushState(state, '', url);
        }
    }

    _buildUrl(route, params) {
        const base = window.location.pathname;
        const qs   = new URLSearchParams(window.location.search);

        ['painel', 'r'].forEach(k => qs.delete(k));
        qs.set('r', route);

        if (params.pautaId) qs.set('pautaId', params.pautaId);
        else qs.delete('pautaId');

        return `${base}?${qs.toString()}`;
    }

    async _execute(route, params, saveToStorage) {
        this._currentRoute  = route;
        this._currentParams = params;

        if (saveToStorage) this._persistRoute(route, params);

        const handler = this._handlers[route];
        if (!handler) {
            console.warn(`[SIGEPRouter] Rota sem handler: "${route}"`);
            return;
        }
        
        try {
            await handler(params);
        } catch (error) {
            console.error(`[SIGEPRouter] Falha crítica ao executar a rota ${route}:`, error);
            // Sistema de segurança: Evita que o usuário fique preso na tela branca
            if (route !== ROUTES.MODO_SELECTION && route !== ROUTES.LOGIN) {
                this._deps.showNotification("Erro interno de interface. Restaurando...", "error");
                this.navigate(ROUTES.MODO_SELECTION, {}, true);
            }
        }
    }

    _persistRoute(route, params) {
        const screenMap = {
            [ROUTES.LOGIN]:            'login',
            [ROUTES.MODO_SELECTION]:   'modo-selection',
            [ROUTES.PAUTA_SELECTION]:  'pauta-selection',
            [ROUTES.APP]:              'app',
            [ROUTES.DASHBOARD]:        'dashboard',
            [ROUTES.ADMIN]:            'admin',
            [ROUTES.RECEPCAO_CENTRAL]: 'recepcao-central',
        };
        if (screenMap[route]) {
            localStorage.setItem('sigep_active_screen', screenMap[route]);
        }
        if (route === ROUTES.APP && params.pautaId) {
            localStorage.setItem('lastPautaId',   params.pautaId);
            localStorage.setItem('lastPautaName', params.pautaName || '');
            localStorage.setItem('lastPautaType', params.pautaType || 'normal');
        }
    }

    _buildHandlers() {
        const app  = this._app;
        const deps = this._deps;

        return {
            [ROUTES.LOGIN]: async () => {
                deps.UIService.showScreen('login');
                document.getElementById('admin-panel-btn')?.classList.add('hidden');
                document.getElementById('admin-btn-main')?.classList.add('hidden');
            },

            [ROUTES.MODO_SELECTION]: async () => {
                deps.UIService.showScreen('modoSelection');
                app.applyRoleBasedUI();
            },

            [ROUTES.PAUTA_SELECTION]: async () => {
                if (app.currentPauta) {
                    app._teardownPauta(); // Limpa pauta atual
                }
                
                // Exibição de emergência (Airbag) caso o UIService falhe com o nome exato
                try {
                    deps.UIService.showScreen('pauta-selection');
                } catch (e) {
                    deps.UIService.showScreen('pauta-selection-container');
                }
                
                // Força bruta segura baseada no seu HTML
                const container = document.getElementById('pauta-selection-container');
                if (container) {
                    document.getElementById('login-container')?.classList.add('hidden');
                    document.getElementById('modo-selection-screen')?.classList.add('hidden');
                    document.getElementById('app-container')?.classList.add('hidden');
                    container.classList.remove('hidden');
                }

                await app.loadPautasWithFilter();
                app.applyRoleBasedUI();
            },

            [ROUTES.APP]: async ({ pautaId, pautaName, pautaType } = {}) => {
                const id   = pautaId   || localStorage.getItem('lastPautaId');
                const name = pautaName || localStorage.getItem('lastPautaName');
                const type = pautaType || localStorage.getItem('lastPautaType');
                
                if (id && name) {
                    // Evita o loop de carregamento se a pauta já for a atual
                    if (!app.currentPauta || app.currentPauta.id !== id) {
                        await app.loadPauta(id, name, type);
                    }
                    
                    try {
                        deps.UIService.showScreen('app');
                    } catch(e) {
                        deps.UIService.showScreen('app-container');
                    }
                    
                    // Força bruta segura baseada no seu HTML
                    const container = document.getElementById('app-container');
                    if (container) {
                        document.getElementById('pauta-selection-container')?.classList.add('hidden');
                        document.getElementById('modo-selection-screen')?.classList.add('hidden');
                        container.classList.remove('hidden');
                    }
                } else {
                    await this.navigate(ROUTES.PAUTA_SELECTION, {}, true);
                }
            },

            [ROUTES.DASHBOARD]: async () => {
                deps.DashboardService.showDashboardScreen();
                localStorage.setItem('sigep_active_screen', 'dashboard');
            },

            [ROUTES.ADMIN]: async () => {
                app.showAdminScreen();
            },

            [ROUTES.RECEPCAO_CENTRAL]: async () => {
                await deps.RecepçãoCentralService.abrir(app);
            },

            [ROUTES.PAINEL_PUBLICO]: async () => {
                const { PainelPublicoService } = await import('./painelPublico.js');
                await PainelPublicoService.init(app);
            },
        };
    }
}
