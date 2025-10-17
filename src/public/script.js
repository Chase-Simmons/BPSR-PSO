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
const historyButton = document.getElementById('historyButton');
const closeButton = document.getElementById('closeButton');
const allButtons = [clearButton, pauseButton, helpButton, settingsButton, historyButton, closeButton];
const serverStatus = document.getElementById('serverStatus');
const opacitySlider = document.getElementById('opacitySlider');
const timeoutSlider = document.getElementById('timeoutSlider');
const timeoutValue = document.getElementById('timeoutValue');

let allUsers = {};
let userColors = {};
let isPaused = false;
let socket = null;
let isWebSocketConnected = false;
let lastWebSocketMessage = Date.now();
const WEBSOCKET_RECONNECT_INTERVAL = 5000;

const SERVER_URL = 'localhost:8990';

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

    socket.on('data_cleared', () => {
        console.log('Data cleared - new fight started');
        allUsers = {};
        userColors = {};
        updateAll();
    });

    socket.on('new_fight_started', (data) => {
        console.log(`New fight started: ${data.fightId}`);
        allUsers = {};
        userColors = {};
        updateAll();
    });

    socket.on('fight_ended', () => {
        console.log('Fight ended - clearing main window');
        allUsers = {};
        userColors = {};
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

function updateTimeoutValue() {
    console.log('Updating timeout display to:', timeoutSlider.value);
    timeoutValue.textContent = timeoutSlider.value;
}

async function updateFightTimeout(seconds) {
    try {
        console.log(`Updating fight timeout to ${seconds} seconds (${seconds * 1000}ms)`);
        const response = await fetch(`http://${SERVER_URL}/api/fight/timeout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ timeout: seconds * 1000 }) // Convert to milliseconds
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log(`Fight timeout updated successfully:`, result);
        } else {
            console.error('Failed to update fight timeout:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('Error updating fight timeout:', error);
    }
}

// Fight History Functions
function toggleHistory() {
    // Open history window using Electron API
    window.electronAPI.openHistoryWindow();
}

document.addEventListener('DOMContentLoaded', () => {
    initialize();

    setBackgroundOpacity(opacitySlider.value);

    opacitySlider.addEventListener('input', (event) => {
        setBackgroundOpacity(event.target.value);
    });

    // Initialize timeout slider
    console.log('Timeout slider element:', timeoutSlider);
    console.log('Timeout value element:', timeoutValue);
    updateTimeoutValue();
    timeoutSlider.addEventListener('input', (event) => {
        console.log('Timeout slider changed to:', event.target.value);
        updateTimeoutValue();
        updateFightTimeout(parseInt(event.target.value));
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
});

window.clearData = clearData;
window.togglePause = togglePause;
window.toggleSettings = toggleSettings;
window.toggleHistory = toggleHistory;
window.closeClient = closeClient;
window.toggleHelp = toggleHelp;
