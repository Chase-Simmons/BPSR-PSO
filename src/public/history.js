// Fight History Window JavaScript
const SERVER_URL = 'localhost:8990';

// Color system (same as main script)
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

// State variables
let currentView = 'history'; // 'cumulative', 'history'
let fightHistory = [];
let cumulativeStats = null;
let allUsers = {};
let userColors = {};

// DOM elements
const columnsContainer = document.getElementById('columnsContainer');
const historyContainer = document.getElementById('historyContainer');
const cumulativeView = document.getElementById('cumulativeView');
const fightListView = document.getElementById('fightListView');
const cumulativeStatsDiv = document.getElementById('cumulativeStats');
const fightList = document.getElementById('fightList');

// Utility functions (same as main script)
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

// Initialize the history window
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the view to show history by default
    currentView = 'history';
    columnsContainer.classList.add('hidden');
    historyContainer.classList.remove('hidden');
    updateHistoryView();
    
    loadFightHistory();
    
    // Handle close button
    const closeButton = document.getElementById('closeButton');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            window.close();
        });
    }
});

// Load fight history data
async function loadFightHistory() {
    try {
        console.log('Loading fight history...');
        
        // Load fight list
        const fightResponse = await fetch(`http://${SERVER_URL}/api/fight/list`);
        const fightData = await fightResponse.json();
        
        if (fightData.code === 0) {
            fightHistory = fightData.data || [];
            console.log('Loaded fight history:', fightHistory);
        }
        
        // Load cumulative stats
        const cumulativeResponse = await fetch(`http://${SERVER_URL}/api/fight/cumulative`);
        const cumulativeData = await cumulativeResponse.json();
        
        if (cumulativeData.code === 0) {
            cumulativeStats = cumulativeData.data;
            console.log('Loaded cumulative stats:', cumulativeStats);
        }
        
        // Current fight data not needed in history window
        
        // Update the current view
        updateHistoryView();
        
    } catch (error) {
        console.error('Error loading fight history:', error);
    }
}

// Current fight functions removed - not needed in history window

// Render cumulative statistics
function renderCumulativeStats() {
    if (!cumulativeStats) {
        cumulativeStatsDiv.innerHTML = `
            <h3>Cumulative Statistics</h3>
            <p>No cumulative data available</p>
        `;
        return;
    }
    
    const totalFights = fightHistory.length;
    const totalDamage = cumulativeStats.totalDamage || 0;
    const totalHealing = cumulativeStats.totalHealing || 0;
    const totalDuration = cumulativeStats.totalDuration || 0;
    
    cumulativeStatsDiv.innerHTML = `
        <h3>Cumulative Statistics</h3>
        <div class="stat-item">
            <span class="stat-label">Total Fights:</span>
            <span class="stat-value">${totalFights}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Damage:</span>
            <span class="stat-value">${formatNumber(totalDamage)}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Healing:</span>
            <span class="stat-value">${formatNumber(totalHealing)}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Duration:</span>
            <span class="stat-value">${Math.floor(totalDuration / 1000)}s</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Average Fight Duration:</span>
            <span class="stat-value">${totalFights > 0 ? Math.floor(totalDuration / totalFights / 1000) : 0}s</span>
        </div>
    `;
}

// Render fight list
function renderFightList() {
    if (!fightHistory || fightHistory.length === 0) {
        fightList.innerHTML = '<p>No fight history available</p>';
        return;
    }
    
    fightList.innerHTML = '';
    
    fightHistory.forEach(fight => {
        const fightItem = document.createElement('div');
        fightItem.className = 'fight-item';
        fightItem.onclick = () => viewFight(fight.id);
        
        const startTime = new Date(fight.startTime);
        const duration = Math.floor(fight.duration / 1000);
        
        const totalDamage = fight.totalDamage || 0;
        const totalHealing = fight.totalHealing || 0;
        
        fightItem.innerHTML = `
            <div class="fight-item-info">
                <div class="fight-item-id">Fight ${fight.id}</div>
                <div class="fight-item-time">${startTime.toLocaleString()}</div>
            </div>
            <div class="fight-item-stats">
                <div class="fight-item-damage">Damage: ${formatNumber(totalDamage)}</div>
                <div class="fight-item-healing">Healing: ${formatNumber(totalHealing)}</div>
                <div class="fight-item-duration">Duration: ${duration}s</div>
            </div>
        `;
        
        fightList.appendChild(fightItem);
    });
}

// View a specific fight
async function viewFight(fightId) {
    try {
        console.log(`Loading fight data for: ${fightId}`);
        const response = await fetch(`http://${SERVER_URL}/api/fight/${fightId}`);
        const data = await response.json();
        
        console.log('Fight data response:', data);
        
        if (data.code === 0) {
            // Hide history container and show damage meter
            historyContainer.classList.add('hidden');
            columnsContainer.classList.remove('hidden');
            
            // Transform historical user data to match current format
            allUsers = {};
            userColors = {};
            
            if (data.data.userStats) {
                console.log('User stats found:', data.data.userStats);
                
                for (const [uid, userData] of Object.entries(data.data.userStats)) {
                    let totalDamage = 0;
                    let totalHealing = 0;
                    let totalCount = 0;
                    
                    // Parse damage
                    if (typeof userData.total_damage === 'object' && userData.total_damage !== null) {
                        totalDamage = userData.total_damage.total || 0;
                    } else if (typeof userData.total_damage === 'string') {
                        try {
                            let damageStr = userData.total_damage;
                            if (damageStr.startsWith('@{') && damageStr.endsWith('}')) {
                                damageStr = damageStr.slice(2, -1);
                                damageStr = damageStr.replace(/(\w+)=/g, '"$1":');
                                damageStr = damageStr.replace(/;/g, ',');
                                damageStr = '{' + damageStr + '}';
                            }
                            const damageObj = JSON.parse(damageStr);
                            totalDamage = damageObj.total || 0;
                        } catch (e) {
                            console.warn('Failed to parse total_damage string:', userData.total_damage);
                            totalDamage = 0;
                        }
                    }
                    
                    // Parse healing
                    if (typeof userData.total_healing === 'object' && userData.total_healing !== null) {
                        totalHealing = userData.total_healing.total || 0;
                    } else if (typeof userData.total_healing === 'string') {
                        try {
                            let healingStr = userData.total_healing;
                            if (healingStr.startsWith('@{') && healingStr.endsWith('}')) {
                                healingStr = healingStr.slice(2, -1);
                                healingStr = healingStr.replace(/(\w+)=/g, '"$1":');
                                healingStr = healingStr.replace(/;/g, ',');
                                healingStr = '{' + healingStr + '}';
                            }
                            const healingObj = JSON.parse(healingStr);
                            totalHealing = healingObj.total || 0;
                        } catch (e) {
                            console.warn('Failed to parse total_healing string:', userData.total_healing);
                            totalHealing = 0;
                        }
                    }
                    
                    // Parse count
                    if (typeof userData.total_count === 'object' && userData.total_count !== null) {
                        totalCount = userData.total_count.total || 0;
                    } else if (typeof userData.total_count === 'string') {
                        try {
                            let countStr = userData.total_count;
                            if (countStr.startsWith('@{') && countStr.endsWith('}')) {
                                countStr = countStr.slice(2, -1);
                                countStr = countStr.replace(/(\w+)=/g, '"$1":');
                                countStr = countStr.replace(/;/g, ',');
                                countStr = '{' + countStr + '}';
                            }
                            const countObj = JSON.parse(countStr);
                            totalCount = countObj.total || 0;
                        } catch (e) {
                            console.warn('Failed to parse total_count string:', userData.total_count);
                            totalCount = 0;
                        }
                    }
                    
                    allUsers[uid] = {
                        id: uid,
                        uid: uid,
                        name: userData.name || 'Unknown',
                        profession: userData.profession || 'Unknown',
                        total_damage: { total: totalDamage },
                        total_healing: { total: totalHealing },
                        total_count: { total: totalCount },
                        total_dps: userData.total_dps || 0,
                        total_hps: userData.total_hps || 0,
                        hp: userData.hp || 0,
                        max_hp: userData.max_hp || 0,
                        fightPoint: userData.fightPoint || 0,
                        dead_count: userData.dead_count || 0,
                        taken_damage: userData.taken_damage || 0
                    };
                }
                
                console.log(`Loaded fight ${fightId} with ${Object.keys(allUsers).length} users:`, allUsers);
                updateAll();
            } else {
                console.log('No user stats found in fight data');
                allUsers = {};
                updateAll();
            }
        } else {
            console.error('Failed to load fight data:', data.msg);
            alert('Failed to load fight data: ' + data.msg);
        }
    } catch (error) {
        console.error('Error loading fight:', error);
        alert('Error loading fight: ' + error.message);
    }
}

// View functions
function viewCumulativeStats() {
    currentView = 'cumulative';
    columnsContainer.classList.add('hidden');
    historyContainer.classList.remove('hidden');
    updateHistoryView();
    renderCumulativeStats();
}

function viewFightHistory() {
    currentView = 'history';
    columnsContainer.classList.add('hidden');
    historyContainer.classList.remove('hidden');
    updateHistoryView();
    renderFightList();
}

// Update history view
function updateHistoryView() {
    // Hide all views
    cumulativeView.classList.add('hidden');
    fightListView.classList.add('hidden');
    
    // Remove active class from all buttons
    document.getElementById('viewCumulativeButton').classList.remove('active');
    document.getElementById('viewHistoryButton').classList.remove('active');
    
    // Show current view and set active button
    if (currentView === 'cumulative') {
        cumulativeView.classList.remove('hidden');
        document.getElementById('viewCumulativeButton').classList.add('active');
    } else if (currentView === 'history') {
        fightListView.classList.remove('hidden');
        document.getElementById('viewHistoryButton').classList.add('active');
    }
}

// Clear fight history
async function clearFightHistory() {
    if (!confirm('Are you sure you want to clear all fight history? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`http://${SERVER_URL}/api/fight/clear`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.code === 0) {
            console.log('Fight history cleared');
            fightHistory = [];
            cumulativeStats = null;
            updateHistoryView();
            renderFightList();
            renderCumulativeStats();
        } else {
            console.error('Failed to clear fight history:', data.msg);
            alert('Failed to clear fight history: ' + data.msg);
        }
    } catch (error) {
        console.error('Error clearing fight history:', error);
        alert('Error clearing fight history: ' + error.message);
    }
}

// Utility function
function formatNumber(num) {
    if (isNaN(num)) return 'NaN';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}
