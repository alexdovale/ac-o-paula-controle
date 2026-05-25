
import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
    writeBatch, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification } from './utils.js';
import { logAction } from './admin.js';

// ─── HELPER ───────────────────────────────────────────────────────────────────

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Mapa de tipo → ícone e cor padrão
const TIPO_VISUAL = {
    central:      { icone: '🏛️', cor: 'slate'  },
    especializada:{ icone: '⚖️', cor: 'blue'   },
    mista:        { icone: '📋', cor: 'green'  },
    generalista:  { icone: '🗂️', cor: 'amber'  },
};

// ─── SERVIÇO PRINCIPAL ───────────────────────────────────────────────────────

export const ImportadorOrgaosService = {

    _app: null,
    _dadosImportados: null,
    _dadosEditados: null,
    _unsubEstrutura: null,

    // =========================================================================
    // 1. ABRIR MODAL PRINCIPAL (com abas)
    // =========================================================================

    abrirModal(app, abaInicial = 'upload') {
        this._app = app;

        // Só superadmin
        if (app.currentUser?.role !== 'superadmin') {
            showNotification("Acesso restrito a Superadmin.", "warning");
            return;
        }

        const existing = document.getElementById('importador-orgaos-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'importador-orgaos-modal';
        modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[400] p-4 overflow-y-auto';
        modal.innerHTML = this._htmlModal();
        document.body.appendChild(modal);
        this._setupEventos(modal, abaInicial);

        // Carrega estrutura existente em background
        this._carregarEstruturaExistente();
    },

    // =========================================================================
    // 2. ABRIR APENAS GERENCIADOR (sem abas, modo simplificado)
    // =========================================================================

    abrirGerenciador(app) {
        this.abrirModal(app, 'estrutura');
    },

    // =========================================================================
    // 3. ABRIR APENAS IMPORTADOR (sem abas, modo simplificado)
    // =========================================================================

    abrirImportador(app) {
        this.abrirModal(app, 'upload');
    },

    // =========================================================================
    // 4. ABRIR MODAL MASTER (com escolha entre Gerenciar e Importar)
    // =========================================================================

    abrirModalMaster(app) {
        this._app = app;

        // Só superadmin
        if (app.currentUser?.role !== 'superadmin') {
            showNotification("Acesso restrito a Superadmin.", "warning");
            return;
        }

        // Evita abrir múltiplos modais master
        const existing = document.getElementById('modal-unidades-master');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'modal-unidades-master';
        modal.className = 'fixed inset-0 bg-black/70 z-[500] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
                <div class="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-black text-white flex items-center gap-2">🏢 Gestão de Unidades</h2>
                        <p class="text-slate-300 text-xs mt-1">Escolha uma opção abaixo</p>
                    </div>
                    <button id="fechar-modal-unidades-master" class="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
                </div>
                
                <div class="p-6 space-y-4">
                    <!-- Opção 1: Gerenciar Unidades -->
                    <button id="btn-opcao-gerenciar" 
                        class="w-full flex items-center gap-4 p-4 border-2 border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group">
                        <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl group-hover:bg-blue-200 transition">📋</div>
                        <div class="text-left flex-1">
                            <p class="font-bold text-slate-800 text-base">Gerenciar Unidades</p>
                            <p class="text-[10px] text-slate-500">Cadastrar, editar e excluir unidades/órgãos</p>
                        </div>
                        <svg class="w-5 h-5 text-slate-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>
                    
                    <!-- Opção 2: Importar Órgãos -->
                    <button id="btn-opcao-importar" 
                        class="w-full flex items-center gap-4 p-4 border-2 border-slate-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-all group">
                        <div class="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-2xl group-hover:bg-emerald-200 transition">📁</div>
                        <div class="text-left flex-1">
                            <p class="font-bold text-slate-800 text-base">Importar Órgãos</p>
                            <p class="text-[10px] text-slate-500">Importar estrutura hierárquica via CSV/JSON</p>
                        </div>
                        <svg class="w-5 h-5 text-slate-400 group-hover:text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>
                </div>
                
                <div class="bg-slate-50 px-6 py-4 flex justify-end border-t">
                    <button id="fechar-modal-unidades-master-footer" class="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition">Fechar</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const fechar = () => modal.remove();
        document.getElementById('fechar-modal-unidades-master')?.addEventListener('click', fechar);
        document.getElementById('fechar-modal-unidades-master-footer')?.addEventListener('click', fechar);
        modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
        
        // Opção: Gerenciar Unidades
        document.getElementById('btn-opcao-gerenciar')?.addEventListener('click', () => {
            fechar();
            this.abrirGerenciador(app);
        });
        
        // Opção: Importar Órgãos
        document.getElementById('btn-opcao-importar')?.addEventListener('click', () => {
            fechar();
            this.abrirImportador(app);
        });
    },

    // =========================================================================
    // 5. HTML DO MODAL PRINCIPAL (com abas)
    // =========================================================================

    _htmlModal() {
        return `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">

            <!-- Cabeçalho -->
            <div class="bg-gradient-to-r from-purple-800 to-purple-900 px-6 py-4 flex justify-between items-center shrink-0">
                <div>
                    <h2 class="text-xl font-black text-white flex items-center gap-2">📁 Importador e Gerenciador de Órgãos</h2>
                    <p class="text-purple-200 text-xs mt-1">Gerencie ou importe a hierarquia completa da Defensoria</p>
                </div>
                <button id="fechar-importador" class="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
            </div>

            <!-- Abas -->
            <div class="flex border-b border-slate-200 bg-white shrink-0">
                <button class="tab-imp active-tab py-3 px-5 font-bold text-sm text-purple-600 border-b-2 border-purple-600" data-tab="upload">📤 Upload</button>
                <button class="tab-imp py-3 px-5 font-bold text-sm text-slate-400 hover:text-slate-600" data-tab="preview">👁️ Prévia</button>
                <button class="tab-imp py-3 px-5 font-bold text-sm text-slate-400 hover:text-slate-600" data-tab="estrutura">🗂️ Estrutura Atual</button>
                <button class="tab-imp py-3 px-5 font-bold text-sm text-slate-400 hover:text-slate-600" data-tab="modelo">📄 Modelo</button>
            </div>

            <!-- Conteúdo -->
            <div class="flex-1 overflow-y-auto">

                <!-- ABA: UPLOAD -->
                <div id="painel-upload" class="p-6">
                    <div class="border-2 border-dashed border-purple-300 rounded-2xl p-10 text-center hover:border-purple-500 transition cursor-pointer" id="drop-zone">
                        <input type="file" id="arquivo-estrutura" accept=".csv,.json" class="hidden">
                        <p class="text-5xl mb-4">📂</p>
                        <button id="btn-selecionar-arquivo" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-xl transition shadow-lg text-sm">
                            Selecionar Arquivo
                        </button>
                        <p class="text-sm text-gray-500 mt-3">CSV ou JSON · Arraste e solte aqui</p>
                    </div>

                    <div id="info-arquivo" class="hidden mt-5 p-4 bg-green-50 rounded-xl border border-green-200 flex items-start justify-between gap-4">
                        <div>
                            <p class="text-green-700 font-bold text-sm">✅ Arquivo carregado!</p>
                            <p id="info-arquivo-detalhes" class="text-xs text-green-600 mt-1"></p>
                        </div>
                        <button id="btn-processar-arquivo" class="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 font-bold text-sm shrink-0">
                            Ver Prévia →
                        </button>
                    </div>

                    <div class="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                        <strong>⚠️ Sobre duplicatas:</strong> o sistema compara pelo nome da unidade. Unidades com o mesmo nome serão ignoradas na importação.
                    </div>
                </div>

                <!-- ABA: PREVIEW -->
                <div id="painel-preview" class="hidden p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-black text-slate-800 text-base">Prévia e ajustes antes de importar</h3>
                        <div class="flex gap-2">
                            <button id="btn-voltar-upload" class="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 font-bold text-sm">← Voltar</button>
                            <button id="btn-importar-confirmar" class="bg-green-600 text-white px-6 py-2 rounded-xl hover:bg-green-700 font-black text-sm shadow">
                                🚀 Importar para o Sistema
                            </button>
                        </div>
                    </div>
                    <div id="preview-estrutura" class="space-y-4"></div>
                </div>

                <!-- ABA: ESTRUTURA ATUAL (GERENCIAMENTO) -->
                <div id="painel-estrutura" class="hidden p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-black text-slate-800 text-base">Estrutura importada no sistema</h3>
                        <button id="btn-nova-unidade-manual" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 font-bold text-sm">
                            + Nova Unidade
                        </button>
                    </div>
                    <div id="lista-estrutura-atual" class="space-y-3">
                        <div class="flex justify-center py-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>
                    </div>
                </div>

                <!-- ABA: MODELO -->
                <div id="painel-modelo" class="hidden p-6 space-y-5">
                    <div class="bg-slate-800 text-white p-4 rounded-xl overflow-x-auto text-xs">
                        <p class="text-purple-300 font-bold mb-2">CSV — Cabeçalho:</p>
                        <code>tipo,nome,sigla,endereco,telefone,email,andar,recepcao_nome,recepcao_tipo,salas,responsaveis,assuntos</code>
                        <p class="text-purple-300 font-bold mt-4 mb-2">CSV — Exemplo:</p>
                        <pre>UNIDADE,Defensoria Pública - Duque de Caxias,DP Caxias,"Av. Presidente Kennedy, s/n",,(21) 2675-1234,caxias@dperj.br,,,,
RECEPCAO,,,,,,Térreo,Recepção Central,central,"Recepção Principal;Guichê 1","admin@dperj.br",
RECEPCAO,,,,,,2º Andar,Núcleo de Família,especializada,"1ª Vara Família;2ª Vara Família;CEJUSC","familia@dperj.br","Família;Alimentos;Guarda"</pre>
                    </div>
                    <div class="bg-slate-800 text-white p-4 rounded-xl overflow-x-auto text-xs">
                        <p class="text-purple-300 font-bold mb-2">JSON — Exemplo:</p>
                        <pre>${escapeHTML(`{
  "unidades": [
    {
      "nome": "Defensoria Pública - Duque de Caxias",
      "sigla": "DP Caxias",
      "endereco": "Av. Presidente Kennedy, s/n",
      "telefone": "(21) 2675-1234",
      "email": "caxias@dperj.br",
      "recepcoes": [
        {
          "nome": "Recepção Central",
          "andar": "Térreo",
          "tipo": "central",
          "salas": ["Recepção Principal", "Guichê 1"],
          "responsaveis": ["admin@dperj.br"],
          "assuntosPermitidos": []
        }
      ]
    }
  ]
}`)}</pre>
                    </div>
                    <div class="flex gap-3">
                        <button id="btn-baixar-modelo-csv" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-bold">📥 Baixar CSV</button>
                        <button id="btn-baixar-modelo-json" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-bold">📥 Baixar JSON</button>
                    </div>
                    <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 space-y-1">
                        <p class="font-bold">⚠️ Regras do arquivo:</p>
                        <ul class="list-disc list-inside space-y-1">
                            <li>No CSV, sempre defina UNIDADE antes das RECEPCAO que pertencem a ela.</li>
                            <li>Use <code>;</code> (ponto e vírgula) para separar múltiplos valores em salas, responsáveis e assuntos.</li>
                            <li>Tipos válidos: <code>central</code>, <code>especializada</code>, <code>mista</code>, <code>generalista</code>.</li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Rodapé -->
            <div class="bg-slate-50 px-6 py-3 flex justify-end border-t shrink-0">
                <button id="fechar-importador-footer" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 text-sm font-bold">Fechar</button>
            </div>
        </div>`;
    },

    // =========================================================================
    // 6. EVENTOS DO MODAL PRINCIPAL
    // =========================================================================

    _setupEventos(modal, abaInicial = 'upload') {
        const fechar = () => {
            if (this._unsubEstrutura) { this._unsubEstrutura(); this._unsubEstrutura = null; }
            modal.remove();
        };

        document.getElementById('fechar-importador')?.addEventListener('click', fechar);
        document.getElementById('fechar-importador-footer')?.addEventListener('click', fechar);
        modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });

        // Abas
        document.querySelectorAll('.tab-imp').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab-imp').forEach(t => {
                    t.classList.remove('text-purple-600', 'border-b-2', 'border-purple-600');
                    t.classList.add('text-slate-400');
                });
                tab.classList.remove('text-slate-400');
                tab.classList.add('text-purple-600', 'border-b-2', 'border-purple-600');

                ['upload','preview','estrutura','modelo'].forEach(id => {
                    document.getElementById(`painel-${id}`)?.classList.add('hidden');
                });
                document.getElementById(`painel-${tab.dataset.tab}`)?.classList.remove('hidden');
            });
        });

        // Ativar aba inicial
        if (abaInicial) {
            const tabInicial = document.querySelector(`.tab-imp[data-tab="${abaInicial}"]`);
            if (tabInicial) tabInicial.click();
        }

        // Drop zone
        const dropZone = document.getElementById('drop-zone');
        dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-purple-600', 'bg-purple-50'); });
        dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('border-purple-600', 'bg-purple-50'));
        dropZone?.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-purple-600', 'bg-purple-50');
            const file = e.dataTransfer.files[0];
            if (file) await this._processarArquivo(file);
        });

        document.getElementById('btn-selecionar-arquivo')?.addEventListener('click', () => {
            document.getElementById('arquivo-estrutura')?.click();
        });

        document.getElementById('arquivo-estrutura')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) await this._processarArquivo(file);
        });

        document.getElementById('btn-processar-arquivo')?.addEventListener('click', () => {
            this._gerarPreview();
            document.querySelector('.tab-imp[data-tab="preview"]')?.click();
        });

        document.getElementById('btn-voltar-upload')?.addEventListener('click', () => {
            document.querySelector('.tab-imp[data-tab="upload"]')?.click();
        });

        document.getElementById('btn-importar-confirmar')?.addEventListener('click', async () => {
            await this._importarParaSistema();
        });

        document.getElementById('btn-nova-unidade-manual')?.addEventListener('click', () => {
            this._abrirFormUnidade(null);
        });

        document.getElementById('btn-baixar-modelo-csv')?.addEventListener('click', () => this._baixarModeloCSV());
        document.getElementById('btn-baixar-modelo-json')?.addEventListener('click', () => this._baixarModeloJSON());

        // Carregar estrutura
        this._carregarEstruturaExistente();
    },

    // =========================================================================
    // 7. PARSING DE ARQUIVOS
    // =========================================================================

    async _processarArquivo(file) {
        try {
            const ext = file.name.split('.').pop().toLowerCase();
            let dados;

            if (ext === 'csv') dados = await this._parseCSV(file);
            else if (ext === 'json') dados = await this._parseJSON(file);
            else { showNotification("Use CSV ou JSON.", "error"); return; }

            this._dadosImportados = dados;
            this._dadosEditados = JSON.parse(JSON.stringify(dados));

            const infoDiv = document.getElementById('info-arquivo');
            const infoDetalhes = document.getElementById('info-arquivo-detalhes');
            infoDetalhes.textContent = `${file.name} · ${dados.unidades?.length || 0} unidades · ${dados.unidades?.reduce((t, u) => t + (u.recepcoes?.length || 0), 0)} recepções`;
            infoDiv.classList.remove('hidden');

            showNotification("Arquivo processado! Clique em 'Ver Prévia'.", "success");
        } catch (err) {
            console.error(err);
            showNotification("Erro ao ler arquivo: " + err.message, "error");
        }
    },

    async _parseCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const lines = e.target.result.split('\n').filter(l => l.trim());
                    const headers = this._splitCSVLinha(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

                    const unidades = [];
                    let unidadeAtual = null;

                    for (let i = 1; i < lines.length; i++) {
                        const vals = this._splitCSVLinha(lines[i]);
                        const row = {};
                        headers.forEach((h, idx) => row[h] = (vals[idx] || '').trim());

                        const tipo = (row.tipo || '').toUpperCase();

                        if (tipo === 'UNIDADE') {
                            if (unidadeAtual) unidades.push(unidadeAtual);
                            unidadeAtual = {
                                nome:      row.nome,
                                sigla:     row.sigla,
                                endereco:  row.endereco,
                                telefone:  row.telefone,
                                email:     row.email,
                                recepcoes: [],
                            };
                        } else if (tipo === 'RECEPCAO' && unidadeAtual) {
                            const tipoRec = (row.recepcao_tipo || row.tipo_recepcao || 'especializada').toLowerCase();
                            unidadeAtual.recepcoes.push({
                                nome:               row.recepcao_nome || row.nome,
                                andar:              row.andar,
                                tipo:               tipoRec,
                                salas:              row.salas     ? row.salas.split(';').map(s => s.trim()).filter(Boolean)     : [],
                                responsaveis:       row.responsaveis ? row.responsaveis.split(';').map(r => r.trim()).filter(Boolean) : [],
                                assuntosPermitidos: row.assuntos  ? row.assuntos.split(';').map(a => a.trim()).filter(Boolean)   : [],
                                verTudo:            tipoRec === 'central',
                            });
                        }
                    }
                    if (unidadeAtual) unidades.push(unidadeAtual);
                    resolve({ unidades });
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
        });
    },

    _splitCSVLinha(linha) {
        const resultado = [];
        let dentroAspas = false;
        let valorAtual = '';
        for (const char of linha) {
            if (char === '"') { dentroAspas = !dentroAspas; }
            else if (char === ',' && !dentroAspas) { resultado.push(valorAtual.trim()); valorAtual = ''; }
            else { valorAtual += char; }
        }
        resultado.push(valorAtual.trim());
        return resultado;
    },

    async _parseJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try { resolve(JSON.parse(e.target.result)); }
                catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    // =========================================================================
    // 8. PREVIEW EDITÁVEL
    // =========================================================================

    _gerarPreview() {
        const container = document.getElementById('preview-estrutura');
        if (!container || !this._dadosEditados) return;

        if (this._dadosEditados.unidades.length === 0) {
            container.innerHTML = '<p class="text-center text-slate-400 py-8">Nenhuma unidade encontrada.</p>';
            return;
        }

        container.innerHTML = this._dadosEditados.unidades.map((unidade, uIdx) => {
            return `
            <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div class="bg-purple-50 border-b border-purple-100 px-5 py-4 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-2xl">🏢</span>
                        <div class="min-w-0">
                            <p class="font-black text-purple-800 truncate">${escapeHTML(unidade.nome)}</p>
                            <p class="text-[10px] text-purple-500 uppercase tracking-wider">${escapeHTML(unidade.sigla || '')} ${unidade.endereco ? '· ' + escapeHTML(unidade.endereco) : ''}</p>
                        </div>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button class="prev-btn-remover-unidade text-red-400 hover:text-red-600 text-xs font-bold px-2 py-1 rounded transition"
                            data-u-idx="${uIdx}" title="Remover unidade">🗑️</button>
                    </div>
                </div>
                <div class="p-4 space-y-3">
                    ${(unidade.recepcoes || []).map((rec, rIdx) => {
                        const visual = TIPO_VISUAL[rec.tipo] || TIPO_VISUAL.especializada;
                        return `
                        <div class="border border-slate-200 rounded-xl p-4 bg-white hover:border-purple-300 transition">
                            <div class="flex items-start justify-between gap-3">
                                <div class="flex items-center gap-2 min-w-0 flex-1">
                                    <span class="text-xl">${visual.icone}</span>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <p class="font-bold text-slate-800 text-sm truncate">${escapeHTML(rec.nome)}</p>
                                            <span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase">${rec.tipo}</span>
                                            ${rec.andar ? `<span class="text-[9px] text-slate-400 font-bold">${escapeHTML(rec.andar)}</span>` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div class="flex gap-1 shrink-0">
                                    <button class="prev-btn-editar-rec text-slate-400 hover:text-blue-600 text-xs font-bold px-2 py-1 rounded transition"
                                        data-u-idx="${uIdx}" data-r-idx="${rIdx}" title="Editar">✏️</button>
                                    <button class="prev-btn-remover-rec text-slate-400 hover:text-red-500 text-xs font-bold px-2 py-1 rounded transition"
                                        data-u-idx="${uIdx}" data-r-idx="${rIdx}" title="Remover">🗑️</button>
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                    <button class="prev-btn-add-rec w-full border-2 border-dashed border-slate-200 hover:border-purple-400 text-slate-400 hover:text-purple-600 text-xs font-bold py-2 rounded-xl transition"
                        data-u-idx="${uIdx}">+ Adicionar Recepção</button>
                </div>
            </div>`;
        }).join('');

        // Eventos do preview
        container.querySelectorAll('.prev-btn-remover-unidade').forEach(btn => {
            btn.addEventListener('click', () => {
                const uIdx = parseInt(btn.dataset.uIdx);
                this._dadosEditados.unidades.splice(uIdx, 1);
                this._gerarPreview();
            });
        });

        container.querySelectorAll('.prev-btn-remover-rec').forEach(btn => {
            btn.addEventListener('click', () => {
                const uIdx = parseInt(btn.dataset.uIdx);
                const rIdx = parseInt(btn.dataset.rIdx);
                this._dadosEditados.unidades[uIdx].recepcoes.splice(rIdx, 1);
                this._gerarPreview();
            });
        });

        container.querySelectorAll('.prev-btn-editar-rec').forEach(btn => {
            btn.addEventListener('click', () => {
                const uIdx = parseInt(btn.dataset.uIdx);
                const rIdx = parseInt(btn.dataset.rIdx);
                this._abrirFormRecPreview(uIdx, rIdx);
            });
        });

        container.querySelectorAll('.prev-btn-add-rec').forEach(btn => {
            btn.addEventListener('click', () => {
                const uIdx = parseInt(btn.dataset.uIdx);
                this._dadosEditados.unidades[uIdx].recepcoes.push({
                    nome: 'Nova Recepção',
                    andar: '',
                    tipo: 'especializada',
                    salas: [],
                    responsaveis: [],
                    assuntosPermitidos: [],
                    verTudo: false,
                });
                this._gerarPreview();
            });
        });
    },

    _abrirFormRecPreview(uIdx, rIdx) {
        // Prevenir duplicação
        const existing = document.getElementById('modal-form-rec-preview');
        if (existing) existing.remove();

        const rec = this._dadosEditados.unidades[uIdx].recepcoes[rIdx];

        const overlay = document.createElement('div');
        overlay.id = 'modal-form-rec-preview';
        overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[500] p-4';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <h4 class="font-black text-slate-800 text-lg">✏️ Editar Recepção</h4>
                <div><label class="block text-[10px] font-black text-slate-500 uppercase">Nome</label><input id="frp-nome" type="text" value="${escapeHTML(rec.nome)}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-[10px] font-black text-slate-500 uppercase">Andar</label><input id="frp-andar" type="text" value="${escapeHTML(rec.andar || '')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                    <div><label class="block text-[10px] font-black text-slate-500 uppercase">Tipo</label><select id="frp-tipo" class="w-full p-2.5 border rounded-lg text-sm">
                        ${['central','especializada','mista','generalista'].map(t => `<option value="${t}" ${rec.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select></div>
                </div>
                <div><label class="block text-[10px] font-black text-slate-500 uppercase">Salas (separadas por vírgula)</label><input id="frp-salas" type="text" value="${(rec.salas || []).map(escapeHTML).join(', ')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                <div><label class="block text-[10px] font-black text-slate-500 uppercase">Assuntos (separados por vírgula)</label><input id="frp-assuntos" type="text" value="${(rec.assuntosPermitidos || []).map(escapeHTML).join(', ')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                <div class="flex gap-3 pt-2">
                    <button id="frp-cancelar" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl">Cancelar</button>
                    <button id="frp-salvar" class="flex-1 bg-purple-600 text-white font-black py-2.5 rounded-xl">Salvar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('frp-cancelar').onclick = () => overlay.remove();
        document.getElementById('frp-salvar').onclick = () => {
            const recAtual = this._dadosEditados.unidades[uIdx].recepcoes[rIdx];
            recAtual.nome               = document.getElementById('frp-nome').value.trim();
            recAtual.andar              = document.getElementById('frp-andar').value.trim();
            recAtual.tipo               = document.getElementById('frp-tipo').value;
            recAtual.verTudo            = recAtual.tipo === 'central';
            recAtual.salas              = document.getElementById('frp-salas').value.split(',').map(s => s.trim()).filter(Boolean);
            recAtual.assuntosPermitidos = document.getElementById('frp-assuntos').value.split(',').map(a => a.trim()).filter(Boolean);
            overlay.remove();
            this._gerarPreview();
        };
    },

    // =========================================================================
    // 9. IMPORTAÇÃO PARA O SISTEMA (OTIMIZADO COM BATCH)
    // =========================================================================

    async _importarParaSistema() {
        const db = this._app.db;
        const dados = this._dadosEditados;

        if (!dados?.unidades?.length) {
            showNotification("Nenhum dado para importar.", "error");
            return;
        }

        const btnImportar = document.getElementById('btn-importar-confirmar');
        btnImportar.disabled = true;
        btnImportar.textContent = 'Importando...';

        try {
            const snap = await getDocs(collection(db, "estrutura_unidades"));
            const nomesExistentes = new Set(snap.docs.map(d => d.data().nome));

            let unidadesCriadas = 0;
            let recepcoesCriadas = 0;

            let batch = writeBatch(db);
            let operacoesBatch = 0;

            for (const unidade of dados.unidades) {
                // Prevenção de unidades duplicadas baseada no nome
                if (nomesExistentes.has(unidade.nome)) continue;

                // Criação do ID de forma determinística
                const unidadeId = unidade.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

                const unidadeRef = doc(db, "estrutura_unidades", unidadeId);
                batch.set(unidadeRef, {
                    id: unidadeId,
                    nome: unidade.nome,
                    sigla: unidade.sigla || '',
                    endereco: unidade.endereco || '',
                    telefone: unidade.telefone || '',
                    email: unidade.email || '',
                    createdAt: new Date().toISOString(),
                    importadoPor: this._app.currentUser?.email || 'superadmin',
                });
                unidadesCriadas++;
                operacoesBatch++;

                for (const rec of (unidade.recepcoes || [])) {
                    const visual = TIPO_VISUAL[rec.tipo] || TIPO_VISUAL.especializada;
                    const grupos = (rec.assuntosPermitidos || []).map(a =>
                        a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
                    );

                    const recepcaoId = `${unidadeId}_${rec.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}`;
                    const recepcaoRef = doc(db, "recepcoes", recepcaoId);

                    batch.set(recepcaoRef, {
                        id: recepcaoId,
                        unidadeId,
                        unidadeNome: unidade.nome,
                        nome: rec.nome,
                        icone: visual.icone,
                        cor: visual.cor,
                        andar: rec.andar || '',
                        tipo: rec.tipo || 'especializada',
                        grupos,
                        verTudo: rec.verTudo || rec.tipo === 'central',
                        salas: rec.salas || [],
                        responsaveis: rec.responsaveis || [],
                        ativo: true,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });
                    recepcoesCriadas++;
                    operacoesBatch++;

                    // Limite do Firestore de 500 operações por batch
                    if (operacoesBatch >= 490) {
                        await batch.commit();
                        batch = writeBatch(db); // Inicia um novo batch
                        operacoesBatch = 0;
                    }
                }
            }

            // Comita as operações restantes do último batch
            if (operacoesBatch > 0) {
                await batch.commit();
            }

            await logAction(db, this._app.auth, this._app.currentUserName, null, 'IMPORT_ESTRUTURA', `Importou ${unidadesCriadas} unidades e ${recepcoesCriadas} recepções`);
            showNotification(`✅ ${unidadesCriadas} unidade(s) e ${recepcoesCriadas} recepção(ões) criadas!`, "success");

            document.querySelector('.tab-imp[data-tab="estrutura"]')?.click();
            window.dispatchEvent(new CustomEvent('estrutura:importada'));

        } catch (err) {
            console.error("Erro na importação:", err);
            showNotification("Erro ao importar: " + err.message, "error");
        } finally {
            btnImportar.disabled = false;
            btnImportar.textContent = '🚀 Importar para o Sistema';
        }
    },

    // =========================================================================
    // 10. CRUD DE RECEPÇÕES (MÉTODOS AVULSOS)
    // =========================================================================

    async _criarRecepcao(db, dados) {
        const recepcaoId = `${dados.unidadeId}_${dados.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}`;
        
        await setDoc(doc(db, "recepcoes", recepcaoId), {
            id: recepcaoId,
            ...dados,
            ativo: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        return { id: recepcaoId, ...dados };
    },

    async _atualizarRecepcao(db, id, dados) {
        await updateDoc(doc(db, "recepcoes", id), {
            ...dados,
            updatedAt: new Date().toISOString()
        });
        return true;
    },

    async _excluirRecepcao(db, id) {
        await updateDoc(doc(db, "recepcoes", id), { ativo: false, excluidoEm: new Date().toISOString() });
        return true;
    },

    // =========================================================================
    // 11. ESTRUTURA ATUAL (GERENCIAMENTO)
    // =========================================================================

    async _carregarEstruturaExistente() {
        const db = this._app.db;
        const lista = document.getElementById('lista-estrutura-atual');
        if (!lista) return;

        if (this._unsubEstrutura) this._unsubEstrutura();

        this._unsubEstrutura = onSnapshot(collection(db, "estrutura_unidades"), async (unSnap) => {
            if (unSnap.empty) {
                lista.innerHTML = `<div class="text-center py-12"><span class="text-4xl block mb-3">🏢</span><p class="text-slate-400 text-sm font-bold">Nenhuma unidade cadastrada ainda.</p><p class="text-slate-400 text-xs mt-1">Importe um arquivo ou clique em "+ Nova Unidade".</p></div>`;
                return;
            }

            const unidades = unSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const todasRecepcoes = await getDocs(collection(db, "recepcoes"));
            const recepcoesPorUnidade = {};
            todasRecepcoes.docs.forEach(d => {
                const rec = { id: d.id, ...d.data() };
                if (rec.ativo !== false) {
                    if (!recepcoesPorUnidade[rec.unidadeId]) recepcoesPorUnidade[rec.unidadeId] = [];
                    recepcoesPorUnidade[rec.unidadeId].push(rec);
                }
            });

            lista.innerHTML = unidades.map(unidade => {
                const recs = recepcoesPorUnidade[unidade.id] || [];
                return `
                <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div class="bg-purple-50 border-b border-purple-100 px-5 py-4 flex items-center justify-between gap-3">
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="text-xl">🏢</span>
                            <div class="min-w-0">
                                <p class="font-black text-purple-800 truncate">${escapeHTML(unidade.nome)}</p>
                                <p class="text-[10px] text-purple-500">${escapeHTML(unidade.sigla || '')} ${unidade.endereco ? '· ' + escapeHTML(unidade.endereco) : ''}</p>
                            </div>
                        </div>
                        <div class="flex gap-2 shrink-0 items-center">
                            <span class="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full font-bold">${recs.length} recepções</span>
                            <button class="est-btn-add-rec bg-purple-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg" data-unidade-id="${unidade.id}" data-unidade-nome="${escapeHTML(unidade.nome)}">+ Recepção</button>
                            <button class="est-btn-editar-unidade text-blue-500 hover:text-blue-700 text-xs font-bold px-2 py-1 rounded" data-unidade-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}" data-sigla="${escapeHTML(unidade.sigla || '')}" data-endereco="${escapeHTML(unidade.endereco || '')}">✏️</button>
                            <button class="est-btn-del-unidade text-red-300 hover:text-red-500 text-sm font-black px-2 py-1 rounded" data-unidade-id="${unidade.id}" data-nome="${escapeHTML(unidade.nome)}">🗑️</button>
                        </div>
                    </div>
                    <div class="p-4 space-y-2">
                        ${recs.length === 0 ? `<p class="text-xs text-slate-400 italic text-center py-4">Nenhuma recepção. Clique em "+ Recepção" para adicionar.</p>`
                            : recs.map(rec => {
                                const visual = TIPO_VISUAL[rec.tipo] || TIPO_VISUAL.especializada;
                                return `
                                <div class="border border-slate-200 rounded-xl px-4 py-3 bg-white flex items-center justify-between gap-3">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <span>${visual.icone}</span>
                                        <div class="min-w-0">
                                            <p class="font-bold text-slate-800 text-sm truncate">${escapeHTML(rec.nome)}</p>
                                            <p class="text-[10px] text-slate-400">${rec.andar ? escapeHTML(rec.andar) + ' · ' : ''}<span class="uppercase font-bold text-blue-500">${rec.tipo}</span></p>
                                        </div>
                                    </div>
                                    <div class="flex gap-1 shrink-0">
                                        <button class="est-btn-editar-rec text-slate-400 hover:text-blue-600 text-xs px-2 py-1 rounded font-bold" data-recepcao-id="${rec.id}">✏️</button>
                                        <button class="est-btn-del-rec text-slate-400 hover:text-red-500 text-xs px-2 py-1 rounded font-bold" data-recepcao-id="${rec.id}" data-nome="${escapeHTML(rec.nome)}">🗑️</button>
                                    </div>
                                </div>`;
                            }).join('')
                        }
                    </div>
                </div>`;
            }).join('');

            // Eventos
            lista.querySelectorAll('.est-btn-add-rec').forEach(btn => {
                btn.addEventListener('click', () => this._abrirFormRecepcao({ unidadeId: btn.dataset.unidadeId, unidadeNome: btn.dataset.unidadeNome }, true));
            });
            lista.querySelectorAll('.est-btn-editar-unidade').forEach(btn => {
                btn.addEventListener('click', () => this._abrirFormUnidade({ id: btn.dataset.unidadeId, nome: btn.dataset.nome, sigla: btn.dataset.sigla, endereco: btn.dataset.endereco }));
            });
            lista.querySelectorAll('.est-btn-del-unidade').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`Excluir a unidade "${btn.dataset.nome}" e todas as suas recepções?`)) return;
                    await deleteDoc(doc(db, "estrutura_unidades", btn.dataset.unidadeId));
                    const recs = recepcoesPorUnidade[btn.dataset.unidadeId] || [];
                    // Melhoria: Usando Promise.all para executar exclusões em paralelo
                    await Promise.all(recs.map(r => this._excluirRecepcao(db, r.id)));
                    showNotification("Unidade removida.", "info");
                });
            });
            lista.querySelectorAll('.est-btn-editar-rec').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const snap = await getDoc(doc(db, "recepcoes", btn.dataset.recepcaoId));
                    if (snap.exists()) this._abrirFormRecepcao({ id: snap.id, ...snap.data() });
                });
            });
            lista.querySelectorAll('.est-btn-del-rec').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`Desativar a recepção "${btn.dataset.nome}"?`)) return;
                    await this._excluirRecepcao(db, btn.dataset.recepcaoId);
                    showNotification("Recepção desativada.", "info");
                });
            });
        });
    },

    // =========================================================================
    // 12. FORMULÁRIOS DE CRIAÇÃO/EDIÇÃO
    // =========================================================================

    _abrirFormUnidade(unidade = null) {
        // Prevenir duplicação do modal
        const existing = document.getElementById('modal-form-unidade');
        if (existing) existing.remove();

        const db = this._app.db;
        const isNova = !unidade;
        const overlay = document.createElement('div');
        overlay.id = 'modal-form-unidade';
        overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[500] p-4';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <h4 class="font-black text-slate-800 text-lg">${isNova ? '+ Nova Unidade' : '✏️ Editar Unidade'}</h4>
                <div><label class="block text-[10px] font-black text-slate-500 uppercase">Nome *</label><input id="fu-nome" value="${escapeHTML(unidade?.nome || '')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-[10px] font-black text-slate-500 uppercase">Sigla</label><input id="fu-sigla" value="${escapeHTML(unidade?.sigla || '')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                    <div><label class="block text-[10px] font-black text-slate-500 uppercase">Telefone</label><input id="fu-telefone" value="${escapeHTML(unidade?.telefone || '')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                </div>
                <div><label class="block text-[10px] font-black text-slate-500 uppercase">Endereço</label><input id="fu-endereco" value="${escapeHTML(unidade?.endereco || '')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                <div><label class="block text-[10px] font-black text-slate-500 uppercase">E-mail</label><input id="fu-email" value="${escapeHTML(unidade?.email || '')}" type="email" class="w-full p-2.5 border rounded-lg text-sm"></div>
                <div class="flex gap-3 pt-2">
                    <button id="fu-cancelar" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl">Cancelar</button>
                    <button id="fu-salvar" class="flex-1 bg-purple-600 text-white font-black py-2.5 rounded-xl">Salvar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('fu-cancelar').onclick = () => overlay.remove();
        document.getElementById('fu-salvar').onclick = async () => {
            const nome = document.getElementById('fu-nome').value.trim();
            if (!nome) { showNotification("O nome é obrigatório.", "error"); return; }

            const unidadeId = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            
            const dados = {
                nome,
                sigla: document.getElementById('fu-sigla').value.trim(),
                endereco: document.getElementById('fu-endereco').value.trim(),
                telefone: document.getElementById('fu-telefone').value.trim(),
                email: document.getElementById('fu-email').value.trim(),
                updatedAt: new Date().toISOString()
            };

            if (isNova) {
                dados.id = unidadeId;
                dados.createdAt = new Date().toISOString();
                await setDoc(doc(db, "estrutura_unidades", unidadeId), dados);
                showNotification("Unidade criada!", "success");
            } else {
                await updateDoc(doc(db, "estrutura_unidades", unidade.id), dados);
                showNotification("Unidade atualizada!", "success");
            }
            overlay.remove();
        };
    },

    _abrirFormRecepcao(rec, isNova = false) {
        // Prevenir duplicação do modal
        const existing = document.getElementById('modal-form-recepcao');
        if (existing) existing.remove();

        const db = this._app.db;
        const overlay = document.createElement('div');
        overlay.id = 'modal-form-recepcao';
        overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[500] p-4';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <h4 class="font-black text-slate-800 text-lg">${isNova ? '+ Nova Recepção' : '✏️ Editar Recepção'}</h4>
                <div><label class="block text-[10px] font-black text-slate-500 uppercase">Nome *</label><input id="fr-nome" value="${escapeHTML(rec?.nome || '')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-[10px] font-black text-slate-500 uppercase">Andar</label><input id="fr-andar" value="${escapeHTML(rec?.andar || '')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                    <div><label class="block text-[10px] font-black text-slate-500 uppercase">Tipo</label><select id="fr-tipo" class="w-full p-2.5 border rounded-lg text-sm">
                        ${['central','especializada','mista','generalista'].map(t => `<option value="${t}" ${rec?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select></div>
                </div>
                <div><label class="block text-[10px] font-black text-slate-500 uppercase">Salas (separadas por vírgula)</label><input id="fr-salas" value="${(rec?.salas || []).join(', ')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                <div><label class="block text-[10px] font-black text-slate-500 uppercase">Assuntos (separados por vírgula)</label><input id="fr-assuntos" value="${(rec?.grupos || []).join(', ')}" class="w-full p-2.5 border rounded-lg text-sm"></div>
                <div class="flex gap-3 pt-2">
                    <button id="fr-cancelar" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl">Cancelar</button>
                    <button id="fr-salvar" class="flex-1 bg-purple-600 text-white font-black py-2.5 rounded-xl">Salvar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('fr-cancelar').onclick = () => overlay.remove();
        document.getElementById('fr-salvar').onclick = async () => {
            const nome = document.getElementById('fr-nome').value.trim();
            if (!nome) { showNotification("O nome é obrigatório.", "error"); return; }

            const visual = TIPO_VISUAL[document.getElementById('fr-tipo').value] || TIPO_VISUAL.especializada;
            const dados = {
                nome,
                andar: document.getElementById('fr-andar').value.trim(),
                tipo: document.getElementById('fr-tipo').value,
                icone: visual.icone,
                cor: visual.cor,
                salas: document.getElementById('fr-salas').value.split(',').map(s => s.trim()).filter(Boolean),
                grupos: document.getElementById('fr-assuntos').value.split(',').map(a => a.trim()).filter(Boolean),
                verTudo: document.getElementById('fr-tipo').value === 'central',
                updatedAt: new Date().toISOString()
            };

            if (isNova) {
                dados.unidadeId = rec.unidadeId;
                dados.unidadeNome = rec.unidadeNome;
                dados.createdAt = new Date().toISOString();
                dados.ativo = true;
                const id = `${dados.unidadeId}_${nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}`;
                await setDoc(doc(db, "recepcoes", id), { ...dados, id });
                showNotification("Recepção criada!", "success");
            } else {
                await updateDoc(doc(db, "recepcoes", rec.id), dados);
                showNotification("Recepção atualizada!", "success");
            }
            overlay.remove();
        };
    },

    // =========================================================================
    // 13. DOWNLOADS
    // =========================================================================

    _baixarModeloCSV() {
        const csv = `tipo,nome,sigla,endereco,telefone,email,andar,recepcao_nome,recepcao_tipo,salas,responsaveis,assuntos
UNIDADE,Defensoria Pública - Duque de Caxias,DP Caxias,"Av. Presidente Kennedy, s/n",(21) 2675-1234,caxias@dperj.br,,,,,,
RECEPCAO,,,,,,Térreo,Recepção Central,central,"Recepção Principal;Guichê 1","admin@dperj.br",
RECEPCAO,,,,,,2º Andar,Núcleo de Família,especializada,"1ª Vara Família;2ª Vara Família;CEJUSC","familia@dperj.br","Família;Alimentos;Guarda"`;
        this._download('modelo_estrutura_orgaos.csv', csv, 'text/csv;charset=utf-8;');
    },

    _baixarModeloJSON() {
        const json = JSON.stringify({
            unidades: [{
                nome: "Defensoria Pública - Duque de Caxias",
                sigla: "DP Caxias",
                endereco: "Av. Presidente Kennedy, s/n",
                telefone: "(21) 2675-1234",
                email: "caxias@dperj.br",
                recepcoes: [
                    { nome: "Recepção Central", andar: "Térreo", tipo: "central", salas: ["Recepção Principal", "Guichê 1"], responsaveis: ["admin@dperj.br"], assuntosPermitidos: [] }
                ]
            }]
        }, null, 2);
        this._download('modelo_estrutura_orgaos.json', json, 'application/json');
    },

    _download(nome, conteudo, tipo) {
        const blob = new Blob([conteudo], { type: tipo });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = nome;
        link.click();
        URL.revokeObjectURL(link.href);
    }
};

// =========================================================================
// FUNÇÕES GLOBAIS
// =========================================================================

window.abrirImportadorOrgaos = (app) => ImportadorOrgaosService.abrirModal(app);
window.abrirGerenciadorUnidades = (app) => ImportadorOrgaosService.abrirGerenciador(app);
window.abrirImportadorUnidades = (app) => ImportadorOrgaosService.abrirImportador(app);
window.abrirUnidadesMaster = (app) => ImportadorOrgaosService.abrirModalMaster(app);

export default ImportadorOrgaosService;