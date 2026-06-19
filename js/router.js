// router.js
// Sistema de roteamento SPA para o SIGEP App

export const ROUTES = {
    LOGIN:            'login',
    MODO_SELECTION:   'modo-selection',
    PAUTA_SELECTION:  'pauta-selection',
    APP:              'app',
    DASHBOARD:        'dashboard',
    ADMIN:            'admin',
    RECEPCAO_CENTRAL: 'recepcao-central',
    PAINEL_PUBLICO:   'painel-publico',
    MEU_PERFIL:       'meu-perfil',
};

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

// 🔴 CORREÇÃO AQUI: Todos os IDs de container que existem no index.html
// Se o ID da sua tela de perfil for diferente no HTML, altere o 'meu-perfil-container' abaixo.
const ALL_SCREEN_IDS = [
    'login-container',
    'modo-selection-screen',
    'pauta-selection-container',
    'app-container',
    'dashboard-container',
    'admin-container',
    'recepcao-central-container',
    'painel-publico-container',
    'meu-perfil-container', // <-- Container do perfil adicionado para não empilhar!
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
            if (state?.route) this._execute(state.route, state.params || {}, false);
        });
    }

    async navigate(route, params = {}, replace = false) {
        const redirected = this._guard(route, params);
        if (redirected) return this.navigate(redirected, {}, replace);
        this._pushHistory(route, params, replace);
        await this._execute(route, params, true);
    }

    async resolveInitialRoute() {
        const url = new URLSearchParams(window.location.search);
        if (url.get('painel') === 'true') {
            await this._execute(ROUTES.PAINEL_PUBLICO, {}, false);
            return;
        }

        const savedScreen = localStorage.getItem('sigep_active_screen');
        const pautaId     = localStorage.getItem('lastPautaId');
        const pautaName   = localStorage.getItem('lastPautaName');
        const pautaType   = localStorage.getItem('lastPautaType');

        const routeMap = {
            'app':              async () => {
                if (pautaId && pautaName) await this.navigate(ROUTES.APP, { pautaId, pautaName, pautaType }, true);
                else await this.navigate(ROUTES.PAUTA_SELECTION, {}, true);
            },
            'pauta-selection':  () => this.navigate(ROUTES.PAUTA_SELECTION, {}, true),
            'dashboard':        () => this.navigate(ROUTES.DASHBOARD, {}, true),
            'recepcao-central': () => this.navigate(ROUTES.RECEPCAO_CENTRAL, {}, true),
            'admin':            () => this.navigate(ROUTES.ADMIN, {}, true),
        };

        if (savedScreen && routeMap[savedScreen]) await routeMap[savedScreen]();
        else await this.navigate(ROUTES.MODO_SELECTION, {}, true);
    }

    get currentRoute()  { return this._currentRoute; }
    get currentParams() { return this._currentParams; }

    // ── ESCONDE TODAS AS TELAS ────────────────────────────────────────
    _hideAllScreens() {
        ALL_SCREEN_IDS.forEach(id => {
            // Isso garante que qualquer tela na lista anterior perca a visibilidade
            document.getElementById(id)?.classList.add('hidden');
        });
    }

    // ── GUARD ─────────────────────────────────────────────────────────
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

        if (route === ROUTES.APP) {
            const modoAtual   = app.currentMode;
            const tiposEvento = ['mutirao', 'plantao', 'acao_social', 'mutirão', 'evento'];

            const pautaTipo = params.pautaTipo
                           || localStorage.getItem('lastPautaTipo')
                           || '';
            const pautaType = params.pautaType
                           || localStorage.getItem('lastPautaType')
                           || 'normal';

            const isEvento = tiposEvento.includes(String(pautaTipo).toLowerCase())
                          || tiposEvento.includes(String(pautaType).toLowerCase());

            if (modoAtual === 'normal' && isEvento)  return ROUTES.PAUTA_SELECTION;
            if (modoAtual === 'evento' && !isEvento) return ROUTES.PAUTA_SELECTION;
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
        if (!handler) { console.warn(`[SIGEPRouter] Rota sem handler: "${route}"`); return; }
        
        try {
            await handler(params);
        } catch (error) {
            console.error(`[SIGEPRouter] Falha crítica na rota ${route}:`, error);
            if (this._deps?.showNotification) {
                this._deps.showNotification("Erro na interface: " + (error.message || "Erro desconhecido"), "error");
            }
            console.trace("Stacktrace da falha na rota " + route);
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
        if (screenMap[route]) localStorage.setItem('sigep_active_screen', screenMap[route]);
        if (route === ROUTES.APP && params.pautaId) {
            localStorage.setItem('lastPautaId',   params.pautaId);
            localStorage.setItem('lastPautaName', params.pautaName || '');
            localStorage.setItem('lastPautaType', params.pautaType || 'normal');
            localStorage.setItem('lastPautaTipo', params.pautaTipo || '');
        }
    }

    _buildHandlers() {
        const app  = this._app;
        const deps = this._deps;

        return {
            // ── LOGIN ──────────────────────────────────────────────────
            [ROUTES.LOGIN]: async () => {
                this._hideAllScreens();
                document.getElementById('login-container')?.classList.remove('hidden');
                document.getElementById('admin-panel-btn')?.classList.add('hidden');
                document.getElementById('admin-btn-main')?.classList.add('hidden');
            },

            // ── MODO SELECTION ─────────────────────────────────────────
            [ROUTES.MODO_SELECTION]: async () => {
                this._hideAllScreens();
                document.getElementById('modo-selection-screen')?.classList.remove('hidden');
                app.applyRoleBasedUI();
            },

            // ── PAUTA SELECTION ────────────────────────────────────────
            [ROUTES.PAUTA_SELECTION]: async () => {
                if (app.currentPauta) app._teardownPauta();

                this._hideAllScreens();
                document.getElementById('pauta-selection-container')?.classList.remove('hidden');

                if (deps.UIService?.renderPautaFilters) {
                    deps.UIService.renderPautaFilters(
                        'filters-container',
                        app.currentPautaFilter || 'all',
                        (val) => { app.currentPautaFilter = val; app.loadPautasWithFilter(); },
                        app
                    );
                }

                await app.loadPautasWithFilter();
                app.applyRoleBasedUI();
            },

            // ── APP (pauta aberta) ─────────────────────────────────────
            [ROUTES.APP]: async ({ pautaId, pautaName, pautaType, pautaTipo } = {}) => {
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

            // ── DASHBOARD ──────────────────────────────────────────────
            [ROUTES.DASHBOARD]: async () => {
                this._hideAllScreens();
                deps.DashboardService.showDashboardScreen();
                localStorage.setItem('sigep_active_screen', 'dashboard');
            },

            // ── ADMIN ──────────────────────────────────────────────────
            [ROUTES.ADMIN]: async () => {
                this._hideAllScreens();
                document.getElementById('admin-container')?.classList.remove('hidden');
                app.renderAdminContent();
            },

            // ── RECEPÇÃO CENTRAL ───────────────────────────────────────
            [ROUTES.RECEPCAO_CENTRAL]: async () => {
                this._hideAllScreens();
                await deps.RecepçãoCentralService.abrir(app);
            },

            // ── PAINEL PÚBLICO ─────────────────────────────────────────
            [ROUTES.PAINEL_PUBLICO]: async () => {
                this._hideAllScreens();
                const { PainelPublicoService } = await import('./painelPublico.js');
                await PainelPublicoService.init(app);
            },

            // ── MEU PERFIL ───────────────────────────────────────────────
            [ROUTES.MEU_PERFIL]: async () => {
                this._hideAllScreens();
                document.getElementById('meu-perfil-container')?.classList.remove('hidden');
                
                // Se você já tiver importado o serviço de perfil, inicializamos a tela:
                if (deps.PerfilService) {
                    await deps.PerfilService.carregarDados(app);
                }
            },
        };
    }
}
