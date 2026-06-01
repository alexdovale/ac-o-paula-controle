import { doc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const PainelPublicoService = {
    async init(app) {
        const db = app.db;
        const params = new URLSearchParams(window.location.search);
        const pautasParam = params.get('pautas');
        const recepcaoNome = params.get('nome') || 'Recepção Geral';
        const initialModo = params.get('modo') || 'fila';
        const videoUrl = params.get('video') || '';

        // 1. Limpa o HTML do sistema inteiro e reseta a estrutura base
        document.body.innerHTML = '';
        document.body.className = "p-0 m-0 flex flex-col min-h-screen overflow-hidden";
        
        // 2. Injeta o CSS (incluindo o layout fixo da barra e auto-hide)
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --fs-xs:   clamp(9px,  1vw,  12px);
                --fs-sm:   clamp(11px, 1.2vw, 14px);
                --fs-md:   clamp(13px, 1.5vw, 16px);
                --fs-lg:   clamp(16px, 2vw,   22px);
                --fs-xl:   clamp(20px, 2.8vw, 30px);
                --fs-2xl:  clamp(28px, 4vw,   52px);
                --fs-3xl:  clamp(36px, 5.5vw, 68px);
            }
            body { margin: 0; color: #0f172a; transition: background-color 0.3s; }
            * { font-family: 'DM Sans', sans-serif; }
            .mono { font-family: 'DM Mono', monospace; }
            
            ::-webkit-scrollbar { width: 4px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }

            /* ANIMAÇÕES */
            @keyframes ping-slow { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.6); } }
            .ping-slow { animation: ping-slow 2s ease-in-out infinite; }
            @keyframes chamado-enter { from { opacity: 0; transform: translateY(-16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes flash-glow { 0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } 30% { box-shadow: 0 0 0 18px rgba(245, 158, 11, 0.18); } 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } }
            @keyframes card-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
            @keyframes fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes group-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes fade-in-left { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

            .anim-chamado  { animation: chamado-enter 0.5s cubic-bezier(0.22,1,0.36,1) forwards; }
            .anim-glow     { animation: flash-glow 1.1s ease-out forwards; }
            .anim-card     { animation: card-in 0.3s ease-out forwards; }
            .anim-fade-up  { animation: fade-up 0.4s ease-out forwards; }
            .anim-group    { animation: group-in 0.4s ease-out forwards; }
            .item-historico { animation: fade-in-left 0.4s ease-out forwards; }

            /* ESTILOS ESTRUTURAIS MODO FILA */
            .pessoa-card { background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #f59e0b; border-radius: 10px; padding: clamp(8px, 1.2vw, 14px) clamp(10px, 1.5vw, 16px); display: flex; align-items: center; gap: clamp(8px, 1vw, 12px); box-shadow: 0 1px 2px rgba(0,0,0,0.04); margin-bottom: 8px; }
            .pessoa-card.em-atendimento { border-left-color: #4f46e5 !important; background: #f5f8ff; border-color: #e0e7ff; }
            .unidade-group { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
            .unidade-group-header { display: flex; align-items: center; justify-content: space-between; padding: clamp(8px, 1vw, 12px) clamp(12px, 1.5vw, 18px); border-bottom: 1px solid #f1f5f9; }
            .unidade-group-body { padding: clamp(8px, 1vw, 10px); display: flex; flex-direction: column; gap: 6px; }

            /* CORES DAS UNIDADES */
            .ucor-0 { background: #eff6ff; border-left-color: #3b82f6 !important; } .ucor-0 .u-label { color: #1d4ed8; } .ucor-0 .u-badge { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
            .ucor-1 { background: #fdf4ff; border-left-color: #a855f7 !important; } .ucor-1 .u-label { color: #7e22ce; } .ucor-1 .u-badge { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
            .ucor-2 { background: #f0fdf4; border-left-color: #22c55e !important; } .ucor-2 .u-label { color: #15803d; } .ucor-2 .u-badge { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
            .ucor-3 { background: #fff7ed; border-left-color: #f97316 !important; } .ucor-3 .u-label { color: #c2410c; } .ucor-3 .u-badge { background: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; }
            .ucor-4 { background: #fef2f2; border-left-color: #ef4444 !important; } .ucor-4 .u-label { color: #b91c1c; } .ucor-4 .u-badge { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
            .ucor-5 { background: #f0fdfa; border-left-color: #14b8a6 !important; } .ucor-5 .u-label { color: #0f766e; } .ucor-5 .u-badge { background: #ccfbf1; color: #115e59; border: 1px solid #99f6e4; }
            .ucor-6 { background: #fffbeb; border-left-color: #eab308 !important; } .ucor-6 .u-label { color: #a16207; } .ucor-6 .u-badge { background: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
            .ucor-7 { background: #f8f5ff; border-left-color: #8b5cf6 !important; } .ucor-7 .u-label { color: #6d28d9; } .ucor-7 .u-badge { background: #ede9fe; color: #5b21b6; border: 1px solid #ddd6fe; }

            .coluna-unificada { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 6px rgba(0,0,0,0.04); }
            .coluna-header { padding: clamp(12px, 1.5vw, 18px) clamp(14px, 2vw, 22px); background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
            .nome-chamado { background: linear-gradient(90deg, #d97706, #ea580c); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
            .pill { padding: clamp(3px, 0.4vw, 5px) clamp(8px, 1vw, 14px); border-radius: 999px; font-size: var(--fs-xs); font-weight: 800; letter-spacing: 0.04em; }
            .ordem-num { font-size: var(--fs-md); font-weight: 900; font-family: 'DM Mono', monospace; color: #f59e0b; min-width: clamp(24px, 3vw, 36px); text-align: center; flex-shrink: 0; }
            .sala-badge { font-size: var(--fs-xs); font-weight: 700; padding: clamp(3px, 0.4vw, 5px) clamp(8px, 1vw, 12px); border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; }

            /* ESTILOS MODO TV */
            .bg-tema-panel { background-color: #22c55e; }
            .text-tema-panel { color: #16a34a; }
            @keyframes piscar-chamado-tv { 0%, 100% { background-color: #22c55e; transform: scale(1); } 50% { background-color: #15803d; transform: scale(0.98); } }
            .animar-chamado-tv { animation: piscar-chamado-tv 0.6s cubic-bezier(0.22,1,0.36,1) 3; }
            .texto-nome-tv  { font-size: clamp(2.5rem, 6vw, 6.5rem); line-height: 1.1; word-wrap: break-word; }
            .texto-local-tv { font-size: clamp(2rem, 5vw, 5.5rem); line-height: 1; }

            /* ESTILOS MODO TV+VÍDEO E BARRA LATERAL FIXA */
            #faixa-video {
                width: clamp(220px, 22vw, 340px);
                flex-shrink: 0;
                display: flex;
                flex-direction: column;
                background: #ffffff;
                border-left: 4px solid #e2e8f0;
                height: 100vh; /* Força a barra a ocupar a tela inteira */
            }
            #faixa-header { flex-shrink: 0; } /* Cabeçalho não rola */
            #video-ultimo-chamado { flex-shrink: 0; } /* Último chamado não rola */
            #faixa-historico-titulo { flex-shrink: 0; } /* Título histórico não rola */
            #lista-historico-video { flex: 1; overflow-y: auto; } /* Apenas a lista rola! */
            #faixa-footer { flex-shrink: 0; } /* Rodapé não rola */

            @keyframes banner-slide-in { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes banner-slide-out { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
            @keyframes banner-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } 50% { box-shadow: 0 0 0 24px rgba(34,197,94,0.18); } }

            #banner-chamado {
                position: absolute; bottom: 0; left: 0; right: 0; z-index: 30;
                background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white;
                padding: clamp(14px, 2.5vh, 32px) clamp(20px, 4vw, 60px);
                display: flex; align-items: center; justify-content: space-between; gap: 20px;
                transform: translateY(100%); opacity: 0; border-top: 4px solid #4ade80;
            }
            #banner-chamado.visivel { animation: banner-slide-in 0.5s cubic-bezier(0.22,1,0.36,1) forwards, banner-pulse 1.5s ease-in-out 0.5s 2; }
            #banner-chamado.saindo { animation: banner-slide-out 0.4s ease-in forwards; }

            #video-container { position: relative; width: 100%; height: 100%; background: #000; overflow: hidden; }
            #video-container iframe, #video-container video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
            #video-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f172a; color: #475569; gap: 12px; }

            /* SISTEMA DE CONTROLES INVISÍVEIS (HOVER) */
            #area-controles {
                position: fixed; inset: 0; z-index: 9999; pointer-events: none;
            }
            #controles-wrap {
                opacity: 0; transition: opacity 0.4s ease; pointer-events: auto;
            }
            #area-controles.ativo #controles-wrap { opacity: 1; }

            #seletor-modo {
                position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
                display: flex; gap: 8px; background: white; border: 1px solid #e2e8f0;
                border-radius: 16px; padding: 6px; box-shadow: 0 8px 32px rgba(0,0,0,0.12);
            }
            .btn-modo {
                display: flex; align-items: center; gap: 6px; padding: 8px 14px;
                border-radius: 10px; border: none; font-weight: 800; font-size: 11px;
                text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer;
                transition: all 0.18s; color: #64748b; background: transparent;
            }
            .btn-modo:hover { background: #f1f5f9; color: #1e293b; }
            .btn-modo.ativo { background: #0f172a; color: white; }
            .btn-modo span { font-size: 16px; }
            
            #btn-som-fixo {
                position: absolute; top: 16px; right: 16px; display: flex; align-items: center; gap: 6px;
                background: rgba(255,255,255,0.9); border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 99px;
                font-size: var(--fs-xs); box-shadow: 0 4px 12px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.2s;
            }
            #btn-som-fixo:hover { background: white; }

            #zoom-controls { 
                position: absolute; bottom: 80px; right: 16px; display: flex; align-items: center; gap: 8px; 
                background: white; border: 1px solid #e2e8f0; padding: 8px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); 
            }
        `;
        document.head.appendChild(style);

        // 3. Injeta a estrutura HTML da Tela Pública
        document.body.innerHTML = `
            <div id="loading" class="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-50 gap-4">
                <div class="w-12 h-12 rounded-full border-4 border-slate-200 border-t-amber-500 animate-spin"></div>
                <p class="text-slate-500 font-bold uppercase tracking-widest" style="font-size:var(--fs-xs)">Conectando ao SIGEP...</p>
            </div>

            <!-- CONTROLES FLUTUANTES QUE APARECEM COM O MOUSE -->
            <div id="area-controles">
                <div id="controles-wrap">
                    <div id="seletor-modo">
                        <button class="btn-modo" id="btn-modo-fila"><span>📋</span> Fila</button>
                        <button class="btn-modo" id="btn-modo-tv"><span>📺</span> TV Chamados</button>
                        <button class="btn-modo" id="btn-modo-video"><span>🎬</span> TV + Vídeo</button>
                    </div>
                    <button id="btn-som-fixo">
                        <span id="icone-som-fixo" style="font-size:15px">🔇</span>
                        <span id="texto-som-fixo" class="font-bold text-slate-600 uppercase tracking-widest hidden sm:inline">Som</span>
                    </button>
                    <div id="zoom-controls">
                        <button id="btn-zoom-out" class="flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg font-black text-slate-700 leading-none" style="width:36px;height:36px;font-size:16px">-</button>
                        <span id="zoom-level" class="font-bold text-slate-600 text-center" style="font-size:12px;min-width:3rem">100%</span>
                        <button id="btn-zoom-in" class="flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg font-black text-slate-700 leading-none" style="width:36px;height:36px;font-size:16px">+</button>
                    </div>
                </div>
            </div>

            <!-- MODO FILA -->
            <div id="modo-fila" class="hidden w-full max-w-screen-2xl mx-auto flex-1 flex-col gap-4 h-full p-2 sm:p-4 md:p-6">
                <header class="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-200 shadow-sm rounded-2xl px-5 py-3 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="bg-slate-50 border border-slate-200 rounded-xl p-2 shrink-0">
                            <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo SIGEP" style="height:clamp(28px,4vw,44px)" class="w-auto object-contain drop-shadow-sm">
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h1 class="text-slate-900 font-black tracking-tight leading-none" style="font-size:var(--fs-lg)">SIGEP</h1>
                                <span class="text-slate-300 font-bold" style="font-size:var(--fs-xs)">·</span>
                                <span class="text-slate-500 font-bold uppercase tracking-widest" style="font-size:var(--fs-xs)">Painel de Atendimento</span>
                            </div>
                            <h2 id="recepcao-nome-fila" class="text-amber-600 font-black leading-tight mt-0.5 tracking-tight" style="font-size:var(--fs-md)">—</h2>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 flex-wrap justify-center sm:justify-end">
                        <div class="flex items-center gap-2 px-2">
                            <span class="relative flex" style="height:10px;width:10px">
                                <span class="ping-slow absolute h-full w-full rounded-full bg-green-500 opacity-60"></span>
                                <span class="relative rounded-full bg-green-600" style="height:10px;width:10px"></span>
                            </span>
                            <span class="text-green-600 font-black uppercase tracking-widest" style="font-size:var(--fs-xs)">Ao Vivo</span>
                        </div>
                        <div class="h-8 w-px bg-slate-200"></div>
                        <div class="text-center px-2">
                            <p class="text-amber-500 font-black leading-none" id="g-aguardando" style="font-size:var(--fs-xl)">0</p>
                            <p class="text-slate-500 font-bold uppercase tracking-widest mt-0.5" style="font-size:var(--fs-xs)">Aguardando</p>
                        </div>
                        <div class="text-center px-2">
                            <p class="text-indigo-600 font-black leading-none" id="g-atendendo" style="font-size:var(--fs-xl)">0</p>
                            <p class="text-slate-500 font-bold uppercase tracking-widest mt-0.5" style="font-size:var(--fs-xs)">Atendendo</p>
                        </div>
                        <div id="data-hora-fila" class="mono text-slate-600 font-bold bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg" style="font-size:var(--fs-xs)"></div>
                    </div>
                </header>

                <div id="ultimo-chamado-wrap" class="hidden shrink-0">
                    <div id="ultimo-chamado-card" class="bg-white border border-amber-200 shadow-md rounded-2xl relative overflow-hidden" style="padding:clamp(16px,2.5vw,36px) clamp(20px,3vw,44px)">
                        <div class="absolute inset-0 pointer-events-none" style="background: radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.05) 0%, transparent 70%)"></div>
                        <div class="flex flex-col md:flex-row items-center gap-5 relative z-10">
                            <div class="text-center md:text-left flex-1">
                                <p class="text-amber-600 font-black uppercase flex items-center justify-center md:justify-start gap-2 mb-2" style="font-size:var(--fs-xs);letter-spacing:0.3em">📣 Chamando Agora</p>
                                <h2 id="uc-nome-fila" class="nome-chamado font-black uppercase tracking-tight leading-none mb-3" style="font-size:var(--fs-3xl)">—</h2>
                                <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                                    <span id="uc-pauta-fila" class="bg-slate-100 border border-slate-200 text-slate-700 font-bold px-4 py-1.5 rounded-xl" style="font-size:var(--fs-sm)">—</span>
                                    <span id="uc-local-fila" class="bg-amber-50 border border-amber-200 text-amber-800 font-bold px-4 py-1.5 rounded-xl" style="font-size:var(--fs-sm)">—</span>
                                    <span id="uc-hora-fila" class="mono text-slate-500 font-bold self-center" style="font-size:var(--fs-xs)">—</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col md:flex-row gap-4 flex-1 min-h-[400px]">
                    <div class="coluna-unificada w-full md:w-1/3 border-indigo-100">
                        <div class="coluna-header bg-indigo-50/50 border-indigo-100">
                            <div>
                                <p class="text-indigo-600 font-black uppercase tracking-widest flex items-center gap-1.5" style="font-size:var(--fs-sm)">🧑‍💻 Em Atendimento</p>
                                <p class="text-slate-500 font-bold mt-1" style="font-size:var(--fs-xs)">Sendo atendidos neste momento</p>
                            </div>
                        </div>
                        <div id="lista-atendimento" class="flex-1 overflow-y-auto bg-slate-50 p-3" style="display:flex;flex-direction:column;gap:8px"></div>
                    </div>
                    <div class="coluna-unificada w-full md:w-2/3 border-amber-100">
                        <div class="coluna-header bg-amber-50/30 border-amber-100">
                            <div>
                                <p class="text-amber-600 font-black uppercase tracking-widest flex items-center gap-1.5" style="font-size:var(--fs-sm)">⏳ Fila de Espera</p>
                                <p class="text-slate-500 font-bold mt-1" style="font-size:var(--fs-xs)">Agrupado por unidade · numerado localmente</p>
                            </div>
                            <div id="legenda-unidades" class="flex flex-wrap gap-1.5 justify-end max-w-xs"></div>
                        </div>
                        <div id="lista-espera" class="flex-1 overflow-y-auto bg-slate-50 p-3" style="display:flex;flex-direction:column;gap:10px"></div>
                    </div>
                </div>

                <footer class="text-center text-slate-400 font-bold uppercase tracking-widest pb-2 shrink-0" style="font-size:var(--fs-xs)">
                    SIGEP · Painel Público da Recepção Unificada · Dados em tempo real
                </footer>
            </div>

            <!-- MODO TV -->
            <div id="modo-tv" class="hidden w-full h-screen sm:p-4 flex items-center justify-center overflow-hidden">
                <div class="w-full h-full sm:max-h-[90vh] sm:max-w-[160vh] sm:aspect-video bg-white shadow-2xl overflow-hidden rounded-none sm:rounded-2xl flex flex-col sm:flex-row">
                    <div id="painel-destaque-tv" class="w-full sm:w-2/3 bg-tema-panel flex flex-col justify-center items-center text-white p-6 sm:p-12 text-center transition-all duration-300 flex-1">
                        <h1 class="text-3xl sm:text-5xl font-semibold uppercase tracking-widest mb-2 sm:mb-4 opacity-90 leading-tight drop-shadow-md">Chamando</h1>
                        <div id="uc-nome-tv" class="texto-nome-tv font-black mb-6 sm:mb-12 w-full px-4 drop-shadow-lg" style="min-height:3em;display:flex;align-items:center;justify-content:center;">AGUARDANDO...</div>
                        <h2 class="text-2xl sm:text-4xl font-semibold uppercase tracking-widest mb-1 sm:mb-3 opacity-90 drop-shadow-md" id="label-local-tv">Dirija-se a</h2>
                        <div id="uc-local-tv" class="texto-local-tv font-black tracking-tighter drop-shadow-lg">—</div>
                    </div>
                    <div class="w-full sm:w-1/3 flex flex-col bg-white border-t-4 sm:border-t-0 sm:border-l-4 border-gray-100 flex-shrink-0" style="height:100%">
                        <div class="p-6 pb-2">
                            <h3 class="text-xl sm:text-2xl font-black text-tema-panel text-center mb-6 uppercase tracking-widest">Últimos Chamados</h3>
                            <div class="flex justify-between text-xs sm:text-sm text-slate-400 font-bold mb-2 px-2 uppercase tracking-wider border-b-2 border-slate-100 pb-2">
                                <span>Nome</span><span>Local</span>
                            </div>
                        </div>
                        <div id="lista-historico-tv" class="flex flex-col flex-grow overflow-hidden px-4 space-y-3 mt-2"></div>
                        <div class="mt-auto h-32 sm:h-48 bg-slate-50 flex flex-col justify-center items-center border-t border-slate-200 p-4">
                            <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo" class="h-10 sm:h-16 object-contain mb-3 grayscale opacity-70">
                            <div id="data-hora-tv" class="mono text-slate-500 font-bold text-sm sm:text-base uppercase tracking-widest text-center"></div>
                            <div id="recepcao-nome-tv" class="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Recepção</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODO TV + VÍDEO -->
            <div id="modo-video" class="hidden w-full h-screen overflow-hidden" style="background:#0f172a">
                <div class="w-full h-full flex flex-col sm:flex-row">
                    <div id="video-container" class="flex-1 relative">
                        <div id="video-placeholder">
                            <div style="font-size:64px">📺</div>
                            <p class="font-black text-slate-400 text-xl uppercase tracking-widest">Sem vídeo configurado</p>
                            <p class="text-slate-600 text-sm mt-2">Configure o vídeo no painel administrativo.</p>
                        </div>
                        <div id="video-embed" style="display:none;position:absolute;inset:0"></div>
                        <div id="banner-chamado">
                            <div style="flex:1;min-width:0">
                                <p style="font-size:clamp(11px,1.2vw,15px);font-weight:800;letter-spacing:0.3em;text-transform:uppercase;opacity:0.85;margin-bottom:4px">📣 Chamando Agora</p>
                                <p id="banner-nome" style="font-size:clamp(2rem,5vw,5.5rem);font-weight:900;line-height:1;text-transform:uppercase;word-break:break-word">—</p>
                            </div>
                            <div style="text-align:right;flex-shrink:0">
                                <p id="banner-label-local" style="font-size:clamp(11px,1.2vw,15px);font-weight:700;opacity:0.8;text-transform:uppercase;letter-spacing:0.2em;margin-bottom:4px">Dirija-se a</p>
                                <p id="banner-local" style="font-size:clamp(1.8rem,4vw,4.5rem);font-weight:900;line-height:1">—</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- FAIXA LATERAL (agora fixa!) -->
                    <div id="faixa-video">
                        <div id="faixa-header" style="padding:20px 16px 12px;border-bottom:2px solid #f1f5f9;">
                            <div class="flex items-center gap-3 mb-4">
                                <img src="https://raw.githubusercontent.com/alexdovale/ac-o-paula-controle/main/imagem.png" alt="Logo" style="height:36px;object-fit:contain;filter:grayscale(0.3)">
                                <div>
                                    <p style="font-size:11px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.05em">SIGEP</p>
                                    <p id="recepcao-nome-video" style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.03em">Recepção</p>
                                </div>
                            </div>
                            <div style="display:flex;gap:8px">
                                <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;text-align:center">
                                    <p id="video-g-aguardando" style="font-size:clamp(18px,2.5vw,28px);font-weight:900;color:#f59e0b;line-height:1">0</p>
                                    <p style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px">Aguard.</p>
                                </div>
                                <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;text-align:center">
                                    <p id="video-g-atendendo" style="font-size:clamp(18px,2.5vw,28px);font-weight:900;color:#4f46e5;line-height:1">0</p>
                                    <p style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px">Atend.</p>
                                </div>
                            </div>
                        </div>

                        <div id="video-ultimo-chamado" style="padding:12px 16px;background:#f0fdf4;border-bottom:2px solid #bbf7d0;display:none;">
                            <p style="font-size:9px;font-weight:800;color:#16a34a;text-transform:uppercase;letter-spacing:0.2em;margin-bottom:4px">📣 Chamando</p>
                            <p id="video-uc-nome" style="font-size:clamp(14px,1.8vw,20px);font-weight:900;color:#0f172a;text-transform:uppercase;line-height:1.2;word-break:break-word">—</p>
                            <p id="video-uc-local" style="font-size:11px;font-weight:700;color:#16a34a;margin-top:4px">—</p>
                        </div>

                        <div id="faixa-historico-titulo" style="padding:12px 16px 4px;">
                            <p style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em">Últimos Chamados</p>
                        </div>
                        
                        <div id="lista-historico-video" style="padding:4px 16px 16px;display:flex;flex-direction:column;gap:6px"></div>

                        <div id="faixa-footer" style="padding:12px 16px;border-top:1px solid #f1f5f9;text-align:center;background:#f8fafc">
                            <div id="data-hora-video" class="mono" style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 4. LÓGICA DE INTERAÇÕES E CONTROLES (Hover / Ocultar mouse)
        let somAtivo = false;
        let audioCtx = null;
        
        function garantirAudioCtx() {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            return audioCtx;
        }

        const btnSom = document.getElementById('btn-som-fixo');
        const atualizarSom = () => {
            if (somAtivo) {
                document.getElementById('icone-som-fixo').textContent = '🔔';
                document.getElementById('texto-som-fixo').textContent = 'Som ativo';
                btnSom.style.background = '#dcfce7'; btnSom.style.borderColor = '#86efac';
            } else {
                document.getElementById('icone-som-fixo').textContent = '🔇';
                document.getElementById('texto-som-fixo').textContent = 'Som';
                btnSom.style.background = ''; btnSom.style.borderColor = '';
            }
        };

        btnSom.addEventListener('click', () => {
            if (!somAtivo) { try { garantirAudioCtx(); somAtivo = true; atualizarSom(); tocarSom(); } catch(e){} }
            else { somAtivo = false; atualizarSom(); }
        });

        // Controles que somem sozinhos (e escondem o cursor!)
        let timeoutControles;
        const areaControles = document.getElementById('area-controles');
        const mostrarControles = () => {
            areaControles.classList.add('ativo');
            document.body.style.cursor = 'default';
            clearTimeout(timeoutControles);
            timeoutControles = setTimeout(() => {
                areaControles.classList.remove('ativo');
                document.body.style.cursor = 'none'; // Some o mouse na TV!
            }, 3000);
        };
        document.addEventListener('mousemove', mostrarControles);
        document.addEventListener('click', mostrarControles);
        mostrarControles(); // Mostra inicialmente

        // 5. LÓGICA DE MUDANÇA DE MODOS
        const aplicarModo = (modo) => {
            const url = new URL(window.location);
            url.searchParams.set('modo', modo);
            window.history.replaceState({}, '', url);

            document.getElementById('modo-fila').classList.add('hidden'); document.getElementById('modo-fila').classList.remove('flex');
            document.getElementById('modo-tv').classList.add('hidden'); document.getElementById('modo-tv').classList.remove('flex');
            document.getElementById('modo-video').classList.add('hidden');
            document.getElementById('zoom-controls').style.display = 'none';
            document.querySelectorAll('.btn-modo').forEach(b => b.classList.remove('ativo'));

            if (modo === 'fila') {
                document.getElementById('modo-fila').classList.remove('hidden'); document.getElementById('modo-fila').classList.add('flex');
                document.getElementById('zoom-controls').style.display = 'flex';
                document.body.style.background = '#f1f5f9';
                document.body.style.zoom = window.zoomAtual || 1;
                document.getElementById('btn-modo-fila').classList.add('ativo');
            } else if (modo === 'tv') {
                document.getElementById('modo-tv').classList.remove('hidden'); document.getElementById('modo-tv').classList.add('flex');
                document.body.style.background = '#1e293b'; document.body.style.zoom = 1;
                document.getElementById('btn-modo-tv').classList.add('ativo');
            } else if (modo === 'video') {
                document.getElementById('modo-video').classList.remove('hidden');
                document.body.style.background = '#0f172a'; document.body.style.zoom = 1;
                document.getElementById('btn-modo-video').classList.add('ativo');
                iniciarVideo();
            }
        };

        document.getElementById('btn-modo-fila').addEventListener('click', () => aplicarModo('fila'));
        document.getElementById('btn-modo-tv').addEventListener('click', () => aplicarModo('tv'));
        document.getElementById('btn-modo-video').addEventListener('click', () => aplicarModo('video'));

        // Zoom
        window.zoomAtual = 1;
        const mudarZoom = (delta) => {
            window.zoomAtual = Math.max(0.4, Math.min(2.5, window.zoomAtual + delta));
            if(new URLSearchParams(window.location.search).get('modo') === 'fila' || !new URLSearchParams(window.location.search).get('modo')) {
                document.body.style.zoom = window.zoomAtual;
            }
            document.getElementById('zoom-level').textContent = Math.round(window.zoomAtual * 100) + '%';
        };
        document.getElementById('btn-zoom-in').addEventListener('click', () => mudarZoom(0.1));
        document.getElementById('btn-zoom-out').addEventListener('click', () => mudarZoom(-0.1));

        // 6. LÓGICA DO VÍDEO
        let videoCarregado = false;
        function iniciarVideo() {
            if (videoCarregado || !videoUrl) return;
            videoCarregado = true;
            document.getElementById('video-placeholder').style.display = 'none';
            const embedDiv = document.getElementById('video-embed');
            embedDiv.style.display = 'block';

            const m = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/))([A-Za-z0-9_-]{11})/);
            if (m && m[1]) {
                embedDiv.innerHTML = `<iframe src="https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=1&loop=1&playlist=${m[1]}&controls=0&modestbranding=1" style="position:absolute;inset:0;width:100%;height:100%;border:none" allowfullscreen></iframe>`;
            } else {
                embedDiv.innerHTML = `<video src="${videoUrl}" autoplay muted loop style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>`;
            }
        }

        // 7. LÓGICA DE DADOS (Firebase e Renders)
        const estado = { pautas: {}, assistidos: {}, ultimoChamado: null, historico: [] };
        const corPorUnidade = {}; let proximaCor = 0;
        const getCor = (key) => { if (corPorUnidade[key] === undefined) { corPorUnidade[key] = proximaCor % 8; proximaCor++; } return corPorUnidade[key]; };
        const esc = (str) => !str ? '' : String(str).replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]||t));

        function tickRelogio() {
            const dTV = new Date().toLocaleString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
            document.getElementById('data-hora-fila').textContent = new Date().toLocaleString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).replace(',', ' ·');
            document.getElementById('data-hora-tv').textContent = dTV;
            document.getElementById('data-hora-video').textContent = dTV;
        }
        setInterval(tickRelogio, 1000); tickRelogio();

        function tocarSom() {
            if (!somAtivo) return;
            try {
                const ctx = garantirAudioCtx();
                [[659, 0, 0.4], [523, 0.4, 0.6]].forEach(([f, i, d]) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.connect(g); g.connect(ctx.destination);
                    o.type = 'sine'; o.frequency.setValueAtTime(f, ctx.currentTime + i);
                    g.gain.setValueAtTime(0.5, ctx.currentTime + i); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i + d);
                    o.start(ctx.currentTime + i); o.stop(ctx.currentTime + i + d);
                });
            } catch(e) {}
        }

        function renderPainel() {
            let todosAt = [], totalAg = 0; const grupos = {};
            for (const pid in estado.assistidos) {
                const lista = estado.assistidos[pid] || [];
                const nm = estado.pautas[pid]?.name || 'Geral', sl = estado.pautas[pid]?.sala || '';
                let agLocal = [];
                lista.forEach(a => {
                    const p = { ...a, nm, sl, pid };
                    if (a.status === 'aguardando') agLocal.push(p); else if (a.status === 'emAtendimento') todosAt.push(p);
                });
                if (agLocal.length > 0) {
                    agLocal.sort((a, b) => (a.priority === 'URGENTE' && b.priority !== 'URGENTE' ? -1 : b.priority === 'URGENTE' && a.priority !== 'URGENTE' ? 1 : (a.checkInOrder||0)-(b.checkInOrder||0)));
                    agLocal.forEach((p, idx) => p.ordemLocal = idx + 1);
                    grupos[pid] = { nm, sl, pessoas: agLocal };
                    totalAg += agLocal.length;
                }
            }
            
            document.getElementById('g-aguardando').textContent = totalAg;
            document.getElementById('g-atendendo').textContent = todosAt.length;
            document.getElementById('video-g-aguardando').textContent = totalAg;
            document.getElementById('video-g-atendendo').textContent = todosAt.length;
            todosAt.sort((a, b) => new Date(b.inAttendanceTime||0) - new Date(a.inAttendanceTime||0));

            // Fila de Atendimento
            const lat = document.getElementById('lista-atendimento');
            lat.innerHTML = todosAt.length === 0 ? `<p class="text-center text-slate-400 font-bold mt-10 text-xs uppercase">Nenhum atendimento</p>` 
                : todosAt.map(a => `<div class="pessoa-card em-atendimento anim-fade-up ucor-${getCor(a.pid)}"><div class="flex-1 min-w-0"><p class="font-bold text-slate-800 uppercase truncate" style="font-size:var(--fs-lg)">${esc(a.name)}</p><p class="u-label font-bold text-xs uppercase mt-0.5 truncate">${esc(a.nm)}</p></div>${a.sl ? `<span class="sala-badge">${esc(a.sl)}</span>` : ''}</div>`).join('');
            
            // Fila de Espera
            const les = document.getElementById('lista-espera');
            if (totalAg === 0) { les.innerHTML = `<p class="text-center text-slate-400 font-bold mt-10 text-xs uppercase">Fila vazia</p>`; document.getElementById('legenda-unidades').innerHTML = ''; }
            else {
                const order = Object.keys(grupos).sort((a, b) => grupos[a].nm.localeCompare(grupos[b].nm));
                document.getElementById('legenda-unidades').innerHTML = order.map(k => `<span class="u-badge ucor-${getCor(k)}" style="font-size:var(--fs-xs);font-weight:700;padding:3px 10px;border-radius:6px;white-space:nowrap">${esc(grupos[k].nm)} <strong>${grupos[k].pessoas.length}</strong></span>`).join('');
                les.innerHTML = order.map((k, gi) => {
                    const g = grupos[k], cr = getCor(k);
                    return `<div class="unidade-group anim-group ucor-${cr}" style="animation-delay:${gi*0.08}s;border-left:4px solid currentColor"><div class="unidade-group-header ucor-${cr}"><div class="flex items-center gap-2 flex-1 min-w-0"><span style="font-size:var(--fs-md)">${g.pessoas.some(p=>p.priority==='URGENTE')?'🔴':'🏢'}</span><div class="min-w-0"><p class="u-label font-black text-sm uppercase truncate">${esc(g.nm)}</p>${g.sl ? `<p class="text-xs font-semibold text-slate-500 mt-0.5 truncate">🏠 ${esc(g.sl)}</p>`:''}</div></div><span class="u-badge ucor-${cr} font-bold text-xs px-3 py-1 rounded-full whitespace-nowrap">${g.pessoas.length} na fila</span></div><div class="unidade-group-body">${g.pessoas.map((a, li) => `<div class="pessoa-card anim-card ucor-${cr}" style="animation-delay:${gi*0.1+li*0.03}s"><span class="ordem-num">${a.ordemLocal}º</span><div class="flex-1 min-w-0"><p class="font-bold text-slate-800 uppercase truncate" style="font-size:var(--fs-md)">${esc(a.name)}</p></div>${a.priority==='URGENTE' ? `<span class="pill bg-red-100 text-red-800 border border-red-200">URGENTE</span>`:''}</div>`).join('')}</div></div>`;
                }).join('');
            }
        }

        function renderChamados(c) {
            // Histórico TV
            document.getElementById('lista-historico-tv').innerHTML = estado.historico.length === 0 ? `<p class="text-center text-slate-400 font-bold uppercase text-xs mt-10">Vazio</p>` : estado.historico.slice(0,5).map(h => `<div class="item-historico flex justify-between items-center bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-100 shadow-sm"><span class="text-lg sm:text-xl font-bold text-slate-700 truncate pr-2 w-2/3 uppercase">${esc(h.nome)}</span><span class="text-base sm:text-lg font-black text-tema-panel whitespace-nowrap">${esc(h.sala||h.local||'—')}</span></div>`).join('');
            // Histórico Video
            document.getElementById('lista-historico-video').innerHTML = estado.historico.length === 0 ? `<p class="text-center text-slate-400 font-bold uppercase text-[10px] mt-10">Vazio</p>` : estado.historico.slice(0,6).map(h => `<div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;gap:8px"><span style="font-size:12px;font-weight:700;color:#1e293b;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(h.nome)}</span><span style="font-size:11px;font-weight:800;color:#16a34a;flex-shrink:0">${esc(h.sala||h.local||'—')}</span></div>`).join('');
            
            if(!c) return;
            // Fila
            document.getElementById('ultimo-chamado-wrap').classList.remove('hidden');
            const nEl = document.getElementById('uc-nome-fila'), crd = document.getElementById('ultimo-chamado-card');
            nEl.textContent = c.nome.toUpperCase(); document.getElementById('uc-pauta-fila').textContent = esc(c.pautaNome||c.local||'—'); document.getElementById('uc-local-fila').textContent = c.sala?'🏠 '+esc(c.sala):'📋 '+(c.local||'—'); document.getElementById('uc-hora-fila').textContent = c.hora||'';
            nEl.classList.remove('anim-chamado'); crd.classList.remove('anim-glow'); void crd.offsetWidth; nEl.classList.add('anim-chamado'); crd.classList.add('anim-glow');
            // TV
            document.getElementById('uc-nome-tv').textContent = (c.nome||'').toUpperCase(); document.getElementById('uc-local-tv').textContent = c.sala?esc(c.sala):esc(c.local||'—'); document.getElementById('label-local-tv').textContent = c.sala?'Sala':'Local';
            const pt = document.getElementById('painel-destaque-tv'); pt.classList.remove('animar-chamado-tv'); void pt.offsetWidth; pt.classList.add('animar-chamado-tv');
            // Video Lateral
            document.getElementById('video-ultimo-chamado').style.display='block'; document.getElementById('video-uc-nome').textContent=(c.nome||'').toUpperCase(); document.getElementById('video-uc-local').textContent=c.sala?'🏠 '+c.sala:'📋 '+(c.local||'—');
            // Banner Overlay Video
            const b = document.getElementById('banner-chamado'); document.getElementById('banner-nome').textContent=(c.nome||'').toUpperCase(); document.getElementById('banner-local').textContent=c.sala?esc(c.sala):esc(c.local||'—'); document.getElementById('banner-label-local').textContent=c.sala?'Sala':'Local';
            b.classList.remove('visivel','saindo'); void b.offsetWidth; b.classList.add('visivel');
            setTimeout(()=>{ b.classList.remove('visivel'); b.classList.add('saindo'); setTimeout(()=>b.classList.remove('saindo'),500); }, 8000);
        }

        // 8. Inicializa Listeners
        if (!pautasParam) {
            document.getElementById('loading').innerHTML = `<div class="bg-white p-8 rounded-2xl text-center shadow-lg"><span class="text-4xl mb-4 block">⚠️</span><h2 class="font-bold text-lg">Parâmetros Inválidos</h2></div>`;
            return;
        }
        
        document.getElementById('recepcao-nome-fila').textContent = decodeURIComponent(recepcaoNome);
        document.getElementById('recepcao-nome-tv').textContent = decodeURIComponent(recepcaoNome);
        document.getElementById('recepcao-nome-video').textContent = decodeURIComponent(recepcaoNome);

        aplicarModo(initialModo);
        document.getElementById('loading').classList.add('hidden');
        renderChamados(null);

        const pIds = pautasParam.split(',').map(s => s.trim()).filter(Boolean);
        pIds.forEach(pid => {
            onSnapshot(doc(db, "pautas", pid), (s) => {
                if(!s.exists()) return; estado.pautas[pid] = {id:pid, ...s.data()}; renderPainel();
            });
            onSnapshot(collection(db, "pautas", pid, "attendances"), (s) => {
                estado.assistidos[pid] = s.docs.map(d=>({id:d.id, ...d.data()})); renderPainel();
            });
            onSnapshot(doc(db, "pautas", pid, "painel", "ultimoChamado"), (s) => {
                if(!s.exists() || !s.data().atual) return;
                const d = s.data().atual;
                if ((d.timestamp||0) > (estado.ultimoChamado?.timestamp||0)) {
                    const novo = { ...d, pautaNome: estado.pautas[pid]?.name || d.local || '', sala: estado.pautas[pid]?.sala || d.sala || '' };
                    if(estado.ultimoChamado) { estado.historico.unshift(estado.ultimoChamado); if(estado.historico.length>6) estado.historico.pop(); }
                    estado.ultimoChamado = novo;
                    renderChamados(novo);
                    if (somAtivo && (new URLSearchParams(window.location.search).get('som') !== '0')) tocarSom();
                }
            });
        });
    }
};
