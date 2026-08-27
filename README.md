# Mihomo 完整配置 + v2ray-agent 融合方案（方案 B）

## 最终效果

- 客户端**只导入一个固定订阅链接**，即可获得完整高安全配置（规则、DNS、银行保护、链式代理等）
- 订阅链接看起来像普通静态资源，且不带 .yaml 后缀，例如：
  ```
  https://你的域名/assets/static/a7f3c21e9b
  ```
- 机场入口订阅在 `settings.conf` 里填写，可随时修改
- 一键更新**只更新 VPS 自建落地节点**，主订阅地址永远不变

## 真正一键安装（推荐）

在 VPS 上执行：

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

Raw 地址（上传完整文件后可用）：

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
