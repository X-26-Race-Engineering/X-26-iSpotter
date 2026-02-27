// Close window (Electron)
const closeBtn = document.getElementById('close-window-btn');
if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/stream/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            console.log('Stop response:', data);

            if ((data.status === 'success' || data.status === 'not_running') && (typeof window.closeWindow === 'function')) {
                updateStreamStatus(false);
                updateIRacingStatus(false);
                window.closeWindow();
            } else {
                console.error('window.closeWindow not available - preload.js may not have loaded');
            }
        } catch (error) {
        console.error('Error stopping stream:', error);
        }
    });
}

// --- UI update functions (shared across all pages) ---

function updateStreamStatus(isActive) {
    const statusText = document.getElementById('status-text');
    const startBtn = document.getElementById('start-stream-btn');
    const stopBtn = document.getElementById('stop-stream-btn');

    if (statusText) {
        statusText.textContent = isActive ? 'Active' : 'Inactive';
        statusText.style.color = isActive ? '#00ff00' : '#ff0000';
    }
    if (startBtn) {
        startBtn.disabled = isActive;
        startBtn.style.opacity = isActive ? '0.5' : '1';
    }
    if (stopBtn) {
        stopBtn.disabled = !isActive;
        stopBtn.style.opacity = isActive ? '1' : '0.5';
    }
}

function updateIRacingStatus(isConnected) {
    const el = document.getElementById('iracing-status');
    if (el) {
        el.textContent = isConnected ? 'Connected' : 'Disconnected';
        el.style.color = isConnected ? '#00ff00' : '#ff0000';
    }
}

// --- Start/Stop button handlers (work from any page) ---

document.getElementById('start-stream-btn')?.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/stream/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        console.log('Start response:', data);

        if (data.status === 'success' || data.status === 'already_running') {
            updateStreamStatus(true);
            if (data.iracing_connected !== undefined) {
                updateIRacingStatus(data.iracing_connected);
            }
        }
    } catch (error) {
        console.error('Error starting stream:', error);
    }
});

document.getElementById('stop-stream-btn')?.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/stream/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        console.log('Stop response:', data);

        if (data.status === 'success' || data.status === 'not_running') {
            updateStreamStatus(false);
            updateIRacingStatus(false);
            // Reset manager only if it exists on this page
            if (typeof manager !== 'undefined') {
                manager.reset();
            }
        }
    } catch (error) {
        console.error('Error stopping stream:', error);
    }
});

// --- Initial status check (runs on every page) ---

async function checkStreamStatus() {
    try {
        const response = await fetch('/api/stream/status');
        const data = await response.json();
        updateStreamStatus(data.is_running);
        if (data.iracing_connected !== undefined) {
            updateIRacingStatus(data.iracing_connected);
        }
    } catch (error) {
        console.error('Error checking stream status:', error);
    }
}

checkStreamStatus();