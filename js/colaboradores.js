// js/colaboradores.js
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHTML, showNotification } from './utils.js';

// Variável para armazenar a lista atual
let colaboradores = [];

/**
 * Escuta mudanças na lista de colaboradores da pauta em tempo real
 */
export function setupCollaboratorsListener(db, pautaId, callback) {
    if (!pautaId) return;
    
    const collaboratorsCollectionRef = collection(db, "pautas", pautaId, "collaborators");
    
    return onSnapshot(collaboratorsCollectionRef, (snapshot) => {
        const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Ordena por nome antes de devolver para a interface
        lista.sort((a, b) => a.nome.localeCompare(b.nome));
        colaboradores = lista; // Atualiza a variável global do módulo
        callback(lista);
    }, (error) => {
        console.error("Erro no listener de colaboradores:", error);
    });
}

/**
 * Renderiza a lista de colaboradores na tabela
 */
export function renderColaboradores(lista) {
    const tableBody = document.querySelector('#collaborators-list-table-modal tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    let selfT = 0, compT = 0;

    lista.forEach((colab) => {
        if (colab.transporte === 'Meios Próprios') selfT++; 
        else compT++;
        
        const row = document.createElement('tr');
        row.className = "border-b hover:bg-gray-50 transition-colors";
        row.innerHTML = `
            <td class="p-3 font-bold text-gray-800">${escapeHTML(colab.nome)}</td>
            <td class="p-3 text-center">
                <input type="checkbox" class="checkin-checkbox w-5 h-5 text-green-600 rounded" 
                       data-id="${colab.id}" ${colab.presente ? 'checked' : ''}>
            </td>
            <td class="p-3 text-[10px]">
                <b>${escapeHTML(colab.cargo)}</b><br>
                <span class="text-blue-600 font-black uppercase">EQP ${escapeHTML(colab.equipe)}</span>
            </td>
            <td class="p-3 font-mono text-[10px] text-gray-400">${colab.horario || '--:--'}</td>
            <td class="p-3 text-center flex justify-center gap-3">
                <button class="edit-collaborator-btn text-blue-400 text-lg" data-id="${colab.id}" title="Editar">✏️</button>
                <button class="delete-collaborator-btn text-red-300 text-lg" data-id="${colab.id}" title="Excluir">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Atualiza contadores
    updateCollaboratorCounters(lista.length, selfT, compT);
    
    // Adiciona event listeners aos novos botões
    addEventListenersToTable();
}

/**
 * Atualiza os contadores de estatísticas
 */
function updateCollaboratorCounters(total, selfT, compT) {
    const elTotal = document.getElementById('total-participants-count');
    const elSelf = document.getElementById('self-transport-count');
    const elComp = document.getElementById('company-transport-count');
    
    if (elTotal) elTotal.textContent = total;
    if (elSelf) elSelf.textContent = selfT;
    if (elComp) elComp.textContent = compT;
}

/**
 * Adiciona event listeners aos botões da tabela
 */
function addEventListenersToTable() {
    // Checkboxes de presença
    document.querySelectorAll('#collaborators-modal .checkin-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const docId = e.target.dataset.id;
            const presente = e.target.checked;
            const horario = presente ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            // Dispara evento personalizado para ser capturado pelo componente principal
            const event = new CustomEvent('collaboratorPresenceChange', {
                detail: { id: docId, presente, horario }
            });
            document.dispatchEvent(event);
        });
    });

    // Botões de editar
    document.querySelectorAll('#collaborators-modal .edit-collaborator-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const docId = e.currentTarget.dataset.id;
            const collaborator = colaboradores.find(c => c.id === docId);
            if (collaborator) {
                // Dispara evento para edição
                const event = new CustomEvent('editCollaborator', {
                    detail: collaborator
                });
                document.dispatchEvent(event);
            }
        });
    });

    // Botões de deletar
    document.querySelectorAll('#collaborators-modal .delete-collaborator-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const docId = e.currentTarget.dataset.id;
            if (confirm("Remover este membro?")) {
                // Dispara evento para deletar
                const event = new CustomEvent('deleteCollaborator', {
                    detail: { id: docId }
                });
                document.dispatchEvent(event);
            }
        });
    });
}

/**
 * Salva ou Atualiza um colaborador
 */
export const saveCollaboratorData = async (db, pautaId, data, editId = null) => {
    const collaboratorsCollectionRef = collection(db, "pautas", pautaId, "collaborators");

    if (editId) {
        // Modo Edição
        const collaboratorRef = doc(collaboratorsCollectionRef, editId);
        return await updateDoc(collaboratorRef, data);
    } else {
        // Modo Novo Registro
        return await addDoc(collaboratorsCollectionRef, {
            ...data,
            presente: false,
            horario: '--:--'
        });
    }
};

/**
 * Altera apenas o status de presença de um colaborador
 */
export const toggleCollaboratorPresence = async (db, pautaId, collabId, isPresent) => {
    const collaboratorRef = doc(db, "pautas", pautaId, "collaborators", collabId);
    const horario = isPresent ? new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    
    return await updateDoc(collaboratorRef, { 
        presente: isPresent, 
        horario: horario 
    });
};

/**
 * Exclui um colaborador da lista
 */
export const deleteCollaborator = async (db, pautaId, collabId) => {
    const collaboratorRef = doc(db, "pautas", pautaId, "collaborators", collabId);
    return await deleteDoc(collaboratorRef);
};

/**
 * Limpa toda a lista de presença de uma pauta (Batch)
 */
export const clearCollaborators = async (db, pautaId) => {
    const collaboratorsCollectionRef = collection(db, "pautas", pautaId, "collaborators");
    const snapshot = await getDocs(collaboratorsCollectionRef);
    
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach(d => {
        batch.delete(d.ref);
    });
    
    return await batch.commit();
};

/**
 * Reseta o formulário de colaborador
 */
export function resetCollaboratorForm() {
    const form = document.getElementById('collaborator-form-modal');
    if (form) form.reset();
    
    const btn = document.getElementById('add-collaborator-btn-modal');
    if (btn) btn.textContent = "Salvar Membro";
}

/**
 * Ordena colaboradores por critério
 */
export function sortColaboradores(criterio, lista = colaboradores) {
    const pesos = { "Defensor(a)": 1, "Servidor(a)": 2, "CRC": 3, "Residente": 4, "Estagiário(a)": 5 };
    
    const sortedList = [...lista].sort((a, b) => {
        if (criterio === 'nome') {
            return a.nome.localeCompare(b.nome);
        }
        if (criterio === 'equipe') {
            if (a.equipe !== b.equipe) return a.equipe - b.equipe;
            const pA = pesos[a.cargo] || 99;
            const pB = pesos[b.cargo] || 99;
            return pA !== pB ? pA - pB : a.nome.localeCompare(b.nome);
        }
        return 0;
    });
    
    renderColaboradores(sortedList);
    return sortedList;
}

// Aliás para compatibilidade
export const setupCollaborators = setupCollaboratorsListener;
