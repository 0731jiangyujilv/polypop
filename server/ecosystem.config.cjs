const path = require("node:path")

const logsDir = path.join(__dirname, "logs")

function app(name, script) {
  return {
    name,
    script,
    cwd: __dirname,
    out_file: path.join(logsDir, `${name}.out.log`),
    error_file: path.join(logsDir, `${name}.error.log`),
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    env: {
      NODE_ENV: "production",
    },
  }
}

module.exports = {
  apps: [
    app("arc-uni-service", "dist/service.js"),
    app("arc-uni-ace-worker", "dist/ace-worker.js"),
    // app("betsys-tgbot", "dist/tgbot.js"),
    // app("betsys-xbot", "dist/xbot.js"),
    // app("betsys-bet-listener", "dist/bet-listener.js"),
    // app("betsys-oracle-listener", "dist/oracle-listener.js"),
    // app("betsys-settlement-worker", "dist/settlement-worker.js"),
    // app("betsys-claim-worker", "dist/claim-worker.js"),
    app("arc-uni-verify-worker", "dist/verify-worker.js"),
  ],
}

// Keep only 2 days of logs with pm2-logrotate:
// pm2 install pm2-logrotate
// pm2 set pm2-logrotate:retain 2
// pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
// pm2 set pm2-logrotate:dateFormat 'YYYY-MM-DD_HH-mm-ss'
