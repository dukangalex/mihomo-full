/**
 * 机场订阅覆写（TUN · 无链式）
 * 兼容旧版客户端脚本引擎（避免 find / ?. / 对象展开 / \u{} 正则）
 * 公共规则目标由末尾同步层映射到机场现有策略组，禁止创建重复组
 *
 * 修订记录：
 * - 修复 hk/tw/jp/us 地区正则缺少结尾词边界的问题（原正则会误判 "User"/"Tweet"/"Jpop" 等
 *   以对应字母开头的英文词为该地区节点，本次为四个正则补上结尾 \b）
 * - 移除未被引用的 sub-rules（DOMESTIC_DOMAIN / DOMESTIC_IP）死代码：全局规则中从未出现
 *   任何 SUB-RULE 引用它们，保留只会增加配置体积与解析开销，且其内容已被 rules 中的
 *   同类 RULE-SET 覆盖，故直接移除，不再由 AUTO-SYNC 层处理
 * - category-ads-all 规则集刷新间隔由 7 天缩短为 1 天，广告规则更新频率高于地区/分流规则
 * - 已对照 mihomo v1.19.31 更新日志核实：EasyTier outbound / ZeroTier identity-secret /
 *   tun.stack: mips 均为新增“协议或运行模式”支持，本脚本不生成任何 EasyTier/ZeroTier
 *   节点，tun.stack 保持 mixed（面向主流客户端的推荐值），因此均无需改动；DomainSet
 *   通配符重叠匹配修复、无效域名模式详细报错等为核心侧修复，只需将客户端内核升级到
 *   v1.19.31 即可生效，脚本层面无需跟随改动
 */
function main(config) {
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  }

  var regionMatchCache = {};

  var REGIONS = [
    { key: "hk", name: "🇭🇰 香港节点", flag: "🇭🇰", jsPattern: "🇭🇰|香港|\\bHKG?\\d*\\b|hong[\\s_-]*kong", filter: "(?i)(🇭🇰|香港|\\bHKG?\\d*\\b|hong[\\s_-]*kong)", icon: "" },
    { key: "tw", name: "🇹🇼 台湾节点", flag: "🇹🇼", jsPattern: "🇹🇼|台湾|\\bTWN?\\d*\\b|taiwan", filter: "(?i)(🇹🇼|台湾|\\bTWN?\\d*\\b|taiwan)", icon: "" },
    { key: "jp", name: "🇯🇵 日本节点", flag: "🇯🇵", jsPattern: "🇯🇵|日本|\\bJPN?\\d*\\b|japan|tokyo|osaka|东京|大阪", filter: "(?i)(🇯🇵|日本|\\bJPN?\\d*\\b|japan|tokyo|osaka|东京|大阪)", icon: "" },
    { key: "kr", name: "🇰🇷 韩国节点", flag: "🇰🇷", jsPattern: "🇰🇷|韩国|\\bKR\\b|korea|seoul|首尔", filter: "(?i)(🇰🇷|韩国|\\bKR\\b|korea|seoul|首尔)", icon: "" },
    { key: "sg", name: "🇸🇬 新加坡节点", flag: "🇸🇬", jsPattern: "🇸🇬|新加坡|狮城|\\bSGP?\\d*\\b|singapore", filter: "(?i)(🇸🇬|新加坡|狮城|\\bSGP?\\d*\\b|singapore)", icon: "" },
    { key: "us", name: "🇺🇸 美国节点", flag: "🇺🇸", jsPattern: "🇺🇸|美国|\\bUSA?\\d*\\b|america|united[\\s_-]*states|los[\\s_-]*angeles|洛杉矶|san[\\s_-]*jose|圣何塞", filter: "(?i)(🇺🇸|美国|\\bUSA?\\d*\\b|america|united[\\s_-]*states|los[\\s_-]*angeles|洛杉矶|san[\\s_-]*jose|圣何塞)", icon: "" },
    { key: "uk", name: "🇬🇧 英国节点", flag: "🇬🇧", jsPattern: "🇬🇧|英国|\\bGB\\b|united[\\s_-]*kingdom|london|伦敦", filter: "(?i)(🇬🇧|英国|\\bGB\\b|united[\\s_-]*kingdom|london|伦敦)", icon: "" },
    { key: "de", name: "🇩🇪 德国节点", flag: "🇩🇪", jsPattern: "🇩🇪|德国|\\bDE\\b|germany|frankfurt|法兰克福", filter: "(?i)(🇩🇪|德国|\\bDE\\b|germany|frankfurt|法兰克福)", icon: "" },
    { key: "nl", name: "🇳🇱 荷兰节点", flag: "🇳🇱", jsPattern: "🇳🇱|荷兰|\\bNL\\b|nether?lands|amsterdam|阿姆斯特丹", filter: "(?i)(🇳🇱|荷兰|\\bNL\\b|nether?lands|amsterdam|阿姆斯特丹)", icon: "" },
    { key: "my", name: "🇲🇾 马来西亚节点", flag: "🇲🇾", jsPattern: "🇲🇾|马来西亚|\\bMY\\b|malaysia|kuala[\\s_-]*lumpur|吉隆坡", filter: "(?i)(🇲🇾|马来西亚|\\bMY\\b|malaysia|kuala[\\s_-]*lumpur|吉隆坡)", icon: "" },
    { key: "th", name: "🇹🇭 泰国节点", flag: "🇹🇭", jsPattern: "🇹🇭|泰国|\\bTH\\b|thailand|bangkok|曼谷", filter: "(?i)(🇹🇭|泰国|\\bTH\\b|thailand|bangkok|曼谷)", icon: "" },
    { key: "vn", name: "🇻🇳 越南节点", flag: "🇻🇳", jsPattern: "🇻🇳|越南|\\bVN\\b|vietnam|hanoi|河内|ho[\\s_-]*chi[\\s_-]*minh|胡志明", filter: "(?i)(🇻🇳|越南|\\bVN\\b|vietnam|hanoi|河内|ho[\\s_-]*chi[\\s_-]*minh|胡志明)", icon: "" },
    { key: "ph", name: "🇵🇭 菲律宾节点", flag: "🇵🇭", jsPattern: "🇵🇭|菲律宾|\\bPH\\b|philippines|manila|马尼拉", filter: "(?i)(🇵🇭|菲律宾|\\bPH\\b|philippines|manila|马尼拉)", icon: "" },
    { key: "id", name: "🇮🇩 印尼节点", flag: "🇮🇩", jsPattern: "🇮🇩|印尼|印度尼西亚|\\bID\\b|indonesia|jakarta|雅加达", filter: "(?i)(🇮🇩|印尼|印度尼西亚|\\bID\\b|indonesia|jakarta|雅加达)", icon: "" },
    { key: "in", name: "🇮🇳 印度节点", flag: "🇮🇳", jsPattern: "🇮🇳|印度|\\bIN\\b|india|mumbai|孟买|delhi|德里", filter: "(?i)(🇮🇳|印度|\\bIN\\b|india|mumbai|孟买|delhi|德里)", icon: "" },
    { key: "au", name: "🇦🇺 澳大利亚节点", flag: "🇦🇺", jsPattern: "🇦🇺|澳大利亚|澳洲|\\bAU\\b|australia|sydney|悉尼|melbourne|墨尔本", filter: "(?i)(🇦🇺|澳大利亚|澳洲|\\bAU\\b|australia|sydney|悉尼|melbourne|墨尔本)", icon: "" },
    { key: "fr", name: "🇫🇷 法国节点", flag: "🇫🇷", jsPattern: "🇫🇷|法国|\\bFR\\b|france|paris|巴黎", filter: "(?i)(🇫🇷|法国|\\bFR\\b|france|paris|巴黎)", icon: "" },
    { key: "ru", name: "🇷🇺 俄罗斯节点", flag: "🇷🇺", jsPattern: "🇷🇺|俄罗斯|\\bRU\\b|russia|moscow|莫斯科", filter: "(?i)(🇷🇺|俄罗斯|\\bRU\\b|russia|moscow|莫斯科)", icon: "" },
    { key: "it", name: "🇮🇹 意大利节点", flag: "🇮🇹", jsPattern: "🇮🇹|意大利|\\bIT\\b|\\bitaly\\b|rome|罗马", filter: "(?i)(🇮🇹|意大利|\\bIT\\b|\\bitaly\\b|rome|罗马)", icon: "" },
    { key: "ca", name: "🇨🇦 加拿大节点", flag: "🇨🇦", jsPattern: "🇨🇦|加拿大|\\bCA\\b|canada|toronto|多伦多", filter: "(?i)(🇨🇦|加拿大|\\bCA\\b|canada|toronto|多伦多)", icon: "" },
    { key: "ar", name: "🇦🇷 阿根廷节点", flag: "🇦🇷", jsPattern: "🇦🇷|阿根廷|\\bAR\\b|argentina|buenos[\\s_-]*aires|布宜诺斯艾利斯", filter: "(?i)(🇦🇷|阿根廷|\\bAR\\b|argentina|buenos[\\s_-]*aires|布宜诺斯艾利斯)", icon: "" },
    { key: "br", name: "🇧🇷 巴西节点", flag: "🇧🇷", jsPattern: "🇧🇷|巴西|\\bBR\\b|brazil|sao[\\s_-]*paulo|圣保罗", filter: "(?i)(🇧🇷|巴西|\\bBR\\b|brazil|sao[\\s_-]*paulo|圣保罗)", icon: "" },
    { key: "mx", name: "🇲🇽 墨西哥节点", flag: "🇲🇽", jsPattern: "🇲🇽|墨西哥|\\bMX\\b|mexico", filter: "(?i)(🇲🇽|墨西哥|\\bMX\\b|mexico)", icon: "" },
    { key: "sa", name: "🇸🇦 沙特阿拉伯节点", flag: "🇸🇦", jsPattern: "🇸🇦|沙特阿拉伯|沙特|\\bSA\\b|saudi[\\s_-]*arabia", filter: "(?i)(🇸🇦|沙特阿拉伯|沙特|\\bSA\\b|saudi[\\s_-]*arabia)", icon: "" },
    { key: "za", name: "🇿🇦 南非节点", flag: "🇿🇦", jsPattern: "🇿🇦|南非|\\bZA\\b|south[\\s_-]*africa|johannesburg|约翰内斯堡", filter: "(?i)(🇿🇦|南非|\\bZA\\b|south[\\s_-]*africa|johannesburg|约翰内斯堡)", icon: "" },
    { key: "tr", name: "🇹🇷 土耳其节点", flag: "🇹🇷", jsPattern: "🇹🇷|土耳其|\\bTR\\b|turkey|istanbul|伊斯坦布尔", filter: "(?i)(🇹🇷|土耳其|\\bTR\\b|turkey|istanbul|伊斯坦布尔)", icon: "" },
    { key: "bn", name: "🇧🇳 文莱节点", flag: "🇧🇳", jsPattern: "🇧🇳|文莱|\\bBN\\b|brunei", filter: "(?i)(🇧🇳|文莱|\\bBN\\b|brunei)", icon: "" },
    { key: "kh", name: "🇰🇭 柬埔寨节点", flag: "🇰🇭", jsPattern: "🇰🇭|柬埔寨|\\bKH\\b|cambodia|phnom[\\s_-]*penh|金边", filter: "(?i)(🇰🇭|柬埔寨|\\bKH\\b|cambodia|phnom[\\s_-]*penh|金边)", icon: "" },
    { key: "la", name: "🇱🇦 老挝节点", flag: "🇱🇦", jsPattern: "🇱🇦|老挝|\\bLA\\b|\\blaos\\b|vientiane|万象", filter: "(?i)(🇱🇦|老挝|\\bLA\\b|\\blaos\\b|vientiane|万象)", icon: "" },
    { key: "mm", name: "🇲🇲 缅甸节点", flag: "🇲🇲", jsPattern: "🇲🇲|缅甸|\\bMM\\b|myanmar|yangon|仰光", filter: "(?i)(🇲🇲|缅甸|\\bMM\\b|myanmar|yangon|仰光)", icon: "" },
    { key: "at", name: "🇦🇹 奥地利节点", flag: "🇦🇹", jsPattern: "🇦🇹|奥地利|\\bAT\\b|austria|vienna|维也纳", filter: "(?i)(🇦🇹|奥地利|\\bAT\\b|austria|vienna|维也纳)", icon: "" },
    { key: "be", name: "🇧🇪 比利时节点", flag: "🇧🇪", jsPattern: "🇧🇪|比利时|\\bBE\\b|belgium|brussels|布鲁塞尔", filter: "(?i)(🇧🇪|比利时|\\bBE\\b|belgium|brussels|布鲁塞尔)", icon: "" },
    { key: "bg", name: "🇧🇬 保加利亚节点", flag: "🇧🇬", jsPattern: "🇧🇬|保加利亚|\\bBG\\b|bulgaria|sofia|索非亚", filter: "(?i)(🇧🇬|保加利亚|\\bBG\\b|bulgaria|sofia|索非亚)", icon: "" },
    { key: "hr", name: "🇭🇷 克罗地亚节点", flag: "🇭🇷", jsPattern: "🇭🇷|克罗地亚|\\bHR\\b|croatia", filter: "(?i)(🇭🇷|克罗地亚|\\bHR\\b|croatia)", icon: "" },
    { key: "cy", name: "🇨🇾 塞浦路斯节点", flag: "🇨🇾", jsPattern: "🇨🇾|塞浦路斯|\\bCY\\b|cyprus", filter: "(?i)(🇨🇾|塞浦路斯|\\bCY\\b|cyprus)", icon: "" },
    { key: "cz", name: "🇨🇿 捷克节点", flag: "🇨🇿", jsPattern: "🇨🇿|捷克|捷克共和国|\\bCZ\\b|czech|prague|布拉格", filter: "(?i)(🇨🇿|捷克|捷克共和国|\\bCZ\\b|czech|prague|布拉格)", icon: "" },
    { key: "dk", name: "🇩🇰 丹麦节点", flag: "🇩🇰", jsPattern: "🇩🇰|丹麦|\\bDK\\b|denmark|copenhagen|哥本哈根", filter: "(?i)(🇩🇰|丹麦|\\bDK\\b|denmark|copenhagen|哥本哈根)", icon: "" },
    { key: "ee", name: "🇪🇪 爱沙尼亚节点", flag: "🇪🇪", jsPattern: "🇪🇪|爱沙尼亚|\\bEE\\b|estonia", filter: "(?i)(🇪🇪|爱沙尼亚|\\bEE\\b|estonia)", icon: "" },
    { key: "fi", name: "🇫🇮 芬兰节点", flag: "🇫🇮", jsPattern: "🇫🇮|芬兰|\\bFI\\b|finland|helsinki|赫尔辛基", filter: "(?i)(🇫🇮|芬兰|\\bFI\\b|finland|helsinki|赫尔辛基)", icon: "" },
    { key: "gr", name: "🇬🇷 希腊节点", flag: "🇬🇷", jsPattern: "🇬🇷|希腊|\\bGR\\b|greece|athens|雅典", filter: "(?i)(🇬🇷|希腊|\\bGR\\b|greece|athens|雅典)", icon: "" },
    { key: "hu", name: "🇭🇺 匈牙利节点", flag: "🇭🇺", jsPattern: "🇭🇺|匈牙利|\\bHU\\b|hungary|budapest|布达佩斯", filter: "(?i)(🇭🇺|匈牙利|\\bHU\\b|hungary|budapest|布达佩斯)", icon: "" },
    { key: "ie", name: "🇮🇪 爱尔兰节点", flag: "🇮🇪", jsPattern: "🇮🇪|爱尔兰|\\bIE\\b|ireland|dublin|都柏林", filter: "(?i)(🇮🇪|爱尔兰|\\bIE\\b|ireland|dublin|都柏林)", icon: "" },
    { key: "lv", name: "🇱🇻 拉脱维亚节点", flag: "🇱🇻", jsPattern: "🇱🇻|拉脱维亚|\\bLV\\b|latvia", filter: "(?i)(🇱🇻|拉脱维亚|\\bLV\\b|latvia)", icon: "" },
    { key: "lt", name: "🇱🇹 立陶宛节点", flag: "🇱🇹", jsPattern: "🇱🇹|立陶宛|\\bLT\\b|lithuania", filter: "(?i)(🇱🇹|立陶宛|\\bLT\\b|lithuania)", icon: "" },
    { key: "lu", name: "🇱🇺 卢森堡节点", flag: "🇱🇺", jsPattern: "🇱🇺|卢森堡|\\bLU\\b|luxembourg", filter: "(?i)(🇱🇺|卢森堡|\\bLU\\b|luxembourg)", icon: "" },
    { key: "mt", name: "🇲🇹 马耳他节点", flag: "🇲🇹", jsPattern: "🇲🇹|马耳他|\\bMT\\b|malta", filter: "(?i)(🇲🇹|马耳他|\\bMT\\b|malta)", icon: "" },
    { key: "pl", name: "🇵🇱 波兰节点", flag: "🇵🇱", jsPattern: "🇵🇱|波兰|\\bPL\\b|poland|warsaw|华沙", filter: "(?i)(🇵🇱|波兰|\\bPL\\b|poland|warsaw|华沙)", icon: "" },
    { key: "pt", name: "🇵🇹 葡萄牙节点", flag: "🇵🇹", jsPattern: "🇵🇹|葡萄牙|\\bPT\\b|portugal|lisbon|里斯本", filter: "(?i)(🇵🇹|葡萄牙|\\bPT\\b|portugal|lisbon|里斯本)", icon: "" },
    { key: "ro", name: "🇷🇴 罗马尼亚节点", flag: "🇷🇴", jsPattern: "🇷🇴|罗马尼亚|\\bRO\\b|romania|bucharest|布加勒斯特", filter: "(?i)(🇷🇴|罗马尼亚|\\bRO\\b|romania|bucharest|布加勒斯特)", icon: "" },
    { key: "sk", name: "🇸🇰 斯洛伐克节点", flag: "🇸🇰", jsPattern: "🇸🇰|斯洛伐克|\\bSK\\b|slovakia", filter: "(?i)(🇸🇰|斯洛伐克|\\bSK\\b|slovakia)", icon: "" },
    { key: "si", name: "🇸🇮 斯洛文尼亚节点", flag: "🇸🇮", jsPattern: "🇸🇮|斯洛文尼亚|\\bSI\\b|slovenia", filter: "(?i)(🇸🇮|斯洛文尼亚|\\bSI\\b|slovenia)", icon: "" },
    { key: "es", name: "🇪🇸 西班牙节点", flag: "🇪🇸", jsPattern: "🇪🇸|西班牙|\\bES\\b|\\bspain\\b|madrid|马德里", filter: "(?i)(🇪🇸|西班牙|\\bES\\b|\\bspain\\b|madrid|马德里)", icon: "" },
    { key: "se", name: "🇸🇪 瑞典节点", flag: "🇸🇪", jsPattern: "🇸🇪|瑞典|\\bSE\\b|sweden|stockholm|斯德哥尔摩", filter: "(?i)(🇸🇪|瑞典|\\bSE\\b|sweden|stockholm|斯德哥尔摩)", icon: "" },
    { key: "dz", name: "🇩🇿 阿尔及利亚节点", flag: "🇩🇿", jsPattern: "🇩🇿|阿尔及利亚|\\bDZ\\b|algeria", filter: "(?i)(🇩🇿|阿尔及利亚|\\bDZ\\b|algeria)", icon: "" },
    { key: "ao", name: "🇦🇴 安哥拉节点", flag: "🇦🇴", jsPattern: "🇦🇴|安哥拉|\\bAO\\b|angola", filter: "(?i)(🇦🇴|安哥拉|\\bAO\\b|angola)", icon: "" },
    { key: "bj", name: "🇧🇯 贝宁节点", flag: "🇧🇯", jsPattern: "🇧🇯|贝宁|\\bBJ\\b|benin", filter: "(?i)(🇧🇯|贝宁|\\bBJ\\b|benin)", icon: "" },
    { key: "bw", name: "🇧🇼 博茨瓦纳节点", flag: "🇧🇼", jsPattern: "🇧🇼|博茨瓦纳|\\bBW\\b|botswana", filter: "(?i)(🇧🇼|博茨瓦纳|\\bBW\\b|botswana)", icon: "" },
    { key: "bf", name: "🇧🇫 布基纳法索节点", flag: "🇧🇫", jsPattern: "🇧🇫|布基纳法索|\\bBF\\b|burkina[\\s_-]*faso", filter: "(?i)(🇧🇫|布基纳法索|\\bBF\\b|burkina[\\s_-]*faso)", icon: "" },
    { key: "bi", name: "🇧🇮 布隆迪节点", flag: "🇧🇮", jsPattern: "🇧🇮|布隆迪|\\bBI\\b|burundi", filter: "(?i)(🇧🇮|布隆迪|\\bBI\\b|burundi)", icon: "" },
    { key: "cv", name: "🇨🇻 佛得角节点", flag: "🇨🇻", jsPattern: "🇨🇻|佛得角|\\bCV\\b|cabo[\\s_-]*verde|cape[\\s_-]*verde", filter: "(?i)(🇨🇻|佛得角|\\bCV\\b|cabo[\\s_-]*verde|cape[\\s_-]*verde)", icon: "" },
    { key: "cm", name: "🇨🇲 喀麦隆节点", flag: "🇨🇲", jsPattern: "🇨🇲|喀麦隆|\\bCM\\b|cameroon", filter: "(?i)(🇨🇲|喀麦隆|\\bCM\\b|cameroon)", icon: "" },
    { key: "cf", name: "🇨🇫 中非共和国节点", flag: "🇨🇫", jsPattern: "🇨🇫|中非共和国|中非|\\bCF\\b|central[\\s_-]*african", filter: "(?i)(🇨🇫|中非共和国|中非|\\bCF\\b|central[\\s_-]*african)", icon: "" },
    { key: "td", name: "🇹🇩 乍得节点", flag: "🇹🇩", jsPattern: "🇹🇩|乍得|\\bTD\\b|\\bchad\\b", filter: "(?i)(🇹🇩|乍得|\\bTD\\b|\\bchad\\b)", icon: "" },
    { key: "km", name: "🇰🇲 科摩罗节点", flag: "🇰🇲", jsPattern: "🇰🇲|科摩罗|\\bKM\\b|comoros", filter: "(?i)(🇰🇲|科摩罗|\\bKM\\b|comoros)", icon: "" },
    { key: "cg", name: "🇨🇬 刚果共和国节点", flag: "🇨🇬", jsPattern: "🇨🇬|刚果共和国|刚果（布）|\\bCG\\b|\\bcongo\\b", filter: "(?i)(🇨🇬|刚果共和国|刚果（布）|\\bCG\\b|\\bcongo\\b)", icon: "" },
    { key: "cd", name: "🇨🇩 刚果民主共和国节点", flag: "🇨🇩", jsPattern: "🇨🇩|刚果民主共和国|刚果（金）|民主刚果|\\bCD\\b|dr[\\s_-]*congo|democratic[\\s_-]*republic[\\s_-]*of[\\s_-]*the[\\s_-]*congo", filter: "(?i)(🇨🇩|刚果民主共和国|刚果（金）|民主刚果|\\bCD\\b|dr[\\s_-]*congo|democratic[\\s_-]*republic[\\s_-]*of[\\s_-]*the[\\s_-]*congo)", icon: "" },
    { key: "ci", name: "🇨🇮 科特迪瓦节点", flag: "🇨🇮", jsPattern: "🇨🇮|科特迪瓦|象牙海岸|\\bCI\\b|cote[\\s_-]*d.ivoire|ivory[\\s_-]*coast", filter: "(?i)(🇨🇮|科特迪瓦|象牙海岸|\\bCI\\b|cote[\\s_-]*d.ivoire|ivory[\\s_-]*coast)", icon: "" },
    { key: "dj", name: "🇩🇯 吉布提节点", flag: "🇩🇯", jsPattern: "🇩🇯|吉布提|\\bDJ\\b|djibouti", filter: "(?i)(🇩🇯|吉布提|\\bDJ\\b|djibouti)", icon: "" },
    { key: "eg", name: "🇪🇬 埃及节点", flag: "🇪🇬", jsPattern: "🇪🇬|埃及|\\bEG\\b|egypt|cairo|开罗", filter: "(?i)(🇪🇬|埃及|\\bEG\\b|egypt|cairo|开罗)", icon: "" },
    { key: "gq", name: "🇬🇶 赤道几内亚节点", flag: "🇬🇶", jsPattern: "🇬🇶|赤道几内亚|\\bGQ\\b|equatorial[\\s_-]*guinea", filter: "(?i)(🇬🇶|赤道几内亚|\\bGQ\\b|equatorial[\\s_-]*guinea)", icon: "" },
    { key: "er", name: "🇪🇷 厄立特里亚节点", flag: "🇪🇷", jsPattern: "🇪🇷|厄立特里亚|\\bER\\b|eritrea", filter: "(?i)(🇪🇷|厄立特里亚|\\bER\\b|eritrea)", icon: "" },
    { key: "sz", name: "🇸🇿 斯威士兰节点", flag: "🇸🇿", jsPattern: "🇸🇿|斯威士兰|埃斯瓦蒂尼|\\bSZ\\b|eswatini|swaziland", filter: "(?i)(🇸🇿|斯威士兰|埃斯瓦蒂尼|\\bSZ\\b|eswatini|swaziland)", icon: "" },
    { key: "et", name: "🇪🇹 埃塞俄比亚节点", flag: "🇪🇹", jsPattern: "🇪🇹|埃塞俄比亚|\\bET\\b|ethiopia", filter: "(?i)(🇪🇹|埃塞俄比亚|\\bET\\b|ethiopia)", icon: "" },
    { key: "ga", name: "🇬🇦 加蓬节点", flag: "🇬🇦", jsPattern: "🇬🇦|加蓬|\\bGA\\b|\\bgabon\\b", filter: "(?i)(🇬🇦|加蓬|\\bGA\\b|\\bgabon\\b)", icon: "" },
    { key: "gm", name: "🇬🇲 冈比亚节点", flag: "🇬🇲", jsPattern: "🇬🇲|冈比亚|\\bGM\\b|gambia", filter: "(?i)(🇬🇲|冈比亚|\\bGM\\b|gambia)", icon: "" },
    { key: "gh", name: "🇬🇭 加纳节点", flag: "🇬🇭", jsPattern: "🇬🇭|加纳|\\bGH\\b|\\bghana\\b", filter: "(?i)(🇬🇭|加纳|\\bGH\\b|\\bghana\\b)", icon: "" },
    { key: "gn", name: "🇬🇳 几内亚节点", flag: "🇬🇳", jsPattern: "🇬🇳|几内亚|\\bGN\\b|\\bguinea\\b", filter: "(?i)(🇬🇳|几内亚|\\bGN\\b|\\bguinea\\b)", icon: "" },
    { key: "gw", name: "🇬🇼 几内亚比绍节点", flag: "🇬🇼", jsPattern: "🇬🇼|几内亚比绍|\\bGW\\b|guinea-bissau|guinea[\\s_-]*bissau", filter: "(?i)(🇬🇼|几内亚比绍|\\bGW\\b|guinea-bissau|guinea[\\s_-]*bissau)", icon: "" },
    { key: "ke", name: "🇰🇪 肯尼亚节点", flag: "🇰🇪", jsPattern: "🇰🇪|肯尼亚|\\bKE\\b|kenya|nairobi|内罗毕", filter: "(?i)(🇰🇪|肯尼亚|\\bKE\\b|kenya|nairobi|内罗毕)", icon: "" },
    { key: "ls", name: "🇱🇸 莱索托节点", flag: "🇱🇸", jsPattern: "🇱🇸|莱索托|\\bLS\\b|lesotho", filter: "(?i)(🇱🇸|莱索托|\\bLS\\b|lesotho)", icon: "" },
    { key: "lr", name: "🇱🇷 利比里亚节点", flag: "🇱🇷", jsPattern: "🇱🇷|利比里亚|\\bLR\\b|liberia", filter: "(?i)(🇱🇷|利比里亚|\\bLR\\b|liberia)", icon: "" },
    { key: "ly", name: "🇱🇾 利比亚节点", flag: "🇱🇾", jsPattern: "🇱🇾|利比亚|\\bLY\\b|\\blibya\\b", filter: "(?i)(🇱🇾|利比亚|\\bLY\\b|\\blibya\\b)", icon: "" },
    { key: "mg", name: "🇲🇬 马达加斯加节点", flag: "🇲🇬", jsPattern: "🇲🇬|马达加斯加|\\bMG\\b|madagascar", filter: "(?i)(🇲🇬|马达加斯加|\\bMG\\b|madagascar)", icon: "" },
    { key: "mw", name: "🇲🇼 马拉维节点", flag: "🇲🇼", jsPattern: "🇲🇼|马拉维|\\bMW\\b|malawi", filter: "(?i)(🇲🇼|马拉维|\\bMW\\b|malawi)", icon: "" },
    { key: "ml", name: "🇲🇱 马里节点", flag: "🇲🇱", jsPattern: "🇲🇱|马里|\\bML\\b|\\bmali\\b", filter: "(?i)(🇲🇱|马里|\\bML\\b|\\bmali\\b)", icon: "" },
    { key: "mr", name: "🇲🇷 毛里塔尼亚节点", flag: "🇲🇷", jsPattern: "🇲🇷|毛里塔尼亚|\\bMR\\b|mauritania", filter: "(?i)(🇲🇷|毛里塔尼亚|\\bMR\\b|mauritania)", icon: "" },
    { key: "mu", name: "🇲🇺 毛里求斯节点", flag: "🇲🇺", jsPattern: "🇲🇺|毛里求斯|\\bMU\\b|mauritius", filter: "(?i)(🇲🇺|毛里求斯|\\bMU\\b|mauritius)", icon: "" },
    { key: "ma", name: "🇲🇦 摩洛哥节点", flag: "🇲🇦", jsPattern: "🇲🇦|摩洛哥|\\bMA\\b|morocco|casablanca|卡萨布兰卡", filter: "(?i)(🇲🇦|摩洛哥|\\bMA\\b|morocco|casablanca|卡萨布兰卡)", icon: "" },
    { key: "mz", name: "🇲🇿 莫桑比克节点", flag: "🇲🇿", jsPattern: "🇲🇿|莫桑比克|\\bMZ\\b|mozambique", filter: "(?i)(🇲🇿|莫桑比克|\\bMZ\\b|mozambique)", icon: "" },
    { key: "na", name: "🇳🇦 纳米比亚节点", flag: "🇳🇦", jsPattern: "🇳🇦|纳米比亚|\\bNA\\b|\\bnamibia\\b", filter: "(?i)(🇳🇦|纳米比亚|\\bNA\\b|\\bnamibia\\b)", icon: "" },
    { key: "ne", name: "🇳🇪 尼日尔节点", flag: "🇳🇪", jsPattern: "🇳🇪|尼日尔|\\bNE\\b|\\bniger\\b", filter: "(?i)(🇳🇪|尼日尔|\\bNE\\b|\\bniger\\b)", icon: "" },
    { key: "ng", name: "🇳🇬 尼日利亚节点", flag: "🇳🇬", jsPattern: "🇳🇬|尼日利亚|\\bNG\\b|nigeria|lagos|拉各斯", filter: "(?i)(🇳🇬|尼日利亚|\\bNG\\b|nigeria|lagos|拉各斯)", icon: "" },
    { key: "rw", name: "🇷🇼 卢旺达节点", flag: "🇷🇼", jsPattern: "🇷🇼|卢旺达|\\bRW\\b|rwanda", filter: "(?i)(🇷🇼|卢旺达|\\bRW\\b|rwanda)", icon: "" },
    { key: "st", name: "🇸🇹 圣多美和普林西比节点", flag: "🇸🇹", jsPattern: "🇸🇹|圣多美和普林西比|\\bST\\b|sao[\\s_-]*tome", filter: "(?i)(🇸🇹|圣多美和普林西比|\\bST\\b|sao[\\s_-]*tome)", icon: "" },
    { key: "sn", name: "🇸🇳 塞内加尔节点", flag: "🇸🇳", jsPattern: "🇸🇳|塞内加尔|\\bSN\\b|senegal", filter: "(?i)(🇸🇳|塞内加尔|\\bSN\\b|senegal)", icon: "" },
    { key: "sc", name: "🇸🇨 塞舌尔节点", flag: "🇸🇨", jsPattern: "🇸🇨|塞舌尔|\\bSC\\b|seychelles", filter: "(?i)(🇸🇨|塞舌尔|\\bSC\\b|seychelles)", icon: "" },
    { key: "sl", name: "🇸🇱 塞拉利昂节点", flag: "🇸🇱", jsPattern: "🇸🇱|塞拉利昂|\\bSL\\b|sierra[\\s_-]*leone", filter: "(?i)(🇸🇱|塞拉利昂|\\bSL\\b|sierra[\\s_-]*leone)", icon: "" },
    { key: "so", name: "🇸🇴 索马里节点", flag: "🇸🇴", jsPattern: "🇸🇴|索马里|\\bSO\\b|somalia", filter: "(?i)(🇸🇴|索马里|\\bSO\\b|somalia)", icon: "" },
    { key: "ss", name: "🇸🇸 南苏丹节点", flag: "🇸🇸", jsPattern: "🇸🇸|南苏丹|\\bSS\\b|south[\\s_-]*sudan", filter: "(?i)(🇸🇸|南苏丹|\\bSS\\b|south[\\s_-]*sudan)", icon: "" },
    { key: "sd", name: "🇸🇩 苏丹节点", flag: "🇸🇩", jsPattern: "🇸🇩|苏丹|\\bSD\\b|\\bsudan\\b", filter: "(?i)(🇸🇩|苏丹|\\bSD\\b|\\bsudan\\b)", icon: "" },
    { key: "tz", name: "🇹🇿 坦桑尼亚节点", flag: "🇹🇿", jsPattern: "🇹🇿|坦桑尼亚|\\bTZ\\b|tanzania", filter: "(?i)(🇹🇿|坦桑尼亚|\\bTZ\\b|tanzania)", icon: "" },
    { key: "tg", name: "🇹🇬 多哥节点", flag: "🇹🇬", jsPattern: "🇹🇬|多哥|\\bTG\\b|\\btogo\\b", filter: "(?i)(🇹🇬|多哥|\\bTG\\b|\\btogo\\b)", icon: "" },
    { key: "tn", name: "🇹🇳 突尼斯节点", flag: "🇹🇳", jsPattern: "🇹🇳|突尼斯|\\bTN\\b|tunisia", filter: "(?i)(🇹🇳|突尼斯|\\bTN\\b|tunisia)", icon: "" },
    { key: "ug", name: "🇺🇬 乌干达节点", flag: "🇺🇬", jsPattern: "🇺🇬|乌干达|\\bUG\\b|uganda", filter: "(?i)(🇺🇬|乌干达|\\bUG\\b|uganda)", icon: "" },
    { key: "zm", name: "🇿🇲 赞比亚节点", flag: "🇿🇲", jsPattern: "🇿🇲|赞比亚|\\bZM\\b|zambia", filter: "(?i)(🇿🇲|赞比亚|\\bZM\\b|zambia)", icon: "" },
    { key: "zw", name: "🇿🇼 津巴布韦节点", flag: "🇿🇼", jsPattern: "🇿🇼|津巴布韦|\\bZW\\b|zimbabwe", filter: "(?i)(🇿🇼|津巴布韦|\\bZW\\b|zimbabwe)", icon: "" },
  ];

  function getMatchedRegions(proxyName) {
    proxyName = String(proxyName || "");
    if (regionMatchCache[proxyName]) return regionMatchCache[proxyName];
    var regions = [];
    for (var i = 0; i < REGIONS.length; i++) {
      var r = REGIONS[i];
      try {
        if (new RegExp(r.jsPattern, "i").test(proxyName)) regions.push(r);
      } catch (e) {}
    }
    regionMatchCache[proxyName] = regions;
    return regions;
  }

  function extractFlag(name) {
    var s = String(name || "");
    for (var i = 0; i < s.length - 1; i++) {
      var a = s.charCodeAt(i);
      var b = s.charCodeAt(i + 1);
      if (a === 0xD83C && b >= 0xDDE6 && b <= 0xDDFF) {
        var j = i + 2;
        if (j < s.length - 1 && s.charCodeAt(j) === 0xD83C && s.charCodeAt(j + 1) >= 0xDDE6 && s.charCodeAt(j + 1) <= 0xDDFF) {
          return s.substring(i, i + 4);
        }
      }
    }
    return "";
  }

  function normalizeProxyName(proxy) {
    var originalName = String((proxy && proxy.name) != null ? proxy.name : "");
    var flag = extractFlag(originalName);
    var nameWithoutFlag = (flag ? originalName.split(flag).join("") : originalName).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    var matched = getMatchedRegions(originalName);
    var regionFlag = flag;
    if (!regionFlag) {
      for (var i = 0; i < matched.length; i++) {
        if (matched[i].flag) { regionFlag = matched[i].flag; break; }
      }
    }
    var normalizedName = regionFlag ? (regionFlag + " " + nameWithoutFlag) : nameWithoutFlag;
    if (normalizedName !== originalName) regionMatchCache[normalizedName] = matched;
    if (normalizedName === originalName) return proxy;
    var out = {};
    for (var k in proxy) {
      if (Object.prototype.hasOwnProperty.call(proxy, k)) out[k] = proxy[k];
    }
    out.name = normalizedName;
    return out;
  }

  var sourceConfig = config || {};
  var originalProxies = sourceConfig.proxies || [];
  config = {};

  var excludeFilter =
    /群|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|访问|支持|教程|关注|更新|作者|加入|超时|收藏|福利|邀请|好友|失联|选择|剩余|公益|发布|通路|登录|禁止|定时|渠道|牢记|永久|余额|阁下|本站|刷新|导航|建议|重置|以下|防失联|⚠️|@|\bexpire\b|\bhttps?:\/\/|\.com|\btraffic\b/i;

  var filteredRaw = originalProxies.filter(function(proxy) {
    var type = String(proxy.type != null ? proxy.type : "").toLowerCase();
    if (type === "direct" || type === "reject" || type === "rematch") return false;
    var name = String(proxy.name != null ? proxy.name : "");
    if (excludeFilter.test(name)) return false;
    return true;
  });

  var nameCount = {};
  var normalizedProxies = [];
  var regionsWithNodes = {};
  var hasOtherRegionNodes = false;
  for (var rawIndex = 0; rawIndex < filteredRaw.length; rawIndex++) {
    var raw = filteredRaw[rawIndex];
    var n = normalizeProxyName(raw);
    var finalName = n.name;
    if (Object.prototype.hasOwnProperty.call(nameCount, finalName)) {
      var count = nameCount[finalName] + 1;
      nameCount[finalName] = count;
      finalName = n.name + " #" + count;
    } else {
      nameCount[finalName] = 1;
    }
    if (finalName === n.name) {
      normalizedProxies.push(n);
    } else {
      var n2 = {};
      for (var nk in n) { if (Object.prototype.hasOwnProperty.call(n, nk)) n2[nk] = n[nk]; }
      n2.name = finalName;
      normalizedProxies.push(n2);
    }

    var matched = getMatchedRegions(raw.name || "");
    if (matched.length > 0) {
      for (var mi = 0; mi < matched.length; mi++) { regionsWithNodes[matched[mi].name] = true; }
    } else {
      hasOtherRegionNodes = true;
    }
  }

  config.proxies = normalizedProxies.length > 0 ? normalizedProxies : originalProxies;

  var allRegionKeywords = REGIONS.map(function(r) { return r.jsPattern; }).join("|");
  var OTHER_REGION_NAME = "🌐 其他地区";

  function buildRegionTrio(name, matchField) {
    var autoName = "" + name + "-自动选择";
    var lbName = "" + name + "-负载均衡";
    var common = { "include-all": true, url: "https://www.gstatic.com/generate_204", interval: 180, timeout: 3000, "expected-status": 204, icon: "", hidden: true };
    var auto = { name: autoName, type: "url-test", tolerance: 35, "max-failed-times": 2 };
    var lb = { name: lbName, type: "load-balance", strategy: "sticky-sessions" };
    for (var ck in common) { if (Object.prototype.hasOwnProperty.call(common, ck)) { auto[ck] = common[ck]; lb[ck] = common[ck]; } }
    for (var mk in matchField) { if (Object.prototype.hasOwnProperty.call(matchField, mk)) { auto[mk] = matchField[mk]; lb[mk] = matchField[mk]; } }
    var select = { name: name, type: "select", proxies: [autoName, lbName], icon: "" };
    return [auto, lb, select];
  }

  var regionGroups = [];
  var activeRegions = REGIONS.filter(function(r) { return Object.prototype.hasOwnProperty.call(regionsWithNodes, r.name); });
  for (var ri = 0; ri < activeRegions.length; ri++) {
    var r = activeRegions[ri];
    regionGroups.push.apply(regionGroups, buildRegionTrio(r.name, { filter: r.filter }));
  }
  if (hasOtherRegionNodes) {
    regionGroups.push.apply(regionGroups, buildRegionTrio(OTHER_REGION_NAME, { "exclude-filter": "(?i)(" + allRegionKeywords + ")" }));
  }

  var regionNames = activeRegions.map(function(r) { return r.name; });
  if (hasOtherRegionNodes) regionNames.push(OTHER_REGION_NAME);

  // Claude 与其他 AI 排除港台地区节点（规避限制地区）
  var regionNamesNoHK = regionNames.filter(function(n) { return n !== "🇭🇰 香港节点" && n !== "🇹🇼 台湾节点"; });

  var AUTO_NAME = "♻️ 自动选择";
  var LB_NAME = "⚖️ 负载均衡";
  var SELECT_NAME = "🔰 节点选择";

  var autoGroup = { name: AUTO_NAME, type: "url-test", "include-all": true, url: "https://www.gstatic.com/generate_204", interval: 180, tolerance: 35, timeout: 3000, "expected-status": 204, "max-failed-times": 2, icon: "" };
  var lbGroup = { name: LB_NAME, type: "load-balance", strategy: "sticky-sessions", "include-all": true, url: "https://www.gstatic.com/generate_204", interval: 180, timeout: 3000, "expected-status": 204, icon: "" };
  var selectGroup = { name: SELECT_NAME, type: "select", proxies: [AUTO_NAME, LB_NAME].concat(regionNames), icon: "" };
  var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT-DROP", "REJECT", "DIRECT"], icon: "" };
  var claudeGroup = { name: "🤖 Claude AI", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNamesNoHK), icon: "" };
  var geminiGroup = { name: "🎓 Gemini", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNamesNoHK), icon: "" };
  var aiGroup = { name: "🤖 AI服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNamesNoHK), icon: "" };
  var mediaGroup = { name: "📺 Media", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var youtubeGroup = { name: "📺 YouTube", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var googleGroup = { name: "🔍 Google", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var telegramGroup = { name: "📲 Telegram", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var microsoftGroup = { name: "🪟 Microsoft", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var appleGroup = { name: "🍎 Apple", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var steamGroup = { name: "🎮 Steam", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var tiktokGroup = { name: "📱 TikTok", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var twitterGroup = { name: "🐦 Twitter", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var spotifyGroup = { name: "🎵 Spotify", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var globalServiceGroup = { name: "🌍 国外服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var fallbackGroup = { name: "🐟 漏网之鱼", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "🌍 国外服务", "DIRECT"], icon: "" };

  config["proxy-groups"] = [
    selectGroup, autoGroup, lbGroup, adBlockGroup, claudeGroup, geminiGroup, aiGroup,
    mediaGroup, youtubeGroup, googleGroup, telegramGroup, microsoftGroup,
    appleGroup, steamGroup, tiktokGroup, twitterGroup, spotifyGroup,
    globalServiceGroup, fallbackGroup, remoteToolGroup
  ].concat(regionGroups);

  config["rule-providers"] = {
    "claude": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/claude.mrs",
      "path": "./ruleset/claude.mrs"
    },
    "category-ads-all": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 86400,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-ads-all.mrs",
      "path": "./ruleset/category-ads-all.mrs"
    },
    "gemini": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/gemini.mrs",
      "path": "./ruleset/gemini.mrs"
    },
    "category-ai-!cn": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-ai-!cn.mrs",
      "path": "./ruleset/category-ai-!cn.mrs"
    },
    "openai": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/openai.mrs",
      "path": "./ruleset/openai.mrs"
    },
    "bilibili": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/bilibili.mrs",
      "path": "./ruleset/bilibili.mrs"
    },
    "geolocation-cn": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/geolocation-cn.mrs",
      "path": "./ruleset/geolocation-cn.mrs"
    },
    "cn": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/cn.mrs",
      "path": "./ruleset/cn.mrs"
    },
    "youtube": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/youtube.mrs",
      "path": "./ruleset/youtube.mrs"
    },
    "netflix": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/netflix.mrs",
      "path": "./ruleset/netflix.mrs"
    },
    "hulu": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/hulu.mrs",
      "path": "./ruleset/hulu.mrs"
    },
    "disney": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/disney.mrs",
      "path": "./ruleset/disney.mrs"
    },
    "hbo": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/hbo.mrs",
      "path": "./ruleset/hbo.mrs"
    },
    "amazon": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/amazon.mrs",
      "path": "./ruleset/amazon.mrs"
    },
    "bahamut": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/bahamut.mrs",
      "path": "./ruleset/bahamut.mrs"
    },
    "spotify": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/spotify.mrs",
      "path": "./ruleset/spotify.mrs"
    },
    "tiktok": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/tiktok.mrs",
      "path": "./ruleset/tiktok.mrs"
    },
    "biliintl": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/biliintl.mrs",
      "path": "./ruleset/biliintl.mrs"
    },
    "abema": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/abema.mrs",
      "path": "./ruleset/abema.mrs"
    },
    "bbc": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/bbc.mrs",
      "path": "./ruleset/bbc.mrs"
    },
    "google": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/google.mrs",
      "path": "./ruleset/google.mrs"
    },
    "github": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/github.mrs",
      "path": "./ruleset/github.mrs"
    },
    "gitlab": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/gitlab.mrs",
      "path": "./ruleset/gitlab.mrs"
    },
    "apple": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/apple.mrs",
      "path": "./ruleset/apple.mrs"
    },
    "microsoft": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/microsoft.mrs",
      "path": "./ruleset/microsoft.mrs"
    },
    "facebook": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/facebook.mrs",
      "path": "./ruleset/facebook.mrs"
    },
    "instagram": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/instagram.mrs",
      "path": "./ruleset/instagram.mrs"
    },
    "twitter": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/twitter.mrs",
      "path": "./ruleset/twitter.mrs"
    },
    "linkedin": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/linkedin.mrs",
      "path": "./ruleset/linkedin.mrs"
    },
    "discord": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/discord.mrs",
      "path": "./ruleset/discord.mrs"
    },
    "snapchat": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/snap.mrs",
      "path": "./ruleset/snapchat.mrs"
    },
    "icloud": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/icloud.mrs",
      "path": "./ruleset/icloud.mrs"
    },
    "apple-cn": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/apple-cn.mrs",
      "path": "./ruleset/apple-cn.mrs"
    },
    "microsoft-cn": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/microsoft@cn.mrs",
      "path": "./ruleset/microsoft-cn.mrs"
    },
    "steam": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/steam.mrs",
      "path": "./ruleset/steam.mrs"
    },
    "epicgames": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/epicgames.mrs",
      "path": "./ruleset/epicgames.mrs"
    },
    "ea": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/ea.mrs",
      "path": "./ruleset/ea.mrs"
    },
    "ubisoft": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/ubisoft.mrs",
      "path": "./ruleset/ubisoft.mrs"
    },
    "blizzard": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/blizzard.mrs",
      "path": "./ruleset/blizzard.mrs"
    },
    "steam-cn": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/steam@cn.mrs",
      "path": "./ruleset/steam-cn.mrs"
    },
    "category-games-cn": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-games@cn.mrs",
      "path": "./ruleset/category-games-cn.mrs"
    },
    "paypal": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/paypal.mrs",
      "path": "./ruleset/paypal.mrs"
    },
    "aws": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/aws.mrs",
      "path": "./ruleset/aws.mrs"
    },
    "azure": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/azure.mrs",
      "path": "./ruleset/azure.mrs"
    },
    "dropbox": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/dropbox.mrs",
      "path": "./ruleset/dropbox.mrs"
    },
    "onedrive": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/onedrive.mrs",
      "path": "./ruleset/onedrive.mrs"
    },
    "category-scholar-!cn": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-scholar-!cn.mrs",
      "path": "./ruleset/category-scholar-!cn.mrs"
    },
    "tracker": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/tracker.mrs",
      "path": "./ruleset/tracker.mrs"
    },
    "geolocation-!cn": {
      "type": "http",
      "format": "mrs",
      "behavior": "domain",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/geolocation-!cn.mrs",
      "path": "./ruleset/geolocation-!cn.mrs"
    },
    "wechat": {
      "type": "http",
      "behavior": "classical",
      "format": "yaml",
      "interval": 86400,
      "url": "https://gcore.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/WeChat/WeChat.yaml",
      "path": "./ruleset/wechat.yaml"
    },
    "private-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/private.mrs",
      "path": "./ruleset/private-ip.mrs"
    },
    "cn-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.mrs",
      "path": "./ruleset/cn-ip.mrs"
    },
    "google-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/google.mrs",
      "path": "./ruleset/google-ip.mrs"
    },
    "youtube-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/youtube.mrs",
      "path": "./ruleset/youtube-ip.mrs"
    },
    "telegram-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/telegram.mrs",
      "path": "./ruleset/telegram-ip.mrs"
    },
    "netflix-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/netflix.mrs",
      "path": "./ruleset/netflix-ip.mrs"
    },
    "facebook-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/facebook.mrs",
      "path": "./ruleset/facebook-ip.mrs"
    },
    "twitter-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/twitter.mrs",
      "path": "./ruleset/twitter-ip.mrs"
    },
    "cloudflare-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cloudflare.mrs",
      "path": "./ruleset/cloudflare-ip.mrs"
    },
    "cloudfront-ip": {
      "type": "http",
      "format": "mrs",
      "behavior": "ipcidr",
      "interval": 604800,
      "proxy": "DIRECT",
      "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cloudfront.mrs",
      "path": "./ruleset/cloudfront-ip.mrs"
    }
  };

  config.rules = [
    "RULE-SET,category-ads-all,🛑 广告拦截",
    "RULE-SET,private-ip,DIRECT,no-resolve",
    "RULE-SET,wechat,DIRECT",
    "RULE-SET,claude,🤖 Claude AI",
    "RULE-SET,gemini,🎓 Gemini",
    "RULE-SET,openai,🤖 AI服务",
    "RULE-SET,category-ai-!cn,🤖 AI服务",
    "RULE-SET,youtube,📺 YouTube",
    "RULE-SET,youtube-ip,📺 YouTube",
    "RULE-SET,netflix,📺 Media",
    "RULE-SET,netflix-ip,📺 Media",
    "RULE-SET,hulu,📺 Media",
    "RULE-SET,disney,📺 Media",
    "RULE-SET,hbo,📺 Media",
    "RULE-SET,bahamut,📺 Media",
    "RULE-SET,biliintl,📺 Media",
    "RULE-SET,abema,📺 Media",
    "RULE-SET,bbc,📺 Media",
    "RULE-SET,tiktok,📱 TikTok",
    "RULE-SET,spotify,🎵 Spotify",
    "RULE-SET,telegram-ip,📲 Telegram",
    "RULE-SET,google,🔍 Google",
    "RULE-SET,google-ip,🔍 Google",
    "RULE-SET,twitter,🐦 Twitter",
    "RULE-SET,twitter-ip,🐦 Twitter",
    "RULE-SET,facebook,🌍 国外服务",
    "RULE-SET,facebook-ip,🌍 国外服务",
    "RULE-SET,instagram,🌍 国外服务",
    "RULE-SET,linkedin,🌍 国外服务",
    "RULE-SET,discord,🌍 国外服务",
    "RULE-SET,snapchat,🌍 国外服务",
    "RULE-SET,github,🌍 国外服务",
    "RULE-SET,gitlab,🌍 国外服务",
    "RULE-SET,amazon,🌍 国外服务",
    "RULE-SET,aws,🌍 国外服务",
    "RULE-SET,azure,🌍 国外服务",
    "RULE-SET,dropbox,🌍 国外服务",
    "RULE-SET,paypal,🌍 国外服务",
    "RULE-SET,category-scholar-!cn,🌍 国外服务",
    "RULE-SET,cloudflare-ip,🌍 国外服务",
    "RULE-SET,cloudfront-ip,🌍 国外服务",
    "RULE-SET,apple-cn,DIRECT",
    "RULE-SET,icloud,🍎 Apple",
    "RULE-SET,apple,🍎 Apple",
    "RULE-SET,microsoft-cn,DIRECT",
    "RULE-SET,onedrive,🪟 Microsoft",
    "RULE-SET,microsoft,🪟 Microsoft",
    "RULE-SET,steam-cn,DIRECT",
    "RULE-SET,steam,🎮 Steam",
    "RULE-SET,epicgames,🎮 Steam",
    "RULE-SET,ea,🎮 Steam",
    "RULE-SET,ubisoft,🎮 Steam",
    "RULE-SET,blizzard,🎮 Steam",
    "RULE-SET,category-games-cn,DIRECT",
    "RULE-SET,bilibili,DIRECT",
    "RULE-SET,geolocation-cn,DIRECT",
    "RULE-SET,cn,DIRECT",
    "RULE-SET,cn-ip,DIRECT",
    "RULE-SET,tracker,DIRECT",
    "RULE-SET,geolocation-!cn,🌍 国外服务",
    "MATCH,🐟 漏网之鱼"
  ];

  config["tun"] = {
  "enable": true,
  "stack": "mixed",
  "auto-route": true,
  "auto-redirect": false,
  "strict-route": true,
  "auto-detect-interface": true,
  "mtu": 1500,
  "gso": true,
  "gso-max-size": 65536,
  "udp-timeout": 300,
  "dns-hijack": [
    "any:53",
    "tcp://any:53"
  ]
};

  var DOMESTIC_DNS = ["223.5.5.5", "223.6.6.6"];

  config["dns"] = {
  "enable": true,
  "listen": "127.0.0.1:1053",
  "ipv6": true,
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "fake-ip-range6": "fc00::/18",
  "fake-ip-cache-size": 4096,
  "ttl": 600,
  "min-ttl": 60,
  "max-ttl": 3600,
  "cache-size": 8192,
  "cache-algorithm": "arc",
  "prefer-h3": false,
  "use-hosts": true,
  "use-system-hosts": false,
  "disable-qtype-65": true,
  "fake-ip-filter-mode": "rule",
  "fake-ip-filter": [
    "DOMAIN-SUFFIX,abchina.com,real-ip",
    "DOMAIN-SUFFIX,icbc.com.cn,real-ip",
    "DOMAIN-SUFFIX,ccb.com,real-ip",
    "DOMAIN-SUFFIX,boc.cn,real-ip",
    "DOMAIN-SUFFIX,cmbchina.com,real-ip",
    "DOMAIN-SUFFIX,bankcomm.com,real-ip",
    "DOMAIN-SUFFIX,psbc.com,real-ip",
    "DOMAIN-SUFFIX,spdb.com.cn,real-ip",
    "DOMAIN-SUFFIX,cib.com.cn,real-ip",
    "DOMAIN-SUFFIX,cmbc.com.cn,real-ip",
    "DOMAIN-SUFFIX,pingan.com,real-ip",
    "DOMAIN-SUFFIX,cgbchina.com.cn,real-ip",
    "DOMAIN-SUFFIX,hxb.com.cn,real-ip",
    "DOMAIN-SUFFIX,cebbank.com,real-ip",
    "DOMAIN-SUFFIX,citicbank.com,real-ip",
    "DOMAIN-SUFFIX,ecitic.com,real-ip",
    "DOMAIN-SUFFIX,bankofchina.com,real-ip",
    "DOMAIN-SUFFIX,cmbi.com.cn,real-ip",
    "DOMAIN-SUFFIX,netsunion.org.cn,real-ip",
    "DOMAIN-SUFFIX,gfbazc.com,real-ip",
    "DOMAIN-SUFFIX,fzuol.com,real-ip",
    "DOMAIN-SUFFIX,mps.gov.cn,real-ip",
    "DOMAIN-SUFFIX,unionpay.com,real-ip",
    "DOMAIN-SUFFIX,95516.com,real-ip",
    "DOMAIN-SUFFIX,alipay.com,real-ip",
    "DOMAIN-SUFFIX,alipayobjects.com,real-ip",
    "DOMAIN-SUFFIX,tenpay.com,real-ip",
    "DOMAIN-SUFFIX,wechatpay.cn,real-ip",
    "DOMAIN-SUFFIX,servicewechat.com,real-ip",
    "DOMAIN-SUFFIX,weixinbridge.com,real-ip",
    "DOMAIN-SUFFIX,url.cn,real-ip",
    "DOMAIN-SUFFIX,tongdun.net,real-ip",
    "DOMAIN-SUFFIX,tongduncdn.com,real-ip",
    "DOMAIN-SUFFIX,ishumei.com,real-ip",
    "DOMAIN-SUFFIX,geetest.com,real-ip",
    "DOMAIN-SUFFIX,trustdevice.net,real-ip",
    "DOMAIN-SUFFIX,aegis.qq.com,real-ip",
    "DOMAIN-SUFFIX,antpay.com,real-ip",
    "DOMAIN-SUFFIX,riskradar.net,real-ip",
    "DOMAIN-SUFFIX,abchina.com.cn,real-ip",
    "DOMAIN-SUFFIX,jpush.cn,real-ip",
    "DOMAIN-SUFFIX,jpush.io,real-ip",
    "DOMAIN-SUFFIX,jiguang.cn,real-ip",
    "DOMAIN-SUFFIX,rongcloud.cn,real-ip",
    "DOMAIN-SUFFIX,rongcloud.com,real-ip",
    "DOMAIN-SUFFIX,umeng.com,real-ip",
    "DOMAIN-SUFFIX,umengcloud.com,real-ip",
    "DOMAIN-SUFFIX,dingxiangyun.com,real-ip",
    "DOMAIN-SUFFIX,dingxiangyun.cn,real-ip",
    "DOMAIN-SUFFIX,rong360.com,real-ip",
    "DOMAIN-SUFFIX,yzf.com.cn,real-ip",
    "DOMAIN-SUFFIX,99bill.com,real-ip",
    "DOMAIN-SUFFIX,chinapay.com,real-ip",
    "DOMAIN-SUFFIX,yeepay.com,real-ip",
    "DOMAIN-SUFFIX,jdpay.com,real-ip",
    "DOMAIN-SUFFIX,weixin.qq.com,real-ip",
    "DOMAIN-SUFFIX,wx.qq.com,real-ip",
    "DOMAIN-SUFFIX,weixin.com,real-ip",
    "RULE-SET,category-ads-all,fake-ip",
    "RULE-SET,geolocation-cn,real-ip",
    "RULE-SET,cn,real-ip",
    "RULE-SET,bilibili,real-ip",
    "GEOSITE,cn,real-ip",
    "DOMAIN-SUFFIX,localhost,real-ip",
    "DOMAIN-SUFFIX,local,real-ip",
    "DOMAIN-SUFFIX,lan,real-ip",
    "DOMAIN-SUFFIX,internal,real-ip",
    "DOMAIN-SUFFIX,localdomain,real-ip",
    "DOMAIN-SUFFIX,home.arpa,real-ip",
    "DOMAIN-SUFFIX,example,real-ip",
    "DOMAIN-SUFFIX,invalid,real-ip",
    "DOMAIN-SUFFIX,test,real-ip",
    "DOMAIN-SUFFIX,ip6.arpa,real-ip",
    "DOMAIN-SUFFIX,in-addr.arpa,real-ip",
    "DOMAIN-SUFFIX,msftconnecttest.com,real-ip",
    "DOMAIN-SUFFIX,msftncsi.com,real-ip",
    "DOMAIN,captive.apple.com,real-ip",
    "DOMAIN,connectivitycheck.gstatic.com,real-ip",
    "DOMAIN-SUFFIX,gstatic.com,real-ip",
    "DOMAIN-SUFFIX,10086.cn,real-ip",
    "DOMAIN-SUFFIX,10010.com,real-ip",
    "DOMAIN-SUFFIX,10000.cn,real-ip",
    "DOMAIN-SUFFIX,minorshield.qq.com,real-ip",
    "DOMAIN-SUFFIX,icloud.com.cn,real-ip",
    "DOMAIN-SUFFIX,apple.com.cn,real-ip",
    "DOMAIN-SUFFIX,mzstatic.com.cn,real-ip",
    "DOMAIN,gsa.apple.com,real-ip",
    "DOMAIN,configuration.apple.com,real-ip",
    "DOMAIN,mesu.apple.com,real-ip",
    "DOMAIN,time.apple.com,real-ip",
    "DOMAIN-SUFFIX,windowsupdate.com,real-ip",
    "DOMAIN-SUFFIX,update.microsoft.com,real-ip",
    "DOMAIN-SUFFIX,download.microsoft.com,real-ip",
    "DOMAIN-SUFFIX,microsoft.com.cn,real-ip",
    "DOMAIN-SUFFIX,chinacloudapi.cn,real-ip",
    "DOMAIN-SUFFIX,azure.cn,real-ip",
    "DOMAIN-SUFFIX,microsoftonline.cn,real-ip",
    "DOMAIN-SUFFIX,msftauth.net,real-ip",
    "DOMAIN,time.windows.com,real-ip",
    "DOMAIN-SUFFIX,mi.com,real-ip",
    "DOMAIN-SUFFIX,xiaomi.com,real-ip",
    "DOMAIN-SUFFIX,miui.com,real-ip",
    "DOMAIN-SUFFIX,micloud.com,real-ip",
    "DOMAIN-SUFFIX,mi-img.com,real-ip",
    "DOMAIN-SUFFIX,miwifi.com,real-ip",
    "DOMAIN-SUFFIX,xiaomiev.com,real-ip",
    "DOMAIN-SUFFIX,huawei.com,real-ip",
    "DOMAIN-SUFFIX,huaweicloud.com,real-ip",
    "DOMAIN-SUFFIX,hicloud.com,real-ip",
    "DOMAIN-SUFFIX,vmall.com,real-ip",
    "DOMAIN-SUFFIX,honor.com,real-ip",
    "DOMAIN-SUFFIX,vivo.com,real-ip",
    "DOMAIN-SUFFIX,vivoglobal.com,real-ip",
    "DOMAIN-SUFFIX,oppo.com,real-ip",
    "DOMAIN-SUFFIX,oppomobile.com,real-ip",
    "DOMAIN-SUFFIX,meizu.com,real-ip",
    "DOMAIN-SUFFIX,samsung.com.cn,real-ip",
    "DOMAIN-SUFFIX,samsungapps.com,real-ip",
    "DOMAIN-SUFFIX,samsungcloud.com,real-ip",
    "DOMAIN-SUFFIX,samsungknox.com,real-ip",
    "DOMAIN-SUFFIX,samsungdm.com,real-ip",
    "DOMAIN-SUFFIX,qq.com,real-ip",
    "DOMAIN-SUFFIX,wechat.com,real-ip",
    "DOMAIN-SUFFIX,tencent.com,real-ip",
    "DOMAIN-SUFFIX,tencent-cloud.com,real-ip",
    "DOMAIN-SUFFIX,qpic.cn,real-ip",
    "DOMAIN-SUFFIX,qlogo.cn,real-ip",
    "DOMAIN-SUFFIX,gtimg.com,real-ip",
    "DOMAIN-SUFFIX,gdtimg.com,real-ip",
    "DOMAIN-SUFFIX,myqcloud.com,real-ip",
    "DOMAIN-SUFFIX,taobao.com,real-ip",
    "DOMAIN-SUFFIX,tmall.com,real-ip",
    "DOMAIN-SUFFIX,tbcdn.cn,real-ip",
    "DOMAIN-SUFFIX,alicdn.com,real-ip",
    "DOMAIN-SUFFIX,aliyun.com,real-ip",
    "DOMAIN-SUFFIX,amap.com,real-ip",
    "DOMAIN-SUFFIX,autonavi.com,real-ip",
    "DOMAIN-SUFFIX,ele.me,real-ip",
    "DOMAIN-SUFFIX,dingtalk.com,real-ip",
    "DOMAIN-SUFFIX,1688.com,real-ip",
    "DOMAIN-SUFFIX,bytedance.com,real-ip",
    "DOMAIN-SUFFIX,byteimg.com,real-ip",
    "DOMAIN-SUFFIX,tosv.com,real-ip",
    "DOMAIN-SUFFIX,douyin.com,real-ip",
    "DOMAIN-SUFFIX,iesdouyin.com,real-ip",
    "DOMAIN-SUFFIX,pstatp.com,real-ip",
    "DOMAIN-SUFFIX,snssdk.com,real-ip",
    "DOMAIN-SUFFIX,volccdn.com,real-ip",
    "DOMAIN-SUFFIX,toutiao.com,real-ip",
    "DOMAIN-SUFFIX,ixigua.com,real-ip",
    "DOMAIN-SUFFIX,baidu.com,real-ip",
    "DOMAIN-SUFFIX,bdstatic.com,real-ip",
    "DOMAIN-SUFFIX,bdimg.com,real-ip",
    "DOMAIN-SUFFIX,bcebos.com,real-ip",
    "DOMAIN-SUFFIX,meituan.com,real-ip",
    "DOMAIN-SUFFIX,meituan.net,real-ip",
    "DOMAIN-SUFFIX,dianping.com,real-ip",
    "DOMAIN-SUFFIX,pinduoduo.com,real-ip",
    "DOMAIN-SUFFIX,jd.com,real-ip",
    "DOMAIN-SUFFIX,jdcdn.com,real-ip",
    "DOMAIN-SUFFIX,kuaishou.com,real-ip",
    "DOMAIN-SUFFIX,ksyun.com,real-ip",
    "DOMAIN-SUFFIX,xiaohongshu.com,real-ip",
    "DOMAIN-SUFFIX,xhscdn.com,real-ip",
    "DOMAIN-SUFFIX,netease.com,real-ip",
    "DOMAIN-SUFFIX,163.com,real-ip",
    "DOMAIN-SUFFIX,126.net,real-ip",
    "DOMAIN-SUFFIX,unionpaysecure.com,real-ip",
    "DOMAIN-SUFFIX,pingan.com.cn,real-ip",
    "DOMAIN-SUFFIX,cpic.com.cn,real-ip",
    "DOMAIN-SUFFIX,zhongan.com,real-ip",
    "DOMAIN-SUFFIX,eastmoney.com,real-ip",
    "DOMAIN-SUFFIX,htsc.com.cn,real-ip",
    "DOMAIN-SUFFIX,gtja.com,real-ip",
    "DOMAIN-SUFFIX,deepseek.com,real-ip",
    "DOMAIN-SUFFIX,deepseek.ai,real-ip",
    "DOMAIN-SUFFIX,moonshot.cn,real-ip",
    "DOMAIN-SUFFIX,kimichat.com,real-ip",
    "DOMAIN-SUFFIX,zhipuai.cn,real-ip",
    "DOMAIN-SUFFIX,chatglm.cn,real-ip",
    "DOMAIN-SUFFIX,baichuan-ai.com,real-ip",
    "DOMAIN-SUFFIX,sensetime.com,real-ip",
    "DOMAIN-SUFFIX,minimax.chat,real-ip",
    "DOMAIN-SUFFIX,stepfun.com,real-ip",
    "DOMAIN-SUFFIX,iflytek.com,real-ip",
    "DOMAIN-SUFFIX,bilivideo.cn,real-ip",
    "DOMAIN-SUFFIX,iqiyi.com,real-ip",
    "DOMAIN-SUFFIX,youku.com,real-ip",
    "DOMAIN-SUFFIX,asusrouter.com,real-ip",
    "DOMAIN-SUFFIX,router.asus.com,real-ip",
    "DOMAIN-SUFFIX,tplinkwifi.net,real-ip",
    "DOMAIN-SUFFIX,tendawifi.com,real-ip",
    "DOMAIN-SUFFIX,routerlogin.com,real-ip",
    "DOMAIN-SUFFIX,tplogin.cn,real-ip",
    "DOMAIN-SUFFIX,hiwifi.com,real-ip",
    "DOMAIN-SUFFIX,phicomm.me,real-ip",
    "DOMAIN-SUFFIX,local.adguard.org,real-ip",
    "DOMAIN-SUFFIX,plex.direct,real-ip",
    "DOMAIN-SUFFIX,ts.net,real-ip",
    "DOMAIN-SUFFIX,todesk.com,real-ip",
    "DOMAIN-SUFFIX,oray.com,real-ip",
    "DOMAIN-SUFFIX,sunlogin.com,real-ip",
    "DOMAIN-SUFFIX,teamviewer.com,real-ip",
    "DOMAIN-SUFFIX,anydesk.com,real-ip",
    "DOMAIN-SUFFIX,rustdesk.com,real-ip",
    "DOMAIN,localhost.ptlogin2.qq.com,real-ip",
    "DOMAIN,localhost.sec.qq.com,real-ip",
    "DOMAIN,localhost.work.weixin.qq.com,real-ip",
    "DOMAIN-SUFFIX,market.xiaomi.com,real-ip",
    "DOMAIN-SUFFIX,pool.ntp.org,real-ip",
    "DOMAIN-SUFFIX,ntp.org,real-ip",
    "DOMAIN-SUFFIX,ntp.aliyun.com,real-ip",
    "DOMAIN-SUFFIX,ntp1.aliyun.com,real-ip",
    "DOMAIN-SUFFIX,ntp.tencent.com,real-ip",
    "DOMAIN-SUFFIX,ntp.ubuntu.com,real-ip",
    "DOMAIN-SUFFIX,time.nist.gov,real-ip",
    "DOMAIN,time.cloudflare.com,real-ip",
    "DOMAIN,doh.pub,real-ip",
    "DOMAIN,dns.alidns.com,real-ip",
    "DOMAIN,mtalk.google.com,real-ip",
    "DOMAIN-SUFFIX,gov.cn,real-ip",
    "DOMAIN-SUFFIX,edu.cn,real-ip",
    "DOMAIN-SUFFIX,12306.cn,real-ip",
    "DOMAIN-SUFFIX,chinatax.gov.cn,real-ip",
    "DOMAIN-SUFFIX,fuwu.nhsa.gov.cn,real-ip",
    "DOMAIN-SUFFIX,gjzwfw.gov.cn,real-ip",
    "DOMAIN-SUFFIX,xiaojukeji.com,real-ip",
    "DOMAIN-SUFFIX,didichuxing.com,real-ip",
    "DOMAIN-SUFFIX,work.weixin.qq.com,real-ip",
    "DOMAIN-SUFFIX,meeting.tencent.com,real-ip",
    "DOMAIN-SUFFIX,weibo.com,real-ip",
    "DOMAIN-SUFFIX,zhihu.com,real-ip",
    "DOMAIN-SUFFIX,ctrip.com,real-ip",
    "DOMAIN-SUFFIX,qunar.com,real-ip",
    "DOMAIN-SUFFIX,sf-express.com,real-ip",
    "DOMAIN-SUFFIX,feishu.cn,real-ip",
    "DOMAIN-SUFFIX,xuexi.cn,real-ip",
    "DOMAIN-SUFFIX,chsi.com.cn,real-ip",
    "DOMAIN-SUFFIX,railway12306.cn,real-ip",
    "DOMAIN-SUFFIX,mcdn.bilivideo.cn,real-ip",
    "DOMAIN-SUFFIX,szbdyd.com,real-ip",
    "DOMAIN-SUFFIX,battlenet.com.cn,real-ip",
    "DOMAIN-SUFFIX,blzstatic.cn,real-ip",
    "DOMAIN-SUFFIX,wotgame.cn,real-ip",
    "DOMAIN-SUFFIX,wggames.cn,real-ip",
    "DOMAIN-SUFFIX,wowsgame.cn,real-ip",
    "DOMAIN-SUFFIX,stun.l.google.com,real-ip",
    "DOMAIN-SUFFIX,stun1.l.google.com,real-ip",
    "DOMAIN-SUFFIX,stun2.l.google.com,real-ip",
    "DOMAIN-SUFFIX,stun3.l.google.com,real-ip",
    "DOMAIN-SUFFIX,stun4.l.google.com,real-ip",
    "DOMAIN,global.turn.twilio.com,real-ip",
    "DOMAIN-SUFFIX,stun.playstation.net,real-ip",
    "DOMAIN-SUFFIX,stun.syncthing.net,real-ip",
    "DOMAIN-SUFFIX,sslip.io,real-ip",
    "DOMAIN-SUFFIX,nip.io,real-ip",
    "DOMAIN-SUFFIX,m2m,real-ip",
    "DOMAIN-SUFFIX,bogon,real-ip",
    "DOMAIN-SUFFIX,in-addr.arpa,real-ip",
    "DOMAIN-SUFFIX,ip6.arpa,real-ip",
    "MATCH,fake-ip"
  ],
  "respect-rules": true,
  "default-nameserver": [
    "tls://223.5.5.5",
    "tls://223.6.6.6",
    "tls://1.12.12.12",
    "tls://120.53.53.53",
    "tls://[2400:3200::1]",
    "tls://[2400:3200:baba::1]",
    "tls://[2606:4700:4700::1111]"
  ],
  "proxy-server-nameserver": [
    "https://doh.pub/dns-query",
    "https://223.5.5.5/dns-query"
  ],
  "nameserver": [
    "https://dns.google/dns-query#RULES",
    "https://1.1.1.1/dns-query#RULES"
  ],
  "direct-nameserver": [
    "https://doh.pub/dns-query",
    "https://223.5.5.5/dns-query",
    "https://[2606:4700:4700::1111]/dns-query"
  ],
  "direct-nameserver-follow-policy": true,
  "nameserver-policy": {
    "rule-set:cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "rule-set:geolocation-cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "rule-set:bilibili": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "geosite:cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.net.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.org.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.edu.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.gov.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.mi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.xiaomi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.miui.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.micloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.mi-img.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.miwifi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.xiaomiev.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.huawei.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.huaweicloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.hicloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.vmall.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.honor.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.vivo.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.vivoglobal.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.oppo.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.oppomobile.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.meizu.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsung.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsungapps.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsungcloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsungknox.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsungdm.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.qq.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.wechat.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.weixin.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.wx.qq.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tencent.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tencent-cloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.qpic.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.qlogo.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.gtimg.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.gdtimg.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.myqcloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.wechatpay.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.alipay.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.alipayobjects.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.taobao.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tmall.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tbcdn.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.alicdn.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.aliyun.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.amap.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.autonavi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.ele.me": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.dingtalk.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.1688.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bytedance.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.byteimg.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tosv.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.douyin.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.iesdouyin.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.pstatp.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.snssdk.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.volccdn.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.toutiao.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.ixigua.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.feishu.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.feishu.net": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.volces.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.baidu.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bdstatic.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bdimg.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bcebos.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.iqiyi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.iqiyipic.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.baidubce.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tenpay.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.unionpay.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.unionpaysecure.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.95516.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.icbc.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.ccb.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.boc.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.cmbchina.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.abchina.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bankcomm.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.psbc.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.spdb.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.cmbc.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.cib.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tongdun.net": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.ishumei.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.geetest.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.trustdevice.net": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.rongcloud.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.rongcloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.umeng.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.umengcloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.servicewechat.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.weixinbridge.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.url.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.aegis.qq.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.deepseek.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.deepseek.ai": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.moonshot.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.kimichat.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.zhipuai.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.chatglm.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.baichuan-ai.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.sensetime.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.minimax.chat": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.stepfun.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.iflytek.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.12306.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.railway12306.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "geosite:google": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "geosite:youtube": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "geosite:telegram": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.twitter.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.t.co": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.x.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.challenges.cloudflare.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.recaptcha.net": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "recaptcha.google.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.openai.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.chatgpt.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.oaistatic.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.oaiusercontent.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.anthropic.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.claude.ai": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.gemini.google.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.aistudio.google.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "geosite:geolocation-!cn": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ]
  }
};

  // （比如App硬编码IP直连）的情况下依然能按域名正确分流，
  // 提升规则匹配准确度，减少误判进国内/境外分组
  config["sniffer"] = {
  "enable": true,
  "force-dns-mapping": true,
  "parse-pure-ip": true,
  "override-destination": true,
  "sniff": {
    "HTTP": {
      "ports": [
        80,
        "8080-8880"
      ],
      "enable": true,
      "override-destination": true
    },
    "TLS": {
      "ports": [
        443,
        8443
      ],
      "enable": true,
      "override-destination": true
    }
  },
  "force-domain": [
    "+.google.com",
    "+.youtube.com",
    "+.telegram.org",
    "+.openai.com",
    "+.anthropic.com",
    "+.twitter.com",
    "+.x.com",
    "+.googlevideo.com",
    "+.ytimg.com",
    "+.chatgpt.com",
    "+.claude.ai"
  ],
  "skip-dst-address": [
    "91.105.192.0/23",
    "91.108.4.0/22",
    "91.108.8.0/21",
    "91.108.16.0/21",
    "91.108.56.0/22",
    "95.161.64.0/20",
    "149.154.160.0/20",
    "185.76.151.0/24",
    "2001:b28:f23d::/48",
    "2001:b28:f23f::/48",
    "2001:67c:4e8::/48"
  ],
  "skip-domain": [
    "geosite:cn",
    "geosite:geolocation-cn",
    "geosite:category-ads-all",
    "geosite:category-games-cn",
    "+.gstatic.com",
    "+.msftconnecttest.com",
    "+.msftncsi.com",
    "+.captive.apple.com",
    "+.router.asus.com",
    "+.tplogin.cn",
    "+.hiwifi.com",
    "+.phicomm.me",
    "+.local",
    "+.lan",
    "+.home.arpa",
    "+.unionpay.com",
    "+.95516.com",
    "+.alipay.com",
    "+.alipayobjects.com",
    "+.tenpay.com",
    "+.wechatpay.cn",
    "+.abchina.com",
    "+.abchina.com.cn",
    "+.icbc.com.cn",
    "+.ccb.com",
    "+.boc.cn",
    "+.bankofchina.com",
    "+.cmbchina.com",
    "+.bankcomm.com",
    "+.psbc.com",
    "+.spdb.com.cn",
    "+.cib.com.cn",
    "+.cmbc.com.cn",
    "+.pingan.com",
    "+.cgbchina.com.cn",
    "+.hxb.com.cn",
    "+.cebbank.com",
    "+.citicbank.com",
    "+.ecitic.com",
    "+.gfbazc.com",
    "+.fzuol.com",
    "+.netsunion.org.cn",
    "+.tongdun.net",
    "+.ishumei.com",
    "+.geetest.com",
    "+.trustdevice.net",
    "+.rongcloud.cn",
    "+.rongcloud.com",
    "+.umeng.com",
    "+.umengcloud.com",
    "+.tongduncdn.com",
    "+.dingxiangyun.com",
    "+.dingxiangyun.cn",
    "+.rong360.com",
    "+.99bill.com",
    "+.chinapay.com",
    "+.yeepay.com",
    "+.jdpay.com",
    "+.unionpaysecure.com",
    "+.pingan.com.cn",
    "+.aegis.qq.com",
    "+.riskradar.net",
    "+.cpic.com.cn",
    "+.zhongan.com",
    "+.eastmoney.com",
    "+.htsc.com.cn",
    "+.gtja.com",
    "+.jpush.cn",
    "+.jpush.io",
    "+.jiguang.cn",
    "+.weixin.qq.com",
    "+.wx.qq.com",
    "+.servicewechat.com",
    "+.12306.cn",
    "+.railway12306.cn",
    "+.chinatax.gov.cn",
    "+.fuwu.nhsa.gov.cn",
    "+.gjzwfw.gov.cn",
    "+.xiaojukeji.com",
    "+.didichuxing.com",
    "+.work.weixin.qq.com",
    "+.meeting.tencent.com",
    "+.taobao.com",
    "+.jd.com",
    "+.pinduoduo.com",
    "+.meituan.com",
    "+.dianping.com",
    "+.ele.me",
    "+.amap.com",
    "+.baidu.com",
    "+.xiaohongshu.com",
    "+.kuaishou.com",
    "+.163.com",
    "+.weibo.com",
    "+.zhihu.com",
    "+.ctrip.com",
    "+.qunar.com",
    "+.sf-express.com",
    "+.dingtalk.com",
    "+.feishu.cn",
    "+.xuexi.cn",
    "+.chsi.com.cn"
  ]
};

  config["hosts"] = {
  "dns.alidns.com": [
    "223.5.5.5",
    "223.6.6.6",
    "2400:3200::1",
    "2400:3200:baba::1"
  ],
  "doh.pub": [
    "1.12.12.12",
    "120.53.53.53",
    "2402:4e00::",
    "2402:4e00:1::"
  ],
  "dns.google": [
    "8.8.8.8",
    "8.8.4.4",
    "2001:4860:4860::8888",
    "2001:4860:4860::8844"
  ],
  "cloudflare-dns.com": [
    "1.1.1.1",
    "1.0.0.1",
    "2606:4700:4700::1111",
    "2606:4700:4700::1001"
  ]
};

  config["mixed-port"] = 17890;
  // （仅本机监听），而非无条件强制开放局域网——降低公共网络下被同网段
  // 设备探测到开放代理端口的风险。如需给家里其他设备共享代理，手动改回
  // allow-lan: true 即可。
  config["allow-lan"] = false;
  config["bind-address"] = "127.0.0.1";
  config["ipv6"] = true;
  config["mode"] = "rule";
  config["log-level"] = "info";
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["keep-alive-interval"] = 15;
  config["keep-alive-idle"] = 15;
  config["disable-keep-alive"] = false;
  config["find-process-mode"] = "strict";
  config["etag-support"] = true;
  config["experimental"] = {
  "quic-go-disable-gso": false,
  "quic-go-disable-ecn": false
};
  config["external-controller"] = "127.0.0.1:19090";
  // CORS防护：只允许本地origin访问控制器，防止CDN被劫持/投毒后
  // 其JS通过CORS读取本地控制器数据（节点列表、连接记录等敏感信息）
  config["external-controller-cors"] = {
  "allow-origins": [
    "http://127.0.0.1:19090",
    "https://127.0.0.1:19090",
    "http://localhost:19090",
    "https://localhost:19090"
  ],
  "allow-private-network": false
};
  config["external-ui"] = "ui";
  config["external-ui-url"] = "https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip";

  // 兜底规则会连带失效，因此单独指定镜像而非依赖客户端默认源
  config["geodata-mode"] = false;
  config["geodata-loader"] = "memconservative";
  config["geo-auto-update"] = true;
  config["geo-update-interval"] = 168;
  config["geox-url"] = {
  "geoip": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
  "geosite": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
  "mmdb": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.metadb",
  "asn": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb"
};

  config["profile"] = {
  "store-selected": false,
  "store-fake-ip": false
};
  config["ntp"] = {
  "enable": false,
  "write-to-system": false,
  "server": "ntp.aliyun.com",
  "port": 123,
  "interval": 30
};

  // BEGIN AUTO-SYNC: template.yaml common behavior
  var CANONICAL = {
  "mode": "rule",
  "allow-lan": false,
  "bind-address": "127.0.0.1",
  "mixed-port": 17890,
  "log-level": "info",
  "ipv6": true,
  "unified-delay": true,
  "tcp-concurrent": true,
  "keep-alive-interval": 15,
  "keep-alive-idle": 15,
  "disable-keep-alive": false,
  "find-process-mode": "strict",
  "etag-support": true,
  "external-controller": "127.0.0.1:19090",
  "global-ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "geodata-mode": false,
  "geodata-loader": "memconservative",
  "geo-auto-update": true,
  "geo-update-interval": 168,
  "profile": {
    "store-selected": false,
    "store-fake-ip": false
  },
  "ntp": {
    "enable": false,
    "write-to-system": false,
    "server": "ntp.aliyun.com",
    "port": 123,
    "interval": 30
  },
  "experimental": {
    "quic-go-disable-gso": false,
    "quic-go-disable-ecn": false
  },
  "external-controller-cors": {
    "allow-origins": [
      "http://127.0.0.1:19090",
      "https://127.0.0.1:19090",
      "http://localhost:19090",
      "https://localhost:19090"
    ],
    "allow-private-network": false
  },
  "geox-url": {
    "geoip": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
    "geosite": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
    "mmdb": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.metadb",
    "asn": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb"
  }
};
  config["mode"] = CANONICAL["mode"];
  config["allow-lan"] = CANONICAL["allow-lan"];
  config["bind-address"] = CANONICAL["bind-address"];
  config["mixed-port"] = CANONICAL["mixed-port"];
  config["log-level"] = CANONICAL["log-level"];
  config["ipv6"] = CANONICAL["ipv6"];
  config["unified-delay"] = CANONICAL["unified-delay"];
  config["tcp-concurrent"] = CANONICAL["tcp-concurrent"];
  config["keep-alive-interval"] = CANONICAL["keep-alive-interval"];
  config["keep-alive-idle"] = CANONICAL["keep-alive-idle"];
  config["disable-keep-alive"] = CANONICAL["disable-keep-alive"];
  config["find-process-mode"] = CANONICAL["find-process-mode"];
  config["etag-support"] = CANONICAL["etag-support"];
  config["external-controller"] = CANONICAL["external-controller"];
  config["global-ua"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  config["geodata-mode"] = CANONICAL["geodata-mode"];
  config["geodata-loader"] = CANONICAL["geodata-loader"];
  config["geo-auto-update"] = CANONICAL["geo-auto-update"];
  config["geo-update-interval"] = CANONICAL["geo-update-interval"];
  config["profile"] = CANONICAL["profile"];
  config["ntp"] = CANONICAL["ntp"];
  config["experimental"] = CANONICAL["experimental"];
  config["external-controller-cors"] = CANONICAL["external-controller-cors"];
  config["geox-url"] = CANONICAL["geox-url"];
  // 机场模式必须保留与主配置一致的远控工具例外：规则层允许该组使用 DIRECT，
  // 但 UI 不额外暴露 DIRECT 作为通用节点选择项。
  // 公共同步只覆盖安全底层配置；机场原有策略组及其名称/节点选择逻辑不再被改写。
  // 机场模式明确保留：广告拦截 DIRECT、远控工具 DIRECT。
  // 私有网络/国内服务 DIRECT 只存在于底层规则，不提供用户策略组。
  // 链式模式的功能组名称与机场模式不同，因此仅将公共规则目标映射到现有机场组名。
  var TARGET_MAP = {
    "AI服务": "🤖 AI服务",
    "国外服务": "🌍 国外服务",
    "流媒体": "📺 Media",
    "漏网之鱼": "🐟 漏网之鱼",
    "远控工具": "🔧 远控工具"
  };
  function mapRuleTargets(list) {
    if (!list || !list.map) return list;
    return list.map(function (rule) {
      if (typeof rule !== "string") return rule;
      var parts = rule.split(",");
      if (parts.length < 2) return rule;
      var targetIndex = parts.length - 1;
      if (parts[targetIndex] === "no-resolve" && parts.length >= 3) targetIndex--;
      var target = parts[targetIndex];
      if (TARGET_MAP[target]) parts[targetIndex] = TARGET_MAP[target];
      return parts.join(",");
    });
  }
  if (config["rules"]) config["rules"] = mapRuleTargets(config["rules"]);
  // END AUTO-SYNC: template.yaml common behavior

  // BEGIN AIRPORT NODE SANITIZER
  if (config.proxies && config.proxies.length) {
    var airportChainKey = "dialer-" + "proxy";
    var airportLegacyChainKey = "proxy-" + "dialer";
    for (var api = 0; api < config.proxies.length; api++) {
      var airportProxy = config.proxies[api];
      if (!airportProxy || typeof airportProxy !== "object") continue;
      if (airportProxy[airportChainKey] != null) delete airportProxy[airportChainKey];
      if (airportProxy[airportLegacyChainKey] != null) delete airportProxy[airportLegacyChainKey];
    }
  }
  // END AIRPORT NODE SANITIZER

  return config;
}
