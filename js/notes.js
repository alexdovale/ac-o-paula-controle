// js/notes.js
import { showNotification } from './utils.js';
import { sendNotesByEmail } from './emailService.js';

export function setupNotes() {
    const notesBtn = document.getElementById("notes-btn");
    const notesModal = document.getElementById("notes-modal");
    const closeNotesBtn = document.getElementById("close-notes-btn");
    const saveNotesBtn = document.getElementById("save-notes-btn");
    const notesText = document.getElementById("notes-text");
    
    if (!notesBtn || !notesModal) return;

    notesBtn.addEventListener("click", () => {
        const saved = localStorage.getItem("pauta_notes") || "";
        notesText.value = saved;
        notesModal.classList.remove("hidden");
    });

    closeNotesBtn.addEventListener("click", () => {
        notesModal.classList.add("hidden");
    });

    saveNotesBtn.addEventListener("click", () => {
        localStorage.setItem("pauta_notes", notesText.value);
        showNotification("Anotação salva!", "success");
        notesModal.classList.add("hidden");
    });
}

export async function sendNotesOnClose(currentUserName, currentUserEmail) {
    const notes = localStorage.getItem("pauta_notes") || "";
    if (notes.trim() !== "") {
        try {
            await sendNotesByEmail(notes, currentUserName, currentUserEmail);
            showNotification("Anotações enviadas para seu e-mail por segurança!", "info");
        } catch (err) {
            console.error("Falha ao enviar backup das notas:", err);
        }
    }
}
