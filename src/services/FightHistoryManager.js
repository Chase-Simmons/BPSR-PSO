import { Lock } from '../models/Lock.js';
import logger from './Logger.js';
import fsPromises from 'fs/promises';
import path from 'path';

class FightHistoryManager {
    constructor() {
        this.fights = new Map(); // Map of fightId -> fight data
        this.currentFightId = null;
        this.currentFightStartTime = null;
        this.lastActivityTime = 0;
        this.fightTimeout = 15000; // 15 seconds
        this.fightLock = new Lock();
        
        // Cumulative stats across all fights
        this.cumulativeStats = {
            totalDamage: 0,
            totalHealing: 0,
            totalFights: 0,
            totalDuration: 0,
            startTime: Date.now()
        };
        
        // Auto-save interval
        setInterval(() => {
            this.saveFightHistory();
        }, 30 * 1000); // Save every 30 seconds
    }

    /**
     * Record activity (damage or healing) and manage fight sessions
     * @param {number} timestamp - Current timestamp
     * @param {string} activityType - Type of activity ('damage' or 'healing')
     * @param {number} value - Value of the activity
     */
    recordActivity(timestamp, activityType, value) {
        // Check if we need to start a new fight due to inactivity
        const shouldStartNewFight = !this.currentFightId || (this.lastActivityTime > 0 && (timestamp - this.lastActivityTime) > this.fightTimeout);
        
        if (shouldStartNewFight) {
            logger.info(`Starting new fight due to ${!this.currentFightId ? 'no current fight' : 'inactivity'}. Gap: ${this.lastActivityTime > 0 ? timestamp - this.lastActivityTime : 'N/A'}ms`);
            this.startNewFight(timestamp).catch(error => {
                logger.error('Error starting new fight:', error);
            });
        }
        
        // Update last activity time
        this.lastActivityTime = timestamp;
        
        // Update current fight stats
        if (this.currentFightId) {
            this.updateCurrentFightStats(activityType, value);
        }
    }

    /**
     * Start a new fight session
     * @param {number} timestamp - Start timestamp
     */
    async startNewFight(timestamp) {
        await this.fightLock.acquire();
        try {
            // Save previous fight if it exists
            if (this.currentFightId) {
                logger.info(`Finalizing previous fight: ${this.currentFightId}`);
                this.finalizeCurrentFight();
            }
            
            // Clear current fight references
            this.currentFightId = null;
            this.currentFightStartTime = null;
            
            // Create new fight
            this.currentFightId = `fight_${timestamp}`;
            this.currentFightStartTime = timestamp;
            
            this.fights.set(this.currentFightId, {
                id: this.currentFightId,
                startTime: timestamp,
                endTime: null,
                duration: 0,
                totalDamage: 0,
                totalHealing: 0,
                userStats: new Map(), // Will store user data snapshots
                isActive: true
            });
            
            logger.info(`Started new fight: ${this.currentFightId} at ${new Date(timestamp).toISOString()}`);
            
            // Emit new fight event to frontend
            this.emitNewFightEvent();
        } finally {
            this.fightLock.release();
        }
    }

    /**
     * Emit new fight event to frontend
     */
    emitNewFightEvent() {
        // Import socket dynamically to avoid circular dependency
        import('./Socket.js').then(socketModule => {
            const socket = socketModule.default;
            socket.emit('new_fight_started', {
                fightId: this.currentFightId,
                startTime: this.currentFightStartTime
            });
            logger.info(`Emitted new_fight_started event for fight: ${this.currentFightId}`);
        }).catch(error => {
            logger.error('Error emitting new fight event:', error);
        });
    }

    /**
     * Update current fight statistics
     * @param {string} activityType - Type of activity
     * @param {number} value - Value of the activity
     */
    updateCurrentFightStats(activityType, value) {
        if (!this.currentFightId) {
            logger.warn(`No current fight ID when trying to update stats for ${activityType}: ${value}`);
            return;
        }
        
        const fight = this.fights.get(this.currentFightId);
        if (!fight) {
            logger.warn(`No fight found for ID: ${this.currentFightId}`);
            return;
        }
        
        if (activityType === 'damage') {
            fight.totalDamage += value;
        } else if (activityType === 'healing') {
            fight.totalHealing += value;
        }
        
        fight.endTime = Date.now();
        fight.duration = fight.endTime - fight.startTime;
        
        logger.debug(`Updated fight ${this.currentFightId}: ${activityType} +${value}, total: ${fight.totalDamage} damage, ${fight.totalHealing} healing`);
    }

    /**
     * Finalize the current fight and save it
     */
    finalizeCurrentFight() {
        if (!this.currentFightId) return;
        
        const fight = this.fights.get(this.currentFightId);
        if (!fight) return;
        
        fight.endTime = Date.now();
        fight.duration = fight.endTime - fight.startTime;
        fight.isActive = false;
        
        // Update cumulative stats
        this.cumulativeStats.totalDamage += fight.totalDamage;
        this.cumulativeStats.totalHealing += fight.totalHealing;
        this.cumulativeStats.totalFights++;
        this.cumulativeStats.totalDuration += fight.duration;
        
        logger.info(`Finalized fight: ${this.currentFightId} (${fight.duration}ms, ${fight.totalDamage} damage, ${fight.totalHealing} healing)`);
        
        // Don't clear currentFightId here - let startNewFight handle it
    }

    /**
     * Save a snapshot of current user data to the active fight
     * @param {Map} userData - Current user data map
     */
    saveUserDataSnapshot(userData) {
        if (!this.currentFightId) return;
        
        const fight = this.fights.get(this.currentFightId);
        if (!fight) return;
        
        // Convert Map to plain object for storage
        const userSnapshot = {};
        for (const [uid, user] of userData.entries()) {
            const summary = user.getSummary();
            // Debug: Check if the summary contains string representations
            if (typeof summary.total_damage === 'string' || typeof summary.total_healing === 'string') {
                logger.warn(`User ${uid} summary contains string data:`, {
                    total_damage_type: typeof summary.total_damage,
                    total_healing_type: typeof summary.total_healing,
                    total_damage: summary.total_damage,
                    total_healing: summary.total_healing
                });
            }
            userSnapshot[uid] = summary;
        }
        
        fight.userStats = userSnapshot;
    }

    /**
     * Get current fight data
     * @returns {Object|null} Current fight data or null
     */
    getCurrentFight() {
        if (!this.currentFightId) return null;
        return this.fights.get(this.currentFightId);
    }

    /**
     * Get current fight status for debugging
     * @returns {Object} Current fight status
     */
    getCurrentFightStatus() {
        return {
            currentFightId: this.currentFightId,
            currentFightStartTime: this.currentFightStartTime,
            lastActivityTime: this.lastActivityTime,
            timeSinceLastActivity: this.lastActivityTime > 0 ? Date.now() - this.lastActivityTime : 0,
            fightTimeout: this.fightTimeout,
            totalFights: this.fights.size
        };
    }

    /**
     * Get all fights (excluding current active fight)
     * @returns {Array} Array of completed fights
     */
    getAllFights() {
        const completedFights = [];
        for (const [fightId, fight] of this.fights.entries()) {
            if (!fight.isActive) {
                completedFights.push({
                    id: fight.id,
                    startTime: fight.startTime,
                    endTime: fight.endTime,
                    duration: fight.duration,
                    totalDamage: fight.totalDamage,
                    totalHealing: fight.totalHealing,
                    userCount: Object.keys(fight.userStats).length
                });
            }
        }
        
        // Sort by start time (newest first)
        return completedFights.sort((a, b) => b.startTime - a.startTime);
    }

    /**
     * Get specific fight data
     * @param {string} fightId - Fight ID
     * @returns {Object|null} Fight data or null
     */
    getFightData(fightId) {
        const fightData = this.fights.get(fightId);
        if (fightData) {
            logger.info(`Retrieved fight data for ${fightId}:`, {
                hasUserStats: !!fightData.userStats,
                userStatsKeys: fightData.userStats ? Object.keys(fightData.userStats) : [],
                totalDamage: fightData.totalDamage,
                totalHealing: fightData.totalHealing
            });
            
            // Debug: Check if userStats contains string representations
            if (fightData.userStats) {
                for (const [uid, userData] of Object.entries(fightData.userStats)) {
                    if (typeof userData.total_damage === 'string' || typeof userData.total_healing === 'string') {
                        logger.warn(`Fight ${fightId} user ${uid} has string data:`, {
                            total_damage_type: typeof userData.total_damage,
                            total_healing_type: typeof userData.total_healing,
                            total_damage: userData.total_damage,
                            total_healing: userData.total_healing
                        });
                    }
                }
            }
        } else {
            logger.warn(`No fight data found for ID: ${fightId}`);
        }
        return fightData || null;
    }

    /**
     * Get cumulative statistics across all fights
     * @returns {Object} Cumulative stats
     */
    getCumulativeStats() {
        return {
            ...this.cumulativeStats,
            currentFight: this.getCurrentFight(),
            totalFights: this.fights.size
        };
    }

    /**
     * Save fight history to disk
     */
    async saveFightHistory() {
        try {
            const historyDir = './logs/fight_history';
            await fsPromises.mkdir(historyDir, { recursive: true });
            
            // Convert Map to plain object with proper serialization
            const fightsObject = {};
            for (const [fightId, fight] of this.fights.entries()) {
                fightsObject[fightId] = {
                    ...fight,
                    userStats: fight.userStats || {}
                };
            }
            
            const historyData = {
                fights: fightsObject,
                cumulativeStats: this.cumulativeStats,
                lastSaved: Date.now()
            };
            
            const historyFile = path.join(historyDir, 'fight_history.json');
            await fsPromises.writeFile(historyFile, JSON.stringify(historyData, null, 2), 'utf8');
            
            logger.debug('Fight history saved to disk');
        } catch (error) {
            logger.error('Failed to save fight history:', error);
        }
    }

    /**
     * Load fight history from disk
     */
    async loadFightHistory() {
        try {
            const historyFile = './logs/fight_history/fight_history.json';
            const data = await fsPromises.readFile(historyFile, 'utf8');
            const historyData = JSON.parse(data);
            
            // Restore fights with proper deserialization
            this.fights = new Map();
            if (historyData.fights) {
                for (const [fightId, fight] of Object.entries(historyData.fights)) {
                    // Ensure userStats is properly deserialized
                    const fightData = {
                        ...fight,
                        userStats: fight.userStats || {}
                    };
                    
                    // Debug: Check if userStats contains string representations
                    if (fightData.userStats) {
                        for (const [uid, userData] of Object.entries(fightData.userStats)) {
                            if (typeof userData.total_damage === 'string' || typeof userData.total_healing === 'string') {
                                logger.warn(`Loading fight ${fightId} user ${uid} has string data:`, {
                                    total_damage_type: typeof userData.total_damage,
                                    total_healing_type: typeof userData.total_healing,
                                    total_damage: userData.total_damage,
                                    total_healing: userData.total_healing
                                });
                            }
                        }
                    }
                    
                    this.fights.set(fightId, fightData);
                }
            }
            
            // Restore cumulative stats
            this.cumulativeStats = historyData.cumulativeStats || {
                totalDamage: 0,
                totalHealing: 0,
                totalFights: 0,
                totalDuration: 0
            };
            
            logger.info(`Loaded ${this.fights.size} fights from history`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Failed to load fight history:', error);
            }
        }
    }

    /**
     * Clear all fight history
     */
    clearHistory() {
        this.fights.clear();
        this.currentFightId = null;
        this.currentFightStartTime = null;
        this.lastActivityTime = 0;
        this.cumulativeStats = {
            totalDamage: 0,
            totalHealing: 0,
            totalFights: 0,
            totalDuration: 0,
            startTime: Date.now()
        };
        
        logger.info('Fight history cleared');
    }

    /**
     * Check if we should start a new fight based on inactivity
     * @param {number} currentTime - Current timestamp
     */
    checkForInactivity(currentTime) {
        if (this.currentFightId && this.lastActivityTime > 0) {
            const timeSinceLastActivity = currentTime - this.lastActivityTime;
            if (timeSinceLastActivity > this.fightTimeout) {
                logger.info(`Inactivity detected: ${timeSinceLastActivity}ms since last activity (threshold: ${this.fightTimeout}ms). Finalizing current fight.`);
                this.finalizeCurrentFight();
                this.currentFightId = null;
                this.currentFightStartTime = null;
                
                // Emit fight ended event to clear frontend
                this.emitFightEndedEvent();
            }
        }
    }

    /**
     * Emit fight ended event to frontend
     */
    emitFightEndedEvent() {
        // Import socket dynamically to avoid circular dependency
        import('./Socket.js').then(socketModule => {
            const socket = socketModule.default;
            socket.emit('fight_ended');
            logger.info('Emitted fight_ended event to clear frontend');
        }).catch(error => {
            logger.error('Error emitting fight ended event:', error);
        });
    }

    /**
     * Force start a new fight (for testing/debugging)
     * @param {number} timestamp - Current timestamp
     */
    async forceStartNewFight(timestamp) {
        await this.startNewFight(timestamp);
    }

    /**
     * Update the fight timeout duration
     * @param {number} timeoutMs - New timeout in milliseconds
     */
    updateFightTimeout(timeoutMs) {
        this.fightTimeout = timeoutMs;
        logger.info(`Fight timeout updated to ${timeoutMs}ms (${timeoutMs/1000}s)`);
    }
}

const fightHistoryManager = new FightHistoryManager();
export default fightHistoryManager;
