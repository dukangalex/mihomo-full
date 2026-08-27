/**
 * 机场订阅覆写脚本（个人使用版 · TUN 恒定模式 · 完整策略组架构）
 * 基于脚本A，合并脚本B（AIsouler/MyClash）除去链式代理后的有价值内容
 * 已修复：JS RegExp 不支持内联 (?i) 导致的 SyntaxError
 *
 * 本轮审核后的优化：
 *   1. 移除 excludeFilter"机场公告/伪节点"过滤：曾误杀名字恰好包含
 *      常见词（甚至以.com结尾）的真实节点，现在只过滤direct/reject/
 *      rematch这几个非真实代理占位类型，其余节点一律原样保留
 *   2. 不做任何节点去重：订阅里所有节点全部保留；仅在两个节点标准化
 *      后显示名字完全撞车时追加 #2/#3 后缀，避免mihomo因重名报错，
 *      这一步不涉及任何过滤判断
 *   3. allow-lan / bind-address 改为尊重订阅原有设置，缺失时默认收紧
 *      （仅本机监听），不再无条件强制开放局域网
 *   4. 移除冗余的 cn_ip 规则集（GEOIP,CN 已完全覆盖，避免无意义下载）
 *   已验证：全部规则集URL可访问，rules/rule-providers/proxy-groups
 *   三者交叉引用完整，无孤儿引用
 *
 * V5 对齐加强（保持原架构，无链式代理）：
 *   5. tun.inet4-route-only 改为 false：避免双栈环境 IPv6 绕过 TUN
 *   6. sniffer 关闭 QUIC 嗅探：降低历史内核崩溃面，封堵仍靠规则层
 *   7. 远控进程补 cloudflared / ngrok / frps 等
 *   8. geox-url 优先 gcore.jsdelivr（国内更稳），保留逻辑不变
 *   9. 恢复「公告/非节点」名称排除（正则可维护），避免策略组被垃圾行污染
 *  10. 健康检查：url-test/负载分组收紧 interval/tolerance/timeout，
 *      探测 URL 保持 generate_204（脚本侧无 proxy-provider，无法写 expected-status）
 */

// PLACEHOLDER_WILL_BE_REPLACED
