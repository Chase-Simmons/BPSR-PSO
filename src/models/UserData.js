import { StatisticData } from './StatisticData.js';
import skill_names from '../tables/skill_names.json' with { type: 'json' };

const skillConfig = skill_names.skill_names;

function getSubProfessionBySkillId(skillId) {
    switch (skillId) {
        case 1241:
            return '(Frostbeam)';
        case 2307:
        case 2361:
        case 55302:
            return '(Concerto)';
        case 20301:
            return '(Lifebind)';
        case 1518:
        case 1541:
        case 21402:
            return '(Smite)';
        case 2306:
            return '(Dissonance)';
        case 120901:
        case 120902:
            return '(Icicle)';
        case 1714:
        case 1734:
            return '(Iaido Slash)';
        case 44701:
        case 179906:
            return '(Moonstrike)';
        case 220112:
        case 2203622:
            return '(Falconry)';
        case 2292:
        case 1700820:
        case 1700825:
        case 1700827:
            return '(Wildpack)';
        case 1419:
            return '(Vanguard)';
        case 1405:
        case 1418:
            return '(Skyward)';
        case 2405:
            return '(Shield)';
        case 2406:
            return '(Recovery)';
        case 199902:
            return '(Earthfort)';
        case 1930:
        case 1931:
        case 1934:
        case 1935:
            return '(Block)';
        default:
            return '';
    }
}

export class UserData {
    constructor(uid) {
        this.uid = uid;
        this.name = '';
        this.damageStats = new StatisticData(this, '伤害');
        this.healingStats = new StatisticData(this, '治疗');
        this.takenDamage = 0; // 承伤
        this.deadCount = 0; // 死亡次数
        this.profession = '...';
        this.skillUsage = new Map(); // 技能使用情况
        this.fightPoint = 0; // 总评分
        this.subProfession = '';
        this.attr = {};
        this.lastUpdateTime = Date.now();
        this.lastFightId = null; // Track which fight this user data belongs to
    }

    _touch() {
        this.lastUpdateTime = Date.now();
    }

    /** 添加伤害记录
     * @param {number} skillId - 技能ID/Buff ID
     * @param {string} element - 技能元素属性
     * @param {number} damage - 伤害值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} [isLucky] - 是否为幸运
     * @param {boolean} [isCauseLucky] - 是否造成幸运
     * @param {number} hpLessenValue - 生命值减少量
     */
    addDamage(skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue = 0) {
        this._touch();
        this.damageStats.addRecord(damage, isCrit, isLucky, hpLessenValue);
        // 记录技能使用情况
        if (!this.skillUsage.has(skillId)) {
            this.skillUsage.set(skillId, new StatisticData(this, '伤害', element));
        }
        this.skillUsage.get(skillId).addRecord(damage, isCrit, isCauseLucky, hpLessenValue);
        this.skillUsage.get(skillId).realtimeWindow.length = 0;

        const subProfession = getSubProfessionBySkillId(skillId);
        if (subProfession) {
            this.setSubProfession(subProfession);
        }
    }

    /** 添加治疗记录
     * @param {number} skillId - 技能ID/Buff ID
     * @param {string} element - 技能元素属性
     * @param {number} healing - 治疗值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} [isLucky] - 是否为幸运
     * @param {boolean} [isCauseLucky] - 是否造成幸运
     */
    addHealing(skillId, element, healing, isCrit, isLucky, isCauseLucky) {
        this._touch();
        this.healingStats.addRecord(healing, isCrit, isLucky);
        // 记录技能使用情况
        skillId = skillId + 1000000000;
        if (!this.skillUsage.has(skillId)) {
            this.skillUsage.set(skillId, new StatisticData(this, '治疗', element));
        }
        this.skillUsage.get(skillId).addRecord(healing, isCrit, isCauseLucky);
        this.skillUsage.get(skillId).realtimeWindow.length = 0;

        const subProfession = getSubProfessionBySkillId(skillId - 1000000000);
        if (subProfession) {
            this.setSubProfession(subProfession);
        }
    }

    /** 添加承伤记录
     * @param {number} damage - 承受的伤害值
     * @param {boolean} isDead - 是否致死伤害
     * */
    addTakenDamage(damage, isDead) {
        this._touch();
        this.takenDamage += damage;
        if (isDead) {
            this.deadCount++;
        }
    }

    /** 更新实时DPS和HPS 计算过去1秒内的总伤害和治疗 */
    updateRealtimeDps() {
        this.damageStats.updateRealtimeStats();
        this.healingStats.updateRealtimeStats();
    }

    /** 计算总DPS */
    getTotalDps() {
        return this.damageStats.getTotalPerSecond();
    }

    /** 计算总HPS */
    getTotalHps() {
        return this.healingStats.getTotalPerSecond();
    }

    /** 获取合并的次数统计 */
    getTotalCount() {
        return {
            normal: this.damageStats.count.normal + this.healingStats.count.normal,
            critical: this.damageStats.count.critical + this.healingStats.count.critical,
            lucky: this.damageStats.count.lucky + this.healingStats.count.lucky,
            total: this.damageStats.count.total + this.healingStats.count.total,
        };
    }

    /** 获取用户数据摘要 */
    getSummary() {
        const summary = {
            realtime_dps: this.damageStats.realtimeStats.value,
            realtime_dps_max: this.damageStats.realtimeStats.max,
            total_dps: this.getTotalDps(),
            total_damage: { ...this.damageStats.stats },
            total_count: this.getTotalCount(),
            realtime_hps: this.healingStats.realtimeStats.value,
            realtime_hps_max: this.healingStats.realtimeStats.max,
            total_hps: this.getTotalHps(),
            total_healing: { ...this.healingStats.stats },
            taken_damage: this.takenDamage,
            profession: this.profession + (this.subProfession ? ` ${this.subProfession}` : ''),
            name: this.name,
            fightPoint: this.fightPoint,
            hp: this.attr.hp,
            max_hp: this.attr.max_hp,
            dead_count: this.deadCount,
        };
        
        // Debug: Check if the summary contains string representations
        if (typeof summary.total_damage === 'string' || typeof summary.total_healing === 'string') {
            console.warn(`User ${this.uid} getSummary() returning string data:`, {
                total_damage_type: typeof summary.total_damage,
                total_healing_type: typeof summary.total_healing,
                total_damage: summary.total_damage,
                total_healing: summary.total_healing,
                damageStats_stats: this.damageStats.stats,
                healingStats_stats: this.healingStats.stats
            });
        }
        
        return summary;
    }

    /** 获取技能统计数据 */
    getSkillSummary() {
        const skills = {};
        for (const [skillId, stat] of this.skillUsage) {
            const total = stat.stats.normal + stat.stats.critical + stat.stats.lucky + stat.stats.crit_lucky;
            const critCount = stat.count.critical;
            const luckyCount = stat.count.lucky;
            const critRate = stat.count.total > 0 ? critCount / stat.count.total : 0;
            const luckyRate = stat.count.total > 0 ? luckyCount / stat.count.total : 0;
            const name = skillConfig[skillId % 1000000000] ?? skillId % 1000000000;
            const elementype = stat.element;

            skills[skillId] = {
                displayName: name,
                type: stat.type,
                elementype: elementype,
                totalDamage: stat.stats.total,
                totalCount: stat.count.total,
                critCount: stat.count.critical,
                luckyCount: stat.count.lucky,
                critRate: critRate,
                luckyRate: luckyRate,
                damageBreakdown: { ...stat.stats },
                countBreakdown: { ...stat.count },
            };
        }
        return skills;
    }

    /** 设置职业
     * @param {string} profession - 职业名称
     * */
    setProfession(profession) {
        this._touch();
        if (profession !== this.profession) {
            this.setSubProfession('');
        }
        this.profession = profession;
    }

    /** 设置子职业
     * @param {string} subProfession - 子职业名称
     * */
    setSubProfession(subProfession) {
        this._touch();
        this.subProfession = subProfession;
    }

    /** 设置姓名
     * @param {string} name - 姓名
     * */
    setName(name) {
        this._touch();
        this.name = name;
    }

    /** 设置用户总评分
     * @param {number} fightPoint - 总评分
     * */
    setFightPoint(fightPoint) {
        this._touch();
        this.fightPoint = fightPoint;
    }

    /** 设置额外数据
     * @param {string} key
     * @param {any} value
     * */
    setAttrKV(key, value) {
        this._touch();
        this.attr[key] = value;
    }

    /** 重置数据 预留 */
    reset() {
        // Preserve user identity and attributes
        const preservedName = this.name;
        const preservedProfession = this.profession;
        const preservedSubProfession = this.subProfession;
        const preservedAttr = { ...this.attr };
        
        // Reset all combat data
        this.damageStats.reset();
        this.healingStats.reset();
        this.takenDamage = 0;
        this.skillUsage.clear();
        this.fightPoint = 0;
        
        // Restore preserved data
        this.name = preservedName;
        this.profession = preservedProfession;
        this.subProfession = preservedSubProfession;
        this.attr = preservedAttr;
        
        this._touch();
    }

    /** Reset time range for new fight - keeps damage/healing stats but resets DPS timer */
    resetTimeRange() {
        this.damageStats.resetTimeRange();
        this.healingStats.resetTimeRange();
        // Reset time range for all skill usage stats
        for (const [skillId, stat] of this.skillUsage) {
            stat.resetTimeRange();
        }
        this._touch();
    }
}