const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const threshold = LEVELS[process.env.LOG_LEVEL?.toLowerCase() ?? 'info'] ?? 1;

function write(level, msg, data) {
  if (LEVELS[level] < threshold) return;
  const entry = { timestamp: new Date().toISOString(), level, msg, ...data };
  const line = JSON.stringify(entry) + '\n';
  (LEVELS[level] >= 2 ? process.stderr : process.stdout).write(line);
}

export const log = {
  debug: (msg, data) => write('debug', msg, data),
  info: (msg, data) => write('info', msg, data),
  warn: (msg, data) => write('warn', msg, data),
  error: (msg, data) => write('error', msg, data),
};

export function withAccessLog(handler) {
  return async function (req, server) {
    const start = performance.now();
    const url = new URL(req.url);
    let res;
    try {
      res = await handler(req, server);
    } catch (err) {
      const duration_ms = parseFloat((performance.now() - start).toFixed(1));
      log.error('request error', {
        method: req.method,
        path: url.pathname,
        status: 500,
        duration_ms,
        error: err.message,
        stack: err.stack,
      });
      throw err;
    }
    const duration_ms = parseFloat((performance.now() - start).toFixed(1));
    const logLevel = res.status >= 500 ? 'error' : res.status >= 400 ? 'warn' : 'info';
    log[logLevel]('request', {
      method: req.method,
      path: url.pathname,
      status: res.status,
      duration_ms,
    });
    return res;
  };
}
