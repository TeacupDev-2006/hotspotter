#!/usr/bin/env bash
# HotSpotter 一键部署脚本（Ubuntu / Debian / CentOS 均可）
# 用法：在项目根目录执行  bash deploy.sh
set -e

echo "═══ 1/5 检查 Node.js（需要 ≥ 20）═══"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]; then
  echo "安装 Node.js 20 ..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
    sudo yum install -y nodejs
  fi
fi
node -v

echo "═══ 2/5 安装 pm2 守护进程 ═══"
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2 --registry=https://registry.npmmirror.com
fi

echo "═══ 3/5 安装项目依赖 ═══"
npm install --registry=https://registry.npmmirror.com

echo "═══ 4/5 检查配置文件 ═══"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  已生成 .env 模板，请编辑填入你的密钥："
  echo "    nano .env    （必填 OPENROUTER_API_KEY，其余按需）"
  echo "    填好后重新运行  bash deploy.sh"
  exit 1
fi

echo "═══ 5/5 启动并设置开机自启 ═══"
pm2 start ecosystem.config.cjs || pm2 restart hotspotter
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null || sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME"
pm2 status

IP=$(curl -s --max-time 3 ifconfig.me || echo "服务器IP")
echo ""
echo "✅ 部署完成！访问 http://$IP:3210"
echo "   记得在云控制台安全组放行 TCP 3210 端口"
echo "   常用命令：pm2 logs hotspotter｜pm2 restart hotspotter｜pm2 stop hotspotter"
