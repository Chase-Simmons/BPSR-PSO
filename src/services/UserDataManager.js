import { UserData } from '../models/UserData.js';
import { Lock } from '../models/Lock.js';
import { config } from '../config.js';
import socket from './Socket.js';
import logger from './Logger.js';
import fsPromises from 'fs/promises';
import path from 'path';
import fightHistoryManager from './FightHistoryManager.js';

class UserDataManager {
    constructor(logger) {
        this.users = new Map();
        this.userCache = new Map();
        this.cacheFilePath = './users.json';

        this.saveThrottleDelay = 2000;
        this.saveThrottleTimer = null;
        this.pendingSave = false;

        this.hpCache = new Map();
        this.startTime = Date.now();

        this.logLock = new Lock();
        this.logDirExist = new Set();

        this.enemyCache = {
            name: new Map(),
            hp: new Map(),
            maxHp: new Map(),
        };

        // 自动保存
        this.lastAutoSaveTime = 0;
        this.lastLogTime = 0;
        setInterval(() => {
            if (this.lastLogTime < this.lastAutoSaveTime) return;
            this.lastAutoSaveTime = Date.now();
            this.saveAllUserData();
            
            // Save user data snapshot to current fight
            fightHistoryManager.saveUserDataSnapshot(this.users);
        }, 10 * 1000);

        // New: Interval to clean up inactive users every 30 seconds
        setInterval(() => {
            this.cleanUpInactiveUsers();
        }, 30 * 1000);

        // Check for fight inactivity every 5 seconds
        setInterval(() => {
            fightHistoryManager.checkForInactivity(Date.now());
        }, 5000);
    }

    // New: Method to remove users who have not been updated in 60 seconds
    cleanUpInactiveUsers() {
        const inactiveThreshold = 60 * 1000; // 1 minute
        const currentTime = Date.now();

        for (const [uid, user] of this.users.entries()) {
            if (currentTime - user.lastUpdateTime > inactiveThreshold) {
                socket.emit('user_deleted', { uid });

                this.users.delete(uid);
                logger.info(`Removed inactive user with uid ${uid}`);
            }
        }
    }

    async init() {
        await this.loadUserCache();
        await fightHistoryManager.loadFightHistory();
    }

    async loadUserCache() {
        try {
            await fsPromises.access(this.cacheFilePath);
            const data = await fsPromises.readFile(this.cacheFilePath, 'utf8');
            const cacheData = JSON.parse(data);
            this.userCache = new Map(Object.entries(cacheData));
            logger.info(`Loaded ${this.userCache.size} user cache entries`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Failed to load user cache:', error);
            }
        }
    }

    async saveUserCache() {
        try {
            const cacheData = Object.fromEntries(this.userCache);
            await fsPromises.writeFile(this.cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
        } catch (error) {
            logger.error('Failed to save user cache:', error);
        }
    }

    saveUserCacheThrottled() {
        this.pendingSave = true;
        if (this.saveThrottleTimer) {
            clearTimeout(this.saveThrottleTimer);
        }
        this.saveThrottleTimer = setTimeout(async () => {
            if (this.pendingSave) {
                await this.saveUserCache();
                this.pendingSave = false;
                this.saveThrottleTimer = null;
            }
        }, this.saveThrottleDelay);
    }

    async forceUserCacheSave() {
        await this.saveAllUserData(this.users, this.startTime);
        if (this.saveThrottleTimer) {
            clearTimeout(this.saveThrottleTimer);
            this.saveThrottleTimer = null;
        }
        if (this.pendingSave) {
            await this.saveUserCache();
            this.pendingSave = false;
        }
    }

    getUser(uid) {
        if (!this.users.has(uid)) {
            const user = new UserData(uid);
            const cachedData = this.userCache.get(String(uid));
            if (cachedData) {
                if (cachedData.name) {
                    user.setName(cachedData.name);
                }
                if (cachedData.profession) {
                    user.setProfession(cachedData.profession);
                }
                if (cachedData.fightPoint !== undefined && cachedData.fightPoint !== null) {
                    user.setFightPoint(cachedData.fightPoint);
                }
                if (cachedData.maxHp !== undefined && cachedData.maxHp !== null) {
                    user.setAttrKV('max_hp', cachedData.maxHp);
                }
            }
            if (this.hpCache.has(uid)) {
                user.setAttrKV('hp', this.hpCache.get(uid));
            }
            this.users.set(uid, user);
        }
        return this.users.get(uid);
    }

    addDamage(uid, skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue = 0, targetUid) {
        if (config.IS_PAUSED) return;
        if (config.GLOBAL_SETTINGS.onlyRecordEliteDummy && targetUid !== 75) return;
        this.checkTimeoutClear();
        const user = this.getUser(uid);
        
        // Check if this is the first damage after a new fight started
        const currentFightId = fightHistoryManager.currentFightId;
        
        // If user doesn't have a last fight ID or it's different, reset all data for new fight
        if (!user.lastFightId || user.lastFightId !== currentFightId) {
            user.reset(); // Reset all damage/healing data for new fight
            user.lastFightId = currentFightId;
        }
        
        user.addDamage(skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue);
        
        // Record activity for fight history
        fightHistoryManager.recordActivity(Date.now(), 'damage', damage);
    }

    addHealing(uid, skillId, element, healing, isCrit, isLucky, isCauseLucky, targetUid) {
        if (config.IS_PAUSED) return;
        this.checkTimeoutClear();
        if (uid !== 0) {
            const user = this.getUser(uid);
            
            // Check if this is the first healing after a new fight started
            const currentFightId = fightHistoryManager.currentFightId;
            
            // If user doesn't have a last fight ID or it's different, reset all data for new fight
            if (!user.lastFightId || user.lastFightId !== currentFightId) {
                user.reset(); // Reset all damage/healing data for new fight
                user.lastFightId = currentFightId;
            }
            
            user.addHealing(skillId, element, healing, isCrit, isLucky, isCauseLucky);
            
            // Record activity for fight history
            fightHistoryManager.recordActivity(Date.now(), 'healing', healing);
        }
    }

    addTakenDamage(uid, damage, isDead) {
        if (config.IS_PAUSED) return;
        this.checkTimeoutClear();
        const user = this.getUser(uid);
        user.addTakenDamage(damage, isDead);
    }

    async addLog(log) {
        if (config.IS_PAUSED) return;

        const logDir = path.join('./logs', String(this.startTime));
        const logFile = path.join(logDir, 'fight.log');
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${log}\n`;

        this.lastLogTime = Date.now();

        await this.logLock.acquire();
        try {
            if (!this.logDirExist.has(logDir)) {
                try {
                    await fsPromises.access(logDir);
                } catch (error) {
                    await fsPromises.mkdir(logDir, { recursive: true });
                }
                this.logDirExist.add(logDir);
            }
            await fsPromises.appendFile(logFile, logEntry, 'utf8');
        } catch (error) {
            logger.error('Failed to save log:', error);
        }
        this.logLock.release();
    }

    setProfession(uid, profession) {
        const user = this.getUser(uid);
        if (user.profession !== profession) {
            user.setProfession(profession);
            logger.info(`Found profession ${profession} for uid ${uid}`);
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).profession = profession;
            this.saveUserCacheThrottled();
        }
    }

    setName(uid, name) {
        const user = this.getUser(uid);
        if (user.name !== name) {
            user.setName(name);
            logger.info(`Found player name ${name} for uid ${uid}`);
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).name = name;
            this.saveUserCacheThrottled();
        }
    }

    setFightPoint(uid, fightPoint) {
        const user = this.getUser(uid);
        if (user.fightPoint != fightPoint) {
            user.setFightPoint(fightPoint);
            logger.info(`Found fight point ${fightPoint} for uid ${uid}`);
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).fightPoint = fightPoint;
            this.saveUserCacheThrottled();
        }
    }

    setAttrKV(uid, key, value) {
        const user = this.getUser(uid);
        user.attr[key] = value;
        if (key === 'max_hp') {
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).maxHp = value;
            this.saveUserCacheThrottled();
        }
        if (key === 'hp') {
            this.hpCache.set(uid, value);
        }
    }

    updateAllRealtimeDps() {
        for (const user of this.users.values()) {
            user.updateRealtimeDps();
        }
    }

    getUserSkillData(uid) {
        const user = this.users.get(uid);
        if (!user) return null;
        return {
            uid: user.uid,
            name: user.name,
            profession: user.profession + (user.subProfession ? `-${user.subProfession}` : ''),
            skills: user.getSkillSummary(),
            attr: user.attr,
        };
    }

    getAllUsersData() {
        const result = {};
        for (const [uid, user] of this.users.entries()) {
            result[uid] = user.getSummary();
        }
        return result;
    }

    getAllEnemiesData() {
        const result = {};
        const enemyIds = new Set([
            ...this.enemyCache.name.keys(),
            ...this.enemyCache.hp.keys(),
            ...this.enemyCache.maxHp.keys(),
        ]);
        enemyIds.forEach((id) => {
            result[id] = {
                name: this.enemyCache.name.get(id),
                hp: this.enemyCache.hp.get(id),
                max_hp: this.enemyCache.maxHp.get(id),
            };
        });
        return result;
    }

    deleteEnemyData(id) {
        this.enemyCache.name.delete(id);
        this.enemyCache.hp.delete(id);
        this.enemyCache.maxHp.delete(id);
    }

    refreshEnemyCache() {
        this.enemyCache.name.clear();
        this.enemyCache.hp.clear();
        this.enemyCache.maxHp.clear();
    }

    clearAll() {
        const usersToSave = this.users;
        const saveStartTime = this.startTime;
        
        // Finalize current fight before clearing
        if (fightHistoryManager.currentFightId) {
            fightHistoryManager.finalizeCurrentFight();
            fightHistoryManager.currentFightId = null;
            fightHistoryManager.currentFightStartTime = null;
        }
        
        this.users = new Map();
        this.startTime = Date.now();
        this.lastAutoSaveTime = 0;
        this.lastLogTime = 0;
        this.saveAllUserData(usersToSave, saveStartTime);
        
        // Emit clear event to frontend
        socket.emit('data_cleared');
    }

    getUserIds() {
        return Array.from(this.users.keys());
    }

    async saveAllUserData(usersToSave = null, startTime = null) {
        try {
            const endTime = Date.now();
            const users = usersToSave || this.users;
            const timestamp = startTime || this.startTime;
            const logDir = path.join('./logs', String(timestamp));
            const usersDir = path.join(logDir, 'users');
            const summary = {
                startTime: timestamp,
                endTime,
                duration: endTime - timestamp,
                userCount: users.size,
                version: config.VERSION,
            };

            const allUsersData = {};
            const userDatas = new Map();
            for (const [uid, user] of users.entries()) {
                allUsersData[uid] = user.getSummary();
                const userData = {
                    uid: user.uid,
                    name: user.name,
                    profession: user.profession + (user.subProfession ? `-${user.subProfession}` : ''),
                    skills: user.getSkillSummary(),
                    attr: user.attr,
                };
                userDatas.set(uid, userData);
            }

            try {
                await fsPromises.access(usersDir);
            } catch (error) {
                await fsPromises.mkdir(usersDir, { recursive: true });
            }

            const allUserDataPath = path.join(logDir, 'allUserData.json');
            await fsPromises.writeFile(allUserDataPath, JSON.stringify(allUsersData, null, 2), 'utf8');
            for (const [uid, userData] of userDatas.entries()) {
                const userDataPath = path.join(usersDir, `${uid}.json`);
                await fsPromises.writeFile(userDataPath, JSON.stringify(userData, null, 2), 'utf8');
            }
            await fsPromises.writeFile(path.join(logDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
            logger.debug(`Saved data for ${summary.userCount} users to ${logDir}`);
        } catch (error) {
            logger.error('Failed to save all user data:', error);
            throw error;
        }
    }

    checkTimeoutClear() {
        if (!config.GLOBAL_SETTINGS.autoClearOnTimeout || this.lastLogTime === 0 || this.users.size === 0) return;
        const currentTime = Date.now();
        if (this.lastLogTime && currentTime - this.lastLogTime > 15000) {
            this.clearAll();
            logger.info('Timeout reached, statistics cleared!');
        }
    }

    getGlobalSettings() {
        return config.GLOBAL_SETTINGS;
    }

    // Fight History Methods
    getCurrentFight() {
        return fightHistoryManager.getCurrentFight();
    }

    getCurrentFightStatus() {
        return fightHistoryManager.getCurrentFightStatus();
    }

    getAllFights() {
        return fightHistoryManager.getAllFights();
    }

    getFightData(fightId) {
        return fightHistoryManager.getFightData(fightId);
    }

    getCumulativeStats() {
        return fightHistoryManager.getCumulativeStats();
    }

    clearFightHistory() {
        fightHistoryManager.clearHistory();
    }

    forceNewFight(timestamp) {
        fightHistoryManager.forceStartNewFight(timestamp).catch(error => {
            logger.error('Error forcing new fight:', error);
        });
    }

    updateFightTimeout(timeoutMs) {
        fightHistoryManager.updateFightTimeout(timeoutMs);
    }
}

const userDataManager = new UserDataManager();
export default userDataManager;
