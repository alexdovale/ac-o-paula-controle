/**
 * estatisticas.js - Versão Módulo Corrigida, com PDF Melhorado, Responsiva e Agendados por Horário
 */

// ========================================================
// STATISTICS SERVICE - Objeto com todas as funções de estatísticas
// ========================================================

export const StatisticsService = {
    /**
     * Função auxiliar para tornar o modal interativo (arrastável, redimensionável) - Adaptado para mobile
     */
    makeModalInteractive(modal) {
        if (!modal || modal.classList.contains('interactive-modal-init')) {
            return;
        }
        modal.classList.add('interactive-modal-init', 'bg-white');

        // Detectar se é mobile
        const isMobile = window.innerWidth <= 768;

        // Estilos injetados para garantir que o modal e seu conteúdo se adaptem a diferentes tamanhos de tela.
        if (!document.getElementById('statistics-responsive-styles')) {
            const styleSheet = document.createElement("style");
            styleSheet.id = 'statistics-responsive-styles';
            styleSheet.innerHTML = `
                @media (max-width: 1024px) {
                    #statistics-content-wrapper {
                        overflow-y: auto !important;
                        display: flex;
                        flex-direction: column;
                    }
                }
                @media (max-width: 768px) {
                    #statistics-modal {
                        width: 100vw !important;
                        height: 100vh !important;
                        max-width: 100vw !important;
                        max-height: 100vh !important;
                        top: 0 !important;
                        left: 0 !important;
                        transform: none !important;
                        border-radius: 0 !important;
                        resize: none !important;
                        min-width: 0 !important;
                        min-height: 0 !important;
                    }
                }
            `;
            document.head.appendChild(styleSheet);
        }

        const content = document.getElementById('statistics-content');
        if (!content) {
            const newContent = document.createElement('div');
            newContent.id = 'statistics-content';
            newContent.className = 'flex-grow overflow-auto p-4';
            modal.appendChild(newContent);
        }

        // Configurar estilos base do modal
        if (isMobile) {
            Object.assign(modal.style, {
                position: 'fixed', 
                top: '0', 
                left: '0',
                transform: 'none', 
                width: '100vw', 
                height: '100vh',
                maxWidth: '100vw', 
                maxHeight: '100vh', 
                resize: 'none',
                overflow: 'hidden', 
                border: 'none',
                boxShadow: 'none', 
                borderRadius: '0',
                minWidth: '0', 
                minHeight: '0', 
                display: 'flex',
                flexDirection: 'column',
                padding: '0',
                zIndex: '1000'
            });
        } else {
            Object.assign(modal.style, {
                position: 'fixed', 
                top: '50%', 
                left: '50%',
                transform: 'translate(-50%, -50%)', 
                width: '90vw', 
                height: '90vh',
                maxWidth: '1400px', 
                maxHeight: '95vh', 
                resize: 'both',
                overflow: 'hidden', 
                border: '1px solid #ddd',
                boxShadow: '0 5px 25px rgba(0,0,0,0.2)', 
                borderRadius: '12px',
                minWidth: '600px', 
                minHeight: '500px', 
                display: 'flex',
                flexDirection: 'column',
                padding: '0',
                zIndex: '1000'
            });
        }

        // Verificar se já existe um cabeçalho
        let header = modal.querySelector('#statistics-modal-header');
        
        if (!header) {
            header = document.createElement('div');
            header.id = 'statistics-modal-header';
            
            // Estilo do cabeçalho
            Object.assign(header.style, {
                backgroundColor: isMobile ? '#16a34a' : '#f7f7f7',
                color: isMobile ? 'white' : '#333',
                padding: isMobile ? '16px' : '10px 15px',
                borderBottom: '1px solid #ddd',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: isMobile ? 'default' : 'move',
                borderTopLeftRadius: isMobile ? '0' : '12px',
                borderTopRightRadius: isMobile ? '0' : '12px',
                flexShrink: '0'
            });

            const title = document.createElement('span');
            title.textContent = 'Estatísticas da Pauta';
            title.style.fontWeight = 'bold';
            title.style.fontSize = isMobile ? '18px' : '16px';
            title.style.color = isMobile ? 'white' : '#333';

            const buttons = document.createElement('div');
            buttons.style.display = 'flex';
            buttons.style.alignItems = 'center';
            buttons.style.gap = '5px';
            
            if (isMobile) {
                // Apenas botão de fechar no mobile
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '&times;';
                closeBtn.title = 'Fechar';
                Object.assign(closeBtn.style, {
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    fontSize: '28px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    color: 'white',
                    width: '44px',
                    height: '44px',
                    borderRadius: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: '1',
                    transition: 'background-color 0.2s'
                });
                closeBtn.onmouseover = () => closeBtn.style.backgroundColor = 'rgba(255,255,255,0.3)';
                closeBtn.onmouseout = () => closeBtn.style.backgroundColor = 'rgba(255,255,255,0.2)';
                closeBtn.onclick = () => modal.classList.add('hidden');
                buttons.appendChild(closeBtn);
            } else {
                // Botões de controle no desktop
                const minBtn = document.createElement('button');
                minBtn.innerHTML = '&#95;'; // caractere de subtraço
                minBtn.title = 'Minimizar';
                
                const maxBtn = document.createElement('button');
                maxBtn.innerHTML = '&#9723;'; // quadrado vazio
                maxBtn.title = 'Maximizar/Restaurar';
                
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '&times;';
                closeBtn.title = 'Fechar';
                
                [minBtn, maxBtn, closeBtn].forEach(btn => {
                    Object.assign(btn.style, {
                        background: 'none',
                        border: 'none',
                        fontSize: '20px',
                        cursor: 'pointer',
                        marginLeft: '8px',
                        fontWeight: 'bold',
                        lineHeight: '1',
                        color: '#555',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s, color 0.2s'
                    });
                    btn.onmouseover = () => {
                        btn.style.backgroundColor = '#e0e0e0';
                        btn.style.color = '#000';
                    };
                    btn.onmouseout = () => {
                        btn.style.backgroundColor = 'transparent';
                        btn.style.color = '#555';
                    };
                });

                // Funcionalidade de arrastar (drag)
                let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
                let originalState = {};

                header.onmousedown = function (e) {
                    if (e.target.tagName === 'BUTTON') return;
                    e.preventDefault();
                    pos3 = e.clientX;
                    pos4 = e.clientY;
                    document.onmouseup = closeDragElement;
                    document.onmousemove = elementDrag;
                };

                function elementDrag(e) {
                    e.preventDefault();
                    pos1 = pos3 - e.clientX;
                    pos2 = pos4 - e.clientY;
                    pos3 = e.clientX;
                    pos4 = e.clientY;
                    modal.style.top = (modal.offsetTop - pos2) + "px";
                    modal.style.left = (modal.offsetLeft - pos1) + "px";
                    modal.style.transform = 'none';
                }

                function closeDragElement() {
                    document.onmouseup = null;
                    document.onmousemove = null;
                }

                // Funcionalidade de maximizar
                maxBtn.onclick = () => {
                    if (modal.classList.contains('maximized')) {
                        Object.assign(modal.style, originalState);
                        modal.classList.remove('maximized');
                        maxBtn.innerHTML = '&#9723;';
                        maxBtn.title = 'Maximizar';
                    } else {
                        originalState = {
                            width: modal.style.width, 
                            height: modal.style.height, 
                            top: modal.style.top, 
                            left: modal.style.left, 
                            transform: modal.style.transform
                        };
                        Object.assign(modal.style, {
                            width: '100vw', 
                            height: '100vh', 
                            top: '0px', 
                            left: '0px', 
                            transform: 'none', 
                            borderRadius: '0'
                        });
                        modal.classList.add('maximized');
                        maxBtn.innerHTML = '&#10064;'; // quadrado preenchido
                        maxBtn.title = 'Restaurar';
                    }
                };

                // Funcionalidade de minimizar
                minBtn.onclick = () => {
                    const contentDiv = document.getElementById('statistics-content');
                    const isMinimized = modal.classList.toggle('minimized');
                    if (isMinimized) {
                        if (!originalState.height) {
                            originalState.height = modal.style.height;
                        }
                        if(contentDiv) contentDiv.style.display = 'none';
                        modal.style.height = header.offsetHeight + 'px';
                        modal.style.resize = 'none';
                        minBtn.innerHTML = '&#9650;'; // seta para cima
                        minBtn.title = 'Restaurar';
                    } else {
                        if(contentDiv) contentDiv.style.display = 'block';
                        modal.style.height = originalState.height || '90vh';
                        modal.style.resize = 'both';
                        minBtn.innerHTML = '&#95;'; // subtraço
                        minBtn.title = 'Minimizar';
                    }
                };

                // Fechar
                closeBtn.onclick = () => modal.classList.add('hidden');

                buttons.append(minBtn, maxBtn, closeBtn);
            }

            header.append(title, buttons);
            
            // Inserir cabeçalho no início do modal
            if (modal.firstChild) {
                modal.insertBefore(header, modal.firstChild);
            } else {
                modal.appendChild(header);
            }
        }

        const contentDiv = document.getElementById('statistics-content');
        if (contentDiv) {
            contentDiv.style.flexGrow = '1';
            contentDiv.style.overflow = 'auto';
            contentDiv.style.padding = isMobile ? '12px' : '16px';
            contentDiv.classList.add('bg-gray-50');
        }
    },

    /**
     * Calcula diferença em minutos entre duas datas
     */
    getTimeDifferenceInMinutes(startTimeISO, endTimeISO) {
        if (!startTimeISO || !endTimeISO) return null;
        const start = new Date(startTimeISO);
        const end = new Date(endTimeISO);
        if (isNaN(start) || isNaN(end)) return null;
        return Math.round((end - start) / 60000);
    },

    /**
     * Renderiza o modal de estatísticas (adaptado para mobile)
     */
    showModal(allAssisted, useDelegationFlow, pautaName) {
        const modal = document.getElementById('statistics-modal');

        if (!modal) {
            console.error("Elemento do modal de estatísticas '#statistics-modal' não encontrado.");
            return;
        }
        
        let content = document.getElementById('statistics-content');
        
        this.makeModalInteractive(modal);
        
        if (!content) {
            content = document.getElementById('statistics-content');
        }

        if (modal.classList.contains('minimized')) {
            modal.classList.remove('minimized');
            modal.style.resize = 'both';
        }
        if (content) {
            content.style.display = 'block'; 
        }

        const modalTitle = modal.querySelector('#statistics-modal-header span');
        if (modalTitle) modalTitle.textContent = `Estatísticas - ${pautaName}`;

        if (content) {
            content.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-600">Calculando estatísticas...</p></div>`;
        }
        
        modal.style.display = 'flex';
        modal.classList.remove('hidden');

        const atendidos = allAssisted.filter(a => a.status === 'atendido');
        const faltosos = allAssisted.filter(a => a.status === 'faltoso');

        const statsByGroup = atendidos.reduce((acc, a) => {
            const attendantIsObject = typeof a.attendant === 'object' && a.attendant !== null;
            const attendantName = attendantIsObject ? a.attendant.nome : (a.attendant || 'Não informado');
            
            const groupName = attendantIsObject && a.attendant.equipe ? `Equipe ${a.attendant.equipe}` : 'Equipe Não Definida';

            if (!acc[groupName]) {
                acc[groupName] = { collaborators: {}, total: 0 };
            }

            const safeAttendantName = attendantName || 'Não informado';
            acc[groupName].collaborators[safeAttendantName] = (acc[groupName].collaborators[safeAttendantName] || 0) + 1;
            acc[groupName].total++;
            
            return acc;
        }, {});
        
        const statsByCollaboratorFlat = {};
        Object.values(statsByGroup).forEach(groupData => {
            Object.entries(groupData.collaborators).forEach(([name, count]) => {
                statsByCollaboratorFlat[name] = count;
            });
        });
        const sortedFlatCollaborators = Object.entries(statsByCollaboratorFlat).sort(([, a], [, b]) => b - a);
        
        // Versão responsiva da lista de colaboradores
        const collaboratorsFlatHTML = sortedFlatCollaborators.length > 0 ? `
            <div class="bg-white p-3 md:p-4 rounded-lg border">
                <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2">Atendimentos por Colaborador</h3>
                <div class="max-h-[30vh] overflow-y-auto">
                    <table class="w-full text-xs md:text-sm text-left">
                        <thead class="text-[10px] md:text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                            <tr>
                                <th class="px-2 md:px-4 py-1 md:py-2">Colaborador</th>
                                <th class="px-2 md:px-4 py-1 md:py-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedFlatCollaborators.map(([name, count]) => `
                                <tr class="border-b">
                                    <td class="px-2 md:px-4 py-1 md:py-2 font-medium text-xs md:text-sm">${name}</td>
                                    <td class="px-2 md:px-4 py-1 md:py-2 text-right text-xs md:text-sm">${count}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : '';
        
        const statsBySubject = allAssisted.reduce((acc, a) => {
            const demandasDoAssistido = (a.subject ? [a.subject] : []).concat(a.demandas?.descricoes || []);
            demandasDoAssistido.forEach(demanda => {
                if (!acc[demanda]) {
                    acc[demanda] = { total: 0, atendidos: 0, faltosos: 0 };
                }
                acc[demanda].total++;
                if (a.status === 'atendido') {
                    acc[demanda].atendidos++;
                } else if (a.status === 'faltoso') {
                    acc[demanda].faltosos++;
                }
            });
            return acc;
        }, {});

        const totalDemandasGeral = Object.values(statsBySubject).reduce((sum, data) => sum + data.total, 0);
        const totalDemandasAtendidos = Object.values(statsBySubject).reduce((sum, data) => sum + data.atendidos, 0);
        const totalDemandasFaltosos = Object.values(statsBySubject).reduce((sum, data) => sum + data.faltosos, 0);

        const statsByTime = atendidos.filter(a => a.scheduledTime).reduce((acc, a) => {
            acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
            return acc;
        }, {});
        const sortedTimes = Object.keys(statsByTime).sort();

        const statsByTimeFaltosos = faltosos.filter(a => a.scheduledTime).reduce((acc, a) => {
            acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
            return acc;
        }, {});
        const sortedTimesFaltosos = Object.keys(statsByTimeFaltosos).sort();

        const statsByScheduledTime = allAssisted.filter(a => a.scheduledTime).reduce((acc, a) => {
            acc[a.scheduledTime] = (acc[a.scheduledTime] || 0) + 1;
            return acc;
        }, {});
        const sortedScheduledTimes = Object.keys(statsByScheduledTime).sort();

        let totalDelegatedMinutes = 0, delegatedCount = 0;
        let totalDirectMinutes = 0, directCount = 0;

        atendidos.forEach(a => {
            const minutes = this.getTimeDifferenceInMinutes(a.arrivalTime, a.attendedTime);
            if (minutes !== null) {
                if (useDelegationFlow && a.inAttendanceTime) {
                    totalDelegatedMinutes += minutes;
                    delegatedCount++;
                } else {
                    totalDirectMinutes += minutes;
                    directCount++;
                }
            }
        });

        const avgTimeDelegated = delegatedCount > 0 ? Math.round(totalDelegatedMinutes / delegatedCount) : 0;
        const avgTimeDirect = directCount > 0 ? Math.round(totalDirectMinutes / directCount) : 0;

        const delegationHTML = useDelegationFlow ? `
            <div class="bg-indigo-100 p-2 md:p-3 rounded-lg text-center border border-indigo-200">
                <p class="text-xl md:text-2xl font-bold text-indigo-700">${avgTimeDelegated} min</p>
                <p class="text-[8px] md:text-xs text-gray-600 mt-1">Tempo Médio (delegação)</p>
            </div>` : '';

        const collaboratorsHTML = Object.entries(statsByGroup).sort(([,a],[,b]) => b.total - a.total).map(([groupName, groupData]) => {
            const collaboratorsRows = Object.entries(groupData.collaborators).sort(([,a],[,b]) => b-a).map(([name, count]) => `
                <tr class="border-b">
                    <td class="px-2 md:px-4 py-1 md:py-2 font-medium text-xs md:text-sm pl-2 md:pl-8">${name}</td>
                    <td class="px-2 md:px-4 py-1 md:py-2 text-right text-xs md:text-sm">${count}</td>
                </tr>
            `).join('');

            return `
                <div class="mb-3 md:mb-4">
                    <div class="bg-gray-100 px-2 md:px-4 py-1 md:py-2 rounded-t-lg font-bold text-xs md:text-sm flex justify-between">
                        <span>${groupName}</span>
                        <span>Total: ${groupData.total}</span>
                    </div>
                    <table class="w-full text-xs md:text-sm text-left border-x border-b rounded-b-lg">
                        <tbody>
                            ${collaboratorsRows}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');

        // Versão responsiva do HTML
        const html = `
        <div id="statistics-content-wrapper" class="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4 h-full p-2 md:p-4 overflow-hidden">
            <div class="lg:col-span-2 flex flex-col gap-3 md:gap-4 overflow-y-auto pr-1 md:pr-2">
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2 md:mb-3">Resumo Geral</h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3 text-center summary-cards">
                        <div class="bg-green-100 p-2 md:p-3 rounded-lg border border-green-200">
                            <p class="text-xl md:text-2xl font-bold text-green-700">${atendidos.length}</p>
                            <p class="text-[9px] md:text-xs text-gray-600 mt-1">Atendidos</p>
                        </div>
                        <div class="bg-red-100 p-2 md:p-3 rounded-lg border border-red-200">
                            <p class="text-xl md:text-2xl font-bold text-red-700">${faltosos.length}</p>
                            <p class="text-[9px] md:text-xs text-gray-600 mt-1">Faltosos</p>
                        </div>
                        <div class="bg-blue-100 p-2 md:p-3 rounded-lg border border-blue-200">
                            <p class="text-xl md:text-2xl font-bold text-blue-700">${avgTimeDirect} min</p>
                            <p class="text-[9px] md:text-xs text-gray-600 mt-1">Tempo Médio</p>
                        </div>
                        ${delegationHTML}
                    </div>
                </div>
                
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2 md:mb-3">Exportar Relatório</h3>
                    <div class="grid grid-cols-2 gap-2 md:space-y-2 text-xs md:text-sm">
                        <label class="flex items-center"><input type="checkbox" id="export-general" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Resumo</label>
                        <label class="flex items-center"><input type="checkbox" id="export-collaborators" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Colaboradores</label>
                        <label class="flex items-center"><input type="checkbox" id="export-subjects" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Assuntos</label>
                        <label class="flex items-center"><input type="checkbox" id="export-scheduled-time" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Agendados</label>
                        <label class="flex items-center"><input type="checkbox" id="export-times" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Atendimentos</label>
                        <label class="flex items-center"><input type="checkbox" id="export-absentees-time" class="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 rounded" checked> Faltosos</label>
                    </div>
                    <div class="mt-3 md:mt-4">
                        <button id="export-stats-pdf-btn" class="w-full bg-blue-600 text-white font-bold py-2 md:py-2.5 px-3 md:px-4 rounded-lg hover:bg-blue-700 text-xs md:text-sm transition-colors">
                            Gerar PDF
                        </button>
                    </div>
                </div>

                ${sortedScheduledTimes.length > 0 ? `
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-sm md:text-md font-semibold text-gray-800 mb-2">Agendados por Horário</h3>
                    <div class="max-h-32 md:max-h-40 overflow-y-auto">
                        <table class="w-full text-xs md:text-sm">
                            <thead class="text-[9px] md:text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                                <tr><th class="px-2 md:px-4 py-1">Horário</th><th class="px-2 md:px-4 py-1 text-right">Qtd</th></tr>
                            </thead>
                            <tbody>
                                ${sortedScheduledTimes.map(time => `
                                    <tr class="border-b">
                                        <td class="px-2 md:px-4 py-1">${time}</td>
                                        <td class="px-2 md:px-4 py-1 text-right">${statsByScheduledTime[time]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot class="bg-gray-100 font-bold">
                                <tr><td class="px-2 md:px-4 py-1">Total</td><td class="px-2 md:px-4 py-1 text-right">${allAssisted.length}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                </div>` : ''}

                ${sortedTimes.length > 0 ? `
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-sm md:text-md font-semibold text-gray-800 mb-2">Atendimentos (Chegada)</h3>
                    <div class="max-h-32 md:max-h-40 overflow-y-auto">
                        <table class="w-full text-xs md:text-sm">
                            <thead class="text-[9px] md:text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                                <tr><th class="px-2 md:px-4 py-1">Horário</th><th class="px-2 md:px-4 py-1 text-right">Qtd</th></tr>
                            </thead>
                            <tbody>
                                ${sortedTimes.map(time => `
                                    <tr class="border-b">
                                        <td class="px-2 md:px-4 py-1">${time}</td>
                                        <td class="px-2 md:px-4 py-1 text-right">${statsByTime[time]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot class="bg-gray-100 font-bold">
                                <tr><td class="px-2 md:px-4 py-1">Total</td><td class="px-2 md:px-4 py-1 text-right">${atendidos.length}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                </div>` : ''}

                ${sortedTimesFaltosos.length > 0 ? `
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-sm md:text-md font-semibold text-red-800 mb-2">Faltosos por Horário</h3>
                    <div class="max-h-32 md:max-h-40 overflow-y-auto">
                        <table class="w-full text-xs md:text-sm">
                            <thead class="text-[9px] md:text-xs text-red-700 uppercase bg-red-100 sticky top-0">
                                <tr><th class="px-2 md:px-4 py-1">Horário</th><th class="px-2 md:px-4 py-1 text-right">Qtd</th></tr>
                            </thead>
                            <tbody>
                                ${sortedTimesFaltosos.map(time => `
                                    <tr class="border-b">
                                        <td class="px-2 md:px-4 py-1">${time}</td>
                                        <td class="px-2 md:px-4 py-1 text-right">${statsByTimeFaltosos[time]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot class="bg-red-100 font-bold">
                                <tr><td class="px-2 md:px-4 py-1">Total</td><td class="px-2 md:px-4 py-1 text-right">${faltosos.length}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                </div>` : ''}
            </div>

            <div class="lg:col-span-3 flex flex-col gap-3 md:gap-4 overflow-y-auto pr-1 md:pr-2">
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2">Demandas por Assunto</h3>
                    <div class="max-h-[40vh] md:max-h-[50vh] overflow-y-auto">
                        <table class="w-full text-xs md:text-sm">
                            <thead class="text-[9px] md:text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                                <tr>
                                    <th class="px-1 md:px-4 py-1">Assunto</th>
                                    <th class="px-1 md:px-4 py-1 text-center">Total</th>
                                    <th class="px-1 md:px-4 py-1 text-center text-green-600">Atend.</th>
                                    <th class="px-1 md:px-4 py-1 text-center text-red-600">Falt.</th>
                                    <th class="px-1 md:px-4 py-1 text-right">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(statsBySubject).sort(([,a],[,b]) => b.total - a.total).map(([subject, data]) => `
                                    <tr class="border-b">
                                        <td class="px-1 md:px-4 py-1 font-medium text-[10px] md:text-sm">${subject.length > 20 ? subject.substring(0,20)+'...' : subject}</td>
                                        <td class="px-1 md:px-4 py-1 text-center font-bold">${data.total}</td>
                                        <td class="px-1 md:px-4 py-1 text-center text-green-600">${data.atendidos}</td>
                                        <td class="px-1 md:px-4 py-1 text-center text-red-600">${data.faltosos}</td>
                                        <td class="px-1 md:px-4 py-1 text-right">${totalDemandasGeral > 0 ? ((data.total / totalDemandasGeral) * 100).toFixed(1) : 0}%</td>
                                    </tr>`).join('')}
                            </tbody>
                            <tfoot class="bg-gray-100 font-bold">
                                <tr>
                                    <td class="px-1 md:px-4 py-1">Total</td>
                                    <td class="px-1 md:px-4 py-1 text-center">${totalDemandasGeral}</td>
                                    <td class="px-1 md:px-4 py-1 text-center text-green-600">${totalDemandasAtendidos}</td>
                                    <td class="px-1 md:px-4 py-1 text-center text-red-600">${totalDemandasFaltosos}</td>
                                    <td class="px-1 md:px-4 py-1 text-right">100%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
                
                ${collaboratorsFlatHTML}
                
                <div class="bg-white p-3 md:p-4 rounded-lg border">
                    <h3 class="text-base md:text-lg font-semibold text-gray-800 mb-2">Atendimentos por Equipe</h3>
                    <div class="max-h-[30vh] overflow-y-auto">
                        ${collaboratorsHTML}
                    </div>
                </div>
            </div>
        </div>
        `;
        
        if(content) content.innerHTML = html;

        const exportBtn = document.getElementById('export-stats-pdf-btn');
        if (exportBtn) {
            // Remover listener anterior para evitar duplicação
            const newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            
            newExportBtn.addEventListener('click', () => {
                newExportBtn.textContent = 'Gerando PDF...';
                newExportBtn.disabled = true;

                this.exportStatisticsToPDF(pautaName, {
                    agendadosCount: allAssisted.length,
                    atendidosCount: atendidos.length,
                    faltososCount: faltosos.length,
                    avgTimeDirect,
                    avgTimeDelegated,
                    useDelegationFlow,
                    statsByGroup,
                    statsBySubject,
                    statsByScheduledTime: sortedScheduledTimes.map(time => ({ time, count: statsByScheduledTime[time] })),
                    statsByTime: sortedTimes.map(time => ({ time, count: statsByTime[time] })),
                    statsByTimeFaltosos: sortedTimesFaltosos.map(time => ({ time, count: statsByTimeFaltosos[time] }))
                }).finally(() => {
                    newExportBtn.textContent = 'Gerar PDF';
                    newExportBtn.disabled = false;
                });
            });
        }
    },

    /**
     * Exporta estatísticas para PDF
     */
    async exportStatisticsToPDF(pautaName, statsData) {
        const { jsPDF } = window.jspdf;
        
        // Verificar checkboxes (se não existirem, considerar marcados)
        const exportGeneral = document.getElementById('export-general')?.checked ?? true;
        const exportCollaborators = document.getElementById('export-collaborators')?.checked ?? true;
        const exportSubjects = document.getElementById('export-subjects')?.checked ?? true;
        const exportScheduledTime = document.getElementById('export-scheduled-time')?.checked ?? true;
        const exportTimes = document.getElementById('export-times')?.checked ?? true;
        const exportAbsenteesTime = document.getElementById('export-absentees-time')?.checked ?? true;
        
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        let yPos = margin + 30;

        const FONT_NORMAL = 'Helvetica';
        const FONT_BOLD = 'Helvetica-Bold';
        const COLOR_PRIMARY = '#2B3A55';
        const COLOR_GREEN = '#27ae60';
        const COLOR_RED = '#c0392b';
        const COLOR_BLUE = '#2980b9';

        const addSectionTitle = (title) => {
            if (yPos > pageHeight - 100) { 
                doc.addPage();
                yPos = margin + 30;
            }
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(14);
            doc.setTextColor(COLOR_PRIMARY);
            doc.text(title, margin, yPos);
            yPos += 25;
        };

        // ================================================
        // 1. RESUMO GERAL
        // ================================================
        if (exportGeneral) {
            addSectionTitle("Resumo Geral");
            
            const colWidth = (pageWidth - margin * 2) / 3;
            let startX = margin;
            
            // Atendidos
            doc.setFillColor(220, 255, 220);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(24);
            doc.setTextColor(COLOR_GREEN);
            doc.text(String(statsData.atendidosCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Atendidos", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            // Faltosos
            startX += colWidth;
            doc.setFillColor(255, 220, 220);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(24);
            doc.setTextColor(COLOR_RED);
            doc.text(String(statsData.faltososCount || 0), startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Faltosos", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            // Tempo Médio
            startX += colWidth;
            doc.setFillColor(220, 235, 255);
            doc.roundedRect(startX, yPos - 15, colWidth - 10, 60, 5, 5, 'F');
            doc.setFont(FONT_BOLD, 'normal');
            doc.setFontSize(24);
            doc.setTextColor(COLOR_BLUE);
            const tempoMedio = statsData.avgTimeDirect || 0;
            doc.text(tempoMedio + ' min', startX + (colWidth - 10)/2, yPos + 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text("Tempo Médio", startX + (colWidth - 10)/2, yPos + 35, { align: 'center' });
            
            yPos += 70;
        }

        // ================================================
        // 2. ATENDIMENTOS POR COLABORADOR
        // ================================================
        if (exportCollaborators && statsData.statsByGroup && Object.keys(statsData.statsByGroup).length > 0) {
            addSectionTitle("Atendimentos por Colaborador");
            
            const colaboradores = [];
            Object.entries(statsData.statsByGroup).forEach(([grupo, data]) => {
                Object.entries(data.collaborators || {}).forEach(([nome, count]) => {
                    colaboradores.push([nome, count]);
                });
            });
            
            colaboradores.sort((a, b) => b[1] - a[1]);
            
            doc.autoTable({
                startY: yPos,
                head: [['Colaborador', 'Total']],
                body: colaboradores.slice(0, 15),
                theme: 'grid',
                headStyles: { fillColor: [75, 85, 99], textColor: '#FFFFFF' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ================================================
        // 3. AGENDADOS POR HORÁRIO
        // ================================================
        if (exportScheduledTime && statsData.statsByScheduledTime && statsData.statsByScheduledTime.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Agendados por Horário");
            
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: statsData.statsByScheduledTime.map(item => [item.time, item.count]),
                foot: [['Total', statsData.agendadosCount || 0]],
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ================================================
        // 4. ATENDIMENTOS POR HORÁRIO (CHEGADA)
        // ================================================
        if (exportTimes && statsData.statsByTime && statsData.statsByTime.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Atendimentos por Horário (Chegada)");
            
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: statsData.statsByTime.map(item => [item.time, item.count]),
                foot: [['Total', statsData.atendidosCount || 0]],
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ================================================
        // 5. FALTOSOS POR HORÁRIO
        // ================================================
        if (exportAbsenteesTime && statsData.statsByTimeFaltosos && statsData.statsByTimeFaltosos.length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Faltosos por Horário");
            
            doc.autoTable({
                startY: yPos,
                head: [['Horário', 'Quantidade']],
                body: statsData.statsByTimeFaltosos.map(item => [item.time, item.count]),
                foot: [['Total', statsData.faltososCount || 0]],
                theme: 'grid',
                headStyles: { fillColor: [220, 38, 38], textColor: '#FFFFFF' },
                footStyles: { fillColor: [255, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 9 },
                margin: { left: margin, right: margin }
            });
            
            yPos = doc.lastAutoTable.finalY + 20;
        }

        // ================================================
        // 6. DEMANDAS POR ASSUNTO
        // ================================================
        if (exportSubjects && statsData.statsBySubject && Object.keys(statsData.statsBySubject).length > 0) {
            if (yPos > pageHeight - 100) { doc.addPage(); yPos = margin + 30; }
            addSectionTitle("Demandas por Assunto");
            
            const subjects = Object.entries(statsData.statsBySubject)
                .sort(([,a], [,b]) => b.total - a.total)
                .map(([name, data]) => [
                    name,
                    data.total || 0,
                    data.atendidos || 0,
                    data.faltosos || 0
                ]);
            
            const totalGeral = subjects.reduce((acc, row) => acc + row[1], 0);
            const totalAtendidos = subjects.reduce((acc, row) => acc + row[2], 0);
            const totalFaltosos = subjects.reduce((acc, row) => acc + row[3], 0);
            
            doc.autoTable({
                startY: yPos,
                head: [['Assunto', 'Total', 'Atendidos', 'Faltosos']],
                body: subjects.slice(0, 20),
                foot: [['TOTAL GERAL', totalGeral, totalAtendidos, totalFaltosos]],
                theme: 'grid',
                headStyles: { fillColor: [75, 85, 99], textColor: '#FFFFFF' },
                footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
                styles: { fontSize: 8 },
                columnStyles: { 0: { cellWidth: 180 } },
                margin: { left: margin, right: margin }
            });
        }

        // ================================================
        // RODAPÉ COM DATA
        // ================================================
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `Gerado em: ${new Date().toLocaleString('pt-BR')} - Página ${i} de ${pageCount}`,
                margin,
                pageHeight - 20
            );
        }

        doc.save(`estatisticas_${pautaName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`);
    }
};

// ========================================================
// FUNÇÕES AVULSAS (para compatibilidade com código antigo)
// ========================================================

/**
 * @deprecated Use StatisticsService.showModal() instead
 */
export const renderStatisticsModal = (allAssisted, useDelegationFlow, pautaName) => {
    return StatisticsService.showModal(allAssisted, useDelegationFlow, pautaName);
};

/**
 * @deprecated Use StatisticsService.exportStatisticsToPDF() instead
 */
export const exportStatisticsToPDF = (pautaName, statsData) => {
    return StatisticsService.exportStatisticsToPDF(pautaName, statsData);
};
