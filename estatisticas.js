function makeModalInteractive(modal) {
    if (!modal || modal.classList.contains('interactive-modal-init')) {
        return; // Esta função só deve ser executada uma vez por elemento.
    }

    // ADICIONADO: Adiciona um listener para fechar o modal ao clicar no fundo.
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    modal.classList.add('interactive-modal-init', 'bg-white');

    const content = document.getElementById('statistics-content');
    if (!content) {
        console.error("#statistics-content não encontrado.");
        return;
    }

    Object.assign(modal.style, {
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', width: '90vw', height: '90vh',
        maxWidth: '1400px', maxHeight: '95vh', resize: 'both',
        overflow: 'hidden', border: '1px solid #ddd',
        boxShadow: '0 5px 25px rgba(0,0,0,0.2)', borderRadius: '12px',
        minWidth: '600px', minHeight: '500px', display: 'flex',
        flexDirection: 'column',
        padding: '0'
    });
    
    if (document.getElementById('statistics-modal-header')) {
        return;
    }
    
    const header = document.createElement('div');
    header.id = 'statistics-modal-header';
    Object.assign(header.style, {
        backgroundColor: '#f7f7f7', padding: '10px 15px', cursor: 'move',
        borderBottom: '1px solid #ddd', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        borderTopLeftRadius: '12px', borderTopRightRadius: '12px'
    });
    
    const title = document.createElement('span');
    title.textContent = 'Estatísticas da Pauta';
    title.style.fontWeight = 'bold';
    title.style.color = '#333';

    const buttons = document.createElement('div');
    const minBtn = document.createElement('button');
    minBtn.innerHTML = '&#95;'; minBtn.title = 'Minimizar';
    const maxBtn = document.createElement('button');
    maxBtn.innerHTML = '&#9723;'; maxBtn.title = 'Maximizar/Restaurar';
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;'; closeBtn.title = 'Fechar';

    [minBtn, maxBtn, closeBtn].forEach(btn => {
        Object.assign(btn.style, {
            background: 'none', border: 'none', fontSize: '18px',
            cursor: 'pointer', marginLeft: '10px', fontWeight: 'bold',
            lineHeight: '1', color: '#555'
        });
    });

    buttons.append(minBtn, maxBtn, closeBtn);
    header.append(title, buttons);

    content.style.flexGrow = '1';
    content.style.overflow = 'hidden';
    content.style.padding = '0';
    content.classList.add('bg-gray-50');

    modal.prepend(header);

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let originalState = {};

    header.onmousedown = function(e) {
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

    closeBtn.onclick = () => modal.style.display = 'none';

    maxBtn.onclick = () => {
        if (modal.classList.contains('maximized')) {
            Object.assign(modal.style, originalState);
            modal.classList.remove('maximized');
            maxBtn.innerHTML = '&#9723;';
        } else {
            originalState = { width: modal.style.width, height: modal.style.height, top: modal.style.top, left: modal.style.left, transform: modal.style.transform };
            Object.assign(modal.style, { width: '100vw', height: '100vh', top: '0px', left: '0px', transform: 'none', borderRadius: '0' });
            modal.classList.add('maximized');
            maxBtn.innerHTML = '&#10064;';
        }
    };
    
    minBtn.onclick = () => {
        const isMinimized = modal.classList.toggle('minimized');
        if (isMinimized) {
            originalState.height = modal.style.height;
            content.style.display = 'none';
            modal.style.height = header.offsetHeight + 'px';
            modal.style.resize = 'none';
        } else {
            content.style.display = 'block';
            modal.style.height = originalState.height || '90vh';
            modal.style.resize = 'both';
        }
    };
}
