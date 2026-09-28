// js/monitoramento.js - Módulo de Auditoria, Linha do Tempo e Visualização Global

import { doc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { showNotification, escapeHTML } from './utils.js';

export const MonitoramentoService = {

    // ========================================================
    // FUNÇÃO GLOBAL DE REGISTRO (LINHA DO TEMPO)
    // ========================================================
    async registrarAcaoHistorico(pautaId, assistidoId, descricaoAcao, app) {
        if (!app || !app.db) return;
        try {
            const assistidoRef = doc(app.db, "pautas", pautaId, "attendances", assistidoId);
            const horaFormatada = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const autor = app.currentUserName || "Operador";
            const registro = `${descricaoAcao} (por ${autor}) às ${horaFormatada}`;
            
            await updateDoc(assistidoRef, { historicoAcoes: arrayUnion(registro) });
        } catch (err) {
            console.warn("Falha ao salvar auditoria:", err);
        }
    },

    // ========================================================
    // MONITORAMENTO INDIVIDUAL (PERMITE UPLOAD E EDIÇÃO)
    // ========================================================
    async abrirMonitoramento(pautaId, assistidoId, assistidoNome, app) {
        const modal = document.getElementById('monitoramento-modal');
        if (!modal) return;

        document.getElementById('monitor-nome-assistido').textContent = assistidoNome;
        document.getElementById('monitor-timeline-container').innerHTML = '<p class="text-xs text-slate-400 ml-4 animate-pulse">A carregar histórico...</p>';
        
        const tituloInp = document.getElementById('monitor-upload-titulo');
        const fileInp = document.getElementById('monitor-file-input');
        if(tituloInp) tituloInp.value = '';
        if(fileInp) fileInp.value = '';

        modal.classList.remove('hidden');

        try {
            const assistidoRef = doc(app.db, "pautas", pautaId, "attendances", assistidoId);
            const snap = await getDoc(assistidoRef);

            if (!snap.exists()) {
                showNotification("Registo não encontrado", "error");
                return;
            }

            const data = snap.data();

            const linkInp = document.getElementById('monitor-pdf-link');
            const obsInp = document.getElementById('monitor-pdf-obs');
            const btnVerde = document.getElementById('monitor-btn-verde');
            const btnVerPdf = document.getElementById('monitor-btn-ver-pdf');
            
            // Inserir Botão de Dossiê PDF
            let btnImprimir = document.getElementById('monitor-btn-imprimir');
            if (!btnImprimir && btnVerde) {
                btnImprimir = document.createElement('button');
                btnImprimir.id = 'monitor-btn-imprimir';
                btnImprimir.className = 'px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all shadow-sm uppercase tracking-wider bg-slate-700 text-white hover:bg-slate-800 ml-2 flex items-center gap-1';
                btnImprimir.innerHTML = '🖨️ Dossiê';
                btnVerde.parentNode.appendChild(btnImprimir);
            }

            if (btnImprimir) {
                btnImprimir.onclick = () => this._gerarDossierPDF(data, assistidoNome);
            }

            if(linkInp) linkInp.value = data.pdfLink || '';
            if(obsInp) obsInp.value = data.pdfObservacoes || '';

            if (data.pdfLink && btnVerPdf) {
                btnVerPdf.classList.remove('hidden');
                btnVerPdf.onclick = () => window.open(data.pdfLink, '_blank');
            } else if (btnVerPdf) {
                btnVerPdf.classList.add('hidden');
            }

            const isVerde = data.noVerde || false;
            if(btnVerde) {
                btnVerde.textContent = isVerde ? '✅ NO VERDE' : '⏳ PENDENTE';
                btnVerde.className = `px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all shadow-sm uppercase tracking-wider ${isVerde ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`;
                
                btnVerde.onclick = async () => {
                    await updateDoc(assistidoRef, { noVerde: !isVerde });
                    await this.registrarAcaoHistorico(pautaId, assistidoId, !isVerde ? "Marcado como INSERIDO NO VERDE" : "Removido do Verde", app);
                    this.abrirMonitoramento(pautaId, assistidoId, assistidoNome, app); 
                };
            }

            const btnSalvarLink = document.getElementById('monitor-btn-salvar-link');
            if(btnSalvarLink) btnSalvarLink.onclick = async () => {
                if(!linkInp) return;
                await updateDoc(assistidoRef, { pdfLink: linkInp.value.trim() });
                await this.registrarAcaoHistorico(pautaId, assistidoId, `Link principal do processo atualizado`, app);
                showNotification("Link guardado com sucesso!", "success");
                this.abrirMonitoramento(pautaId, assistidoId, assistidoNome, app);
            };

            const btnSalvarObs = document.getElementById('monitor-btn-salvar-obs');
            if(btnSalvarObs) btnSalvarObs.onclick = async () => {
                if(!obsInp) return;
                await updateDoc(assistidoRef, { pdfObservacoes: obsInp.value.trim() });
                await this.registrarAcaoHistorico(pautaId, assistidoId, `Observação de documento atualizada`, app);
                showNotification("Observação guardada!", "success");
                this.abrirMonitoramento(pautaId, assistidoId, assistidoNome, app);
            };

            const btnTabUpload = document.getElementById('monitor-btn-tab-upload');
            const btnTabLink = document.getElementById('monitor-btn-tab-link');
            const boxUpload = document.getElementById('monitor-box-upload');
            const boxLink = document.getElementById('monitor-box-link');

            if(btnTabUpload && btnTabLink) {
                btnTabUpload.onclick = () => {
                    btnTabUpload.className = "flex-1 py-2 text-[10px] font-black uppercase tracking-widest bg-white shadow-sm rounded text-blue-600 border border-slate-200 transition-all";
                    btnTabLink.className = "flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all";
                    boxUpload.classList.remove('hidden');
                    boxLink.classList.add('hidden');
                };

                btnTabLink.onclick = () => {
                    btnTabLink.className = "flex-1 py-2 text-[10px] font-black uppercase tracking-widest bg-white shadow-sm rounded text-blue-600 border border-slate-200 transition-all";
                    btnTabUpload.className = "flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all";
                    boxLink.classList.remove('hidden');
                    boxUpload.classList.add('hidden');
                };
            }

            const listaArquivosContainer = document.getElementById('monitor-lista-arquivos-anexados');
            const docsDigitalizados = data.documentosDigitalizados || [];
            
            if (listaArquivosContainer) {
                if (docsDigitalizados.length === 0) {
                    listaArquivosContainer.innerHTML = '<p class="text-[10px] text-slate-400 italic">Nenhum ficheiro enviado diretamente pelo sistema.</p>';
                } else {
                    listaArquivosContainer.innerHTML = '';
                    docsDigitalizados.forEach(docItem => {
                        listaArquivosContainer.innerHTML += `
                            <div class="flex justify-between items-center bg-blue-50 p-2 rounded-lg border border-blue-100">
                                <span class="text-[10px] font-bold text-blue-800 truncate flex-1" title="${escapeHTML(docItem.titulo || docItem.nomeArquivo)}">📄 ${escapeHTML(docItem.titulo || docItem.nomeArquivo)}</span>
                                <a href="${docItem.url}" target="_blank" class="bg-blue-600 text-white text-[9px] font-bold px-2 py-1 rounded shadow-sm hover:bg-blue-700 ml-2 shrink-0">Abrir</a>
                            </div>
                        `;
                    });
                }
            }

            const btnEnviarUpload = document.getElementById('monitor-btn-enviar-upload');
            if (btnEnviarUpload) {
                btnEnviarUpload.onclick = async () => {
                    const titulo = document.getElementById('monitor-upload-titulo').value.trim();
                    const fileInput = document.getElementById('monitor-file-input');
                    const file = fileInput.files[0];

                    if (!titulo || !file) {
                        showNotification("Preencha o título e selecione um ficheiro.", "error");
                        return;
                    }

                    btnEnviarUpload.disabled = true;
                    btnEnviarUpload.innerHTML = "⌛ A ENVIAR...";

                    try {
                        const storage = getStorage(app.db.app);
                        const timestamp = Date.now();
                        const storagePath = `documentos_pautas/${pautaId}/${assistidoId}/${timestamp}_${file.name}`;
                        const storageRef = ref(storage, storagePath);

                        await uploadBytes(storageRef, file);
                        const downloadURL = await getDownloadURL(storageRef);

                        await updateDoc(assistidoRef, {
                            documentosDigitalizados: arrayUnion({
                                url: downloadURL,
                                titulo: titulo,
                                nomeArquivo: file.name,
                                enviadoPor: app.currentUserName || "Recepção / Monitoramento",
                                dataEnvio: new Date().toISOString()
                            })
                        });

                        await this.registrarAcaoHistorico(pautaId, assistidoId, `Upload concluído: ${titulo}`, app);
                        showNotification("Documento enviado com sucesso!", "success");
                        this.abrirMonitoramento(pautaId, assistidoId, assistidoNome, app);
                    } catch (err) {
                        console.error(err);
                        showNotification("Erro ao enviar o documento para a nuvem.", "error");
                        btnEnviarUpload.disabled = false;
                        btnEnviarUpload.innerHTML = "🚀 ENVIAR PARA A NUVEM";
                    }
                };
            }

            this._renderTimeline(data, 'monitor-timeline-container');

        } catch (e) {
            console.error(e);
            showNotification("Erro ao carregar monitoramento.", "error");
        }
    },

    // ========================================================
    // GERAÇÃO DE DOSSIÊ PDF (NOVA FUNCIONALIDADE)
    // ========================================================
    _gerarDossierPDF(data, assistidoNome) {
        if (!window.jspdf) {
            showNotification("Motor de PDF não carregado. Recarregue a página.", "error");
            return;
        }
        showNotification("A gerar Dossiê em PDF...", "info");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("Dossiê de Acompanhamento - SIGEP", 14, 20);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, 14, 26);
        
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("1. Dados do Assistido", 14, 35);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        
        // Tratar múltiplos assuntos ou números
        const assuntosStr = Array.isArray(data.subject) ? data.subject.join(' | ') : (data.subject || 'Não informado');
        const agendamentosStr = Array.isArray(data.numAgendamento) ? data.numAgendamento.join(', ') : (data.numeroAgendamento || data.numAgendamento || 'Avulso');

        doc.text(`Nome: ${assistidoNome}`, 14, 42);
        doc.text(`Identificação / Agendamento: ${agendamentosStr}`, 14, 48);
        doc.text(`Assunto(s): ${assuntosStr}`, 14, 54);
        doc.text(`Estado Atual: ${String(data.status || 'Desconhecido').toUpperCase()}`, 14, 60);

        let yPos = 70;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("2. Cronologia de Eventos (Linha do Tempo)", 14, yPos);
        yPos += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const acoes = data.historicoAcoes || [];
        if (acoes.length === 0) {
            doc.text("Nenhum evento registado na auditoria.", 14, yPos);
        } else {
            acoes.forEach((acao) => {
                const linhasTexto = doc.splitTextToSize(`• ${acao}`, 180);
                doc.text(linhasTexto, 14, yPos);
                yPos += (linhasTexto.length * 5);
                if (yPos > 280) {
                    doc.addPage();
                    yPos = 20;
                }
            });
        }

        doc.save(`Dossie_${assistidoNome.replace(/\s+/g, '_')}.pdf`);
        showNotification("Dossiê gerado com sucesso!", "success");
    },

    // ========================================================
    // MONITORAMENTO GLOBAL (APENAS LEITURA DE DOCUMENTOS E SLA)
    // ========================================================
    abrirMonitoramentoGlobal(app) {
        let modal = document.getElementById('monitoramento-global-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        const searchInput = document.getElementById('monitor-global-search');
        if (searchInput) searchInput.value = '';
        this.renderizarListaMonitorGlobal(app);
    },

    renderizarListaMonitorGlobal(app, filtro = '') {
        const container = document.getElementById('monitor-global-list');
        if (!container || !app || !app.allAssisted) return;

        let assistidos = app.allAssisted.filter(a => (a.name || '').toLowerCase().includes(filtro));
        
        if (assistidos.length === 0) {
            container.innerHTML = `<div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center text-slate-400 font-medium text-sm">Nenhum assistido encontrado.</div>`;
            return;
        }

        // 🌟 ORDENAÇÃO INTELIGENTE (SLA): Quem espera há mais tempo aparece primeiro
        assistidos.sort((a, b) => {
            if (a.status === 'aguardando' && b.status !== 'aguardando') return -1;
            if (a.status !== 'aguardando' && b.status === 'aguardando') return 1;
            if (a.status === 'aguardando' && b.status === 'aguardando') {
                const timeA = a.arrivalTime ? new Date(a.arrivalTime).getTime() : 0;
                const timeB = b.arrivalTime ? new Date(b.arrivalTime).getTime() : 0;
                return timeA - timeB; 
            }
            return 0;
        });

        const agora = Date.now();
        let html = '';

        assistidos.forEach(a => {
            const isVerde = a.noVerde || false;
            
            // Tratamento SLA Visual
            let borderSlaClass = "border-slate-200";
            let badgeSlaHtml = "";
            let animPulse = "";

            if (a.status === 'aguardando' && a.arrivalTime) {
                const timeDiff = Math.floor((agora - new Date(a.arrivalTime).getTime()) / 60000);
                if (timeDiff >= 60) {
                    borderSlaClass = "border-red-400 shadow-red-100 ring-1 ring-red-400";
                    animPulse = "animate-pulse";
                    badgeSlaHtml = `<span class="bg-red-100 text-red-700 text-[9px] font-black px-2 py-1 rounded shadow-sm flex items-center gap-1">⚠️ ESPERA: ${timeDiff} MIN</span>`;
                } else if (timeDiff >= 30) {
                    borderSlaClass = "border-amber-400 shadow-amber-100 ring-1 ring-amber-400";
                    badgeSlaHtml = `<span class="bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-1 rounded shadow-sm flex items-center gap-1">⏳ ESPERA: ${timeDiff} MIN</span>`;
                }
            }

            // Tratamento APENAS LEITURA dos documentos
            let docsUploadHTML = '';
            const docsDigitalizados = a.documentosDigitalizados || [];
            if (docsDigitalizados.length > 0) {
                docsDigitalizados.forEach(d => {
                    docsUploadHTML += `
                        <div class="flex justify-between items-center bg-blue-50 p-1.5 rounded-lg border border-blue-100 mb-1">
                            <span class="text-[9px] font-bold text-blue-800 truncate flex-1">📄 ${escapeHTML(d.titulo || d.nomeArquivo)}</span>
                            <a href="${d.url}" target="_blank" class="bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-sm hover:bg-blue-700 ml-2 shrink-0">Abrir</a>
                        </div>`;
                });
            } else {
                docsUploadHTML = '<p class="text-[9px] text-slate-400 italic">Nenhum upload registado.</p>';
            }

            const linkPrincipalHtml = a.pdfLink 
                ? `<a href="${a.pdfLink}" target="_blank" class="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 hover:bg-blue-200 w-full justify-center shadow-sm">🔗 Abrir Link Principal</a>` 
                : `<span class="text-[10px] text-slate-400 italic block text-center p-1 border border-dashed rounded">Nenhum link externo</span>`;

            // Tratamento Múltiplos Assuntos/Agendamentos
            const assuntosRenderizados = Array.isArray(a.subject) ? a.subject.join(' | ') : escapeHTML(a.subject || 'Sem Nome');
            const agendamentoRenderizado = Array.isArray(a.numAgendamento) ? a.numAgendamento.join(', ') : escapeHTML(a.numeroAgendamento || a.numAgendamento || 'N/A');

            html += `
                <div class="bg-white p-4 rounded-2xl shadow-sm border ${borderSlaClass} mb-3 flex flex-col md:flex-row gap-4 transition-all">
                    
                    <!-- DADOS DO ASSISTIDO -->
                    <div class="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-100 pb-3 md:pb-0 md:pr-4 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <h4 class="font-black text-slate-800 text-sm truncate" title="${escapeHTML(a.name)}">${escapeHTML(a.name || 'Sem Nome')}</h4>
                                ${badgeSlaHtml}
                            </div>
                            <p class="text-[10px] text-slate-500 font-bold mb-2 uppercase line-clamp-2">${assuntosRenderizados}</p>
                            
                            <div class="mt-2 space-y-1.5 flex flex-wrap gap-2">
                                <span class="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded shadow-sm">Status: ${escapeHTML(a.status || 'aguardando').toUpperCase()}</span>
                                <span class="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm">Agendamento: #${agendamentoRenderizado}</span>
                            </div>
                        </div>
                        <div class="mt-4 flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <span class="font-bold text-[10px] text-slate-600">Verde:</span>
                            <span class="px-2 py-1 rounded font-bold text-[9px] uppercase ${isVerde ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">
                                ${isVerde ? '✅ Inserido' : '⏳ Pendente'}
                            </span>
                        </div>
                    </div>

                    <!-- GESTÃO DE DOCUMENTOS (SOMENTE CONSULTA) -->
                    <div class="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-100 pb-3 md:pb-0 md:pr-4 flex flex-col gap-2">
                        <label class="text-[9px] font-black text-slate-400 uppercase">Documentos Enviados</label>
                        <div class="max-h-20 overflow-y-auto mb-2 pr-1 custom-scrollbar">
                            ${docsUploadHTML}
                        </div>
                        
                        <label class="text-[9px] font-black text-slate-400 uppercase border-t border-slate-100 pt-2">Link Principal Externo</label>
                        ${linkPrincipalHtml}

                        <label class="text-[9px] font-black text-slate-400 uppercase mt-2 border-t border-slate-100 pt-2">Observações / Pendências</label>
                        <p class="text-[10px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 min-h-[30px] italic">
                            ${escapeHTML(a.pdfObservacoes || 'Nenhuma observação.')}
                        </p>
                    </div>

                    <!-- TIMELINE -->
                    <div class="w-full md:w-1/3 pl-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                        <h5 class="text-[9px] font-black text-slate-400 uppercase mb-3 sticky top-0 bg-white z-10 pb-1">Últimos Eventos</h5>
                        <div class="relative border-l-2 border-slate-200 ml-2">
                            ${this._gerarHtmlTimeline(a)}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    // ========================================================
    // MÉTODOS DE APOIO PARA A LINHA DO TEMPO
    // ========================================================
    _renderTimeline(data, containerId) {
        const timelineContainer = document.getElementById(containerId);
        if(!timelineContainer) return;
        timelineContainer.innerHTML = this._gerarHtmlTimeline(data, false);
        // O scroll desce automaticamente se os eventos ultrapassarem o tamanho da div
        timelineContainer.scrollTop = timelineContainer.scrollHeight;
    },

    _gerarHtmlTimeline(data, resumida = true) {
        let historicoHTML = '';
        const acoes = data.historicoAcoes || [];
        const horaChegada = data.arrivalTime ? new Date(data.arrivalTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '--:--';
        
        // 1. Mostrar o status de Agendamento ou Avulso
        const agendamentoRenderizado = Array.isArray(data.scheduledTime) ? data.scheduledTime.join(', ') : escapeHTML(data.scheduledTime);
        const assuntoRenderizado = Array.isArray(data.subject) ? data.subject.join(' | ') : escapeHTML(data.subject || 'Não informado');

        if (agendamentoRenderizado && agendamentoRenderizado !== '--:--') {
            historicoHTML += `
                <div class="relative pl-6">
                    <span class="absolute left-[-9px] top-1 h-4 w-4 rounded-full bg-slate-300 ring-4 ring-slate-50"></span>
                    <p class="text-[10px] font-bold text-slate-500 uppercase mb-0.5">AGENDAMENTO • ${agendamentoRenderizado}</p>
                    ${!resumida ? `<p class="text-xs text-slate-700 font-medium">Marcado para assunto: ${assuntoRenderizado}.</p>` : ''}
                </div>
                <div class="h-4 border-l-2 border-slate-200 absolute left-[3px]"></div>
            `;
        } else {
             historicoHTML += `
                <div class="relative pl-6">
                    <span class="absolute left-[-9px] top-1 h-4 w-4 rounded-full bg-slate-300 ring-4 ring-slate-50"></span>
                    <p class="text-[10px] font-bold text-slate-500 uppercase mb-0.5">ATENDIMENTO AVULSO</p>
                    ${!resumida ? `<p class="text-xs text-slate-700 font-medium">Utente não agendado, inserido com assunto: ${assuntoRenderizado}.</p>` : ''}
                </div>
                 <div class="h-4 border-l-2 border-slate-200 absolute left-[3px]"></div>
            `;
        }

        // 2. Mostrar a hora exata da Chegada
        historicoHTML += `
            <div class="relative pl-6 ${data.scheduledTime || data.type === 'avulso' ? 'mt-4' : ''}">
                <span class="absolute left-[-9px] top-1 h-4 w-4 rounded-full bg-blue-500 ring-4 ring-slate-50"></span>
                <p class="text-[10px] font-bold text-blue-600 uppercase mb-0.5">CHEGADA • ${horaChegada}</p>
                ${!resumida ? '<p class="text-xs text-slate-700 font-medium">Assistido registado na recepção.</p>' : ''}
            </div>
        `;

        if (acoes.length === 0) {
            historicoHTML += `<div class="relative pl-6 mt-4"><p class="text-[10px] text-slate-400 italic">Sem movimentações adicionais.</p></div>`;
        } else {
            let acoesList = acoes.slice().reverse();
            if (resumida) acoesList = acoesList.slice(0, 5);

            acoesList.forEach(acao => {
                let texto = acao;
                let hora = "Log";
                const match = acao.match(/(.+) às (\d{2}:\d{2})$/);
                if (match) { texto = match[1]; hora = match[2]; }

                let colorClass = "bg-slate-400";
                const tLower = texto.toLowerCase();
                if (tLower.includes('documento') || tLower.includes('link') || tLower.includes('upload')) colorClass = "bg-violet-500";
                if (tLower.includes('edit') || tLower.includes('alterad')) colorClass = "bg-amber-500";
                if (tLower.includes('verde')) colorClass = "bg-emerald-500";
                if (tLower.includes('triagem')) colorClass = "bg-indigo-500";

                historicoHTML += `
                    <div class="relative pl-6 mt-4">
                        <span class="absolute left-[-7px] top-1 h-3 w-3 rounded-full ${colorClass} ring-4 ring-slate-50 shadow-sm"></span>
                        <p class="text-[9px] font-black text-slate-400 uppercase mb-0.5">${hora}</p>
                        <p class="text-[10px] text-slate-600 font-medium leading-tight">${escapeHTML(texto)}</p>
                    </div>
                `;
            });
            if (resumida && acoes.length > 5) historicoHTML += `<p class="text-[9px] text-slate-400 mt-3 pl-6 italic">... e mais ${acoes.length - 5} evento(s)</p>`;
        }
        return historicoHTML;
    }
};

window.MonitoramentoService = MonitoramentoService;
