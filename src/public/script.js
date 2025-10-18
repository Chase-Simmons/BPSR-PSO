const colorHues = [
    210, // Blue
    30, // Orange
    270, // Purple
    150, // Teal
    330, // Magenta
    60, // Yellow
    180, // Cyan
    0, // Red
    240, // Indigo
];

let colorIndex = 0;

function getNextColorShades() {
    const h = colorHues[colorIndex];
    colorIndex = (colorIndex + 1) % colorHues.length;
    const s = 90;
    const l_dps = 30;
    const l_hps = 20;

    const dpsColor = `hsl(${h}, ${s}%, ${l_dps}%)`;
    const hpsColor = `hsl(${h}, ${s}%, ${l_hps}%)`;
    return { dps: dpsColor, hps: hpsColor };
}

const columnsContainer = document.getElementById('columnsContainer');
const settingsContainer = document.getElementById('settingsContainer');
const helpContainer = document.getElementById('helpContainer');
const passthroughTitle = document.getElementById('passthroughTitle');
const pauseButton = document.getElementById('pauseButton');
const clearButton = document.getElementById('clearButton');
const helpButton = document.getElementById('helpButton');
const settingsButton = document.getElementById('settingsButton');
const closeButton = document.getElementById('closeButton');
const allButtons = [clearButton, pauseButton, helpButton, settingsButton, closeButton];
const serverStatus = document.getElementById('serverStatus');
const opacitySlider = document.getElementById('opacitySlider');
const keybindList = document.getElementById('keybindList');

let allUsers = {};
let userColors = {};
let isPaused = false;
let socket = null;
let isWebSocketConnected = false;
let lastWebSocketMessage = Date.now();
const WEBSOCKET_RECONNECT_INTERVAL = 5000;

const SERVER_URL = 'localhost:8990';

// Keybind management
let currentKeybinds = {};
let isRecordingKeybind = false;
let currentRecordingElement = null;

function formatNumber(num) {
    if (isNaN(num)) return 'NaN';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.round(num).toString();
}

function renderDataList(users) {
    columnsContainer.innerHTML = '';

    const totalDamageOverall = users.reduce((sum, user) => sum + user.total_damage.total, 0);
    const totalHealingOverall = users.reduce((sum, user) => sum + user.total_healing.total, 0);

    users.sort((a, b) => b.total_dps - a.total_dps);

    users.forEach((user, index) => {
        if (!userColors[user.id]) {
            userColors[user.id] = getNextColorShades();
        }
        const colors = userColors[user.id];
        const item = document.createElement('li');

        item.className = 'data-item';
        const damagePercent = totalDamageOverall > 0 ? (user.total_damage.total / totalDamageOverall) * 100 : 0;
        const healingPercent = totalHealingOverall > 0 ? (user.total_healing.total / totalHealingOverall) * 100 : 0;

        const displayName = user.fightPoint ? `${user.name} (${user.fightPoint})` : user.name;

        let classIconHtml = '';
        const professionString = user.profession ? user.profession.trim() : '';
        if (professionString) {
            const mainProfession = professionString.split('(')[0].trim();
            const iconFileName = mainProfession.toLowerCase().replace(/ /g, '_') + '.png';
            classIconHtml = `<img src="assets/${iconFileName}" class="class-icon" alt="${mainProfession}" onerror="this.style.display='none'">`;
        }

        let subBarHtml = '';
        if (user.total_healing.total > 0 || user.total_hps > 0) {
            subBarHtml = `
                <div class="sub-bar">
                    <div class="hps-bar-fill" style="width: ${healingPercent}%; background-color: ${colors.hps};"></div>
                    <div class="hps-stats">
                       ${formatNumber(user.total_healing.total)} (${formatNumber(user.total_hps)} HPS, ${healingPercent.toFixed(1)}%)
                    </div>
                </div>
            `;
        }

        item.innerHTML = `
            <div class="main-bar">
                <div class="dps-bar-fill" style="width: ${damagePercent}%; background-color: ${colors.dps};"></div>
                <div class="content">
                    <span class="rank">${index + 1}.</span>
                    ${classIconHtml}
                    <span class="name">${displayName}</span>
                    <span class="stats">${formatNumber(user.total_damage.total)} (${formatNumber(user.total_dps)} DPS, ${damagePercent.toFixed(1)}%)</span>
                </div>
            </div>
            ${subBarHtml}
        `;
        columnsContainer.appendChild(item);
    });
}

function updateAll() {
    const usersArray = Object.values(allUsers).filter((user) => user.total_dps > 0 || user.total_hps > 0);
    renderDataList(usersArray);
}

function processDataUpdate(data) {
    if (isPaused) return;
    if (!data.user) {
        console.warn('Received data without a "user" object:', data);
        return;
    }

    for (const userId in data.user) {
        const newUser = data.user[userId];
        const existingUser = allUsers[userId] || {};

        const updatedUser = {
            ...existingUser,
            ...newUser,
            id: userId,
        };

        const hasNewValidName = newUser.name && typeof newUser.name === 'string' && newUser.name !== '未知';
        if (hasNewValidName) {
            updatedUser.name = newUser.name;
        } else if (!existingUser.name || existingUser.name === '...') {
            updatedUser.name = '...';
        }

        const hasNewProfession = newUser.profession && typeof newUser.profession === 'string';
        if (hasNewProfession) {
            updatedUser.profession = newUser.profession;
        } else if (!existingUser.profession) {
            updatedUser.profession = '';
        }

        const hasNewFightPoint = newUser.fightPoint !== undefined && typeof newUser.fightPoint === 'number';
        if (hasNewFightPoint) {
            updatedUser.fightPoint = newUser.fightPoint;
        } else if (existingUser.fightPoint === undefined) {
            updatedUser.fightPoint = 0;
        }

        allUsers[userId] = updatedUser;
    }

    updateAll();
}

async function clearData() {
    try {
        const currentStatus = getServerStatus();
        showServerStatus('cleared');

        const response = await fetch(`http://${SERVER_URL}/api/clear`);
        const result = await response.json();

        if (result.code === 0) {
            allUsers = {};
            userColors = {};
            updateAll();
            showServerStatus('cleared');
            console.log('Data cleared successfully.');
        } else {
            console.error('Failed to clear data on server:', result.msg);
        }

        setTimeout(() => showServerStatus(currentStatus), 1000);
    } catch (error) {
        console.error('Error sending clear request to server:', error);
    }
}

function togglePause() {
    isPaused = !isPaused;
    pauseButton.innerText = isPaused ? 'Resume' : 'Pause';
    showServerStatus(isPaused ? 'paused' : 'connected');
}

function closeClient() {
    window.electronAPI.closeClient();
}

function showServerStatus(status) {
    const statusElement = document.getElementById('serverStatus');
    statusElement.className = `status-indicator ${status}`;
}

function getServerStatus() {
    const statusElement = document.getElementById('serverStatus');
    return statusElement.className.replace('status-indicator ', '');
}

function connectWebSocket() {
    socket = io(`ws://${SERVER_URL}`);

    socket.on('connect', () => {
        isWebSocketConnected = true;
        showServerStatus('connected');
        lastWebSocketMessage = Date.now();
    });

    socket.on('disconnect', () => {
        isWebSocketConnected = false;
        showServerStatus('disconnected');
    });

    socket.on('data', (data) => {
        processDataUpdate(data);
        lastWebSocketMessage = Date.now();
    });

    socket.on('user_deleted', (data) => {
        console.log(`User ${data.uid} was removed due to inactivity.`);
        delete allUsers[data.uid];
        updateAll();
    });

    socket.on('connect_error', (error) => {
        showServerStatus('disconnected');
        console.error('WebSocket connection error:', error);
    });
}

function checkConnection() {
    if (!isWebSocketConnected && socket && socket.disconnected) {
        showServerStatus('reconnecting');
        socket.connect();
    }

    if (isWebSocketConnected && Date.now() - lastWebSocketMessage > WEBSOCKET_RECONNECT_INTERVAL) {
        isWebSocketConnected = false;
        if (socket) socket.disconnect();
        connectWebSocket();
        showServerStatus('reconnecting');
    }
}

function initialize() {
    connectWebSocket();
    setInterval(checkConnection, WEBSOCKET_RECONNECT_INTERVAL);
}

function toggleSettings() {
    const isSettingsVisible = !settingsContainer.classList.contains('hidden');

    if (isSettingsVisible) {
        settingsContainer.classList.add('hidden');
        columnsContainer.classList.remove('hidden');
    } else {
        settingsContainer.classList.remove('hidden');
        columnsContainer.classList.add('hidden');
        helpContainer.classList.add('hidden'); // Also hide help
    }
}

function toggleHelp() {
    const isHelpVisible = !helpContainer.classList.contains('hidden');
    if (isHelpVisible) {
        helpContainer.classList.add('hidden');
        columnsContainer.classList.remove('hidden');
    } else {
        helpContainer.classList.remove('hidden');
        columnsContainer.classList.add('hidden');
        settingsContainer.classList.add('hidden'); // Also hide settings
    }
}

function setBackgroundOpacity(value) {
    document.documentElement.style.setProperty('--main-bg-opacity', value);
}

// Keybind management functions
async function loadKeybinds() {
    try {
        currentKeybinds = await window.electronAPI.getKeybinds();
        renderKeybindList();
    } catch (error) {
        console.error('Failed to load keybinds:', error);
    }
}

function renderKeybindList() {
    keybindList.innerHTML = '';
    
    const keybindLabels = {
        togglePassthrough: 'Toggle Mouse Pass-through',
        minimizeWindow: 'Minimize Window Content',
        resizeUp: 'Resize Window Up',
        resizeDown: 'Resize Window Down',
        resizeLeft: 'Resize Window Left',
        resizeRight: 'Resize Window Right',
        moveUp: 'Move Window Up',
        moveDown: 'Move Window Down',
        moveLeft: 'Move Window Left',
        moveRight: 'Move Window Right',
        pauseResume: 'Pause/Resume Statistics',
        clearData: 'Clear Data'
    };
    
    Object.entries(currentKeybinds).forEach(([keybindName, shortcut]) => {
        const item = document.createElement('div');
        item.className = 'keybind-item';
        
        const label = document.createElement('span');
        label.className = 'keybind-label';
        label.textContent = keybindLabels[keybindName] || keybindName;
        
        const shortcutElement = document.createElement('span');
        shortcutElement.className = 'keybind-shortcut';
        shortcutElement.textContent = shortcut;
        shortcutElement.dataset.keybindName = keybindName;
        shortcutElement.addEventListener('click', () => startRecordingKeybind(keybindName, shortcutElement));
        
        item.appendChild(label);
        item.appendChild(shortcutElement);
        keybindList.appendChild(item);
    });
}

async function startRecordingKeybind(keybindName, element) {
    if (isRecordingKeybind) {
        await stopRecordingKeybind();
    }
    
    isRecordingKeybind = true;
    currentRecordingElement = element;
    element.classList.add('recording');
    element.textContent = 'Press a key...';
    
    // Disable all keybinds temporarily
    try {
        await window.electronAPI.disableKeybinds();
    } catch (error) {
        console.error('Failed to disable keybinds:', error);
    }
    
    // Add global keydown listener
    document.addEventListener('keydown', handleKeybindRecording, true);
}

async function stopRecordingKeybind() {
    if (currentRecordingElement) {
        currentRecordingElement.classList.remove('recording');
        currentRecordingElement.textContent = currentKeybinds[currentRecordingElement.dataset.keybindName];
    }
    
    isRecordingKeybind = false;
    currentRecordingElement = null;
    document.removeEventListener('keydown', handleKeybindRecording, true);
    
    // Re-enable all keybinds
    try {
        await window.electronAPI.enableKeybinds();
    } catch (error) {
        console.error('Failed to enable keybinds:', error);
    }
}

async function handleKeybindRecording(event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!isRecordingKeybind || !currentRecordingElement) return;
    
    const keybindName = currentRecordingElement.dataset.keybindName;
    const modifiers = [];
    
    if (event.ctrlKey) modifiers.push('Control');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.metaKey) modifiers.push('Meta');
    
    let key = event.key;
    
    // Handle special keys
    if (key === ' ') key = 'Space';
    if (key === 'ArrowUp') key = 'Up';
    if (key === 'ArrowDown') key = 'Down';
    if (key === 'ArrowLeft') key = 'Left';
    if (key === 'ArrowRight') key = 'Right';
    
    // Skip modifier-only keys
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return;
    
    const newShortcut = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
    
    // Check if shortcut is already in use
    const isAlreadyUsed = Object.entries(currentKeybinds).some(([name, shortcut]) => 
        name !== keybindName && shortcut === newShortcut
    );
    
    if (isAlreadyUsed) {
        currentRecordingElement.classList.add('error');
        currentRecordingElement.textContent = 'Already used';
        setTimeout(async () => {
            currentRecordingElement.classList.remove('error');
            await stopRecordingKeybind();
        }, 1500);
        return;
    }
    
    // Update the keybind
    await updateKeybind(keybindName, newShortcut);
    await stopRecordingKeybind();
}

async function updateKeybind(keybindName, newShortcut) {
    try {
        const success = await window.electronAPI.updateKeybind(keybindName, newShortcut);
        if (success) {
            currentKeybinds[keybindName] = newShortcut;
            currentRecordingElement.textContent = newShortcut;
        } else {
            currentRecordingElement.classList.add('error');
            currentRecordingElement.textContent = 'Failed';
            setTimeout(async () => {
                currentRecordingElement.classList.remove('error');
                await stopRecordingKeybind();
            }, 1500);
        }
    } catch (error) {
        console.error('Failed to update keybind:', error);
        currentRecordingElement.classList.add('error');
        currentRecordingElement.textContent = 'Error';
        setTimeout(async () => {
            currentRecordingElement.classList.remove('error');
            await stopRecordingKeybind();
        }, 1500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initialize();

    setBackgroundOpacity(opacitySlider.value);

    opacitySlider.addEventListener('input', (event) => {
        setBackgroundOpacity(event.target.value);
    });

    // Load keybinds when settings are opened
    settingsButton.addEventListener('click', () => {
        if (!settingsContainer.classList.contains('hidden')) {
            loadKeybinds();
        }
    });

    // Listen for the passthrough toggle event from the main process
    window.electronAPI.onTogglePassthrough((isIgnoring) => {
        if (isIgnoring) {
            allButtons.forEach((button) => {
                button.classList.add('hidden');
            });
            passthroughTitle.classList.remove('hidden');
            columnsContainer.classList.remove('hidden');
            settingsContainer.classList.add('hidden');
            helpContainer.classList.add('hidden');
        } else {
            allButtons.forEach((button) => {
                button.classList.remove('hidden');
            });
            passthroughTitle.classList.add('hidden');
        }
    });

    // Listen for keybind-triggered actions
    window.electronAPI.onTriggerPauseResume(() => {
        togglePause();
    });

    window.electronAPI.onTriggerClearData(() => {
        clearData();
    });
});

window.clearData = clearData;
window.togglePause = togglePause;
window.toggleSettings = toggleSettings;
window.closeClient = closeClient;
window.toggleHelp = toggleHelp;
