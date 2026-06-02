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
     * @param {object} app  - Instância do SIGEPApp (para ler currentUser, currentMode, etc.)
     * @param {object} deps - { UIService, RecepçãoCentralService, DashboardService, showNotification }
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

    /** Inicializa listeners de History API e rota de abertura de página. */
    init() {
        if (this._listening) return;
        this._listening = true;

        // Botão "voltar/avançar" do navegador
        window.addEventListener('popstate', (e) => {
            const state = e.state;
            if (state?.route) {
                this._execute(state.route, state.params || {}, false);
            }
        });
    }

    /**
     * Navega para uma rota, aplica guards e atualiza a URL.
     * @param {string} route  - Uma das constantes ROUTES
     * @param {object} params - Parâmetros opcionais (ex.: { pautaId, pautaName })
     * @param {boolean} replace - Usar replaceState em vez de pushState
     */
    async navigate(route, params = {}, replace = false) {
        const redirected = this._guard(route);
        if (redirected) {
            // Guard redirecionou para outra rota
            return this.navigate(redirected, {}, replace);
        }
        this._pushHistory(route, params, replace);
        await this._execute(route, params, true);
    }

    /** Resolve a rota correta após o login, sem alterar o histórico. */
    async resolveInitialRoute() {
        const url = new URLSearchParams(window.location.search);

        // Painel público tem prioridade (querystring ?painel=true)
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

        // Guard de modo: evita carregar pautas do modo errado ao retornar via back
        if (route === ROUTES.APP) {
            const savedType = localStorage.getItem('lastPautaType') || 'normal';
            const modoAtual = app.currentMode;
            const tiposEvento = ['mutirao', 'plantao', 'acao_social', 'mutirão', 'evento'];
            const isEvento = tiposEvento.includes(String(savedType).toLowerCase());
            if (modoAtual === 'normal' && isEvento)    return ROUTES.PAUTA_SELECTION;
            if (modoAtual === 'evento' && !isEvento)   return ROUTES.PAUTA_SELECTION;
        }

        return null; // sem redirecionamento
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
        // Mantém querystrings existentes que não pertencem ao router
        const base = window.location.pathname;
        const qs   = new URLSearchParams(window.location.search);

        // Remove params controlados pelo router
        ['painel', 'r'].forEach(k => qs.delete(k));

        // Injeta rota como querystring para não exigir servidor SPA
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
        await handler(params);
    }

    _persistRoute(route, params) {
        // Espelha o comportamento anterior com localStorage para compatibilidade
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
                // Método correto dentro do app
                if (app.currentPauta) {
                    app._teardownPauta(); // Limpa pauta atual
                }
                UIService.showScreen('pauta-selection');
                await app.loadPautasWithFilter();
                app.applyRoleBasedUI();
            },

            [ROUTES.APP]: async ({ pautaId, pautaName, pautaType } = {}) => {
                const id   = pautaId   || localStorage.getItem('lastPautaId');
                const name = pautaName || localStorage.getItem('lastPautaName');
                const type = pautaType || localStorage.getItem('lastPautaType');
                if (id && name) {
                    await app.loadPauta(id, name, type);
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
