// js/notes.js
import { showNotification } from './utils.js';
import { sendNotesByEmail } from './emailService.js';

/**
 * Configura o modal de anotações
 */
export function setupNotes() {
    const notesBtn = document.getElementById("notes-btn");
    const notesModal = document.getElementById("notes-modal");
    const closeNotesBtn = document.getElementById("close-notes-btn");
    const saveNotesBtn = document.getElementById("save-notes-btn");
    const notesText = document.getElementById("notes-text");
    
    if (!notesBtn || !notesModal) {
        console.warn("Elementos do modal de anotações não encontrados");
        return;
    }

    // Abrir modal
    notesBtn.addEventListener("click", () => {
        const saved = localStorage.getItem("pauta_notes") || "";
        notesText.value = saved;
        notesModal.classList.remove("hidden");
    });

    // Fechar modal (botão X)
    if (closeNotesBtn) {
        closeNotesBtn.addEventListener("click", () => {
            notesModal.classList.add("hidden");
        });
    }

    // Salvar anotações
    if (saveNotesBtn) {
        saveNotesBtn.addEventListener("click", () => {
            localStorage.setItem("pauta_notes", notesText.value);
            showNotification("Anotação salva!", "success");
            notesModal.classList.add("hidden");
        });
    }

    // Fechar ao clicar fora do modal
    notesModal.addEventListener("click", (e) => {
        if (e.target === notesModal) {
            notesModal.classList.add("hidden");
        }
    });
}

/**
 * Envia as anotações por email ao fechar a pauta
 * @param {string} currentUserName - Nome do usuário atual
 * @param {string} userEmail - Email do usuário
 */
export async function sendNotesOnClose(currentUserName, userEmail) {
    const notes = localStorage.getItem("pauta_notes") || "";
    
    if (notes.trim() === "") {
        return;
    }
    
    try {
        await sendNotesByEmail(notes, currentUserName, userEmail);
        showNotification("Anotações enviadas para seu e-mail por segurança!", "info");
    } catch (err) {
        console.error("Falha ao enviar backup das notas:", err);
    }
}
