const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};
function shouldLog(level) {
    const configuredLevel = LEVELS[LOG_LEVEL];
    const currentLevel = configuredLevel !== undefined ? configuredLevel : LEVELS.info;
    return LEVELS[level] <= currentLevel;
}
export const logger = {
    error: (message, meta) => {
        if (shouldLog('error')) {
            console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
        }
    },
    warn: (message, meta) => {
        if (shouldLog('warn')) {
            console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
        }
    },
    info: (message, meta) => {
        if (shouldLog('info')) {
            console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
        }
    },
    debug: (message, meta) => {
        if (shouldLog('debug')) {
            console.log(`[DEBUG] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
        }
    },
};
//# sourceMappingURL=logger.js.map