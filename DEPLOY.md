# 部署到云服务器

适用：腾讯云 / 阿里云 / AWS 等任意 Linux 服务器（Ubuntu / Debian / CentOS），也适用境外 VPS。

## 一、购买建议（学生）

| 平台 | 推荐 | 价格 |
|---|---|---|
| [腾讯云学生优惠](https://cloud.tencent.com/act/campus) | 轻量应用服务器 2C2G | 约 ¥112/年（学生认证后） |
| [阿里云学生优惠](https://university.aliyun.com) | ECS 经济型 | 约 ¥100/年 |
| RackNerd / Vultr 等境外 VPS | 任意最低配 | $10~20/年 |

> 国内服务器与境外服务器的差异：国内的访问不到 Google News 源（自动降级，Bing + X + AI 判断等核心功能不受影响）；境外服务器信息源全通，但国内访问页面略慢。本项目很轻量，最低配（1C1G）即可流畅运行。

## 二、部署步骤

### 1. 准备服务器

购买时系统选 **Ubuntu 22.04**（或其他 Linux），购买后在云控制台 **安全组 / 防火墙** 放行端口：

- `22`（SSH，一般默认放行）
- `3210`（HotSpotter 网页端口）

### 2. 拉取代码

SSH 登录服务器后：

```bash
git clone https://github.com/TeacupDev-2006/hotspotter.git
cd hotspotter
```

> 国内服务器克隆 GitHub 慢的话，用镜像：`git clone https://gitclone.com/github.com/TeacupDev-2006/hotspotter.git`
> 或者干脆从本机打包上传：本机执行 `git archive -o hotspotter.zip HEAD`，再 `scp hotspotter.zip root@服务器IP:~` 后解压。

### 3. 配置密钥

```bash
cp .env.example .env
nano .env
```

必填 `OPENROUTER_API_KEY`；按需填 `TWITTER_API_KEY` 和 QQ 邮箱三项；`PROXY_URL` **留空**（服务器上没有本地代理，程序会自动直连并降级不可达的源）。

### 4. 一键部署

```bash
bash deploy.sh
```

脚本会自动：装 Node 20 → 装 pm2 → 装依赖 → 启动并设置**开机自启**。完成后访问 `http://服务器IP:3210`。

## 三、日常运维

```bash
pm2 logs hotspotter      # 看实时日志
pm2 restart hotspotter   # 改完 .env 后重启生效
pm2 stop hotspotter      # 停止
pm2 status               # 运行状态
```

**更新代码**（本机改完 push 后，服务器上）：

```bash
cd hotspotter && git pull && npm install --registry=https://registry.npmmirror.com && pm2 restart hotspotter
```

## 四、可选增强

- **绑域名 + HTTPS**：装 Caddy（自动签发证书）：
  ```bash
  sudo apt install -y caddy
  echo "你的域名.com { reverse_proxy localhost:3210 }" | sudo tee /etc/caddy/Caddyfile
  sudo systemctl reload caddy
  ```
- **改端口**：`.env` 里 `PORT=80`（需 root）或保持 3210 用域名反代
- **数据备份**：热点数据都在 `hotspotter.db` 一个文件里，定时 `scp` 回本机即可

## 常见问题

- **页面打不开**：九成是安全组没放行 3210；其次 `pm2 logs` 看报错
- **Google 源报错**：国内服务器正常现象，自动降级不影响使用
- **twitterapi.io 403**：偶发的地区限制，下一轮扫描会自动重试；持续出现可在 `.env` 配一个可用的 `PROXY_URL`
