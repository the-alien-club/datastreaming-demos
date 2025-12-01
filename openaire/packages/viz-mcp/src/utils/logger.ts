const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function shouldLog(level: keyof typeof LEVELS): boolean {
  const configuredLevel = LEVELS[LOG_LEVEL as keyof typeof LEVELS];
  const currentLevel = configuredLevel !== undefined ? configuredLevel : LEVELS.info;
  return LEVELS[level] <= currentLevel;
}

export const logger = {
  error: (message: string, meta?: any) => {
    if (shouldLog('error')) {
      console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
  },
  warn: (message: string, meta?: any) => {
    if (shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
  },
  info: (message: string, meta?: any) => {
    if (shouldLog('info')) {
      console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
  },
  debug: (message: string, meta?: any) => {
    if (shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
  },
};
