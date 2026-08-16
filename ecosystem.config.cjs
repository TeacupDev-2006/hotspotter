// pm2 进程守护配置：pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'hotspotter',
      script: 'server/index.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
      autorestart: true,
    },
  ],
};
