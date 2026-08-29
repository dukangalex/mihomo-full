# Mihomo-Full 公共行为基线

本文件是 `template.yaml`、`airport_overwrite.js`、生成器和管理入口的一致性基线。

## 必须一致的公共行为

纯机场模式与链式模式除“VPS 落地 / dialer-proxy”外，应保持以下行为一致：

- `mode: rule`
- `allow-lan: false`
- `bind-address: 127.0.0.1`
- `mixed-port: 17890`
- `log-level: info`
- `ipv6: false`
- `unified-delay: true`
- `tcp-concurrent: true`
- keep-alive 参数
- `find-process-mode: strict`
- `etag-support: true`
- `external-controller: 127.0.0.1:19090`
- 本地 CORS 限制
- `profile.store-selected: false`
- `profile.store-fake-ip: false`
- geodata / geox-url
- NTP 禁用
- TUN：mixed / auto-route / strict-route / auto-detect-interface / dns-hijack / inet4-route-only / gso
- sniffer：HTTP/TLS、force-domain、skip-dst-address、skip-domain
- DNS：fake-ip、安全过滤、国内/境外解析策略、`respect-rules`
- 公共规则集、规则优先级和安全封堵
- **广告拦截：默认 REJECT/REJECT-DROP，并保留用户主动 DIRECT 例外**
- **远控工具：默认 REJECT，并保留用户主动 DIRECT 例外**
- **私有网络：底层规则 DIRECT，不提供“私有网络代理”用户选择器**
- **国内服务：通过规则集/CN IP 底层判定 DIRECT，不提供“国内服务代理”用户选择器**
- **未知目标不得因为无法分类而自动 DIRECT**

## 广告拦截的 DIRECT 使用说明

广告拦截默认开启。只有在以下情况才建议临时切换到 `DIRECT`：

- 免费资讯、视频、下载、工具或内容网站依赖广告收入维持运营；
- 开启拦截后出现页面打不开、视频无法播放、登录失败或功能异常；
- 确认问题来自广告规则误伤，而不是站点本身故障。

不建议为了“少广告”长期关闭拦截。钓鱼、恶意域名等安全威胁规则仍保持强制拦截，不能通过广告 DIRECT 例外放行。

## 远控工具的 DIRECT 使用说明

远控、P2P、内网穿透等工具默认采用安全策略。只有当工具的 P2P/UDP/设备发现/中继机制与 TUN 或代理发生兼容性问题时，才主动选择 `DIRECT`。

该 DIRECT 只属于“远控工具”局部例外，不代表系统获得全局直连能力。

## 私有网络与国内服务

### 私有网络

私有地址、回环地址、链路本地地址等属于本机/局域网拓扑，应由底层规则直接处理，不送往机场或 VPS，也不提供用户可选的“私网代理”按钮。

### 国内服务

明确属于国内的服务优先依据规则集和 CN IP 判定 `DIRECT`。未知目标不能因为没有命中国内分类就默认直连；无法可靠判定为国内时，遵循项目的代理安全默认路径。

## 节点协议

**不按协议名称自动排除节点。** VMess、Shadowsocks、Trojan、VLESS、Hysteria/Hysteria2、TUIC 等均保留。

协议名称本身不足以准确判断实际安全性；服务端配置、加密/传输方式和节点来源同样重要。

## 明确允许不同的部分

仅以下能力属于链式专属能力，纯机场覆盖脚本不应伪造：

- `provider_exit`
- VPS 落地节点
- `dialer-proxy`
- “前置优选入口”与“落地优选出口/负载均衡/手动选择”的链式关系

纯机场模式可以拥有自己的机场自动选择 / 负载均衡 / 手动选择，但必须遵循同样的安全默认和上述 DIRECT 例外原则。

## 机场模式专属 UX

机场覆盖脚本保留现有地区、自动选择、负载均衡、手动选择、流媒体等策略组。同步器不得重命名、重构或删除这些策略组。

广告拦截和远控工具的 DIRECT 例外必须保留；私有网络和国内服务的 DIRECT 则隐藏在底层规则中。

## 同步原则

`tools/sync-airport-overwrite.py` 只同步公共行为，然后重新应用机场模式明确允许的差异。不得：

- 删除广告组的 DIRECT；
- 删除远控组的 DIRECT；
- 添加 VMess/SS 等协议排除；
- 把链式 VPS/dialer-proxy 复制到机场模式；
- 把私有网络/国内服务重新暴露成用户策略组。

任何修改 `template.yaml` 的公共行为后，都必须检查：

1. `airport_overwrite.js`
2. `generate.sh`
3. `manage.sh`
4. Telegram 管理器
5. README / docs

最终以**生成结果**而不是单纯模板文本作为审计对象。
