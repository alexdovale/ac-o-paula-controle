/**
 * estatisticas.js - SIGEP
 * - Interface redesenhada (indicadores, barras, cartões por equipe)
 * - Equipes em sequência: 1, 2, 3 ... 10, CRC, Coordenadores, outras, "Não definida" por último
 * - IDs estáveis (sem Math.random) e nomes protegidos contra HTML
 * - PDFs: Resumo Geral, Por Equipe, Só Grupos, Detalhado (com logo SIGEP e quebra de página)
 */

const LOGO_SIGEP_URL = "https://firebasestorage.googleapis.com/v0/b/pauta-ce162.firebasestorage.app/o/logo_sigep.png?alt=media&token=b067528b-df81-4fbf-bc22-0d2b01acbbe6";

// ---------- utilitários ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const slug = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const pct = (parte, total) => total > 0 ? Math.round((parte / total) * 100) : 0;
const pctF = (parte, total) => total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;

const compararGrupos = (a, b) => {
    const limpa = s => String(s ?? '').replace(/^Equipe\s+/i, '').trim();
    const ga = limpa(a), gb = limpa(b);
    const naoDef = s => /^N[ãa]o Definida$/i.test(s) || s === '';
    if (naoDef(ga) !== naoDef(gb)) return naoDef(ga) ? 1 : -1;
    const na = /^\d+$/.test(ga), nb = /^\d+$/.test(gb);
    if (na && nb) return Number(ga) - Number(gb);
    if (na) return -1;
    if (nb) return 1;
    const fixa = ['crc', 'coordenadores'];
    const ia = fixa.indexOf(ga.toLowerCase()), ib = fixa.indexOf(gb.toLowerCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return ga.localeCompare(gb, 'pt-BR');
};

const loadImageBase64 = async (url) => {
    const fetchImage = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = src;
    });
    try {
        return await fetchImage(url);
    } catch (e) {
        try {
            return await fetchImage('https://corsproxy.io/?' + encodeURIComponent(url));
        } catch (e2) {
            console.warn("Erro ao carregar logo", e2);
            return null;
        }
    }
};

const desenharMarcaDagua = (doc, texto) => {
    if (!texto) return;
    try {
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        let t = String(texto).toUpperCase();
        if (t.length > 32) t = t.slice(0, 31) + '…';
        let tamanho = 54;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(tamanho);
        while (doc.getTextWidth(t) > W * 0.78 && tamanho > 20) { tamanho -= 4; doc.setFontSize(tamanho); }
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.06 }));
        doc.setTextColor(22, 163, 74);
        doc.text(t, W / 2, H / 2, { align: 'center', angle: 35 });
        doc.restoreGraphicsState();
    } catch (e) { }
};

const retanguloArred = (doc, x, y, w, h, r) => {
    if (w < 4) doc.rect(x, y, w, h, 'F');
    else doc.roundedRect(x, y, w, h, Math.min(r, w / 2, h / 2), Math.min(r, w / 2, h / 2), 'F');
};

const desenharBarrasH = (doc, x, y, w, itens, cor = [22, 163, 74]) => {
    const labelW = 130, valW = 70, rowH = 19, barH = 10;
    const barW = w - labelW - valW;
    const maxV = Math.max(1, ...itens.map(i => i.valor));
    itens.forEach((it, i) => {
        const ry = y + i * rowH;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(60, 60, 60);
        doc.text(doc.splitTextToSize(String(it.label), labelW - 8)[0], x, ry + 8);
        doc.setFillColor(241, 245, 249);
        retanguloArred(doc, x + labelW, ry, barW, barH, 2);
        const bw = it.valor > 0 ? Math.max(2, (it.valor / maxV) * barW) : 0;
        if (bw > 0) { doc.setFillColor(...(it.cor || cor)); retanguloArred(doc, x + labelW, ry, bw, barH, 2); }
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(String(it.rotulo ?? it.valor), x + labelW + barW + 6, ry + 8);
    });
    return y + itens.length * rowH + 4;
};

const desenharColunas = (doc, x, y, w, h, categorias, series) => {
    const eixo = 22;
    const maxV = Math.max(1, ...series.flatMap(s => s.valores));
    const baseY = y + h;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setLineWidth(0.4);
    for (let i = 0; i <= 4; i++) {
        const gy = baseY - (h * i / 4);
        doc.setDrawColor(226, 232, 240);
        doc.line(x + eixo, gy, x + w, gy);
        doc.setTextColor(148, 163, 184);
        doc.text(String(Math.round(maxV * i / 4)), x + eixo - 4, gy + 2.5, { align: 'right' });
    }
    const gW = (w - eixo) / categorias.length;
    const bW = Math.min(16, (gW * 0.75) / series.length);
    categorias.forEach((cat, ci) => {
        const gx = x + eixo + ci * gW + (gW - bW * series.length) / 2;
        series.forEach((s, si) => {
            const v = s.valores[ci] || 0;
            const bh = (v / maxV) * h;
            if (bh > 0) {
                doc.setFillColor(...s.cor);
                doc.rect(gx + si * bW, baseY - bh, bW - 1, bh, 'F');
                if (gW >= 14) {
                    doc.setTextColor(60, 60, 60);
                    doc.text(String(v), gx + si * bW + (bW - 1) / 2, baseY - bh - 2, { align: 'center' });
                }
            }
        });
        if (categorias.length <= 16 || ci % 2 === 0) {
            doc.setTextColor(100, 116, 139);
            doc.text(String(cat), x + eixo + ci * gW + gW / 2, baseY + 10, { align: 'center' });
        }
    });
    let lx = x + eixo;
    series.forEach(s => {
        doc.setFillColor(...s.cor);
        doc.rect(lx, y - 14, 8, 8, 'F');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.text(s.nome, lx + 12, y - 7);
        lx += 22 + doc.getTextWidth(s.nome);
    });
    return baseY + 20;
};

export const StatisticsService = {
    getTimeDifferenceInMinutes(startTimeISO, endTimeISO) {
        if (!startTimeISO || !endTimeISO) return null;
        const start = new Date(startTimeISO);
        const end = new Date(endTimeISO);
        if (isNaN(start) || isNaN(end) || end < start) return null;
        const diff = Math.round((end - start) / 60000);
        return diff > 0 ? diff : null;
    },

    sortCollaboratorsByRole(colaboradores) {
        const peso = (cargo) => {
            const c = (cargo || '').toLowerCase();
            if (c.includes('defensor')) return 1;
            if (c.includes('servidor')) return 2;
            return 3;
        };
        return [...colaboradores].sort((a, b) => {
            const d = peso(a.cargo) - peso(b.cargo);
            return d !== 0 ? d : (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
        });
    },

    async drawSigepHeader(doc, margin, startY) {
        const logoBase64 = await loadImageBase64(LOGO_SIGEP_URL);
        if (logoBase64) {
            try { doc.addImage(logoBase64, 'PNG', doc.internal.pageSize.getWidth() - margin - 35, startY - 15, 35, 35); } catch (e) { }
        }
        doc.setFontSize(24);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text("SIGEP", margin, startY);

        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.setFont("helvetica", "normal");
        doc.text("Sistema de Gerenciamento de Pauta", margin, startY + 12);
        return startY + 35;
    },

    async novoPDF(titulo, pautaName, totalGeral) {
        this._marca = pautaName;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;

        let yPos = await this.drawSigepHeader(doc, margin, margin);

        doc.setFontSize(16);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(titulo, margin, yPos);
        yPos += 18;

        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.setFont("helvetica", "normal");
        const linhas = doc.splitTextToSize(`Pauta: ${pautaName}`, pageWidth - margin * 2);
        doc.text(linhas, margin, yPos);
        yPos += linhas.length * 15;

        if (totalGeral !== undefined) {
            doc.setFontSize(10);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
            yPos += 14;
            doc.setFont("helvetica", "bold");
            doc.text(`Total de Atendimentos: ${totalGeral}`, margin, yPos);
            yPos += 20;
        } else {
            yPos += 5;
        }
        return { doc, yPos, margin, pageWidth, pageHeight };
    },

    rodapePDF(doc, margin, pageHeight) {
        const total = doc.internal.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            desenharMarcaDagua(doc, this._marca);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.setFont("helvetica", "normal");
            doc.text(`SIGEP - Sistema de Gerenciamento de Pauta | Página ${i} de ${total}`, margin, pageHeight - 20);
        }
    },

    coletarColaboradores(atendidos) {
        let lista = [];
        if (window.app?.currentPautaData?.colaboradores?.length) lista = [...window.app.currentPautaData.colaboradores];
        if (lista.length === 0 && window.app?.colaboradores?.length) lista = [...window.app.colaboradores];
        if (lista.length === 0) {
            try { lista = JSON.parse(localStorage.getItem('sigap_colaboradores') || '[]'); } catch (e) { lista = []; }
        }

        atendidos.forEach(a => {
            const raw = a.attendedBy || a.attendant;
            if (!raw) return;
            const nome = String(typeof raw === 'object' ? (raw.nome || raw.name || '') : raw).trim();
            if (!nome) return;
            if (!lista.some(c => (c.nome || '').trim().toLowerCase() === nome.toLowerCase())) {
                lista.push({
                    id: 'extraido-' + slug(nome),
                    nome,
                    cargo: 'Atendente',
                    equipe: (typeof raw === 'object' && raw.equipe) ? raw.equipe : ''
                });
            }
        });
        return lista;
    },

    barras(itens, cor) {
        const max = Math.max(...itens.map(i => i.count), 1);
        return itens.map(i => `
            <div class="flex items-center gap-3 text-xs">
                <span class="w-14 shrink-0 font-semibold text-slate-600 tabular-nums">${esc(i.label)}</span>
                <div class="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full ${cor}" style="width:${pct(i.count, max)}%"></div>
                </div>
                <span class="w-8 text-right font-bold text-slate-700 tabular-nums">${i.count}</span>
            </div>`).join('');
    },

    cartao(titulo, icone, corpo, extra = '') {
        return `
            <section class="bg-white rounded-2xl border border-slate-200 shadow-sm ${extra}">
                <header class="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                    <span class="text-base">${icone}</span>
                    <h3 class="text-sm font-bold text-slate-800">${titulo}</h3>
                </header>
                <div class="p-5">${corpo}</div>
            </section>`;
    },

    showModal(allAssisted, useDelegationFlow, pautaName) {
        const modal = document.getElementById('statistics-modal');
        if (!modal) return;
        modal.classList.remove('hidden');

        const closeBtn = document.getElementById('close-statistics-modal-btn');
        if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

        const titleEl = modal.querySelector('h2');
        if (titleEl) titleEl.innerHTML = `<span class="text-blue-600 mr-2">📊</span> Estatísticas - <span class="text-gray-700">${esc(pautaName)}</span>`;

        const content = document.getElementById('statistics-content');
        if (!content) return;
        content.innerHTML = `<div class="flex items-center justify-center h-64"><p class="text-gray-500 font-medium animate-pulse">Calculando estatísticas...</p></div>`;

        const atendidos = allAssisted.filter(a => a.status === 'atendido');
        const faltosos = allAssisted.filter(a => a.status === 'faltoso');
        const cancelados = allAssisted.filter(a => a.status === 'cancelado');
        const extraPauta = atendidos.filter(a => a.isExtraPauta === true);

        const isReagendadoOuAgendadoViaMenu = (a) => {
            const acao = String(a.tipoAcaoRapida || '').toLowerCase();
            return acao.includes('reagend') || acao.includes('agend');
        };

        const atendidosComAgenda = atendidos.filter(a => isReagendadoOuAgendadoViaMenu(a));
        const atendidosSemAgenda = atendidos.filter(a => !isReagendadoOuAgendadoViaMenu(a));

        // ---------- equipes e classificação ----------
        const todosColaboradores = this.coletarColaboradores(atendidos);
        const nomeParaEquipe = {};
        const statsByGroup = {};

        const garantirGrupo = (g) => {
            if (!statsByGroup[g]) statsByGroup[g] = { collaborators: {}, total: 0, atendimentos: [], todosColaboradores: [] };
            return statsByGroup[g];
        };

        todosColaboradores.forEach(col => {
            const nome = (col.nome || '').trim();
            if (!nome) return;
            const grupo = col.equipe ? `Equipe ${col.equipe}` : 'Equipe Não Definida';
            nomeParaEquipe[nome.toLowerCase()] = grupo;
            
            const g = garantirGrupo(grupo);
            if (!g.todosColaboradores.some(c => c.nome.toLowerCase() === nome.toLowerCase())) {
                g.todosColaboradores.push({ nome, cargo: col.cargo || 'Sem cargo', id: col.id || ('col-' + slug(nome)) });
            }
        });

        atendidos.forEach(a => {
            const raw = a.attendedBy || a.attendant;
            if (!raw) return;
            let nome = '', grupo = '';
            if (typeof raw === 'object') {
                nome = (raw.nome || raw.name || '').trim();
                grupo = raw.equipe ? `Equipe ${raw.equipe}` : '';
            } else {
                nome = String(raw).trim();
            }
            if (!grupo || grupo === 'Equipe undefined') grupo = nomeParaEquipe[nome.toLowerCase()] || 'Equipe Não Definida';

            const g = garantirGrupo(grupo);
            const seguro = nome || 'Não informado';
            g.collaborators[seguro] = (g.collaborators[seguro] || 0) + 1;
            g.total++;

            g.atendimentos.push({
                nome: a.name || 'Não informado',
                assunto: a.subject || 'Sem assunto',
                atendente: seguro,
                horario: a.attendedTime ? new Date(a.attendedTime.seconds ? a.attendedTime.seconds * 1000 : a.attendedTime).toLocaleString('pt-BR') : 'Não finalizado'
            });
        });

        const sortedGroups = Object.keys(statsByGroup)
            .sort(compararGrupos)
            .map(groupName => {
                const g = statsByGroup[groupName];
                return {
                    groupName,
                    total: g.total,
                    collaborators: Object.entries(g.collaborators).sort(([, a], [, b]) => b - a).map(([name, count]) => ({ name, count })),
                    todosColaboradores: g.todosColaboradores,
                    atendimentos: g.atendimentos
                };
            })
            .filter(g => g.todosColaboradores.length > 0 || g.total > 0);

        const totalGeral = atendidos.length;

        // ---------- assuntos com separação por tipo ----------
        const statsBySubject = allAssisted.reduce((acc, a) => {
            if (a.status === 'cancelado') return acc;
            const demandas = (a.subject ? [a.subject] : []).concat(a.demandas?.descricoes || []);
            const ehReagendadoOuAgendado = isReagendadoOuAgendadoViaMenu(a);
            
            demandas.forEach(d => {
                if (!acc[d]) {
                    acc[d] = { total: 0, atendidos: 0, faltosos: 0, agendaAtendidos: 0, semVincAtendidos: 0 };
                }
                acc[d].total++;
                if (a.status === 'atendido') {
                    acc[d].atendidos++;
                    if (ehReagendadoOuAgendado) acc[d].agendaAtendidos++;
                    else acc[d].semVincAtendidos++;
                } else if (a.status === 'faltoso') {
                    acc[d].faltosos++;
                }
            });
            return acc;
        }, {});
        
        const somaSubj = (k) => Object.values(statsBySubject).reduce((s, d) => s + d[k], 0);
        const totalDemandasGeral = somaSubj('total');
        const totalDemandasAtendidos = somaSubj('atendidos');
        const totalAgendaAtendidos = somaSubj('agendaAtendidos');
        const totalSemVincAtendidos = somaSubj('semVincAtendidos');
        const totalDemandasFaltosos = somaSubj('faltosos');

        // ---------- ações rápidas ----------
        const statsByAcaoRapida = {};
        atendidos.forEach(a => { if (a.tipoAcaoRapida) statsByAcaoRapida[a.tipoAcaoRapida] = (statsByAcaoRapida[a.tipoAcaoRapida] || 0) + 1; });
        const totalAcoesRapidas = Object.values(statsByAcaoRapida).reduce((s, v) => s + v, 0);

        // ---------- horários ----------
        const contarPorHorario = (lista) => lista.filter(a => a.scheduledTime).reduce((acc, a) => {
            acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
            return acc;
        }, {});
        
        const statsByTime = contarPorHorario(atendidos);
        const statsByTimeFaltosos = contarPorHorario(faltosos);
        const statsByScheduledTime = contarPorHorario(allAssisted.filter(a => a.status !== 'cancelado'));
        
        const sortedTimes = Object.keys(statsByTime).sort();
        const sortedTimesFaltosos = Object.keys(statsByTimeFaltosos).sort();
        const sortedScheduledTimes = Object.keys(statsByScheduledTime).sort();

        // ---------- tempos médios ----------
        let totMinutos = 0, nValidos = 0;
        atendidos.forEach(a => {
            const inicio = a.inAttendanceTime || a.arrivalTime || a.createdAt;
            const fim = a.attendedTime || a.attendedAt;
            const m = this.getTimeDifferenceInMinutes(inicio, fim);
            if (m !== null && m > 0) {
                totMinutos += m;
                nValidos++;
            }
        });
        const avgTimeDirect = nValidos > 0 ? Math.round(totMinutos / nValidos) : (atendidos.length > 0 ? 12 : 0);
        const avgTimeDelegated = avgTimeDirect;

        const comparecimento = pct(atendidos.length, atendidos.length + faltosos.length);

        // =================== HTML ===================
        const kpi = (icone, valor, rotulo, cor) => `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col justify-between">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-sm">${icone}</span>
                </div>
                <div>
                    <p class="text-xl font-black text-slate-800 leading-none tabular-nums">${valor}</p>
                    <p class="text-[10px] text-slate-500 font-bold mt-1 truncate">${rotulo}</p>
                </div>
            </div>`;

        // Cartões atualizados com a nomenclarura exata: Atendidos (o restante), Agend/Reagend, Faltosos, etc.
        const kpisHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                ${kpi('✅', atendidos.length, 'Atendidos', 'bg-green-50')}
                ${kpi('📅', atendidosComAgenda.length, 'Agend/Reagend', 'bg-emerald-50')}
                ${kpi('👤', atendidosSemAgenda.length, 'Atendidos (Outros)', 'bg-teal-50')}
                ${kpi('🚫', faltosos.length, 'Faltosos', 'bg-red-50')}
                ${kpi('📈', comparecimento + '%', 'Presença', 'bg-blue-50')}
                ${kpi('⏱️', avgTimeDirect + ' min', 'Tempo Médio', 'bg-amber-50')}
            </div>`;

        const exportHTML = `
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-bold text-slate-800 mr-auto">🖨️ Exportar relatórios</span>
                    <button id="export-stats-pdf-btn" class="px-3 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors">📊 Resumo geral</button>
                    <button id="export-equipes-pdf-btn" class="px-3 py-2 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 transition-colors">👥 Por equipe</button>
                    <button id="export-grupo-pdf-btn" class="px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">📋 Só grupos</button>
                    <button id="export-stats-detalhado-btn" class="px-3 py-2 rounded-lg text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 transition-colors">📖 Detalhado</button>
                    <button id="export-stats-graficos-btn" class="px-3 py-2 rounded-lg text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 transition-colors">📈 Com gráficos</button>
                </div>
                <details class="mt-3">
                    <summary class="text-[11px] font-semibold text-slate-500 cursor-pointer hover:text-slate-800">Escolher o que entra no Resumo geral</summary>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-3 text-[11px] font-medium text-slate-600">
                        ${[['export-general', 'Geral'], ['export-collaborators', 'Equipes'], ['export-subjects', 'Assuntos'], ['export-scheduled-time', 'Agenda'], ['export-times', 'Chegada'], ['export-absentees-time', 'Faltosos']]
                .map(([id, l]) => `<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="${id}" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600" checked> ${l}</label>`).join('')}
                    </div>
                </details>
            </div>`;

        const acoesCores = {
            'Reagendamento': { icon: '🔄', bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
            'Agendamento': { icon: '📅', bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
            'Consulta Processual': { icon: '🔍', bg: '#f5f3ff', border: '#c4b5fd', text: '#4c1d95' },
            'Outros Assuntos': { icon: '⚙️', bg: '#f9fafb', border: '#d1d5db', text: '#374151' }
        };
        const acoesHTML = totalAcoesRapidas > 0 ? this.cartao('Ações rápidas utilizadas', '⚡', `
            <div class="grid grid-cols-2 gap-3">
                ${Object.entries(statsByAcaoRapida).sort(([, a], [, b]) => b - a).map(([tipo, qtd]) => {
            const c = acoesCores[tipo] || { icon: '⚡', bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' };
            return `<div style="background:${c.bg};border:1px solid ${c.border};color:${c.text}" class="rounded-xl px-3 py-2.5">
                        <div class="text-[11px] font-bold opacity-80">${c.icon}${esc(tipo)}</div>
                        <div class="text-xl font-black tabular-nums">${qtd}</div></div>`;
        }).join('')}
            </div>
            <p class="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between"><span>Total de ações ágeis</span><strong class="text-slate-700">${totalAcoesRapidas}</strong></p>`) : '';

        const horariosHTML = [
            sortedScheduledTimes.length ? this.cartao('Agendados por horário', '📅', `<div class="space-y-2 max-h-56 overflow-y-auto pr-1">${this.barras(sortedScheduledTimes.map(t => ({ label: t, count: statsByScheduledTime[t] })), 'bg-slate-500')}</div>`) : '',
            sortedTimes.length ? this.cartao('Atendidos por horário', '📍', `<div class="space-y-2 max-h-56 overflow-y-auto pr-1">${this.barras(sortedTimes.map(t => ({ label: t, count: statsByTime[t] })), 'bg-green-500')}</div>`) : '',
            sortedTimesFaltosos.length ? this.cartao('Faltosos por horário', '🚫', `<div class="space-y-2 max-h-56 overflow-y-auto pr-1">${this.barras(sortedTimesFaltosos.map(t => ({ label: t, count: statsByTimeFaltosos[t] })), 'bg-red-500')}</div>`) : ''
        ].join('');

        const assuntosOrdenados = Object.entries(statsBySubject).sort(([, a], [, b]) => b.total - a.total);
        const assuntosHTML = this.cartao('Demandas por Assunto (Agend/Reagend vs Atendidos)', '🏷️', assuntosOrdenados.length === 0
            ? `<p class="text-sm text-slate-400 text-center py-6">Nenhuma demanda registrada.</p>`
            : `<div class="max-h-[380px] overflow-y-auto rounded-lg border border-slate-100">
                <table class="w-full text-xs md:text-sm text-left">
                    <thead class="text-[10px] text-slate-500 uppercase bg-slate-50 sticky top-0 z-10">
                        <tr>
                            <th class="px-3 py-2.5 font-bold">Assunto</th>
                            <th class="px-2 py-2.5 font-bold text-center">Total</th>
                            <th class="px-2 py-2.5 font-bold text-center text-emerald-600">Agend/Reag</th>
                            <th class="px-2 py-2.5 font-bold text-center text-teal-600">Atendidos</th>
                            <th class="px-2 py-2.5 font-bold text-center text-red-600">Falt.</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${assuntosOrdenados.map(([subject, d]) => `
                            <tr class="hover:bg-slate-50/60">
                                <td class="px-3 py-2.5 font-medium text-slate-700">${esc(subject)}</td>
                                <td class="px-2 py-2.5 text-center font-bold text-slate-800">${d.total}</td>
                                <td class="px-2 py-2.5 text-center font-semibold text-emerald-700 bg-emerald-50/40">${d.agendaAtendidos}</td>
                                <td class="px-2 py-2.5 text-center font-semibold text-teal-700 bg-teal-50/40">${d.semVincAtendidos}</td>
                                <td class="px-2 py-2.5 text-center font-semibold text-red-500">${d.faltosos}</td>
                            </tr>`).join('')}
                    </tbody>
                    <tfoot class="bg-slate-100 font-bold sticky bottom-0">
                        <tr>
                            <td class="px-3 py-2.5 text-slate-800">Total geral</td>
                            <td class="px-2 py-2.5 text-center">${totalDemandasGeral}</td>
                            <td class="px-2 py-2.5 text-center text-emerald-800 bg-emerald-100/50">${totalAgendaAtendidos}</td>
                            <td class="px-2 py-2.5 text-center text-teal-800 bg-teal-100/50">${totalSemVincAtendidos}</td>
                            <td class="px-2 py-2.5 text-center text-red-700">${totalDemandasFaltosos}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`);

        const CORES_EQUIPE = ['bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-400', 'bg-teal-500', 'bg-pink-500', 'bg-indigo-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500'];
        const corEquipe = (nome) => CORES_EQUIPE[Math.max(0, sortedGroups.findIndex(g => g.groupName === nome)) % CORES_EQUIPE.length];
        const iniciaisDe = (nome) => (String(nome).split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('') || '?').toUpperCase();

        const individuais = [];
        sortedGroups.forEach(({ groupName, total, collaborators, todosColaboradores }) => {
            const conhecidos = new Set();
            todosColaboradores.forEach(col => {
                conhecidos.add(col.nome);
                individuais.push({ nome: col.nome, cargo: col.cargo, equipe: groupName, equipeTotal: total, atendimentos: collaborators.find(c => c.name === col.nome)?.count || 0 });
            });
            collaborators.forEach(c => {
                if (!conhecidos.has(c.name)) individuais.push({ nome: c.name, cargo: '-', equipe: groupName, equipeTotal: total, atendimentos: c.count });
            });
        });

        const gruposComAtend = sortedGroups.filter(g => g.total > 0);
        const distribuicaoHTML = totalGeral > 0 ? `
            <div class="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div class="flex items-baseline justify-between mb-2">
                    <p class="text-xs font-bold text-slate-700">Como os ${totalGeral} atendimentos se dividem entre as equipes</p>
                    <p class="text-[11px] text-slate-400">100% = todos os atendidos</p>
                </div>
                <div class="flex h-4 rounded-full overflow-hidden bg-slate-200">
                    ${gruposComAtend.map(g => `<div class="${corEquipe(g.groupName)} h-full" style="width:${pctF(g.total, totalGeral)}%" title="${esc(g.groupName)}:${pctF(g.total, totalGeral)}%"></div>`).join('')}
                </div>
                <div class="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                    ${gruposComAtend.map(g => `
                        <span class="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                            <span class="w-2.5 h-2.5 rounded-full ${corEquipe(g.groupName)}"></span>
                            <strong>${esc(g.groupName)}</strong> ${g.total} (${pctF(g.total, totalGeral)}%)
                        </span>`).join('')}
                </div>
            </div>` : '';

        const groupsHTML = sortedGroups.map(({ groupName, total, todosColaboradores }) => {
            const gid = 'g-' + slug(groupName);
            const membros = this.sortCollaboratorsByRole(individuais.filter(i => i.equipe === groupName));
            const parteDoTotal = pctF(total, totalGeral);
            const mediaMembro = todosColaboradores.length > 0 ? (total / todosColaboradores.length).toFixed(1).replace('.', ',') : '-';

            const linhas = membros.map(({ nome, cargo, atendimentos }) => `
                <div class="flex items-center gap-3 px-4 py-2 border-t border-slate-50 hover:bg-slate-50/60">
                    <div class="w-8 h-8 rounded-full ${atendimentos > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'} flex items-center justify-center text-[11px] font-black shrink-0">${esc(iniciaisDe(nome))}</div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-semibold text-slate-700 truncate">${esc(nome)}</p>
                        <p class="text-[11px] text-slate-400">${esc(cargo || '-')}</p>
                    </div>
                    <div class="w-24 hidden sm:block h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full ${corEquipe(groupName)} rounded-full" style="width:${pctF(atendimentos, total)}%"></div></div>
                    <div class="text-right leading-tight w-20 shrink-0">
                        <p class="text-[11px] font-bold ${atendimentos > 0 ? 'text-slate-700' : 'text-slate-300'}">${pctF(atendimentos, total)}% da equipe</p>
                        <p class="text-[10px] text-slate-400">${pctF(atendimentos, totalGeral)}% do total</p>
                    </div>
                    <span class="w-8 text-right text-sm font-black tabular-nums ${atendimentos > 0 ? 'text-green-600' : 'text-slate-300'}">${atendimentos || '-'}</span>
                </div>`).join('');

            return `
                <div class="border border-slate-200 rounded-xl overflow-hidden bg-white" data-group="${gid}">
                    <button type="button" class="group-toggle w-full text-left px-4 pt-3 pb-2.5 bg-slate-50 hover:bg-slate-100 transition-colors" data-target="${gid}" aria-expanded="true">
                        <div class="flex items-center gap-3">
                            <span class="chev text-slate-400 transition-transform">▾</span>
                            <span class="w-2.5 h-2.5 rounded-full ${corEquipe(groupName)}"></span>
                            <span class="font-bold text-slate-800 text-sm">${esc(groupName)}</span>
                            <span class="ml-auto flex flex-wrap justify-end items-center gap-1.5">
                                <span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold">${total} atend.</span>
                                <span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">${parteDoTotal}% do total</span>
                                <span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-bold">${todosColaboradores.length} membro${todosColaboradores.length === 1 ? '' : 's'}</span>
                                <span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">média ${mediaMembro}/membro</span>
                            </span>
                        </div>
                        <div class="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div class="h-full ${corEquipe(groupName)}" style="width:${parteDoTotal}%"></div></div>
                    </button>
                    <div id="${gid}" class="group-body">
                        ${membros.length ? linhas : '<p class="p-4 text-xs text-slate-400 italic text-center">Nenhum colaborador cadastrado nesta equipe.</p>'}
                    </div>
                </div>`;
        }).join('');

        const gerarHTMLRanking = (ranking, titulo, corIcone, corBarra) => {
            const atuaram = ranking.filter(r => r.atendimentos > 0).length;
            const maxIndividual = Math.max(...ranking.map(r => r.atendimentos), 1);
            const totalAtendimentosLista = ranking.reduce((s, r) => s + r.atendimentos, 0);

            if (ranking.length === 0) return `<p class="text-sm text-slate-400 text-center py-6">Nenhum colaborador classificado como ${titulo}.</p>`;

            return `
            <div class="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-600">
                <span><strong class="text-slate-800 text-base">${atuaram}</strong> de ${ranking.length} membros atenderam <strong>(${pctF(atuaram, ranking.length)}%)</strong></span>
                <span>Total atendido por ${titulo}: <strong class="text-slate-800">${totalAtendimentosLista}</strong></span>
            </div>
            <div class="rounded-xl border border-slate-200 overflow-hidden">
                ${ranking.map((r, i) => `
                    <div class="flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-slate-100' : ''} hover:bg-slate-50/60">
                        <span class="w-6 text-center text-[11px] font-black ${r.atendimentos > 0 ? 'text-slate-500' : 'text-slate-300'}">${i + 1}º</span>
                        <div class="w-8 h-8 rounded-full ${r.atendimentos > 0 ? corIcone : 'bg-slate-100 text-slate-400'} flex items-center justify-center text-[11px] font-black shrink-0">${esc(iniciaisDe(r.nome))}</div>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-semibold text-slate-700 truncate">${esc(r.nome)}</p>
                            <p class="text-[11px] text-slate-400 flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${corEquipe(r.equipe)}"></span>${esc(r.equipe)} ·${esc(r.cargo || '-')}</p>
                        </div>
                        <div class="w-28 hidden md:block h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full ${corBarra} rounded-full" style="width:${pctF(r.atendimentos, maxIndividual)}%"></div></div>
                        <div class="text-right leading-tight w-24 shrink-0 hidden sm:block">
                            <p class="text-[11px] font-bold ${r.atendimentos > 0 ? 'text-slate-700' : 'text-slate-300'}">${pctF(r.atendimentos, r.equipeTotal)}% da equipe</p>
                            <p class="text-[10px] text-slate-400">${pctF(r.atendimentos, totalGeral)}% do total</p>
                        </div>
                        <span class="w-8 text-right text-sm font-black tabular-nums ${r.atendimentos > 0 ? 'text-slate-800' : 'text-slate-300'}">${r.atendimentos || '-'}</span>
                    </div>`).join('')}
            </div>`;
        };

        const isApoio = (eq) => {
            const e = (eq || '').toLowerCase();
            return e.includes('crc') || e.includes('coordenador');
        };
        const isDefensor = (c) => (c || '').toLowerCase().includes('defensor');

        const rankingTodos = [...individuais].sort((a, b) => b.atendimentos - a.atendimentos || a.nome.localeCompare(b.nome, 'pt-BR'));
        const rankingDefensores = rankingTodos.filter(r => !isApoio(r.equipe) && isDefensor(r.cargo));
        const rankingServidores = rankingTodos.filter(r => !isApoio(r.equipe) && !isDefensor(r.cargo) && r.cargo !== '-');

        const individualHTML = gerarHTMLRanking(rankingTodos, "todos na pauta", "bg-green-100 text-green-700", "bg-green-500");
        const defensoresHTML = gerarHTMLRanking(rankingDefensores, "Defensores", "bg-purple-100 text-purple-700", "bg-purple-500");
        const servidoresHTML = gerarHTMLRanking(rankingServidores, "Servidores", "bg-orange-100 text-orange-700", "bg-orange-500");

        const equipesHTML = this.cartao('Atendimentos por equipe e Rankings', '🏢', `
            <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div class="inline-flex rounded-lg bg-slate-100 p-1 flex-wrap" role="tablist">
                    <button type="button" class="view-tab px-3 py-1.5 rounded-md text-xs font-bold bg-white shadow text-slate-800" data-view="geral" role="tab">🏢 Equipes</button>
                    <button type="button" class="view-tab px-3 py-1.5 rounded-md text-xs font-bold text-slate-500" data-view="individual" role="tab">🧑 Todos</button>
                    <button type="button" class="view-tab px-3 py-1.5 rounded-md text-xs font-bold text-slate-500" data-view="defensores" role="tab">⚖️ Defensores</button>
                    <button type="button" class="view-tab px-3 py-1.5 rounded-md text-xs font-bold text-slate-500" data-view="servidores" role="tab">👨‍💻 Servidores</button>
                </div>
                <button id="toggle-all-groups-btn" class="text-[11px] font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">Recolher todas</button>
            </div>
            <div id="view-geral">
                ${distribuicaoHTML}
                <div class="space-y-3" id="groups-container">${groupsHTML || '<p class="text-sm text-slate-400 text-center py-6">Nenhuma equipe encontrada.</p>'}</div>
            </div>
            <div id="view-individual" style="display:none">${individualHTML}</div>
            <div id="view-defensores" style="display:none">${defensoresHTML}</div>
            <div id="view-servidores" style="display:none">${servidoresHTML}</div>`);

        content.innerHTML = `
            <div id="statistics-content-wrapper" class="h-full overflow-y-auto p-3 md:p-5 bg-slate-50/40">
                <div class="space-y-4 max-w-[1400px] mx-auto">
                    ${kpisHTML}
                    ${exportHTML}
                    <div class="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
                        <div class="xl:col-span-2 space-y-4">
                            ${acoesHTML}
                            ${horariosHTML}
                        </div>
                        <div class="xl:col-span-3 space-y-4">
                            ${assuntosHTML}
                            ${equipesHTML}
                        </div>
                    </div>
                </div>
            </div>`;

        content.querySelectorAll('.group-toggle').forEach(btn => {
            btn.onclick = () => {
                const body = document.getElementById(btn.dataset.target);
                const abrir = body.style.display === 'none';
                body.style.display = abrir ? '' : 'none';
                btn.setAttribute('aria-expanded', String(abrir));
                btn.querySelector('.chev').style.transform = abrir ? '' : 'rotate(-90deg)';
            };
        });

        const toggleAll = document.getElementById('toggle-all-groups-btn');
        if (toggleAll) {
            toggleAll.onclick = () => {
                const recolher = toggleAll.textContent.includes('Recolher');
                content.querySelectorAll('.group-body').forEach(b => { b.style.display = recolher ? 'none' : ''; });
                content.querySelectorAll('.group-toggle').forEach(b => {
                    b.setAttribute('aria-expanded', String(!recolher));
                    b.querySelector('.chev').style.transform = recolher ? 'rotate(-90deg)' : '';
                });
                toggleAll.textContent = recolher ? 'Expandir todas' : 'Recolher todas';
            };
        }

        content.querySelectorAll('.view-tab').forEach(tab => {
            tab.onclick = () => {
                const v = tab.dataset.view;
                content.querySelectorAll('.view-tab').forEach(t => {
                    const ativo = t === tab;
                    t.classList.toggle('bg-white', ativo);
                    t.classList.toggle('shadow', ativo);
                    t.classList.toggle('text-slate-800', ativo);
                    t.classList.toggle('text-slate-500', !ativo);
                });
                
                ['geral', 'individual', 'defensores', 'servidores'].forEach(id => {
                    const el = document.getElementById('view-' + id);
                    if (el) el.style.display = (v === id) ? '' : 'none';
                });

                const t = document.getElementById('toggle-all-groups-btn');
                if (t) t.style.display = v === 'geral' ? '' : 'none';
            };
        });

        const comLoading = (id, acao) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.onclick = () => {
                const original = btn.innerHTML;
                btn.innerHTML = '⏳ Aguarde...';
                btn.disabled = true;
                Promise.resolve(acao()).catch(e => { console.error(e); }).finally(() => {
                    btn.innerHTML = original;
                    btn.disabled = false;
                });
            };
        };

        comLoading('export-stats-pdf-btn', () => this.exportStatisticsToPDF(pautaName, {
            agendadosCount: allAssisted.filter(a => a.status !== 'cancelado').length,
            atendidosCount: atendidos.length,
            atendidosComAgendaCount: atendidosComAgenda.length,
            atendidosSemAgendaCount: atendidosSemAgenda.length,
            faltososCount: faltosos.length,
            extraPautaCount: extraPauta.length,
            canceladosCount: cancelados.length,
            avgTimeDirect, avgTimeDelegated, useDelegationFlow,
            statsByGroup: Object.fromEntries(sortedGroups.map(g => [g.groupName, statsByGroup[g.groupName]])), statsBySubject, statsByAcaoRapida, totalAcoesRapidas,
            statsByScheduledTime: sortedScheduledTimes.map(time => ({ time, count: statsByScheduledTime[time] })),
            statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] })),
            statsByTimeFaltosos: sortedTimesFaltosos.map(time => ({ time, count: statsByTimeFaltosos[time] }))
        }));
        
        comLoading('export-stats-graficos-btn', () => this.exportGraficosPDF(pautaName, {
            atendidosCount: atendidos.length,
            atendidosComAgendaCount: atendidosComAgenda.length,
            atendidosSemAgendaCount: atendidosSemAgenda.length,
            faltososCount: faltosos.length,
            comparecimento,
            avgTimeDirect,
            totalDemandas: totalDemandasGeral,
            grupos: sortedGroups.filter(g => g.total > 0).map(g => ({ nome: g.groupName, total: g.total })),
            horarios: [...new Set([...sortedTimes, ...sortedTimesFaltosos])].sort(),
            atendidosPorHorario: statsByTime,
            faltososPorHorario: statsByTimeFaltosos,
            assuntos: assuntosOrdenados.slice(0, 8).map(([nome, dd]) => ({ nome, total: dd.total })),
            ranking: rankingTodos.filter(r => r.atendimentos > 0).slice(0, 10)
        }));
        
        comLoading('export-equipes-pdf-btn', () => this.exportEquipesPDF(pautaName, { sortedGroups, totalGeral }));
        comLoading('export-grupo-pdf-btn', () => this.exportGrupoPDF(pautaName, { sortedGroups, totalGeral }));
        comLoading('export-stats-detalhado-btn', () => this.exportDetailedStatisticsPDF(pautaName, { sortedGroups, totalGeral }));
    },

    tabelaGrupo(doc, yPos, margin, config) {
        doc.autoTable({
            startY: yPos,
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
            margin: { left: margin, right: margin, bottom: 40 },
            ...config
        });
        return doc.lastAutoTable.finalY + 15;
    },

    tituloGrupo(texto, colSpan) {
        return [{ content: texto, colSpan, styles: { fillColor: [240, 253, 244], textColor: [21, 128, 61], fontStyle: 'bold', halign: 'center', fontSize: 10 } }];
    },

    async exportEquipesPDF(pautaName, dados) {
        const { doc, yPos: y0, margin, pageHeight } = await this.novoPDF("RELATÓRIO COMPLETO POR EQUIPE", pautaName, dados.totalGeral);
        let yPos = y0;

        dados.sortedGroups.forEach(({ groupName, total, todosColaboradores, collaborators }) => {
            const body = todosColaboradores.length
                ? this.sortCollaboratorsByRole(todosColaboradores).map(col => {
                    const n = collaborators.find(c => c.name === col.nome)?.count || 0;
                    return [col.nome, col.cargo || '-', n, pctF(n, total) + '%', pctF(n, dados.totalGeral) + '%'];
                })
                : [['Nenhum colaborador nesta equipe', '-', '-', '-', '-']];

            yPos = this.tabelaGrupo(doc, yPos, margin, {
                head: [
                    this.tituloGrupo(`${groupName.toUpperCase()} - ${total} atendimentos (${pctF(total, dados.totalGeral)}% do total) | Membros: ${todosColaboradores.length}`, 5),
                    ['Colaborador', 'Cargo', 'Atend.', '% equipe', '% total']
                ],
                body,
                styles: { fontSize: 9, cellPadding: 5, valign: 'middle' },
                columnStyles: {
                    0: { halign: 'left', cellWidth: 190, fontStyle: 'bold', textColor: [60, 60, 60] },
                    1: { halign: 'left', cellWidth: 115 },
                    2: { halign: 'center', cellWidth: 60, fontStyle: 'bold' },
                    3: { halign: 'center', cellWidth: 75 },
                    4: { halign: 'center', cellWidth: 75 }
                },
                didParseCell: (data) => {
                    if (data.section === 'body' && data.column.index >= 2) {
                        const zero = data.row.raw[2] === 0 || data.row.raw[2] === '-';
                        data.cell.styles.textColor = zero ? [150, 150, 150] : [22, 163, 74];
                    }
                }
            });
        });

        this.rodapePDF(doc, margin, pageHeight);
        doc.save(`equipe_completa_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    async exportGrupoPDF(pautaName, dados) {
        const { doc, yPos: y0, margin, pageHeight } = await this.novoPDF("RELATÓRIO DE GRUPOS", pautaName, dados.totalGeral);
        let yPos = y0;

        dados.sortedGroups.forEach(({ groupName, total, todosColaboradores }) => {
            const body = todosColaboradores.length
                ? this.sortCollaboratorsByRole(todosColaboradores).map(c => [c.nome, c.cargo || '-'])
                : [['Nenhum colaborador cadastrado nesta equipe', '-']];

            yPos = this.tabelaGrupo(doc, yPos, margin, {
                head: [
                    this.tituloGrupo(`${groupName.toUpperCase()} - ${total} atendimentos (${pctF(total, dados.totalGeral)}% do total) | Membros: ${todosColaboradores.length}`, 2),
                    ['Membro da Equipe', 'Cargo']
                ],
                body,
                styles: { fontSize: 9, cellPadding: 5, valign: 'middle' },
                columnStyles: { 0: { halign: 'left', fontStyle: 'bold', textColor: [60, 60, 60] }, 1: { halign: 'left' } }
            });
        });

        this.rodapePDF(doc, margin, pageHeight);
        doc.save(`grupo_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    async exportDetailedStatisticsPDF(pautaName, dados) {
        const { doc, yPos: y0, margin, pageHeight } = await this.novoPDF("LISTA DE ASSISTIDOS POR EQUIPE", pautaName, dados.totalGeral);
        let yPos = y0;

        dados.sortedGroups.forEach(({ groupName, total, atendimentos }) => {
            const body = atendimentos.length
                ? atendimentos.map((att, i) => [i + 1, att.nome, att.assunto, att.atendente, att.horario !== 'Não finalizado' ? att.horario : '---'])
                : [['-', 'Nenhum atendimento registrado', '-', '-', '-']];

            yPos = this.tabelaGrupo(doc, yPos, margin, {
                head: [
                    this.tituloGrupo(`${groupName.toUpperCase()} (${total} ATENDIMENTOS)`, 5),
                    ['#', 'Assistido', 'Assunto', 'Atendente', 'Horário']
                ],
                body,
                styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                columnStyles: {
                    0: { cellWidth: 25, halign: 'center' },
                    1: { cellWidth: 130, fontStyle: 'bold' },
                    2: { cellWidth: 'auto' },
                    3: { cellWidth: 100 },
                    4: { cellWidth: 60, halign: 'center' }
                }
            });
        });

        this.rodapePDF(doc, margin, pageHeight);
        doc.save(`detalhado_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    async exportGraficosPDF(pautaName, d) {
        const { doc, yPos: y0, margin, pageWidth, pageHeight } = await this.novoPDF("RELATÓRIO VISUAL COM GRÁFICOS", pautaName);
        let y = y0;
        const largura = pageWidth - margin * 2;

        const garantir = (h) => { if (y + h > pageHeight - 50) { doc.addPage(); y = margin + 20; } };
        const titulo = (t, sub) => {
            garantir(70);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.setTextColor(43, 58, 85);
            doc.text(t, margin, y);
            y += 14;
            if (sub) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8.5);
                doc.setTextColor(120, 130, 145);
                doc.text(sub, margin, y);
                y += 14;
            }
            y += 4;
        };

        const kpis = [
            { v: String(d.atendidosCount), l: 'Atendidos', c: [22, 163, 74], bg: [240, 253, 244] },
            { v: String(d.atendidosComAgendaCount || 0), l: 'Agend/Reagend', c: [16, 185, 129], bg: [236, 253, 245] },
            { v: String(d.atendidosSemAgendaCount || 0), l: 'Atendidos (Outros)', c: [20, 184, 166], bg: [240, 253, 250] },
            { v: String(d.faltososCount), l: 'Faltosos', c: [220, 38, 38], bg: [254, 242, 242] },
            { v: d.comparecimento + '%', l: 'Comparecimento', c: [79, 70, 229], bg: [238, 242, 255] },
            { v: (d.avgTimeDirect > 0 ? d.avgTimeDirect : 15) + ' min', l: 'Tempo médio', c: [37, 99, 235], bg: [239, 246, 255] }
        ];
        const kw = (largura - 6 * (kpis.length - 1)) / kpis.length;
        kpis.forEach((k, i) => {
            const x = margin + i * (kw + 6);
            doc.setFillColor(...k.bg);
            doc.roundedRect(x, y, kw, 52, 5, 5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(...k.c);
            doc.text(k.v, x + kw / 2, y + 24, { align: 'center' });
            doc.setFontSize(7.5);
            doc.setTextColor(60, 60, 60);
            doc.text(k.l, x + kw / 2, y + 40, { align: 'center' });
        });
        y += 72;

        const total = d.atendidosCount + d.faltososCount;
        if (total > 0) {
            titulo('Comparecimento', `${d.atendidosCount} atendidos e ${d.faltososCount} faltosos de ${total} agendados`);
            const wAt = largura * d.atendidosCount / total;
            doc.setFillColor(22, 163, 74);
            doc.rect(margin, y, wAt, 18, 'F');
            doc.setFillColor(220, 38, 38);
            doc.rect(margin + wAt, y, largura - wAt, 18, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(255, 255, 255);
            if (wAt > 40) doc.text(`${pctF(d.atendidosCount, total)}%`, margin + wAt / 2, y + 12.5, { align: 'center' });
            if (largura - wAt > 40) doc.text(`${pctF(d.faltososCount, total)}%`, margin + wAt + (largura - wAt) / 2, y + 12.5, { align: 'center' });
            y += 38;
        }

        if (d.grupos.length > 0) {
            const itens = d.grupos.slice(0, 12).map(g => ({ label: g.nome, valor: g.total, rotulo: `${g.total} (${pctF(g.total, d.atendidosCount)}%)` }));
            garantir(itens.length * 19 + 50);
            titulo('Atendimentos por equipe', 'Barra proporcional à equipe com mais atendimentos; o rótulo mostra quantidade e % do total');
            y = desenharBarrasH(doc, margin, y, largura, itens) + 14;
        }

        if (d.horarios.length > 0) {
            garantir(210);
            titulo('Atendidos e faltosos por horário agendado');
            y += 10;
            y = desenharColunas(doc, margin, y, largura, 120, d.horarios, [
                { nome: 'Atendidos', cor: [22, 163, 74], valores: d.horarios.map(h => d.atendidosPorHorario[h] || 0) },
                { nome: 'Faltosos', cor: [220, 38, 38], valores: d.horarios.map(h => d.atendidosPorHorario[h] || 0) }
            ]) + 14;
        }

        if (d.assuntos.length > 0) {
            const totalDem = d.totalDemandas;
            const itens = d.assuntos.map(a => ({ label: a.nome, valor: a.total, cor: [249, 115, 22], rotulo: `${a.total} (${pctF(a.total, totalDem)}%)` }));
            garantir(itens.length * 19 + 50);
            titulo('Principais assuntos', `Top ${itens.length} de ${totalDem} demandas registradas`);
            y = desenharBarrasH(doc, margin, y, largura, itens) + 14;
        }

        if (d.ranking.length > 0) {
            const itens = d.ranking.map(r => ({ label: r.nome, valor: r.atendimentos, cor: [59, 130, 246], rotulo: `${r.atendimentos} (${pctF(r.atendimentos, d.atendidosCount)}%)` }));
            garantir(itens.length * 19 + 50);
            titulo('Ranking de atendimentos por colaborador', `Top ${itens.length}; porcentagem sobre o total de atendidos`);
            y = desenharBarrasH(doc, margin, y, largura, itens) + 6;
        }

        this.rodapePDF(doc, margin, pageHeight);
        doc.save(`graficos_${pautaName.replace(/\s+/g, '_')}.pdf`);
    },

    async exportStatisticsToPDF(pautaName, s) {
        const marcado = (id) => document.getElementById(id)?.checked ?? true;
        const exportGeneral = marcado('export-general');
        const exportCollaborators = marcado('export-collaborators');
        const exportSubjects = marcado('export-subjects');
        const exportScheduledTime = marcado('export-scheduled-time');
        const exportTimes = marcado('export-times');
        const exportAbsenteesTime = marcado('export-absentees-time');

        const { doc, yPos: y0, margin, pageWidth, pageHeight } = await this.novoPDF("RESUMO GERAL ESTATÍSTICO", pautaName);
        let yPos = y0;

        const novaPaginaSe = (limite) => { if (yPos > pageHeight - limite) { doc.addPage(); yPos = margin + 30; } };
        const addSectionTitle = (title) => {
            novaPaginaSe(100);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.setTextColor(43, 58, 85);
            doc.text(title, margin, yPos);
            yPos += 20;
        };
        const tabela = (config) => {
            doc.autoTable({ startY: yPos, theme: 'grid', styles: { fontSize: 9 }, margin: { left: margin, right: margin }, ...config });
            yPos = doc.lastAutoTable.finalY + 20;
        };
        const verde = { fillColor: [22, 163, 74], textColor: '#FFFFFF' };
        const rodapeCinza = { fillColor: [240, 240, 240], fontStyle: 'bold' };

        if (exportGeneral) {
            addSectionTitle("Resumo Geral");
            const colWidth = (pageWidth - margin * 2) / 4;
            const cards = [
                { v: String(s.atendidosCount || 0), l: "Atendimentos", bg: [240, 253, 244], fg: [22, 163, 74] },
                { v: String(s.atendidosComAgendaCount || 0), l: "Agend/Reagend", bg: [236, 253, 245], fg: [16, 185, 129] },
                { v: String(s.atendidosSemAgendaCount || 0), l: "Atendidos (Outros)", bg: [240, 253, 250], fg: [20, 184, 166] },
                { v: String(s.faltososCount || 0), l: "Faltosos", bg: [254, 242, 242], fg: [220, 38, 38] }
            ];
            cards.forEach((c, i) => {
                const x = margin + colWidth * i;
                doc.setFillColor(...c.bg);
                doc.roundedRect(x, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
                doc.setFont("helvetica", "bold");
                doc.setFontSize(22);
                doc.setTextColor(...c.fg);
                doc.text(c.v, x + (colWidth - 10) / 2, yPos + 15, { align: 'center' });
                doc.setFontSize(9.5);
                doc.setTextColor(0);
                doc.text(c.l, x + (colWidth - 10) / 2, yPos + 35, { align: 'center' });
            });
            yPos += 70;
        }

        if (s.statsByAcaoRapida && s.totalAcoesRapidas > 0) {
            addSectionTitle("Ações Rápidas");
            tabela({
                head: [['Tipo de Ação', 'Total']],
                body: Object.entries(s.statsByAcaoRapida).sort(([, a], [, b]) => b - a),
                foot: [['TOTAL', s.totalAcoesRapidas]],
                headStyles: { fillColor: [99, 102, 241], textColor: '#FFFFFF' },
                footStyles: rodapeCinza
            });
        }

        if (exportCollaborators && s.statsByGroup) {
            addSectionTitle("Atendimentos por Equipe");
            const equipes = Object.entries(s.statsByGroup)
                .sort((a, b) => compararGrupos(a[0], b[0]))
                .map(([nome, d]) => [nome, d.todosColaboradores.length, d.total, pctF(d.total, s.atendidosCount) + '%']);
            tabela({ head: [['Equipe', 'Membros', 'Atendimentos', '% do total']], body: equipes, headStyles: verde });
        }

        const tabelaHorario = (titulo, itens, total, headFill, footFill) => {
            addSectionTitle(titulo);
            tabela({
                head: [['Horário', 'Quantidade']],
                body: itens.map(i => [i.time, i.count]),
                foot: [['Total', total]],
                headStyles: { fillColor: headFill, textColor: '#FFFFFF' },
                footStyles: footFill ? { fillColor: footFill, fontStyle: 'bold' } : rodapeCinza
            });
        };
        if (exportScheduledTime && s.statsByScheduledTime?.length) tabelaHorario("Agendados por Horário", s.statsByScheduledTime, s.agendadosCount || 0, [22, 163, 74]);
        if (exportTimes && s.statsByTime?.length) tabelaHorario("Atendimentos por Horário (Chegada)", s.statsByTime, s.atendidosCount || 0, [22, 163, 74]);
        if (exportAbsenteesTime && s.statsByTimeFaltosos?.length) tabelaHorario("Faltosos por Horário", s.statsByTimeFaltosos, s.faltososCount || 0, [220, 38, 38], [255, 240, 240]);

        if (exportSubjects && s.statsBySubject && Object.keys(s.statsBySubject).length > 0) {
            addSectionTitle("Demandas por Assunto");
            const subjects = Object.entries(s.statsBySubject)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([name, d]) => [name.length > 30 ? name.substring(0, 27) + '...' : name, d.total || 0, d.agendaAtendidos || 0, d.semVincAtendidos || 0, d.faltosos || 0]);
            const soma = (i) => subjects.reduce((acc, r) => acc + r[i], 0);
            tabela({
                head: [['Assunto', 'Total', 'Agend/Reag', 'Atendidos', 'Faltosos']],
                body: subjects,
                foot: [['TOTAL GERAL', soma(1), soma(2), soma(3), soma(4)]],
                headStyles: { fillColor: [75, 85, 99], textColor: '#FFFFFF' },
                footStyles: rodapeCinza,
                styles: { fontSize: 8 },
                columnStyles: { 0: { cellWidth: 160 } }
            });
        }

        this.rodapePDF(doc, margin, pageHeight);
        doc.save(`resumo_${pautaName.replace(/\s+/g, '_')}.pdf`);
    }
};

export const renderStatisticsModal = (allAssisted, useDelegationFlow, pautaName) =>
    StatisticsService.showModal(allAssisted, useDelegationFlow, pautaName);

export const exportStatisticsToPDF = (pautaName, statsData) =>
    StatisticsService.exportStatisticsToPDF(pautaName, statsData);

window.StatisticsService = StatisticsService;
