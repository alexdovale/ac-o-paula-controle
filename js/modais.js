const todosOsModaisHTML = `
    <!-- MODAL DE ACEITE LGPD -->
    <div id="lgpd-acceptance-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4 text-center">Bem-vindo ao SIGEP</h2>
            <p class="text-sm sm:text-base text-gray-600 text-center mb-6">Para continuar, precisamos da sua confirmação sobre o uso do sistema.</p>
            <div class="space-y-4 mb-8 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label class="flex items-start cursor-pointer group">
                    <input type="checkbox" id="lgpd-check-termos" class="mt-1 h-5 w-5 text-green-600 border-gray-300 rounded focus:ring-green-500">
                    <span class="ml-3 text-sm text-gray-700">
                        Eu li e aceito os <button type="button" onclick="document.getElementById('terms-modal').classList.remove('hidden')" class="text-blue-600 font-bold hover:underline">Termos de Uso</button> do sistema.
                    </span>
                </label>
                <label class="flex items-start cursor-pointer group">
                    <input type="checkbox" id="lgpd-check-privacidade" class="mt-1 h-5 w-5 text-green-600 border-gray-300 rounded focus:ring-green-500">
                    <span class="ml-3 text-sm text-gray-700">
                        Eu concordo com a <button type="button" onclick="document.getElementById('privacy-policy-modal').classList.remove('hidden')" class="text-blue-600 font-bold hover:underline">Política de Privacidade (LGPD)</button> e com o tratamento dos dados inseridos.
                    </span>
                </label>
            </div>
            <button id="btn-confirm-lgpd" disabled class="w-full bg-gray-400 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all duration-300 cursor-not-allowed">
                Confirmar e Entrar
            </button>
        </div>
    </div>

    <!-- TIPO DE PAUTA MODAL -->
    <div id="pauta-type-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4 text-center">Tipo de Pauta</h2>
            <p class="text-sm sm:text-base text-gray-600 text-center mb-6">Selecione o tipo de atendimento para sua nova pauta no SIGEP:</p>
            <div class="space-y-3 sm:space-y-4">
                <button data-type="agendado" class="pauta-type-btn w-full flex items-center justify-center gap-2 p-3 sm:p-4 bg-green-100 text-green-700 font-semibold rounded-lg hover:bg-green-200 transition text-sm sm:text-base">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h8m-11 0h11a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
                    </svg>
                    Atendimento Agendado
                </button>
                <button data-type="avulso" class="pauta-type-btn w-full flex items-center justify-center gap-2 p-3 sm:p-4 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition text-sm sm:text-base">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Atendimento Avulso
                </button>
                <button data-type="multisala" class="pauta-type-btn w-full flex items-center justify-center gap-2 p-3 sm:p-4 bg-blue-100 text-blue-700 font-semibold rounded-lg hover:bg-blue-200 transition text-sm sm:text-base">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    Multi-Salas
                </button>
            </div>
            <div class="flex justify-end mt-6">
                <button id="cancel-pauta-type-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
            </div>
        </div>
    </div>

    <!-- CRIAR PAUTA MODAL -->
    <div id="create-pauta-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">Criar Nova Pauta</h2>
            <label for="create-pauta-name-input" class="block text-sm font-medium text-gray-700 mb-2">Nome da Pauta</label>
            <input type="text" id="create-pauta-name-input" class="w-full p-3 border border-gray-300 rounded-lg mb-4 sm:mb-6 text-sm sm:text-base">
            
            <div id="room-config-container" class="hidden mb-4 sm:mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">Defina as Salas ou Locais</label>
                <div class="flex flex-col sm:flex-row gap-2 mb-3">
                    <input type="text" id="custom-room-input" placeholder="Ex: Vara de Família..." class="w-full sm:flex-1 p-3 border border-gray-300 rounded-lg text-sm sm:text-base" />
                    <button id="add-custom-room-btn" class="w-full sm:w-auto bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition">Adicionar</button>
                </div>
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3" style="min-height: 100px;">
                    <p id="no-rooms-msg" class="text-gray-400 text-xs sm:text-sm text-center mt-4">Nenhum local adicionado ainda.</p>
                    <ul id="custom-rooms-list" class="space-y-2 text-sm"></ul>
                </div>
            </div>

            <div id="orgao-integration-wrapper" class="mb-4 sm:mb-6">
                <label for="select-orgao-integracao" class="block text-sm font-medium text-gray-700 mb-2">
                    Sincronizar com Órgão (Solar/Verde)
                </label>
                <select id="select-orgao-integracao" class="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 text-sm sm:text-base">
                    <option value="">-- Criar pauta vazia (Manual) --</option>
                    <option value="123">DP Duque de Caxias - 1ª Vara Cível</option>
                    <option value="456">DP Duque de Caxias - Família / Mutirão</option>
                    <option value="789">DP Belford Roxo - Núcleo Geral</option>
                </select>
                <p class="text-[9px] sm:text-[10px] text-blue-600 mt-1 italic">Ao selecionar, os nomes agendados serão puxados automaticamente no ato da criação.</p>
            </div>
            
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 mt-6">
                <button id="cancel-create-pauta-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="next-to-ordem-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Avançar</button>
            </div>
        </div>
    </div>

    <!-- ADMIN MODAL -->
    <div id="admin-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4" onclick="this.classList.add('hidden')">
        <div id="admin-window" class="bg-white shadow-2xl w-full max-w-4xl flex flex-col h-full sm:h-auto sm:rounded-xl transition-all duration-300 animate-scale-up" style="max-height: 100vh;" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center bg-slate-50 px-4 py-3 border-b select-none shrink-0 sm:rounded-t-xl">
                <div class="flex items-center gap-2">
                    <span class="text-blue-600 text-base">🛡️</span>
                    <h2 class="text-xs sm:text-sm font-bold text-slate-700 uppercase tracking-wider">Painel do Administrador SIGEP</h2>
                </div>
                <div class="flex items-center gap-1 sm:gap-2">
                    <button id="min-admin-btn" class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600">_</button>
                    <button id="max-admin-btn" class="hidden sm:flex w-8 h-8 items-center justify-center rounded hover:bg-gray-200 text-gray-600">▢</button>
                    <button id="close-admin-modal-btn" class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500 hover:text-white text-gray-600 font-bold text-xl">×</button>
                </div>
            </div>

            <div id="admin-content-area" class="flex-grow overflow-y-auto p-4 md:p-6 space-y-6 sm:space-y-8 text-left scrollable-content bg-white">
                <div class="border-t pt-4">
                    <h3 class="font-bold text-red-600 mb-2 uppercase text-xs sm:text-sm tracking-wide">Manutenção do Sistema e Proteção de Dados (LGPD)</h3>
                    <p class="text-xs text-gray-500 mb-4">Apaga permanentemente os registros e atendimentos concluídos com mais de 7 dias de todas as pautas ativas.</p>
                    <button id="cleanup-old-data-btn" class="w-full bg-red-50 text-red-700 font-black py-3 rounded-lg hover:bg-red-100 transition border border-red-200 text-xs uppercase tracking-wider">
                        Executar Limpeza Manual de 7 Dias
                    </button>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
                        <button id="btn-unidades-master" class="w-full text-left flex items-start gap-3">
                            <span class="text-2xl">🏢</span>
                            <div>
                                <h3 class="font-bold text-slate-800 text-sm">Unidades / Órgãos</h3>
                                <p class="text-[10px] text-slate-500 mt-0.5">Gerenciar ou importar estrutura hierárquica</p>
                            </div>
                        </button>
                    </div>
                </div>

                <div>
                    <h3 class="text-sm sm:text-base font-black text-slate-700 mb-2 border-l-4 border-purple-500 pl-2 uppercase tracking-wide">Auditoria, Segurança e Logs</h3>
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                            <div>
                                <h4 class="font-bold text-slate-800 text-sm">Logs de Atividade em Tempo Real</h4>
                                <p class="text-[11px] text-gray-500">Mapeamento e rastro total de ações e erros de conexão dos colaboradores.</p>
                            </div>
                            <div class="flex w-full sm:w-auto gap-2">
                                <button id="view-audit-logs-btn" class="flex-1 sm:flex-none bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-xs font-bold uppercase tracking-wider shadow-sm">Carregar Logs</button>
                                <button id="export-audit-pdf-btn" class="hidden flex-1 sm:flex-none bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-xs font-bold uppercase tracking-wider shadow-sm">Gerar PDF</button>
                            </div>
                        </div>

                        <div id="audit-filters-section" class="hidden bg-white p-3 border rounded-xl mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 shadow-sm">
                            <div>
                                <label class="block text-[9px] font-black text-gray-400 uppercase">Usuário</label>
                                <select id="filter-log-user" class="w-full border rounded-lg text-xs p-2.5 bg-gray-50"><option value="all">Todos</option></select>
                            </div>
                            <div>
                                <label class="block text-[9px] font-black text-gray-400 uppercase">Ação / Erro</label>
                                <select id="filter-log-action" class="w-full border rounded-lg text-xs p-2.5 bg-gray-50"><option value="all">Todas as Ações</option></select>
                            </div>
                            <div>
                                <label class="block text-[9px] font-black text-gray-400 uppercase">Início</label>
                                <input type="date" id="filter-log-start" class="w-full border rounded-lg text-xs p-2">
                            </div>
                            <div>
                                <label class="block text-[9px] font-black text-gray-400 uppercase">Fim</label>
                                <input type="date" id="filter-log-end" class="w-full border rounded-lg text-xs p-2">
                            </div>
                        </div>

                        <div id="audit-logs-container" class="hidden mt-4 animate-fade-in">
                            <div class="overflow-x-auto border rounded-xl bg-white max-h-60 overflow-y-auto custom-scrollbar">
                                <table class="w-full text-[11px] text-left text-gray-500 min-w-max border-collapse">
                                    <thead class="text-slate-700 uppercase bg-slate-50 border-b font-black text-[9px] tracking-wider sticky top-0 shadow-sm">
                                        <tr>
                                            <th class="px-3 py-2.5">Data / Hora</th>
                                            <th class="px-3 py-2.5">Usuário</th>
                                            <th class="px-3 py-2.5 text-center">Ação</th>
                                            <th class="px-3 py-2.5">Detalhes</th>
                                        </tr>
                                    </thead>
                                    <tbody id="audit-logs-table-body" class="divide-y divide-gray-100"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 class="text-sm sm:text-base font-black text-slate-700 mb-4 border-l-4 border-green-500 pl-2 uppercase tracking-wide">Análise Estatística de Dados (BI / Dashboard)</h3>
                    <div class="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div class="flex flex-col md:flex-row items-end gap-3 mb-6">
                            <div class="w-full md:w-auto flex gap-2">
                                <div class="flex-1">
                                    <label class="block text-[9px] font-black text-gray-400 uppercase">Início</label>
                                    <input type="date" id="stats-filter-start" class="w-full border rounded-lg p-2 text-xs">
                                </div>
                                <div class="flex-1">
                                    <label class="block text-[9px] font-black text-gray-400 uppercase">Fim</label>
                                    <input type="date" id="stats-filter-end" class="w-full border rounded-lg p-2 text-xs">
                                </div>
                            </div>
                            <div class="w-full md:flex-grow flex gap-2 flex-col sm:flex-row">
                                <div class="flex-1">
                                    <label class="block text-[9px] font-black text-gray-400 uppercase">Criador da Pauta</label>
                                    <select id="stats-filter-user" class="w-full border rounded-lg p-2 text-xs bg-white"><option value="all">Todos</option></select>
                                </div>
                                <div class="flex-1">
                                    <label class="block text-[9px] font-black text-gray-400 uppercase">Atendente</label>
                                    <select id="stats-filter-attendant" class="w-full border rounded-lg p-2 text-xs bg-white"><option value="all">Todos</option></select>
                                </div>
                            </div>
                            <button id="btn-load-dashboard" class="w-full md:w-auto bg-green-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-green-700 transition shadow-sm text-xs uppercase tracking-wider">
                                Gerar Métricas
                            </button>
                        </div>
                
                        <div id="dashboard-results" class="hidden space-y-6 animate-fade-in">
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div class="p-3 bg-blue-50 border border-blue-100 rounded-xl text-center shadow-sm">
                                    <p class="text-[9px] text-blue-600 font-black uppercase tracking-wider">Total de Assistidos</p>
                                    <h4 id="dash-total-geral" class="text-2xl font-black text-blue-900 mt-1">0</h4>
                                </div>
                                <div class="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center shadow-sm">
                                    <p class="text-[9px] text-emerald-600 font-black uppercase tracking-wider">Concluídos</p>
                                    <h4 id="dash-total-atendidos" class="text-2xl font-black text-emerald-900 mt-1">0</h4>
                                </div>
                                <div class="p-3 bg-orange-50 border border-orange-100 rounded-xl text-center shadow-sm">
                                    <p class="text-[9px] text-orange-600 font-black uppercase tracking-wider">Taxa Absenteísmo</p>
                                    <h4 id="dash-taxa-falta" class="text-2xl font-black text-orange-900 mt-1">0%</h4>
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="border border-gray-100 rounded-xl p-4 bg-slate-50/50 shadow-inner">
                                    <h5 class="text-[10px] font-black mb-3 uppercase text-slate-400 tracking-widest">Top Assuntos</h5>
                                    <div id="dash-subjects-list" class="space-y-2 text-xs"></div>
                                </div>
                                <div class="border border-gray-100 rounded-xl p-4 bg-slate-50/50 shadow-inner">
                                    <h5 class="text-[10px] font-black mb-3 uppercase text-slate-400 tracking-widest">Atividade / Criador</h5>
                                    <div id="dash-users-list" class="space-y-2 text-xs"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                        <h3 class="font-bold text-slate-700 mb-2 border-b pb-1 text-xs uppercase tracking-wider flex items-center gap-1.5"><span class="w-1.5 h-1.5 bg-amber-500 rounded-full"></span> Usuários Aguardando Aprovação</h3>
                        <div id="pending-users-list" class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar"></div>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-700 mb-2 border-b pb-1 text-xs uppercase tracking-wider flex items-center gap-1.5"><span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Usuários Ativos / Cadastrados</h3>
                        <div id="approved-users-list" class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- EDIT CONFIG MODAL -->
    <div id="edit-pauta-config-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4 text-center">Editar Configurações</h2>
            <p class="text-sm sm:text-base text-gray-600 text-center mb-4">Edite as configurações da pauta no SIGEP</p>
            
            <div class="mb-4 sm:mb-6">
                <h3 class="font-semibold text-gray-700 mb-2 text-sm sm:text-base">Tipo de Pauta</h3>
                <div class="space-y-2">
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="edit-pauta-type" value="agendado" class="h-4 w-4 text-green-600">
                        <span class="ml-3">
                            <span class="font-semibold text-sm sm:text-base">Agendado</span>
                            <span class="block text-[10px] sm:text-xs text-gray-500">Atendimentos com hora marcada</span>
                        </span>
                    </label>
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="edit-pauta-type" value="avulso" class="h-4 w-4 text-green-600">
                        <span class="ml-3">
                            <span class="font-semibold text-sm sm:text-base">Avulso</span>
                            <span class="block text-[10px] sm:text-xs text-gray-500">Atendimentos por ordem de chegada</span>
                        </span>
                    </label>
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="edit-pauta-type" value="multisala" class="h-4 w-4 text-green-600">
                        <span class="ml-3">
                            <span class="font-semibold text-sm sm:text-base">Multi-Salas</span>
                            <span class="block text-[10px] sm:text-xs text-gray-500">Atendimentos distribuídos em salas</span>
                        </span>
                    </label>
                </div>
            </div>

            <div class="mb-4 sm:mb-6">
                <h3 class="font-semibold text-gray-700 mb-2 text-sm sm:text-base">Ordem de Atendimento</h3>
                <div class="space-y-2">
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="edit-ordem" value="padrao" class="h-4 w-4 text-green-600">
                        <span class="ml-3">
                            <span class="font-semibold text-sm sm:text-base">Padrão do Sistema</span>
                            <span class="block text-[10px] sm:text-xs text-gray-500">Prioriza por pontualidade e urgência</span>
                        </span>
                    </label>
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="edit-ordem" value="chegada" class="h-4 w-4 text-green-600">
                        <span class="ml-3">
                            <span class="font-semibold text-sm sm:text-base">Ordem de Chegada</span>
                            <span class="block text-[10px] sm:text-xs text-gray-500">Atende na ordem em que chegaram</span>
                        </span>
                    </label>
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="edit-ordem" value="manual" class="h-4 w-4 text-green-600">
                        <span class="ml-3">
                            <span class="font-semibold text-sm sm:text-base">Ordem Manual</span>
                            <span class="block text-[10px] sm:text-xs text-gray-500">Permite arrastar e reordenar</span>
                        </span>
                    </label>
                </div>
            </div>

            <div class="mb-6">
                <h3 class="font-semibold text-gray-700 mb-2 text-sm sm:text-base">Fluxo de Atendimento</h3>
                <div class="space-y-2">
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="edit-delegation" value="true" class="h-4 w-4 text-green-600">
                        <span class="ml-3">
                            <span class="font-semibold text-sm sm:text-base">Usar fluxo de delegação</span>
                            <span class="block text-[10px] sm:text-xs text-gray-500">Permite delegar finalização para colaborador</span>
                        </span>
                    </label>
                    <div class="ml-5 sm:ml-7 p-3 bg-gray-50 rounded-lg border">
                        <label class="flex items-start cursor-pointer">
                            <input type="checkbox" id="edit-use-distribution" class="h-4 w-4 text-cyan-600 rounded mt-1">
                            <span class="ml-2 sm:ml-3">
                                <span class="font-semibold text-xs sm:text-sm">Habilitar Fila de Distribuição</span>
                                <span class="block text-[9px] sm:text-[10px] text-gray-500">Para processos que precisam de assinatura/protocolo</span>
                            </span>
                        </label>
                    </div>
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="edit-delegation" value="false" class="h-4 w-4 text-red-600">
                        <span class="ml-3">
                            <span class="font-semibold text-sm sm:text-base">Não, finalizar diretamente</span>
                            <span class="block text-[10px] sm:text-xs text-gray-500">Pula a coluna "Em Atendimento"</span>
                        </span>
                    </label>
                </div>
            </div>

            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 mt-6">
                <button id="cancel-edit-pauta-config-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-edit-pauta-config-btn" class="w-full sm:w-auto bg-purple-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-purple-700">Salvar Alterações</button>
            </div>
        </div>
    </div>

    <!-- ORDEM DE ATENDIMENTO MODAL -->
    <div id="ordem-atendimento-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">Ordem de Atendimento</h2>
            <p class="text-sm sm:text-base text-gray-600 mb-6">Como a fila de "Aguardando" será organizada no SIGEP?</p>
            <div id="ordem-atendimento-options" class="space-y-3">
                <label class="flex items-center p-3 sm:p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="ordemAtendimento" value="padrao" class="h-5 w-5 text-green-600 focus:ring-green-500" checked>
                    <span class="ml-3">
                        <span class="font-semibold text-gray-800 text-sm sm:text-base">Padrão do Sistema</span>
                        <span class="block text-xs sm:text-sm text-gray-500">Prioriza por pontualidade e urgência. Justo e flexível.</span>
                    </span>
                </label>
                <label class="flex items-center p-3 sm:p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="ordemAtendimento" value="chegada" class="h-5 w-5 text-green-600 focus:ring-green-500">
                    <span class="ml-3">
                        <span class="font-semibold text-gray-800 text-sm sm:text-base">Ordem de Chegada</span>
                        <span class="block text-xs sm:text-sm text-gray-500">Atende na ordem em que a chegada foi marcada.</span>
                    </span>
                </label>
                <label class="flex items-center p-3 sm:p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="ordemAtendimento" value="manual" class="h-5 w-5 text-green-600 focus:ring-green-500">
                    <span class="ml-3">
                        <span class="font-semibold text-gray-800 text-sm sm:text-base">Ordem Manual</span>
                        <span class="block text-xs sm:text-sm text-gray-500">Permite arrastar e reordenar a fila livremente.</span>
                    </span>
                </label>
            </div>
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 mt-6">
                <button id="cancel-ordem-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Voltar</button>
                <button id="next-to-delegation-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Avançar</button>
            </div>
        </div>
    </div>

    <!-- DELEGATION FLOW MODAL -->
    <div id="delegation-flow-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">Fluxo de Atendimento</h2>
            <p class="text-sm text-gray-600 mb-4 sm:mb-6">Deseja utilizar a coluna "Em Atendimento" para delegar a finalização?</p>
            <div class="space-y-3">
                <label class="flex items-center p-3 sm:p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="useDelegationFlow" value="true" class="h-4 w-4 sm:h-5 sm:w-5 text-green-600 focus:ring-green-500" checked>
                    <span class="ml-3">
                        <span class="font-semibold text-gray-800 text-sm sm:text-base">Sim, usar delegação</span>
                        <span class="block text-xs sm:text-sm text-gray-500">Permite atribuir para outro colaborador.</span>
                    </span>
                </label>
                <div id="distribution-option-container" class="p-3 sm:p-4 border-x border-b rounded-b-lg bg-white ml-5 sm:ml-8 border-t-0">
                    <label class="flex items-start space-x-2 sm:space-x-3 cursor-pointer">
                        <input type="checkbox" id="check-use-distribution" class="h-4 w-4 sm:h-5 sm:w-5 text-cyan-600 focus:ring-cyan-500 rounded mt-1">
                        <div class="flex-1">
                            <span class="font-semibold text-gray-700 block text-sm sm:text-base">Habilitar Fila de Distribuição?</span>
                            <span class="text-[10px] sm:text-xs text-gray-500">Para processos que precisam de protocolo.</span>
                        </div>
                    </label>
                </div>
            </div>
            <div class="mt-4">
                <label class="flex items-center p-3 sm:p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="useDelegationFlow" value="false" class="h-4 w-4 sm:h-5 sm:w-5 text-red-600 focus:ring-red-500">
                    <span class="ml-3">
                        <span class="font-semibold text-gray-800 text-sm sm:text-base">Não, finalizar diretamente</span>
                        <span class="block text-xs sm:text-sm text-gray-500">Pula a coluna "Em Atendimento".</span>
                    </span>
                </label>
            </div>

            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 mt-6">
                <button id="cancel-delegation-flow-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Voltar</button>
                <button id="confirm-create-pauta-final-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Criar Pauta</button>
            </div>
        </div>
    </div>

    <!-- SHARE MODAL -->
    <div id="share-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4 text-gray-800">Compartilhamento Externo</h2>
            <p class="text-gray-600 mb-6 text-xs sm:text-sm">Gere um link público para que assistidos vejam a fila do SIGEP em tempo real.</p>
            
            <div class="flex items-center justify-between mb-4 sm:mb-6 bg-gray-50 p-3 sm:p-4 rounded-lg border">
                <span class="font-medium text-gray-700 text-sm sm:text-base">Status do Link:</span>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="share-toggle" class="sr-only peer">
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                    <span id="share-status-text" class="ml-3 text-sm font-medium text-gray-900">Privado</span>
                </label>
            </div>

            <div id="share-link-container" class="hidden space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase">Link Público</label>
                    <div class="flex mt-1 flex-col sm:flex-row gap-2 sm:gap-0">
                        <input type="text" id="share-link-input" readonly class="w-full p-2 border border-gray-300 rounded-lg sm:rounded-r-none bg-gray-100 text-xs sm:text-sm text-gray-600">
                        <button id="copy-share-link-btn" class="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 sm:rounded-l-none rounded-lg hover:bg-blue-700 font-bold text-sm">Copiar</button>
                    </div>
                </div>
                <div class="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="mask-names-check" class="h-4 w-4 text-pink-600 border-gray-300 rounded">
                    <label for="mask-names-check" class="text-xs sm:text-sm text-gray-700">Ocultar Sobrenomes (Privacidade/LGPD)</label>
                </div>
                <a id="open-external-btn" href="#" target="_blank" class="block w-full text-center py-2.5 border border-pink-600 text-pink-600 rounded-lg hover:bg-pink-50 font-bold mt-4">
                    Abrir Visualização
                </a>
            </div>

            <div class="flex justify-end mt-6">
                <button id="close-share-modal-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Fechar</button>
            </div>
        </div>
    </div>

    <!-- DIST FINISH MODAL -->
    <div id="distribution-finish-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4 text-cyan-800">Concluir Distribuição</h2>
            <p class="mb-4 text-gray-600 text-sm sm:text-base">O processo foi distribuído. Insira o número (opcional).</p>
            
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700">Número do Processo</label>
                <input type="text" id="dist-process-number" placeholder="0000.00.00.0000" class="mt-1 w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm sm:text-base">
            </div>

            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 mt-6">
                <button id="cancel-dist-finish-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-4 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-dist-finish-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-green-700">Finalizar</button>
            </div>
        </div>
    </div>

    <!-- MEMBERS MODAL -->
    <div id="members-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-4 flex-shrink-0">
                <h2 class="text-lg sm:text-2xl font-bold text-gray-800">Gerenciar Membros</h2>
                <button id="close-members-modal-btn" class="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
            </div>
            <div class="overflow-y-auto scrollable-content pr-1">
                <div class="space-y-4">
                    <h3 class="text-sm sm:text-lg font-semibold text-gray-700">Convidar Novo Membro (Usuário)</h3>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <input type="email" id="invite-email-input" placeholder="email@exemplo.com" class="flex-grow p-3 border border-gray-300 rounded-lg text-sm sm:text-base">
                        <button id="invite-member-btn" class="bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 flex-shrink-0">Convidar</button>
                    </div>
                    <div id="invite-status" class="text-sm h-4"></div>
                </div>
                <div class="mt-6">
                    <h3 class="text-sm sm:text-lg font-semibold text-gray-700 mb-2">Membros Atuais da Pauta</h3>
                    <div id="members-list-container" class="space-y-2 max-h-64 overflow-y-auto"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- COLLABORATORS MODAL -->
    <div id="collaborators-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100] p-0 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white w-full max-w-4xl flex flex-col h-full sm:h-auto sm:rounded-xl sm:max-h-[95vh]" style="max-height: 100vh;" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center p-3 sm:p-4 border-b bg-gray-50 sm:rounded-t-xl shrink-0">
                <h2 class="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
                    <span class="text-violet-600">👥</span> Lista de Presença da Equipe
                </h2>
                <button id="close-collaborators-modal-btn" class="text-gray-400 hover:text-red-500 text-3xl p-1 leading-none">&times;</button>
            </div>
    
            <div class="flex-grow overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 scrollable-content bg-white">
                <div class="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="text-[10px] font-black text-slate-400 uppercase mb-3 sm:mb-4 tracking-widest border-b pb-2">Cadastro / Edição</h3>
                    <form id="collaborator-form-modal" class="space-y-3 sm:space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label class="text-[9px] font-black text-gray-500 uppercase">Nome Completo</label>
                                <input type="text" id="collaborator-name-modal" required class="w-full p-2.5 border rounded-lg text-sm bg-white">
                            </div>
                            <div>
                                <label class="text-[9px] font-black text-gray-500 uppercase">Cargo</label>
                                <select id="collaborator-role-modal" required class="w-full p-2.5 border rounded-lg text-sm bg-white">
                                    <option value="Defensor(a)">Defensor(a)</option>
                                    <option value="Servidor(a)">Servidor(a)</option>
                                    <option value="CRC">CRC</option>
                                    <option value="Residente">Residente</option>
                                    <option value="Estagiário(a)">Estagiário(a)</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-[9px] font-black text-gray-500 uppercase">Equipe</label>
                                <select id="collaborator-team-modal" required class="w-full p-2.5 border rounded-lg text-sm bg-white">
                                    <option value="1">Equipe 1</option>
                                    <option value="2">Equipe 2</option>
                                    <option value="3">Equipe 3</option>
                                    <option value="4">Equipe 4</option>
                                </select>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div class="sm:col-span-3">
                                <label id="label-identificador-modal" class="text-[9px] font-black text-gray-500 uppercase">Matrícula/ID</label>
                                <div class="mt-1 flex flex-col sm:flex-row rounded-lg shadow-sm border border-gray-300">
                                    <input type="text" id="collaborator-identificador-modal" placeholder="Matrícula ou ID" required 
                                           class="flex-1 block w-full sm:rounded-l-lg sm:rounded-tr-none rounded-t-lg focus:ring-blue-500 focus:border-blue-500 text-sm p-2.5 bg-white outline-none">
                                    <button type="button" id="buscar-master-btn" 
                                            class="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border-t sm:border-t-0 sm:border-l border-gray-300 bg-gray-50 text-sm font-medium text-gray-700 sm:rounded-r-lg sm:rounded-bl-none rounded-b-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                        Buscar no Banco
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div class="sm:col-span-1">
                                <label class="text-[9px] font-black text-gray-500 uppercase">WhatsApp</label>
                                <input type="tel" id="collaborator-phone-modal" placeholder="21999998888" class="w-full p-2.5 border rounded-lg text-sm bg-white">
                            </div>
                            <div class="sm:col-span-1">
                                <label class="text-[9px] font-black text-gray-500 uppercase">E-mail</label>
                                <input type="email" id="collaborator-email-modal" class="w-full p-2.5 border rounded-lg text-sm bg-white">
                            </div>
                            <div class="flex gap-3 sm:gap-4 p-2.5 bg-white border rounded-lg justify-center sm:justify-start">
                                <label class="text-[9px] font-black text-gray-500 uppercase mr-1">Transp:</label>
                                <label class="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="transporte-colaborador" value="Meios Próprios" checked> Próprio</label>
                                <label class="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="transporte-colaborador" value="Com a Empresa"> Empresa</label>
                            </div>
                        </div>
                        <button type="submit" id="add-collaborator-btn-modal" class="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 transition shadow-md uppercase text-xs sm:text-sm">Salvar Membro</button>
                    </form>
                </div>
    
                <div class="flex flex-col sm:flex-row justify-between items-center gap-3 bg-violet-50 p-3 rounded-xl border border-violet-100">
                    <div class="flex gap-3 text-[10px] font-bold text-violet-800 uppercase">
                        <span>Total: <b id="total-participants-count">0</b></span>
                        <span>Próprio: <b id="self-transport-count">0</b></span>
                        <span>Empresa: <b id="company-transport-count">0</b></span>
                    </div>
                    <div class="flex flex-wrap justify-center gap-3 text-[9px] sm:text-[10px] font-black text-violet-600 uppercase sm:border-l sm:pl-3 border-violet-200">
                        <label class="flex items-center gap-1"><input type="checkbox" class="pdf-col-check h-3 w-3" value="nome" checked> Nome</label>
                        <label class="flex items-center gap-1"><input type="checkbox" class="pdf-col-check h-3 w-3" value="cargo" checked> Cargo</label>
                        <label class="flex items-center gap-1"><input type="checkbox" class="pdf-col-check h-3 w-3" value="equipe" checked> Equipe</label>
                        <label class="flex items-center gap-1"><input type="checkbox" class="pdf-col-check h-3 w-3" value="transporte" checked> Transp</label>
                    </div>
                </div>
    
                <div class="overflow-x-auto border border-gray-100 rounded-xl shadow-sm w-full">
                    <table id="collaborators-list-table-modal" class="w-full min-w-max text-left border-collapse bg-white">
                        <thead class="bg-gray-50 text-[9px] font-black text-gray-400 uppercase border-b">
                            <tr>
                                <th class="p-2 sm:p-3 cursor-pointer hover:text-violet-600" onclick="window.sortColaboradores('nome')">Membro ↕️</th>
                                <th class="p-2 sm:p-3 text-center">Presença</th>
                                <th class="p-2 sm:p-3 cursor-pointer hover:text-violet-600" onclick="window.sortColaboradores('equipe')">Cargo/Equipe ↕️</th>
                                <th class="p-2 sm:p-3">Horário</th>
                                <th class="p-2 sm:p-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="text-xs text-gray-600"></tbody>
                    </table>
                </div>
    
                <div class="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
                    <div class="flex w-full sm:w-auto gap-2">
                        <button id="download-collaborators-pdf-modal" onclick="CollaboratorService.abrirModalExportacaoPDF(window.app)" type="button" class="flex-1 sm:flex-none bg-red-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-red-700 text-[10px] sm:text-xs shadow-md uppercase">Emitir PDF</button>
                        <button id="clear-collaborators-list-modal" class="flex-1 sm:flex-none text-gray-500 bg-gray-200 hover:bg-red-100 hover:text-red-600 py-2.5 px-4 rounded-lg text-[10px] sm:text-xs font-bold uppercase transition">Limpar Lista</button>
                    </div>
                    <button id="btn-gerar-ata-social" class="w-full sm:w-auto bg-green-700 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-green-800 text-[10px] sm:text-xs shadow-md uppercase"> Gerar Ata Social</button>
                </div>
            </div>
        </div>
    </div>

    <!-- ARRIVAL MODAL -->
    <div id="arrival-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">Confirmar Chegada</h2>
            <p class="mb-4 text-sm sm:text-base text-gray-600">Por favor, informe o horário de chegada do assistido.</p>
            
            <div id="arrival-room-container" class="hidden mb-4">
                <label for="arrival-room-select" class="block text-sm font-medium text-gray-700 mb-1">Selecionar Sala de Espera</label>
                <select id="arrival-room-select" class="w-full p-3 border border-gray-300 rounded-lg bg-white text-sm sm:text-base"></select>
            </div>

            <input type="time" id="arrival-time-input" class="w-full p-3 border border-gray-300 rounded-lg mb-6 text-sm sm:text-base">
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4">
                <button id="cancel-arrival-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-arrival-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Confirmar</button>
            </div>
        </div>
    </div>

    <!-- ATTENDANT MODAL -->
    <div id="attendant-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">Finalizar Atendimento</h2>
            <p class="mb-4 text-sm sm:text-base text-gray-600">Selecione o profissional que realizou o atendimento (opcional):</p>
            
            <select id="attendant-select" class="w-full p-3 border border-gray-300 rounded-lg mb-6 bg-white text-sm sm:text-base">
                <option value="">-- Selecione um profissional (opcional) --</option>
            </select>
            
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4">
                <button id="cancel-attendant-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-attendant-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Confirmar</button>
            </div>
        </div>
    </div>

    <!-- SELECT COLLABORATOR MODAL -->
    <div id="select-collaborator-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] flex flex-col" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-3">Atender Assistido</h2>
            <p class="mb-4 text-xs sm:text-sm text-gray-600">Selecione o colaborador que irá atender <strong id="assisted-to-attend-name"></strong>:</p>
            
            <div class="mb-4 shrink-0">
                <input type="text" 
                       id="collaborator-search-input" 
                       placeholder="🔍 Pesquisar colaborador..." 
                       class="w-full p-3 border border-gray-300 rounded-lg text-sm sm:text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all">
            </div>
            
            <div id="collaborator-selection-list" class="space-y-2 mb-6 flex-grow overflow-y-auto border rounded-lg p-2 bg-gray-50 scrollable-content">
                </div>
            
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 shrink-0 border-t pt-4">
                <button id="cancel-select-collaborator-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-select-collaborator-btn" class="w-full sm:w-auto bg-blue-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-blue-700">Confirmar Seleção</button>
            </div>
        </div>
    </div>

    <!-- EDIT ATTENDANT MODAL -->
    <div id="edit-attendant-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">Editar Atendente</h2>
            <p class="mb-4 text-sm sm:text-base text-gray-600">Selecione o profissional que realizou o atendimento:</p>
            
            <select id="edit-attendant-select" class="w-full p-3 border border-gray-300 rounded-lg mb-6 bg-white text-sm sm:text-base">
                <option value="">-- Selecione um profissional --</option>
            </select>
            
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4">
                <button id="cancel-edit-attendant-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-edit-attendant-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Salvar</button>
            </div>
        </div>
    </div>

    <!-- DELEGATE EMAIL MODAL -->
    <div id="delegate-email-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">Delegar Finalização</h2>
            <p class="mb-4 text-sm sm:text-base text-gray-600">Enviar link para <strong id="delegate-assisted-name"></strong>.</p>
            <div class="mb-4">
                <label for="collaborator-email-input" class="block text-sm font-medium text-gray-700">Email do Colaborador:</label>
                <input type="email" id="collaborator-email-input" placeholder="email@exemplo.com" class="mt-1 block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm sm:text-base">
            </div>
            <p class="text-xs sm:text-sm text-gray-500 mb-6">O colaborador receberá um link por e-mail para finalizar o atendimento no SIGEP.</p>
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4">
                <button id="cancel-delegate-email-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="send-delegate-email-btn" class="w-full sm:w-auto bg-blue-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-blue-700">Enviar E-mail</button>
            </div>
        </div>
    </div>

    <!-- RESET CONFIRM MODAL -->
    <div id="reset-confirm-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-lg space-y-4 max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold text-gray-800">Zerar Pauta no SIGEP</h2>
            <p class="text-sm sm:text-base text-gray-600">Tem certeza de que deseja apagar permanentemente todos os dados desta pauta?</p>
            <div id="reset-auth-error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4 hidden" role="alert"></div>
            <div>
                <label for="reset-pauta-password" class="block text-sm font-medium text-gray-700">Confirme sua senha:</label>
                <input type="password" id="reset-pauta-password" class="w-full p-3 border border-gray-300 rounded-lg mt-1 text-sm sm:text-base" required>
            </div>
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 pt-4">
                <button id="cancel-reset-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-reset-btn" class="w-full sm:w-auto bg-red-700 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-red-800">Zerar Pauta</button>
            </div>
        </div>
    </div>

    <!-- EDIT PAUTA MODAL -->
    <div id="edit-pauta-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">Editar Nome da Pauta</h2>
            <label for="edit-pauta-name-input" class="block text-sm font-medium text-gray-700 mb-2">Novo nome da pauta no SIGEP</label>
            <input type="text" id="edit-pauta-name-input" class="w-full p-3 border border-gray-300 rounded-lg mb-6 text-sm sm:text-base">
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4">
                <button id="cancel-edit-pauta-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-edit-pauta-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Salvar</button>
            </div>
        </div>
    </div>

    <!-- CLOSE PAUTA MODAL -->
    <div id="close-pauta-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4" id="close-modal-title">Fechar Pauta</h2>
            <p class="mb-4 text-sm sm:text-base text-gray-600" id="close-modal-message">Para fechar esta pauta, confirme sua senha. Nenhum membro poderá fazer alterações até que você a reabra.</p>
            <input type="password" id="close-pauta-password" placeholder="Sua senha de login" class="w-full p-3 border border-gray-300 rounded-lg mb-6 text-sm sm:text-base">
            <div id="close-auth-error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4 hidden" role="alert"></div>
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4">
                <button id="cancel-close-pauta-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-close-pauta-btn" class="w-full sm:w-auto bg-red-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-red-700">Confirmar</button>
            </div>
        </div>
    </div>

    <!-- FORMAT HELP MODAL -->
    <div id="format-help-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-2xl relative flex flex-col" style="max-height: 95vh;" onclick="event.stopPropagation()">
            <div class="flex-shrink-0 mb-4 pr-8">
                <button id="close-format-help-modal-btn" class="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
                <h2 class="text-xl sm:text-2xl font-bold leading-tight">Preparar Pauta para Importação no SIGEP</h2>
            </div>
            <div class="flex-grow overflow-y-auto scrollable-content pr-2 sm:pr-4">
                <p class="mb-4 text-sm sm:text-base text-gray-600">Crie um arquivo <strong>.csv</strong>. Você pode criar este arquivo usando Excel, Google Sheets ou Bloco de Notas.</p>
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-2">
                     <p class="font-semibold text-sm">O arquivo deve seguir este formato, com 4 colunas:</p>
                     <button id="copy-csv-format-btn" class="bg-gray-200 text-gray-800 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-300 w-full sm:w-auto">Copiar Formato</button>
                </div>
                <div class="bg-gray-100 p-3 sm:p-4 rounded-lg text-xs sm:text-sm mb-4 overflow-x-auto">
                    <code id="csv-format-code" class="whitespace-nowrap">Nome Completo do Assistido;HH:MM;Matéria do Assunto;CPF(opcional)</code>
                </div>
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-2">
                    <h3 class="text-base sm:text-lg font-semibold">Exemplo:</h3>
                    <button id="copy-csv-example-btn" class="bg-gray-200 text-gray-800 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-300 w-full sm:w-auto">Copiar Exemplo</button>
                </div>
                <pre class="bg-gray-100 p-3 sm:p-4 rounded-lg text-xs sm:text-sm overflow-x-auto"><code id="csv-example-code" class="whitespace-pre-wrap word-break">Maria Joaquina de Amaral Pereira;09:00;Divórcio Consensual;111.222.333-44
João da Silva;09:30;Ação de Alimentos;
Fulano de Tal;10:00;Curatela;444.555.666-77</code></pre>
                <ul class="list-disc list-inside mt-4 space-y-2 text-gray-700 text-sm">
                    <li>A primeira linha (cabeçalho) é <strong>opcional</strong>.</li>
                    <li>O <strong>CPF</strong> é opcional. Pode deixar em branco.</li>
                    <li>O <strong>horário</strong> deve ser <strong>HH:MM</strong> (Ex: 09:00).</li>
                </ul>
                <div class="mt-6 pt-4 border-t">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-2">
                        <h3 class="text-base sm:text-lg font-semibold">Prompt para IA:</h3>
                        <button id="copy-ai-prompt-btn" class="bg-gray-200 text-gray-800 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-300 w-full sm:w-auto">Copiar Prompt</button>
                    </div>
                    <p class="text-xs sm:text-sm text-gray-600 mb-2">Cole o texto abaixo no ChatGPT/Gemini junto com seu PDF para generate o CSV automático.</p>
                    <pre class="bg-gray-100 p-3 sm:p-4 rounded-lg text-xs sm:text-sm overflow-x-auto"><code id="ai-prompt-code" class="whitespace-pre-wrap word-break">Olá! Por favor, converta o conteúdo do arquivo PDF que estou enviando para o formato CSV, usando ponto e vírgula (;) como separador. O resultado deve seguir este padrão:

Nome Completo do Assistido;HH:MM;Matéria do Assunto;CPF(opcional)</code></pre>
                </div>
            </div>
        </div>
    </div>

    <!-- DEMANDS MODAL -->
    <div id="demands-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-lg flex flex-col" style="max-height: 95vh;" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-4 flex-shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-800">Demandas Adicionais</h2>
                <button id="close-demands-modal-btn" class="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
            </div>
            <div class="flex-grow overflow-y-auto pr-1">
                <p class="mb-4 text-sm sm:text-base">Assistido: <strong id="demands-assisted-name-modal" class="text-green-600"></strong></p>
                <div class="space-y-2">
                    <label for="demands-modal-new-demand-input" class="block text-sm font-medium text-gray-700">Adicionar nova demanda:</label>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <input type="text" id="demands-modal-new-demand-input" placeholder="Ex: Ação de Partilha..." class="flex-grow p-3 border border-gray-300 rounded-lg text-sm sm:text-base">
                        <button id="demands-modal-add-demand-btn" class="w-full sm:w-auto bg-blue-500 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-600 flex-shrink-0">Adicionar</button>
                    </div>
                </div>
                <div class="mt-6">
                    <h3 class="text-base sm:text-lg font-semibold text-gray-700 mb-2">Demandas Registradas:</h3>
                    <div id="demands-modal-list-container" class="space-y-2 max-h-60 overflow-y-auto bg-gray-50 p-3 rounded-lg border scrollable-content">
                        <p class="text-gray-500 text-center text-sm">Nenhuma demanda adicional.</p>
                    </div>
                </div>
            </div>
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 mt-6 flex-shrink-0 border-t pt-4">
                <button id="cancel-demands-btn" class="w-full sm:w-auto bg-gray-300 text-gray-700 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Fechar</button>
                <button id="save-demands-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Salvar Alterações</button>
            </div>
        </div>
    </div>

    <!-- EDIT ASSISTED MODAL -->
    <div id="edit-assisted-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-lg max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-6">Editar Assistido</h2>
            <div class="space-y-4">
                <div><label for="edit-assisted-name" class="block text-sm font-medium text-gray-700">Nome</label><input type="text" id="edit-assisted-name" class="mt-1 block w-full p-3 border border-gray-300 rounded-lg text-sm sm:text-base"></div>
                <div><label for="edit-assisted-cpf" class="block text-sm font-medium text-gray-700">CPF</label><input type="text" id="edit-assisted-cpf" class="mt-1 block w-full p-3 border border-gray-300 rounded-lg text-sm sm:text-base"></div>
                
                <div><label for="edit-assisted-num-agendamento" class="block text-sm font-medium text-gray-700">Nº Agendamento</label><input type="text" id="edit-assisted-num-agendamento" class="mt-1 block w-full p-3 border border-gray-300 rounded-lg text-sm sm:text-base"></div>
                
                <div><label for="edit-assisted-subject" class="block text-sm font-medium text-gray-700">Assunto</label><input list="subjects-list" type="text" id="edit-assisted-subject" class="mt-1 block w-full p-3 border border-gray-300 rounded-lg text-sm sm:text-base"></div>
                <div><label for="edit-scheduled-time" class="block text-sm font-medium text-gray-700">Horário Agendado</label><input type="time" id="edit-scheduled-time" class="mt-1 block w-full p-3 border border-gray-300 rounded-lg text-sm sm:text-base"></div>
            </div>
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 mt-8">
                <button id="cancel-edit-assisted-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-edit-assisted-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Salvar Alterações</button>
            </div>
        </div>
    </div>

    <!-- PRIORITY REASON MODAL -->
    <div id="priority-reason-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-2xl w-full max-w-md border-t-8 border-red-600 max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-2 text-gray-800">Prioridade Legal</h2>
            <p class="mb-4 sm:mb-6 text-xs sm:text-sm text-gray-500">Selecione uma ou mais categorias:</p>
            
            <div id="priority-types-grid" class="grid grid-cols-2 gap-2 mb-4 sm:mb-6">
                <button type="button" data-value="Idoso (60+)" class="p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition">👴 Idoso (60+)</button>
                <button type="button" data-value="Idoso (80+)" class="p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition">🎖️ Idoso (80+)</button>
                <button type="button" data-value="Deficiência (PCD)" class="p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition">♿ Deficiência</button>
                <button type="button" data-value="Autismo (TEA)" class="p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition">🧩 Autismo</button>
                <button type="button" data-value="Gestante" class="p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition">🤰 Gestante</button>
                <button type="button" data-value="Criança de Colo" class="p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition">👶 Colo</button>
                <button type="button" data-value="Obesidade" class="p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition">⚖️ Obesidade</button>
                <button type="button" data-value="Urgência Médica" class="p-chip border border-gray-200 rounded-lg py-2.5 px-2 text-[10px] sm:text-xs font-semibold hover:bg-red-50 hover:border-red-200 transition">🚑 Médica</button>
            </div>
    
            <label class="block text-[10px] sm:text-xs font-bold text-gray-400 uppercase mb-1">Outros / Observações:</label>
            <textarea id="priority-reason-input" placeholder="Ex: Advogado com prazo..." class="w-full p-3 border border-gray-300 rounded-lg mb-6 h-20 text-sm sm:text-base"></textarea>
            
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4">
                <button id="cancel-priority-reason-btn" class="w-full sm:w-auto bg-gray-200 text-gray-700 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400 transition">Cancelar</button>
                <button id="confirm-priority-reason-btn" class="w-full sm:w-auto bg-red-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-red-700 transition shadow-lg">Confirmar Prioridade</button>
            </div>
        </div>
    </div>

    <!-- PRIVACY POLICY MODAL -->
    <div id="privacy-policy-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-2xl flex flex-col" style="max-height: 95vh;" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-4 flex-shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-800">Política de Privacidade</h2>
                <button id="close-policy-modal-btn-x" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
            </div>
            <div id="policy-content" class="text-sm sm:text-base text-gray-700 space-y-4 overflow-y-auto pr-2 scrollable-content">
                <p><strong>1. Natureza do Sistema e Ciclo de Vida dos Dados</strong><br>
                O Sistema de Gerenciamento de Pauta (SIGEP) é uma interface de controle para a gestão de atendimentos. Ele coleta e armazena os dados pessoais de assistidos, como nome, CPF (opcional), assunto e demanda, por um período de sete dias após a finalização da ação. Após esse prazo, os dados são permanentemente excluídos do SIGEP.<br>
                Para o armazenamento permanente, todos os dados são enviados e salvos no sistema Verde, que é de responsabilidade da Defensoria Pública do Estado do Rio de Janeiro (DPERJ) e está em total conformidade com a LGPD.</p>
                <p><strong>2. Dados Coletados pelo SIGEP</strong><br>
                Para permitir o uso da interface, o SIGEP coleta apenas os dados de autenticação dos usuários (profissionais): e-mail e senha.</p>
                <p><strong>3. Tratamento e Proteção de Dados (dentro do SIGEP)</strong><br>
                Os dados de autenticação são utilizados para garantir o acesso restrito e seguro ao sistema. Os dados de assistidos são armazenados por apenas sete dias, tempo necessário para a conclusão da ação, e são protegidos por cookies e criptografia ponta a ponta.</p>
            </div>
            <div class="flex justify-end mt-6 flex-shrink-0">
                <button id="close-policy-modal-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Fechar</button>
            </div>
        </div>
    </div>

    <!-- MANUAL MODAL -->
    <div id="manual-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-2xl flex flex-col" style="max-height: 95vh;" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-4 flex-shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-800">Manual de Instruções e Orientações</h2>
                <button id="close-manual-modal-x" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
            </div>
            <div class="text-sm sm:text-base text-gray-700 space-y-4 overflow-y-auto pr-2 scrollable-content">
                <h2 class="font-bold text-lg">1. Como usar</h2>
                <h3 class="font-bold">1.1. Login e Cadastro</h3>
                <ul class="list-disc pl-5 space-y-1">
                    <li><strong>Login:</strong> Insira seu email e senha na tela inicial do SIGEP e clique em "Entrar".</li>
                </ul>
            </div>
            <div class="flex justify-end mt-6 flex-shrink-0">
                <button id="close-manual-modal-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Fechar</button>
            </div>
        </div>
    </div>
    
    <!-- TERMS MODAL -->
    <div id="terms-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-2xl flex flex-col" style="max-height: 95vh;" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-4 flex-shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-800">Termos de Uso do SIGEP</h2>
                <button id="close-terms-modal-x" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
            </div>
            <div class="text-sm sm:text-base text-gray-700 space-y-4 overflow-y-auto pr-2 scrollable-content">
                <h3 class="font-bold">1. Aceitação dos Termos</h3>
                <p>Ao acessar e utilizar o SIGEP (Sistema de Gerenciamento de Pauta), você concorda integralmente com estes Termos de Uso.</p>
            </div>
            <div class="flex justify-end mt-6 flex-shrink-0">
                <button id="close-terms-modal-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700">Fechar</button>
            </div>
        </div>
    </div>

    <!-- ASSISTED DETAILS MODAL -->
    <div id="assisted-details-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100] p-0 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white shadow-2xl w-full max-w-4xl flex flex-col h-full sm:h-auto sm:rounded-xl sm:max-h-[95vh]" style="max-height: 100vh;" onclick="event.stopPropagation()">
            
            <div id="assisted-details-modal-header" class="flex justify-between items-center p-3 sm:p-4 border-b bg-gray-50 shrink-0 sm:rounded-t-xl">
                <h2 class="text-sm sm:text-lg font-bold text-gray-800 truncate pr-2">
                    <span id="assisted-details-name" class="text-green-600 uppercase"></span>
                </h2>
                <button id="close-assisted-details-modal-btn" class="text-gray-400 hover:text-red-500 text-3xl p-1 leading-none">&times;</button>
            </div>

            <div id="assisted-details-content-wrapper" class="flex-grow overflow-y-auto p-3 sm:p-6 bg-white scrollable-content">
                <div id="document-action-selection"></div>
                <div id="document-checklist-view" class="hidden flex-col">
                    <div id="document-checklist-view-header-actions" class="p-2 sm:p-4 bg-white border-b flex flex-col gap-3 shrink-0">
                        <div class="flex items-center gap-3 w-full">
                            <button id="back-to-action-selection-btn" class="bg-gray-100 border border-gray-300 text-gray-700 font-bold p-2.5 rounded-lg text-sm shrink-0 active:bg-gray-200">&larr;</button>
                            <div class="flex flex-col min-w-0">
                                <h3 id="checklist-title" class="text-[10px] sm:text-xs font-black text-gray-500 uppercase truncate leading-none mb-1.5"></h3>
                                <span id="checklist-counter" class="text-[9px] sm:text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full w-max border border-blue-100">0 itens selecionados</span>
                            </div>
                        </div>
                        <div class="flex flex-wrap sm:flex-nowrap grid-cols-3 sm:grid-cols-none gap-2 w-full">
                            <button id="btn-gerar-captacao" class="flex-1 sm:flex-none sm:w-auto bg-blue-600 text-white font-bold py-2.5 px-3 rounded-lg text-xs uppercase shadow-sm hover:bg-blue-700 transition-colors">🔗 Captação</button>
                            <button id="print-checklist-btn" class="flex-1 sm:flex-none sm:w-24 bg-red-600 text-white font-bold py-2.5 rounded-lg text-xs uppercase shadow-sm hover:bg-red-700 transition-colors">PDF</button>
                            <button id="reset-checklist-btn" class="flex-1 sm:flex-none sm:w-24 bg-amber-500 text-white font-bold py-2.5 rounded-lg text-xs uppercase shadow-sm hover:bg-amber-600 transition-colors">Mudar</button>
                            <button id="save-checklist-btn" class="flex-1 sm:flex-none sm:w-32 bg-green-600 text-white font-bold py-2.5 rounded-lg text-xs uppercase shadow-lg hover:bg-green-700 transition-colors">Salvar</button>
                        </div>
                    </div>
            
                    <div id="checklist-search-container" class="p-3 bg-gray-50 border-b shrink-0">
                        <input type="search" id="checklist-search" placeholder="Pesquisar documento..." class="w-full p-2.5 border border-gray-300 rounded-lg text-sm sm:text-base outline-none focus:ring-2 focus:ring-green-500">
                    </div>
                    <div id="checklist-container" class="space-y-1 p-2 sm:p-4"></div>
                    <div id="address-editor-container" class="mt-8 border-t pt-6 mb-10 px-2 sm:px-4"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- USER PREFERENCES MODAL -->
    <div id="user-preferences-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-lg max-h-[95vh] overflow-y-auto" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-6 text-center text-gray-800 border-b pb-4">Minhas Preferências - SIGEP</h2>
            <div class="space-y-6 mb-6">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-black text-gray-500 uppercase mb-1">Nome</label>
                        <input type="text" id="pref-user-name" class="w-full p-2 border border-gray-300 rounded-lg bg-gray-100 text-sm" readonly>
                    </div>
                    <div>
                        <label class="block text-xs font-black text-gray-500 uppercase mb-1">Email</label>
                        <input type="email" id="pref-user-email" class="w-full p-2 border border-gray-300 rounded-lg bg-gray-100 text-sm" readonly>
                    </div>
                </div>

                <div class="pt-4 border-t border-gray-100">
                    <h3 class="font-bold text-gray-700 mb-3 flex items-center gap-2">🔊 Sons de Notificação</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200">
                            <input type="checkbox" id="pref-enable-sounds-success" class="h-4 w-4 text-green-600 rounded" checked>
                            <span class="ml-3 text-sm text-gray-700">Sucesso</span>
                        </label>
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200">
                            <input type="checkbox" id="pref-enable-sounds-error" class="h-4 w-4 text-red-600 rounded" checked>
                            <span class="ml-3 text-sm text-gray-700">Erro</span>
                        </label>
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200">
                            <input type="checkbox" id="pref-enable-sounds-info" class="h-4 w-4 text-blue-600 rounded" checked>
                            <span class="ml-3 text-sm text-gray-700">Informativo</span>
                        </label>
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200">
                            <input type="checkbox" id="pref-enable-sounds-warning" class="h-4 w-4 text-orange-600 rounded" checked>
                            <span class="ml-3 text-sm text-gray-700">Aviso</span>
                        </label>
                    </div>
                </div>

                <div class="pt-4 border-t border-gray-100">
                    <h3 class="font-bold text-gray-700 mb-3 flex items-center gap-2">💬 Mensagens na Tela (Toasts)</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200">
                            <input type="checkbox" id="pref-show-toasts-success" class="h-4 w-4 text-green-600 rounded" checked>
                            <span class="ml-3 text-sm text-gray-700">Mostrar Sucesso</span>
                        </label>
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200">
                            <input type="checkbox" id="pref-show-toasts-error" class="h-4 w-4 text-red-600 rounded" checked>
                            <span class="ml-3 text-sm text-gray-700">Mostrar Erros</span>
                        </label>
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200">
                            <input type="checkbox" id="pref-show-toasts-info" class="h-4 w-4 text-blue-600 rounded" checked>
                            <span class="ml-3 text-sm text-gray-700">Mostrar Informações</span>
                        </label>
                        <label class="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200">
                            <input type="checkbox" id="pref-show-toasts-warning" class="h-4 w-4 text-orange-600 rounded" checked>
                            <span class="ml-3 text-sm text-gray-700">Mostrar Avisos</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="flex flex-col sm:flex-row justify-end gap-3 border-t pt-6">
                <button id="cancel-user-preferences-btn" class="w-full sm:w-auto bg-gray-200 text-gray-700 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition">Cancelar</button>
                <button id="save-user-preferences-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700 shadow-md transition">Salvar Alterações</button>
            </div>
        </div>
    </div>

    <!-- NOTES MODAL -->
    <div id="notes-modal" class="hidden fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center p-2 z-50" onclick="this.classList.add('hidden')">
        <div class="bg-white rounded-xl p-5 sm:p-6 w-full sm:w-96 shadow-lg max-h-[95vh] flex flex-col" onclick="event.stopPropagation()">
            <h2 class="text-lg font-semibold text-gray-700 mb-3 shrink-0">Minhas Anotações</h2>
            <textarea id="notes-text" class="w-full flex-grow border border-gray-300 rounded-lg p-3 text-sm sm:text-base focus:ring-2 focus:ring-indigo-500 outline-none" style="min-height: 150px;"></textarea>
            <div class="mt-4 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0">
                <button id="close-notes-btn" class="w-full sm:w-auto bg-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-400 font-bold">Fechar</button>
                <button id="save-notes-btn" class="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 font-bold">Salvar</button>
            </div>
        </div>
    </div>

    <!-- CONFIRM MODAL -->
    <div id="confirm-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-md" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">Confirmação</h2>
            <p id="modal-text" class="mb-6 text-sm sm:text-base text-gray-600">Tem certeza que deseja realizar esta ação?</p>
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4">
                <button id="cancel-action" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="confirm-action" class="w-full sm:w-auto bg-red-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-red-700">Confirmar</button>
            </div>
        </div>
    </div>

    <!-- STATISTICS MODAL -->
    <div id="statistics-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-0 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white shadow-xl w-full max-w-6xl flex flex-col h-full sm:h-auto sm:rounded-xl sm:max-h-[95vh]" style="max-height: 100vh;" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center p-3 sm:p-4 border-b bg-gray-50 shrink-0 sm:rounded-t-xl">
                <h2 class="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
                    <span class="text-green-600">📊</span> Estatísticas da Pauta
                </h2>
                <button id="close-statistics-modal-btn" class="text-gray-400 hover:text-red-500 text-3xl p-1 leading-none">&times;</button>
            </div>
            <div id="statistics-content" class="flex-grow overflow-auto p-3 sm:p-4 scrollable-content bg-white"></div>
        </div>
    </div>

    <!-- ATA SOCIAL MODAL -->
    <div id="ata-social-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[200] p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[95vh] flex flex-col" onclick="event.stopPropagation()">
            <div class="p-5 sm:p-6 border-b bg-gray-50 rounded-t-xl shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-800">Ata de Ação Social</h2>
                <p class="text-xs text-gray-500 mt-1">Preencha os dados do evento</p>
            </div>
            <div class="p-5 sm:p-6 space-y-4 overflow-y-auto scrollable-content">
                <div>
                    <label class="block text-xs font-bold text-gray-700 uppercase mb-1">🏷️ Nome da Ação / Projeto</label>
                    <input type="text" id="ata-acao-nome" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Ex: Mutirão de Documentação">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 uppercase mb-1">📍 Endereço do Evento</label>
                    <input type="text" id="ata-endereco" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Ex: Praça do Pacificador, Centro, Caxias">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">📅 Data</label>
                        <input type="date" id="ata-data" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">🔢 Total Assistidos</label>
                        <input type="number" id="ata-total" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 font-bold" min="0" title="Calculado automaticamente ou manual">
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 uppercase mb-1">🏢 Órgão de Atendimento (SIGEP)</label>
                    <input type="text" id="ata-orgao" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Ex: Defensoria Pública - Duque de Caxias">
                </div>
            </div>
            <div class="flex flex-col sm:flex-row justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl shrink-0">
                <button id="save-ata-data-btn" class="w-full sm:w-auto bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition uppercase text-xs tracking-wider shadow-sm hidden">Salvar Memória</button>
                <button id="cancel-ata-modal-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-4 rounded-lg hover:bg-gray-400 transition uppercase text-xs tracking-wider">Cancelar</button>
                <button id="confirm-ata-modal-btn" class="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700 transition uppercase text-xs tracking-wider shadow-sm">Gerar Ata Oficial</button>
            </div>
        </div>
    </div>
    
    <!-- MANAGE ROOMS MODAL -->
    <div id="manage-rooms-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-5 sm:p-8 rounded-xl shadow-xl w-full max-w-md max-h-[95vh] flex flex-col" onclick="event.stopPropagation()">
            <h2 class="text-xl sm:text-2xl font-bold mb-4 text-gray-800">Gerenciar Salas / Varas</h2>
            <div id="manage-rooms-list" class="space-y-2 overflow-y-auto pr-2 flex-grow mb-6 scrollable-content"></div>
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:space-x-4 shrink-0 border-t pt-4">
                <button id="cancel-manage-rooms-btn" class="w-full sm:w-auto bg-gray-300 text-gray-800 font-bold py-2.5 px-6 rounded-lg hover:bg-gray-400">Cancelar</button>
                <button id="save-manage-rooms-btn" class="w-full sm:w-auto bg-blue-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-blue-700">Salvar Alterações</button>
            </div>
        </div>
    </div>
    
    <!-- CAPTACAO QR MODAL -->
    <div id="modal-captacao-qr" class="hidden fixed inset-0 bg-black/60 z-[200] flex items-center justify-center backdrop-blur-sm p-4" onclick="this.classList.add('hidden')">
        <div class="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center relative" onclick="event.stopPropagation()">
            <button onclick="document.getElementById('modal-captacao-qr').classList.add('hidden')" class="absolute top-3 right-3 text-gray-400 hover:text-red-500">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <h3 class="text-lg font-black text-slate-800 mb-1">Captação Direta</h3>
            <p class="text-xs text-slate-500 mb-4">Peça para o assistido ler o QR Code ou envie o link diretamente:</p>
            
            <div id="qrcode-display" class="flex justify-center p-4 bg-white border-4 border-slate-100 rounded-xl mb-4"></div>
            
            <div class="mb-3 text-left">
                <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">WhatsApp / Celular do Assistido:</label>
                <input type="tel" id="captacao-phone-input" placeholder="(21) 90000-0000" maxlength="15" class="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 bg-gray-50">
            </div>

            <div class="space-y-2 w-full mb-3">
                <button id="btn-copy-link" class="w-full bg-slate-700 text-white py-2 rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center justify-center gap-2 transition shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                    COPIAR LINK
                </button>
                
                <div class="flex gap-2">
                    <button id="btn-share-wa" class="flex-1 bg-green-500 text-white py-2 rounded-lg text-xs font-bold hover:bg-green-600 flex items-center justify-center gap-1 transition shadow-sm">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg> WhatsApp
                    </button>
                    <button id="btn-share-sms" class="flex-1 bg-blue-500 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-600 flex items-center justify-center gap-1 transition shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg> SMS
                    </button>
                </div>
            </div>
        </div>
    </div>
`;

export function injetarModais() {
    const container = document.getElementById('modals-container');
    if (container) {
        container.innerHTML = todosOsModaisHTML;
        console.log("Modais injetados com sucesso!");
    } else {
        console.error("Container de modais não encontrado!");
    }
}

// Injeção imediata
injetarModais();
