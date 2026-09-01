// js/painelPublico.js - PAINEL DE TV E FILA PÚBLICA (VISUAL PREMIUM & AUDIO FIX)

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
        document.body.className = "p-0 m-0 flex flex-col min-h-screen overflow-hidden bg-slate-900 font-sans";
        
        // 2. Injeta o CSS (Melhorado para Telas Grandes)
        const style = document.createElement('style');
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&family=DM+Mono:wght@500&display=swap');
            
            :root {
                --fs-xs:   clamp(10px,  1vw,   13px);
                --fs-sm:   clamp(12px, 1.2vw, 15px);
                --fs-md:   clamp(14px, 1.6vw, 18px);
                --fs-lg:   clamp(18px, 2.2vw, 24px);
                --fs-xl:   clamp(22px, 3vw,   34px);
                --fs-2xl:  clamp(32px, 4.5vw, 58px);
                --fs-3xl:  clamp(42px, 6vw,   82px);
            }
            body { margin: 0; color: #0f172a; transition: background-color 0.4s ease; font-family: 'DM Sans', sans-serif; }
            .mono { font-family: 'DM Mono', monospace; }
            
            ::-webkit-scrollbar { width: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }

            /* ANIMAÇÕES GERAIS */
            @keyframes ping-slow { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.5); } }
            .ping-slow { animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite; }
            
            @keyframes chamado-enter { 
                0% { opacity: 0; transform: translateY(-20px) scale(0.95); filter: blur(4px); } 
                100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } 
            }
            
            @keyframes flash-glow { 
                0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } 
                20% { box-shadow: 0 0 0 25px rgba(245, 158, 11, 0.2); } 
                100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } 
            }
            
            @keyframes fade-in-left { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

            .anim-chamado  { animation: chamado-enter 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
            .anim-glow     { animation: flash-glow 1.2s ease-out forwards; }
            .item-historico { animation: fade-in-left 0.4s ease-out forwards; }

            /* ESTILOS ESTRUTURAIS MODO FILA */
            .pessoa-card { background: #ffffff; border: 1px solid #e2e8f0; border-left: 5px solid #f59e0b; border-radius: 12px; padding: clamp(10px, 1.5vw, 16px); display: flex; align-items: center; gap: clamp(10px, 1.2vw, 14px); box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 10px; }
            .pessoa-card.em-atendimento { border-left-color: #4f46e5 !important; background: #f5f8ff; border-color: #e0e7ff; }
            .unidade-group { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
            .unidade-group-header { display: flex; align-items: center; justify-content: space-between; padding: clamp(10px, 1.2vw, 16px) clamp(16px, 2vw, 24px); border-bottom: 1px solid #f1f5f9; }
            .unidade-group-body { padding: clamp(10px, 1.2vw, 14px); display: flex; flex-direction: column; gap: 8px; }

            /* CORES DAS UNIDADES */
            .ucor-0 { background: #eff6ff; border-left-color: #3b82f6 !important; } .ucor-0 .u-label { color: #1d4ed8; } .ucor-0 .u-badge { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
            .ucor-1 { background: #fdf4ff; border-left-color: #a855f7 !important; } .ucor-1 .u-label { color: #7e22ce; } .ucor-1 .u-badge { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
            .ucor-2 { background: #f0fdf4; border-left-color: #22c55e !important; } .ucor-2 .u-label { color: #15803d; } .ucor-2 .u-badge { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
            .ucor-3 { background: #fff7ed; border-left-color: #f97316 !important; } .ucor-3 .u-label { color: #c2410c; } .ucor-3 .u-badge { background: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; }
            .ucor-4 { background: #fef2f2; border-left-color: #ef4444 !important; } .ucor-4 .u-label { color: #b91c1c; } .ucor-4 .u-badge { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }

            .coluna-unificada { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 8px 20px rgba(0,0,0,0.03); }
            .coluna-header { padding: clamp(16px, 2vw, 24px) clamp(20px, 2.5vw, 30px); background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
            .nome-chamado { background: linear-gradient(90deg, #d97706, #ea580c); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
            .ordem-num { font-size: var(--fs-md); font-weight: 900; font-family: 'DM Mono', monospace; color: #f59e0b; min-width: clamp(28px, 3.5vw, 40px); text-align: center; flex-shrink: 0; }
            .sala-badge { font-size: var(--fs-xs); font-weight: 800; padding: clamp(4px, 0.5vw, 6px) clamp(10px, 1.2vw, 16px); border-radius: 8px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; }

            /* ESTILOS MODO TV CLÁSSICA */
            .bg-tema-panel { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); }
            .text-tema-panel { color: #16a34a; }
            @keyframes piscar-chamado-tv { 
                0%, 100% { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); transform: scale(1); } 
                50% { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); transform: scale(0.98); box-shadow: 0 0 50px rgba(34,197,94,0.3); } 
            }
            .animar-chamado-tv { animation: piscar-chamado-tv 0.8s cubic-bezier(0.22,1,0.36,1) 3; }
            .texto-nome-tv  { font-size: clamp(3rem, 7vw, 7.5rem); line-height: 1.1; word-wrap: break-word; text-transform: uppercase; letter-spacing: -0.02em; }
            .texto-local-tv { font-size: clamp(2.5rem, 5.5vw, 6rem); line-height: 1; text-transform: uppercase; color: #f0fdf4; text-shadow: 0 4px 12px rgba(0,0,0,0.1); }

            /* ESTILOS MODO TV+VÍDEO (REFORMULADO: BANNER FIXO) */
            #faixa-video {
                width: clamp(260px, 25vw, 380px);
                flex-shrink: 0; display: flex; flex-direction: column;
                background: #ffffff; border-left: 1px solid #e2e8f0; height: 100vh;
                box-shadow: -10px 0 30px rgba(0,0,0,0.05); z-index: 40;
            }
            #faixa-header { flex-shrink: 0; }
            #video-ultimo-chamado { flex-shrink: 0; }
            #faixa-historico-titulo { flex-shrink: 0; }
            #lista-historico-video { flex: 1; overflow-y: auto; }
            #faixa-footer { flex-shrink: 0; }

            /* Wrapper do Vídeo e Banner Fixo */
            #coluna-midia {
                flex: 1; display: flex; flex-direction: column;
                position: relative; overflow: hidden; background: #000;
            }
            #video-container {
                flex: 1; position: relative; overflow: hidden; pointer-events: none;
            }
            
            #video-embed iframe {
                position: absolute; top: -10%; left: -10%;
                width: 120%; height: 120%; border: none;
            }
            #video-embed video {
                position: absolute; top: 0; left: 0;
                width: 100%; height: 100%; object-fit: cover;
            }
            #video-placeholder {
                position: absolute; inset: 0; display: flex; flex-direction: column; 
                align-items: center; justify-content: center; background: #0f172a; color: #64748b; gap: 16px;
            }

            /* Banner Fixo na Base do Vídeo */
            #banner-chamado {
                flex-shrink: 0; z-index: 30;
                background: linear-gradient(90deg, #1e293b 0%, #0f172a 100%); color: white;
                padding: clamp(16px, 2vh, 24px) clamp(24px, 4vw, 64px);
                display: flex; align-items: center; justify-content: space-between; gap: 24px;
                border-top: 4px solid #3b82f6;
            }
            
            @keyframes piscar-banner-fixo {
                0%, 100% { background: linear-gradient(90deg, #1e293b 0%, #0f172a 100%); border-top-color: #3b82f6; }
                50% { background: linear-gradient(90deg, #1d4ed8 0%, #1e3a8a 100%); border-top-color: #60a5fa; box-shadow: 0 0 40px rgba(59,130,246,0.3); }
            }
            .banner-destaque-anim { animation: piscar-banner-fixo 0.6s ease-in-out 3; }

            /* SISTEMA DE CONTROLES INVISÍVEIS (HOVER) */
            #area-controles { position: fixed; inset: 0; z-index: 9999; pointer-events: none; }
            #controles-wrap { opacity: 0; transition: opacity 0.5s ease; pointer-events: auto; }
            #area-controles.ativo #controles-wrap { opacity: 1; }

            #seletor-modo {
                position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
                display: flex; gap: 8px; background: rgba(255,255,255,0.95); border: 1px solid #e2e8f0;
                border-radius: 20px; padding: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); backdrop-filter: blur(10px);
            }
            .btn-modo {
                display: flex; align-items: center; gap: 8px; padding: 10px 18px;
                border-radius: 12px; border: none; font-weight: 800; font-size: 12px;
                text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer;
                transition: all 0.2s; color: #64748b; background: transparent;
            }
            .btn-modo:hover { background: #f1f5f9; color: #0f172a; }
            .btn-modo.ativo { background: #0f172a; color: white; }
            .btn-modo span { font-size: 18px; }
            
            #btn-som-fixo {
                position: absolute; top: 24px; right: 24px; display: flex; align-items: center; gap: 8px;
                background: rgba(255,255,255,0.95); border: 1px solid #e2e8f0; padding: 10px 16px; border-radius: 99px;
                font-size: var(--fs-sm); box-shadow: 0 4px 16px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.2s;
                backdrop-filter: blur(10px);
            }
            #btn-som-fixo:hover { transform: scale(1.05); }

            #zoom-controls { 
                position: absolute; bottom: 100px; right: 24px; display: flex; align-items: center; gap: 10px; 
                background: rgba(255,255,255,0.95); border: 1px solid #e2e8f0; padding: 10px; border-radius: 16px; 
                box-shadow: 0 10px 30px rgba(0,0,0,0.1); backdrop-filter: blur(10px);
            }
            
            /* TELA DE DESTRAVAMENTO DE AUDIO */
            #unlock-audio-overlay {
                position: fixed; inset: 0; z-index: 10000; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px);
                display: flex; flex-direction: column; align-items: center; justify-content: center; color: white;
            }
        `;
        document.head.appendChild(style);

        // 3. Injeta a estrutura HTML da Tela Pública
        document.body.innerHTML = `
            <!-- OVERLAY DE DESTRAVAMENTO (Para o Navegador permitir o Som) -->
            <div id="unlock-audio-overlay">
                <div class="text-6xl mb-6 animate-bounce">👆</div>
                <h1 class="text-3xl font-black mb-2 text-center">Painel de Atendimento</h1>
                <p class="text-slate-400 mb-8 text-center max-w-md">Para que os alertas sonoros e a chamada por voz funcionem corretamente, clique no botão abaixo.</p>
                <button id="btn-unlock-audio" class="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl px-10 py-5 rounded-2xl shadow-xl transition-transform hover:scale-105">
                    INICIAR PAINEL E ATIVAR SOM
                </button>
            </div>

            <div id="loading" class="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-50 gap-5 hidden">
                <div class="w-14 h-14 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin"></div>
                <p class="text-slate-500 font-bold uppercase tracking-widest text-sm">Conectando ao SIGEP...</p>
            </div>

            <!-- CONTROLES FLUTUANTES QUE APARECEM COM O MOUSE -->
            <div id="area-controles">
                <div id="controles-wrap">
                    <div id="seletor-modo">
                        <button class="btn-modo" id="btn-modo-fila"><span>📋</span> Fila Aberta</button>
                        <button class="btn-modo" id="btn-modo-tv"><span>📺</span> TV Chamados</button>
                        <button class="btn-modo" id="btn-modo-video"><span>🎬</span> TV + Vídeo</button>
                    </div>
                    <button id="btn-som-fixo">
                        <span id="icone-som-fixo" style="font-size:18px">🔇</span>
                        <span id="texto-som-fixo" class="font-bold text-slate-600 uppercase tracking-widest hidden sm:inline">Som Desativado</span>
                    </button>
                    <div id="zoom-controls">
                        <button id="btn-zoom-out" class="flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-slate-700 leading-none" style="width:40px;height:40px;font-size:18px">-</button>
                        <span id="zoom-level" class="font-bold text-slate-600 text-center" style="font-size:14px;min-width:3.5rem">100%</span>
                        <button id="btn-zoom-in" class="flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-slate-700 leading-none" style="width:40px;height:40px;font-size:18px">+</button>
                    </div>
                </div>
            </div>

            <!-- ============================================== -->
            <!-- MODO FILA                                      -->
            <!-- ============================================== -->
            <div id="modo-fila" class="hidden w-full max-w-[1800px] mx-auto flex-1 flex-col gap-5 h-full p-3 sm:p-5 md:p-8 bg-slate-100">
                <header class="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-slate-200 shadow-sm rounded-3xl px-6 py-4 shrink-0">
                    <div class="flex items-center gap-4">
                        <div class="bg-[#0d1117] border border-slate-700 rounded-2xl p-2.5 shrink-0 shadow-md">
                            <img src="https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_sigep.png?alt=media&token=b067528b-df81-4fbf-bc22-0d2b01acbbe6" alt="Logo SIGEP" style="height:clamp(24px,3vw,36px)" class="w-auto object-contain">
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h1 class="text-slate-900 font-black tracking-tight leading-none" style="font-size:var(--fs-lg)">SIGEP</h1>
                                <span class="text-slate-300 font-bold" style="font-size:var(--fs-xs)">·</span>
                                <span class="text-slate-500 font-bold uppercase tracking-widest" style="font-size:var(--fs-xs)">Painel de Atendimento</span>
                            </div>
                            <h2 id="recepcao-nome-fila" class="text-indigo-600 font-black leading-tight mt-1 tracking-tight" style="font-size:var(--fs-md)">—</h2>
                        </div>
                    </div>
                    <div class="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
                        <div class="flex items-center gap-2 px-3 bg-emerald-50 border border-emerald-100 py-1.5 rounded-lg">
                            <span class="relative flex" style="height:12px;width:12px">
                                <span class="ping-slow absolute h-full w-full rounded-full bg-emerald-500 opacity-60"></span>
                                <span class="relative rounded-full bg-emerald-600" style="height:12px;width:12px"></span>
                            </span>
                            <span class="text-emerald-700 font-black uppercase tracking-widest" style="font-size:var(--fs-xs)">Ao Vivo</span>
                        </div>
                        <div class="h-10 w-px bg-slate-200"></div>
                        <div class="text-center px-3">
                            <p class="text-amber-500 font-black leading-none" id="g-aguardando" style="font-size:var(--fs-xl)">0</p>
                            <p class="text-slate-500 font-bold uppercase tracking-widest mt-1" style="font-size:var(--fs-xs)">Aguardando</p>
                        </div>
                        <div class="text-center px-3">
                            <p class="text-indigo-600 font-black leading-none" id="g-atendendo" style="font-size:var(--fs-xl)">0</p>
                            <p class="text-slate-500 font-bold uppercase tracking-widest mt-1" style="font-size:var(--fs-xs)">Em Mesa</p>
                        </div>
                        <div id="data-hora-fila" class="mono text-slate-600 font-bold bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl shadow-inner" style="font-size:var(--fs-sm)"></div>
                    </div>
                </header>

                <div id="ultimo-chamado-wrap" class="hidden shrink-0">
                    <div id="ultimo-chamado-card" class="bg-white border-2 border-amber-300 shadow-xl rounded-3xl relative overflow-hidden" style="padding:clamp(20px,3vw,40px) clamp(24px,4vw,50px)">
                        <div class="absolute inset-0 pointer-events-none" style="background: radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.08) 0%, transparent 70%)"></div>
                        <div class="flex flex-col md:flex-row items-center gap-6 relative z-10">
                            <div class="text-center md:text-left flex-1 w-full">
                                <p class="text-amber-600 font-black uppercase flex items-center justify-center md:justify-start gap-2 mb-3" style="font-size:var(--fs-sm);letter-spacing:0.3em">📣 Chamando Agora</p>
                                <h2 id="uc-nome-fila" class="nome-chamado font-black uppercase tracking-tight leading-none mb-4" style="font-size:var(--fs-3xl)">—</h2>
                                <div class="flex flex-wrap gap-3 justify-center md:justify-start items-center">
                                    <span id="uc-pauta-fila" class="bg-slate-100 border border-slate-200 text-slate-700 font-black px-5 py-2 rounded-xl" style="font-size:var(--fs-md)">—</span>
                                    <span id="uc-local-fila" class="bg-amber-50 border border-amber-200 text-amber-800 font-black px-5 py-2 rounded-xl shadow-sm" style="font-size:var(--fs-md)">—</span>
                                    <span id="uc-hora-fila" class="mono text-slate-400 font-bold ml-2" style="font-size:var(--fs-sm)">—</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col md:flex-row gap-5 flex-1 min-h-[450px]">
                    <div class="coluna-unificada w-full md:w-1/3 border-indigo-100">
                        <div class="coluna-header bg-indigo-50 border-indigo-100">
                            <div>
                                <p class="text-indigo-700 font-black uppercase tracking-widest flex items-center gap-2" style="font-size:var(--fs-md)">🧑‍💻 Em Atendimento</p>
                                <p class="text-indigo-400 font-bold mt-1" style="font-size:var(--fs-xs)">Sendo atendidos neste momento</p>
                            </div>
                        </div>
                        <div id="lista-atendimento" class="flex-1 overflow-y-auto bg-slate-50/50 p-4" style="display:flex;flex-direction:column;gap:10px"></div>
                    </div>
                    <div class="coluna-unificada w-full md:w-2/3 border-amber-100">
                        <div class="coluna-header bg-amber-50/50 border-amber-100">
                            <div>
                                <p class="text-amber-700 font-black uppercase tracking-widest flex items-center gap-2" style="font-size:var(--fs-md)">⏳ Fila de Espera</p>
                                <p class="text-amber-500/70 font-bold mt-1" style="font-size:var(--fs-xs)">Aguardando chamada</p>
                            </div>
                            <div id="legenda-unidades" class="flex flex-wrap gap-2 justify-end max-w-sm"></div>
                        </div>
                        <div id="lista-espera" class="flex-1 overflow-y-auto bg-slate-50/50 p-4" style="display:flex;flex-direction:column;gap:12px"></div>
                    </div>
                </div>
            </div>

            <!-- ============================================== -->
            <!-- MODO TV CLÁSSICA                               -->
            <!-- ============================================== -->
            <div id="modo-tv" class="hidden w-full h-screen bg-slate-900 sm:p-6 flex items-center justify-center overflow-hidden">
                <div class="w-full h-full sm:max-h-[90vh] sm:max-w-[170vh] sm:aspect-video bg-white shadow-2xl overflow-hidden rounded-none sm:rounded-[32px] flex flex-col sm:flex-row">
                    <div id="painel-destaque-tv" class="w-full sm:w-2/3 bg-tema-panel flex flex-col justify-center items-center text-white p-8 sm:p-16 text-center transition-all duration-300 flex-1 relative overflow-hidden">
                        <!-- Efeito de fundo na TV -->
                        <div class="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-white opacity-5 rounded-full blur-3xl pointer-events-none"></div>
                        
                        <h1 class="text-3xl sm:text-4xl font-bold uppercase tracking-[0.3em] mb-4 sm:mb-8 opacity-90 leading-tight text-green-100">Próximo Chamado</h1>
                        <div id="uc-nome-tv" class="texto-nome-tv font-black mb-8 sm:mb-16 w-full px-6 drop-shadow-xl" style="min-height:3em;display:flex;align-items:center;justify-content:center;">AGUARDANDO...</div>
                        <h2 class="text-2xl sm:text-3xl font-semibold uppercase tracking-[0.2em] mb-2 sm:mb-4 text-green-100" id="label-local-tv">Dirija-se a</h2>
                        <div id="uc-local-tv" class="texto-local-tv font-black tracking-tight drop-shadow-xl bg-white/10 px-8 py-4 rounded-3xl border border-white/20">—</div>
                    </div>
                    
                    <div class="w-full sm:w-1/3 flex flex-col bg-slate-50 border-t-4 sm:border-t-0 sm:border-l border-slate-200 flex-shrink-0" style="height:100%">
                        <div class="p-8 pb-4 bg-white border-b border-slate-200 shadow-sm z-10">
                            <h3 class="text-xl sm:text-2xl font-black text-slate-800 text-center mb-6 uppercase tracking-widest">Últimos Chamados</h3>
                            <div class="flex justify-between text-xs sm:text-sm text-slate-400 font-bold px-2 uppercase tracking-wider">
                                <span>Nome</span><span>Local</span>
                            </div>
                        </div>
                        <div id="lista-historico-tv" class="flex flex-col flex-grow overflow-hidden px-5 py-4 space-y-3"></div>
                        
                        <div class="mt-auto bg-white flex flex-col justify-center items-center border-t border-slate-200 p-6 z-10">
                            <div class="bg-[#0d1117] rounded-xl p-2.5 mb-4 shadow-sm">
                                <img src="https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_sigep.png?alt=media&token=b067528b-df81-4fbf-bc22-0d2b01acbbe6" alt="Logo" class="h-8 sm:h-12 object-contain">
                            </div>
                            <div id="data-hora-tv" class="mono text-slate-600 font-bold text-sm sm:text-lg uppercase tracking-widest text-center"></div>
                            <div id="recepcao-nome-tv" class="text-xs text-slate-400 font-bold mt-2 uppercase tracking-widest">Recepção</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ============================================== -->
            <!-- MODO TV + VÍDEO (REFINADO COM BRANDING)        -->
            <!-- ============================================== -->
            <div id="modo-video" class="hidden w-full h-screen overflow-hidden bg-slate-900 flex-col sm:flex-row">
                
                <div id="coluna-midia">
                    <!-- Vídeo -->
                    <div id="video-container">
                        <div id="video-placeholder">
                            <div style="font-size:72px; opacity:0.8">🎬</div>
                            <p class="font-black text-white text-2xl uppercase tracking-widest mt-4">Tela de Mídia</p>
                            <p class="text-slate-400 text-base mt-2 text-center max-w-md">Feche esta aba, clique em "Configurar Painel da TV" e insira um link válido do YouTube.</p>
                        </div>
                        <div id="video-embed" style="display:none; position:absolute; inset:0;"></div>
                    </div>
                    
                    <!-- Banner Chamado (Fixo na Base) -->
                    <div id="banner-chamado">
                        <div style="flex:1; min-width:0;">
                            <p style="font-size:clamp(10px,1vw,14px); font-weight:800; letter-spacing:0.2em; text-transform:uppercase; color:#93c5fd; margin-bottom:4px;">📣 Próximo Chamado</p>
                            <p id="banner-nome" style="font-size:clamp(1.8rem,4vw,4.5rem); font-weight:900; line-height:1; text-transform:uppercase; word-break:break-word; text-shadow: 0 4px 12px rgba(0,0,0,0.3);">AGUARDANDO...</p>
                        </div>
                        <div style="text-align:right; flex-shrink:0; background:rgba(255,255,255,0.1); padding: clamp(10px,1.5vw,20px) clamp(16px,2vw,30px); border-radius:16px; border:1px solid rgba(255,255,255,0.2); backdrop-filter:blur(10px);">
                            <p id="banner-label-local" style="font-size:clamp(10px,1vw,14px); font-weight:700; color:#93c5fd; text-transform:uppercase; letter-spacing:0.15em; margin-bottom:4px;">Dirija-se a</p>
                            <p id="banner-local" style="font-size:clamp(1.5rem,3vw,3.5rem); font-weight:900; line-height:1; text-transform:uppercase; text-shadow: 0 2px 8px rgba(0,0,0,0.2);">—</p>
                        </div>
                    </div>
                </div>
                
                <!-- FAIXA LATERAL DIREITA -->
                <div id="faixa-video">
                    <div id="faixa-header" style="padding:24px 20px 16px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
                        <div class="flex items-center justify-center gap-3 mb-6 bg-[#0d1117] rounded-xl py-3 shadow-inner">
                            <img src="https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_sigep.png?alt=media&token=b067528b-df81-4fbf-bc22-0d2b01acbbe6" alt="Logo" style="height:28px;object-fit:contain;">
                        </div>
                        <p id="recepcao-nome-video" style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;text-align:center;margin-bottom:16px">Recepção</p>
                        
                        <div style="display:flex;gap:10px">
                            <div style="flex:1;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:12px 10px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,0.02)">
                                <p id="video-g-aguardando" style="font-size:clamp(22px,3vw,32px);font-weight:900;color:#f59e0b;line-height:1">0</p>
                                <p style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px">Fila</p>
                            </div>
                            <div style="flex:1;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:12px 10px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,0.02)">
                                <p id="video-g-atendendo" style="font-size:clamp(22px,3vw,32px);font-weight:900;color:#4f46e5;line-height:1">0</p>
                                <p style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px">Mesas</p>
                            </div>
                        </div>
                    </div>

                    <div id="video-ultimo-chamado" style="padding:16px 20px;background:#f0fdf4;border-bottom:3px solid #4ade80;display:none;">
                        <p style="font-size:10px;font-weight:900;color:#16a34a;text-transform:uppercase;letter-spacing:0.2em;margin-bottom:6px">📣 Último Chamado</p>
                        <p id="video-uc-nome" style="font-size:clamp(16px,2vw,22px);font-weight:900;color:#064e3b;text-transform:uppercase;line-height:1.1;word-break:break-word">—</p>
                        <p id="video-uc-local" style="font-size:12px;font-weight:800;color:#15803d;margin-top:6px;text-transform:uppercase;background:#dcfce7;display:inline-block;padding:4px 8px;border-radius:6px">—</p>
                    </div>

                    <div id="faixa-historico-titulo" style="padding:20px 20px 8px;">
                        <p style="font-size:11px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:0.1em">Histórico Recente</p>
                    </div>
                    
                    <div id="lista-historico-video" style="padding:4px 20px 20px;display:flex;flex-direction:column;gap:8px"></div>

                    <div id="faixa-footer" style="padding:20px;border-top:1px solid #e2e8f0;text-align:center;background:#f8fafc;display:flex;flex-direction:column;align-items:center;">
                        <p style="font-size:10px;font-weight:900;color:#475569;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.05em">Acompanhe no Celular</p>
                        <div id="qr-code-tv" style="background:white;padding:8px;border-radius:12px;border:1px solid #cbd5e1;margin-bottom:12px;box-shadow:0 4px 6px rgba(0,0,0,0.05)"></div>
                        <div id="data-hora-video" class="mono" style="font-size:13px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;background:white;padding:6px 12px;border-radius:8px;border:1px solid #e2e8f0"></div>
                    </div>
                </div>
            </div>
        `;

        // 4. LÓGICA DE DESTRAVAMENTO DE ÁUDIO (Navegadores Modernos)
        let somAtivo = false;
        let audioCtx = null;
        let lastUtterance = null; // Para cancelar fala anterior
        
        function garantirAudioCtx() {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            return audioCtx;
        }

        const overlay = document.getElementById('unlock-audio-overlay');
        const btnUnlock = document.getElementById('btn-unlock-audio');
        
        btnUnlock.addEventListener('click', () => {
            // Inicializa e destrava o áudio no primeiro clique do usuário
            garantirAudioCtx();
            
            // Ativa o som se a URL mandou
            const urlSom = params.get('som');
            if (urlSom === '1' || urlSom === 'true' || urlSom === null) {
                somAtivo = true;
            }
            
            // Pequeno truque para destravar o TTS no iOS/Safari (falar algo vazio)
            if ('speechSynthesis' in window) {
                const msg = new SpeechSynthesisUtterance('');
                msg.volume = 0;
                window.speechSynthesis.speak(msg);
            }

            atualizarSom();
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 500); // Remove do DOM
            
            document.getElementById('loading').classList.remove('hidden'); // Volta o loading original
            this._conectarFirebase(app, pautasParam, recepcaoNome, initialModo, videoUrl); // Inicia os dados reais
        });


        const btnSom = document.getElementById('btn-som-fixo');

        const atualizarSom = () => {
            if (somAtivo) {
                document.getElementById('icone-som-fixo').textContent = '🔔';
                document.getElementById('texto-som-fixo').textContent = 'Som Ativado';
                btnSom.style.background = '#dcfce7'; btnSom.style.borderColor = '#4ade80'; btnSom.style.color = '#166534';
            } else {
                document.getElementById('icone-som-fixo').textContent = '🔇';
                document.getElementById('texto-som-fixo').textContent = 'Som Desativado';
                btnSom.style.background = ''; btnSom.style.borderColor = ''; btnSom.style.color = '';
            }
        };

        btnSom.addEventListener('click', () => {
            if (!somAtivo) { 
                try { garantirAudioCtx(); somAtivo = true; atualizarSom(); tocarSomEDizer("Áudio ativado", "painel"); } catch(e){} 
            } else { 
                somAtivo = false; atualizarSom(); 
            }
        });

        // Controles que somem sozinhos (e escondem o cursor)
        let timeoutControles;
        const areaControles = document.getElementById('area-controles');
        const mostrarControles = () => {
            areaControles.classList.add('ativo');
            document.body.style.cursor = 'default';
            clearTimeout(timeoutControles);
            timeoutControles = setTimeout(() => {
                areaControles.classList.remove('ativo');
                document.body.style.cursor = 'none'; // Some o mouse!
            }, 3000);
        };
        document.addEventListener('mousemove', mostrarControles);
        document.addEventListener('click', mostrarControles);

        // 5. LÓGICA DE MUDANÇA DE MODOS
        const aplicarModo = (modo) => {
            const url = new URL(window.location);
            url.searchParams.set('modo', modo);
            window.history.replaceState({}, '', url);

            document.getElementById('modo-fila').classList.add('hidden'); document.getElementById('modo-fila').classList.remove('flex');
            document.getElementById('modo-tv').classList.add('hidden'); document.getElementById('modo-tv').classList.remove('flex');
            document.getElementById('modo-video').classList.add('hidden'); document.getElementById('modo-video').classList.remove('flex');
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
                document.body.style.background = '#0f172a'; document.body.style.zoom = 1;
                document.getElementById('btn-modo-tv').classList.add('ativo');
            } else if (modo === 'video') {
                document.getElementById('modo-video').classList.remove('hidden'); document.getElementById('modo-video').classList.add('flex');
                document.body.style.background = '#000000'; document.body.style.zoom = 1;
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

        // 6. LÓGICA DO VÍDEO (YOUTUBE)
        let videoCarregado = false;
        function iniciarVideo() {
            if (videoCarregado || !videoUrl) return;
            videoCarregado = true;
            document.getElementById('video-placeholder').style.display = 'none';
            const embedDiv = document.getElementById('video-embed');
            embedDiv.style.display = 'block';

            const m = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/))([A-Za-z0-9_-]{11})/);
            if (m && m[1]) {
                embedDiv.innerHTML = `<iframe src="https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=1&loop=1&playlist=${m[1]}&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&iv_load_policy=3" allow="autoplay; encrypted-media"></iframe>`;
            } else {
                embedDiv.innerHTML = `<video src="${videoUrl}" autoplay muted loop playsinline></video>`;
            }
        }

        // Deixa a lógica de Firebase para ser chamada apenas APÓS o clique do usuário!
        this._tocarSomEDizer = (nomePessoa, salaOuLocal) => {
            if (!somAtivo) return;
            try {
                const ctx = garantirAudioCtx();
                
                // Toca o "Ding-Dong"
                [[659, 0, 0.4], [523, 0.4, 0.6]].forEach(([f, i, d]) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.connect(g); g.connect(ctx.destination);
                    o.type = 'sine'; o.frequency.setValueAtTime(f, ctx.currentTime + i);
                    g.gain.setValueAtTime(0.5, ctx.currentTime + i); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i + d);
                    o.start(ctx.currentTime + i); o.stop(ctx.currentTime + i + d);
                });

                if ('speechSynthesis' in window) {
                    // Cancela a fala anterior se a pessoa chamou muito rápido (Fila de Voz Inteligente)
                    window.speechSynthesis.cancel(); 

                    setTimeout(() => {
                        const localFormatado = salaOuLocal.toLowerCase().includes('sala') 
                                ? salaOuLocal 
                                : `a recepção ${salaOuLocal}`;
                        
                        const mensagem = new SpeechSynthesisUtterance(`${nomePessoa}. Por favor, dirija-se à ${localFormatado}.`);
                        mensagem.lang = 'pt-BR';
                        mensagem.rate = 0.85; 
                        mensagem.pitch = 1.0;
                        mensagem.volume = 1.0;
                        window.speechSynthesis.speak(mensagem);
                    }, 1200); // Espera o Ding-Dong terminar
                }
            } catch(e) { console.error("Erro no som:", e); }
        };
    },

    // ESTA FUNÇÃO SÓ É CHAMADA APÓS O USUÁRIO CLICAR NO BOTÃO DA TELA PRETA (Para não bloquear o áudio)
    _conectarFirebase(app, pautasParam, recepcaoNome, initialModo, videoUrl) {
        
        const db = app.db;
        const estado = { pautas: {}, assistidos: {}, ultimoChamado: null, historico: [] };
        const corPorUnidade = {}; let proximaCor = 0;
        const getCor = (key) => { if (corPorUnidade[key] === undefined) { corPorUnidade[key] = proximaCor % 5; proximaCor++; } return corPorUnidade[key]; };
        const esc = (str) => !str ? '' : String(str).replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]||t));

        function tickRelogio() {
            const dTV = new Date().toLocaleString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
            const docHoraFila = document.getElementById('data-hora-fila');
            if(docHoraFila) docHoraFila.textContent = new Date().toLocaleString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).replace(',', ' ·');
            const docHoraTv = document.getElementById('data-hora-tv');
            if(docHoraTv) docHoraTv.textContent = dTV;
            const docHoraVid = document.getElementById('data-hora-video');
            if(docHoraVid) docHoraVid.textContent = dTV;
        }
        setInterval(tickRelogio, 1000); tickRelogio();

        const tocarSomEDizer = this._tocarSomEDizer;

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
            
            const docGAg = document.getElementById('g-aguardando'); if(docGAg) docGAg.textContent = totalAg;
            const docGAt = document.getElementById('g-atendendo'); if(docGAt) docGAt.textContent = todosAt.length;
            const vidGAg = document.getElementById('video-g-aguardando'); if(vidGAg) vidGAg.textContent = totalAg;
            const vidGAt = document.getElementById('video-g-atendendo'); if(vidGAt) vidGAt.textContent = todosAt.length;
            
            todosAt.sort((a, b) => new Date(b.inAttendanceTime||0) - new Date(a.inAttendanceTime||0));

            // Fila de Atendimento
            const lat = document.getElementById('lista-atendimento');
            if(lat) {
                lat.innerHTML = todosAt.length === 0 ? `<p class="text-center text-slate-400 font-bold mt-10 text-xs uppercase">Nenhum atendimento</p>` 
                    : todosAt.map(a => `<div class="pessoa-card em-atendimento anim-fade-up ucor-${getCor(a.pid)}"><div class="flex-1 min-w-0"><p class="font-black text-indigo-900 uppercase truncate" style="font-size:var(--fs-lg)">${esc(a.name)}</p><p class="u-label font-bold text-xs uppercase mt-0.5 truncate">${esc(a.nm)}</p></div>${a.sl ? `<span class="sala-badge">${esc(a.sl)}</span>` : ''}</div>`).join('');
            }
            
            // Fila de Espera
            const les = document.getElementById('lista-espera');
            if(les) {
                if (totalAg === 0) { les.innerHTML = `<p class="text-center text-slate-400 font-bold mt-10 text-xs uppercase">Fila vazia</p>`; document.getElementById('legenda-unidades').innerHTML = ''; }
                else {
                    const order = Object.keys(grupos).sort((a, b) => grupos[a].nm.localeCompare(grupos[b].nm));
                    document.getElementById('legenda-unidades').innerHTML = order.map(k => `<span class="u-badge ucor-${getCor(k)}" style="font-size:var(--fs-xs);font-weight:800;padding:4px 12px;border-radius:8px;white-space:nowrap">${esc(grupos[k].nm)} <strong>${grupos[k].pessoas.length}</strong></span>`).join('');
                    les.innerHTML = order.map((k, gi) => {
                        const g = grupos[k], cr = getCor(k);
                        return `<div class="unidade-group anim-group ucor-${cr}" style="animation-delay:${gi*0.08}s;border-left:5px solid currentColor"><div class="unidade-group-header ucor-${cr}"><div class="flex items-center gap-3 flex-1 min-w-0"><span style="font-size:var(--fs-md)">${g.pessoas.some(p=>p.priority==='URGENTE')?'🔴':'🏢'}</span><div class="min-w-0"><p class="u-label font-black text-sm uppercase truncate">${esc(g.nm)}</p>${g.sl ? `<p class="text-xs font-bold text-slate-500 mt-0.5 truncate">🏠 ${esc(g.sl)}</p>`:''}</div></div><span class="u-badge ucor-${cr} font-black text-xs px-3 py-1 rounded-lg whitespace-nowrap">${g.pessoas.length} na fila</span></div><div class="unidade-group-body">${g.pessoas.map((a, li) => `<div class="pessoa-card anim-card ucor-${cr}" style="animation-delay:${gi*0.1+li*0.03}s"><span class="ordem-num">${a.ordemLocal}º</span><div class="flex-1 min-w-0"><p class="font-black text-slate-800 uppercase truncate" style="font-size:var(--fs-md)">${esc(a.name)}</p></div>${a.priority==='URGENTE' ? `<span class="pill bg-rose-100 text-rose-700 border border-rose-200">URGENTE</span>`:''}</div>`).join('')}</div></div>`;
                    }).join('');
                }
            }
        }

        function renderChamados(c) {
            // Histórico TV Clássica
            const lht = document.getElementById('lista-historico-tv');
            if(lht) {
                lht.innerHTML = estado.historico.length === 0 ? `<p class="text-center text-slate-400 font-bold uppercase text-xs mt-10">Vazio</p>` : estado.historico.slice(0,5).map(h => `<div class="item-historico flex justify-between items-center bg-white rounded-xl p-4 sm:p-5 border border-slate-200 shadow-sm"><span class="text-lg sm:text-xl font-black text-slate-800 truncate pr-2 w-2/3 uppercase">${esc(h.nome)}</span><span class="text-base sm:text-lg font-black text-tema-panel whitespace-nowrap bg-green-50 px-3 py-1 rounded-lg border border-green-100">${esc(h.sala||h.local||'—')}</span></div>`).join('');
            }

            // Histórico Video
            const lhv = document.getElementById('lista-historico-video');
            if(lhv) {
                lhv.innerHTML = estado.historico.length === 0 ? `<p class="text-center text-slate-400 font-bold uppercase text-[10px] mt-10">Vazio</p>` : estado.historico.slice(0,6).map(h => `<div style="display:flex;justify-content:space-between;align-items:center;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;gap:8px;box-shadow:0 2px 4px rgba(0,0,0,0.02)"><span style="font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(h.nome)}</span><span style="font-size:11px;font-weight:900;color:#047857;background:#ecfdf5;padding:4px 8px;border-radius:6px;flex-shrink:0">${esc(h.sala||h.local||'—')}</span></div>`).join('');
            }
            
            if(!c) return;

            // Fila
            const ucWrap = document.getElementById('ultimo-chamado-wrap');
            if(ucWrap) ucWrap.classList.remove('hidden');
            const nEl = document.getElementById('uc-nome-fila'), crd = document.getElementById('ultimo-chamado-card');
            if(nEl && crd) {
                nEl.textContent = c.nome.toUpperCase(); 
                document.getElementById('uc-pauta-fila').textContent = esc(c.pautaNome||c.local||'—'); 
                document.getElementById('uc-local-fila').textContent = c.sala?'🏠 '+esc(c.sala):'📋 '+(c.local||'—'); 
                document.getElementById('uc-hora-fila').textContent = c.hora||'';
                nEl.classList.remove('anim-chamado'); crd.classList.remove('anim-glow'); void crd.offsetWidth; nEl.classList.add('anim-chamado'); crd.classList.add('anim-glow');
            }

            // TV Clássica
            const unt = document.getElementById('uc-nome-tv');
            if(unt) {
                unt.textContent = (c.nome||'').toUpperCase(); 
                document.getElementById('uc-local-tv').textContent = c.sala?esc(c.sala):esc(c.local||'—'); 
                document.getElementById('label-local-tv').textContent = c.sala?'Sala':'Local';
                const pt = document.getElementById('painel-destaque-tv'); pt.classList.remove('animar-chamado-tv'); void pt.offsetWidth; pt.classList.add('animar-chamado-tv');
            }
            
            // Video Lateral e Banner Fixo
            const vuc = document.getElementById('video-ultimo-chamado');
            if(vuc) {
                vuc.style.display='block'; 
                document.getElementById('video-uc-nome').textContent=(c.nome||'').toUpperCase(); 
                document.getElementById('video-uc-local').textContent=c.sala?'🏠 '+c.sala:'📋 '+(c.local||'—');
            }
            
            // BANNER FIXO MODO VIDEO (apenas pisca o fundo)
            const b = document.getElementById('banner-chamado'); 
            if(b) {
                document.getElementById('banner-nome').textContent=(c.nome||'').toUpperCase(); 
                document.getElementById('banner-local').textContent=c.sala?esc(c.sala):esc(c.local||'—'); 
                document.getElementById('banner-label-local').textContent=c.sala?'Sala':'Local';
                
                b.classList.remove('banner-destaque-anim');
                void b.offsetWidth;
                b.classList.add('banner-destaque-anim');
            }
        }

        if (!pautasParam) {
            document.getElementById('loading').innerHTML = `<div class="bg-white p-8 rounded-3xl text-center shadow-2xl max-w-sm mx-auto"><span class="text-6xl mb-6 block text-rose-500">⚠️</span><h2 class="font-black text-xl text-slate-800">Link Incompleto</h2><p class="text-slate-500 mt-2 text-sm">Este painel precisa ser aberto a partir da Recepção Central para carregar as pautas corretamente.</p></div>`;
            return;
        }
        
        const rnf = document.getElementById('recepcao-nome-fila'); if(rnf) rnf.textContent = decodeURIComponent(recepcaoNome);
        const rnt = document.getElementById('recepcao-nome-tv'); if(rnt) rnt.textContent = decodeURIComponent(recepcaoNome);
        const rnv = document.getElementById('recepcao-nome-video'); if(rnv) rnv.textContent = decodeURIComponent(recepcaoNome);

        // Oculta loading real e exibe a tela correta (o botão "Ativar som" já mudou o modo antes)
        document.getElementById('loading').classList.add('hidden');
        document.getElementById(`btn-modo-${initialModo}`).click(); // Simula o clique para garantir a exibição certa
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
                    
                    // CHAMA A FUNÇÃO DE TTS
                    tocarSomEDizer(novo.nome, novo.sala || novo.local || novo.pautaNome || 'nossa recepção');
                }
            });
        });

        // 9. GERA O QR CODE PARA A FILA VIRTUAL
        setTimeout(() => {
            const baseUrl = window.location.origin + window.location.pathname.replace('painel_tv.html', '').replace('index.html', '');
            const linkFilaVirtual = `${baseUrl}/acompanhamento.html?id=${pIds[0]}`;
            
            const qrContainer = document.getElementById('qr-code-tv');
            if (qrContainer && typeof QRCode !== 'undefined') {
                new QRCode(qrContainer, {
                    text: linkFilaVirtual,
                    width: 110,
                    height: 110,
                    colorDark : "#0f172a",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.L
                });
            }
        }, 1500);

    }
};
