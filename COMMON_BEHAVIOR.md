# Mihomo-Full 公共行为基线

本文件是 `template.yaml` 与 `airport_overwrite.js` 的一致性基线。

## 必须一致的部分

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
- 远控工具：默认拒绝，不提供 DIRECT 作为用户可选项

## 明确允许不同的部分

仅以下能力属于链式专属能力，纯机场覆盖脚本不应伪造：

- `provider_exit`
- VPS 落地节点
- `dialer-proxy`
- “前置优选入口”与“落地优选出口/负载均衡/手动选择”的链式关系

纯机场模式可以拥有自己的“机场自动选择 / 负载均衡 / 手动选择”，但必须遵循同样的安全默认和 UI 原则。

## UI 原则

用户可见策略组不得为了实现 DIRECT 而暴露 DIRECT 选项。国内直连应由底层规则直接执行；远控工具默认 `REJECT-DROP`，启用远控时通过明确的管理操作切换到允许的安全路径，而不是把 DIRECT 作为普通节点选项散落到多个组。

## 规则集原则

`airport_overwrite.js` 不得使用与 `template.yaml` 不同的规则源而无明确理由。若纯机场模式需要额外规则集，必须在文档中注明“机场专属增强”，不能悄悄替换公共规则源。

规则源 CDN、行为（domain/ipcidr/classical/text）、更新周期和安全相关 provider 应保持一致。

## 修改要求

任何修改 `template.yaml` 的公共行为后，都必须检查：

1. `airport_overwrite.js`
2. `generate.sh`
3. `manage.sh`
4. Telegram 管理器
5. README

不得只修改其中一个文件。
