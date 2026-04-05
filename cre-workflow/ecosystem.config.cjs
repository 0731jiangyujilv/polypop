module.exports = {
  apps: [
    {
      name: "binary-weather-simulate",
      script: "cre",
      args: "workflow simulate binary-weather --broadcast",
      cwd: "/Users/just/workspace/aibkh/chainlink/arc-uni-polypop/cre-workflow",
      cron_restart: "*/10 * * * *",
      autorestart: false,
      watch: false,
      interpreter: "none",
      out_file: "logs/binary-weather-out.log",
      error_file: "logs/binary-weather-error.log",
      time: true,
    },
  ],
};
