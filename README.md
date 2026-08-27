# Mihomo 完整配置 + v2ray-agent 融合方案

## 最终效果

- 客户端**只导入一个固定订阅链接**，即可获得完整高安全配置（规则、DNS、银行保护、链式代理等）
- 订阅链接看起来像普通静态资源，且不带 .yaml 后缀，例如：
  ```
  https://你的域名/assets/static/a7f3c21e9b
  ```
- 机场入口订阅在 `settings.conf` 里填写，可随时修改
- 一键更新**只更新 VPS 自建落地节点**，主订阅地址永远不变

## 依赖说明（请先读）

本仓库的一键脚本**不会**安装 v2ray-agent，只负责在已有落地节点之上生成完整 Mihomo 配置。

落地节点由 **[v2ray-agent](https://github.com/mack-a/v2ray-agent)**（作者 [mack-a](https://github.com/mack-a)）在 VPS 上管理；本项目读取其本地 clashMeta 订阅目录中的节点，再与机场入口订阅合并。

### 推荐安装顺序

1. **安装并配置 v2ray-agent**（在 VPS 上）

   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/mack-a/v2ray-agent/master/install.sh)
   ```

   安装完成后执行 `vasma`，添加你需要的落地协议（推荐 VLESS Reality / Vision、Hysteria2 等；本方案生成时会自动排除 VMess）。

2. **再安装本仓库（mihomo-full）**

   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/dukangalex/mihomo-full/main/install.sh)
   ```

   按提示填写：机场订阅链接、你的域名、以及 v2ray-agent 的 clashMeta 目录（默认 `/etc/v2ray-agent/subscribe_local/clashMeta`）。

3. **配置 Nginx** 并重载（脚本会打印需要粘贴的 `location`）。

4. 客户端只导入固定订阅地址即可。

### 与 v2ray-agent 的衔接

| 项目 | 说明 |
|------|------|
| 节点来源 | `V2RAY_AGENT_CLASHMETA_DIR`（默认见上）下的本地订阅文件 |
| 更新落地 | 在 v2ray-agent 中增删改协议后，执行 `/opt/mihomo-full/generate.sh` |
| 不覆盖 | 本脚本不修改 v2ray-agent 自身配置，只读节点、写出 Mihomo 侧文件 |

官方文档与问题反馈请优先前往：[mack-a/v2ray-agent](https://github.com/mack-a/v2ray-agent)。

## 真正一键安装本仓库（在 v2ray-agent 就绪后）

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/dukangalex/mihomo-full/main/install.sh)
```

按提示输入机场订阅和域名即可。

## 目录结构

```
/opt/mihomo-full/
├── settings.conf          # 用户配置（机场订阅、域名）
├── template.yaml          # 完整配置模板（链式：机场入口 + 落地）
├── generate.sh            # 一键生成/更新脚本
├── install.sh             # 一键安装脚本
├── nginx-example.conf     # Nginx 参考配置
├── airport_overwrite.js   # 机场专用订阅覆写脚本（无链式）
└── output/
    ├── full-config.yaml   # 最终完整配置（主订阅）
    └── exit-nodes.yaml    # 落地节点列表
```

## 机场专用覆写脚本（无链式）

仅用机场、不需要 VPS 落地时，把 `airport_overwrite.js` 挂到客户端的「脚本覆写」即可。

能力概要：

- 地区三层分组（自动 / 负载 / 选择）+ AI/流媒体等功能组
- 银行/微信进程直连、STUN/DNS 泄露封堵、远控默认 REJECT-DROP
- 公告伪节点名称排除、url-test 健康检查收紧（interval 180 / tolerance 35）

Raw 地址：

```
https://raw.githubusercontent.com/dukangalex/mihomo-full/main/airport_overwrite.js
```

## 日常使用

- **只更新落地节点**：
  ```bash
  /opt/mihomo-full/generate.sh
  ```
- **更换机场订阅**：编辑 `settings.conf` 里的 `AIRPORT_SUB_URL`，再运行一次 `generate.sh`。

## 注意事项

1. 落地节点会自动排除 VMess。
2. 完整配置内部通过第二个固定地址拉取落地节点，客户端无感知。
3. Nginx 示例里已包含 `Cache-Control: no-cache`。
4. 本仓库不包含 v2ray-agent 本体；请先完成其安装与协议配置。

## 鸣谢

- **[mack-a / v2ray-agent](https://github.com/mack-a/v2ray-agent)**  
  提供 VPS 侧协议管理与本地 clashMeta 订阅能力。本项目的落地节点读取与更新流程建立在其工作流之上，特此致谢。
- [MetaCubeX / mihomo](https://github.com/MetaCubeX/mihomo) 及社区规则、文档贡献者。
- 规则与 geodata 等上游维护者（如 meta-rules-dat、相关 ruleset 项目）。

若你在使用 v2ray-agent 时遇到安装/协议问题，请到其仓库提交 Issue；与本仓库「配置生成 / 固定订阅 / 覆写脚本」相关的问题可在本仓库反馈。
