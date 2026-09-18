
/**
 * 机场订阅覆写（TUN · 无链式）
 * 兼容旧版客户端脚本引擎（避免 find / ?. / 对象展开 / \\u{} 正则）
 * 公共规则目标由末尾同步层映射到机场现有策略组，禁止创建重复组
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
    { key: "hk", name: "🇭🇰 香港节点", flag: "🇭🇰", jsPattern: "🇭🇰|香港|\\bHKG?\\b|hong[\\s_-]*kong", filter: "(?i)(🇭🇰|香港|\\bHKG?\\b|hong[\\s_-]*kong)", icon: "" },
    { key: "tw", name: "🇹🇼 台湾节点", flag: "🇹🇼", jsPattern: "🇹🇼|台湾|\\bTWN?\\b|taiwan", filter: "(?i)(🇹🇼|台湾|\\bTWN?\\b|taiwan)", icon: "" },
    { key: "jp", name: "🇯🇵 日本节点", flag: "🇯🇵", jsPattern: "🇯🇵|日本|\\bJPN?\\b|japan|tokyo|osaka|东京|大阪", filter: "(?i)(🇯🇵|日本|\\bJPN?\\b|japan|tokyo|osaka|东京|大阪)", icon: "" },
    { key: "kr", name: "🇰🇷 韩国节点", flag: "🇰🇷", jsPattern: "🇰🇷|韩国|\\bKR\\b|korea|seoul|首尔", filter: "(?i)(🇰🇷|韩国|\\bKR\\b|korea|seoul|首尔)", icon: "" },
    { key: "sg", name: "🇸🇬 新加坡节点", flag: "🇸🇬", jsPattern: "🇸🇬|新加坡|狮城|\\bSGP?\\b|singapore", filter: "(?i)(🇸🇬|新加坡|狮城|\\bSGP?\\b|singapore)", icon: "" },
    { key: "us", name: "🇺🇸 美国节点", flag: "🇺🇸", jsPattern: "🇺🇸|美国|\\bUSA?\\b|america|united[\\s_-]*states|los[\\s_-]*angeles|洛杉矶|san[\\s_-]*jose|圣何塞", filter: "(?i)(🇺🇸|美国|\\bUSA?\\b|america|united[\\s_-]*states|los[\\s_-]*angeles|洛杉矶|san[\\s_-]*jose|圣何塞)", icon: "" },
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
    // Regional Indicator Symbol pairs (emoji flags), engine-safe (no \\u{} /u)
    var s = String(name || "");
    for (var i = 0; i < s.length - 1; i++) {
      var a = s.charCodeAt(i);
      var b = s.charCodeAt(i + 1);
      // UTF-16 surrogates for U+1F1E6..U+1F1FF
      if (a >= 0xD83C && a <= 0xD83C && b >= 0xDDE6 && b <= 0xDDFF) {
        // high surrogate is always 0xD83C for this block
      }
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
  // Full-overwrite contract: every airport-supplied field except proxies is discarded.
  config = {};

  // 排除明显非节点的「公告/说明/营销」行（机场订阅常见垃圾项）。
  // 与早期「误杀真实节点」的激进过滤不同：本正则针对群/客服/流量/到期/
  var excludeFilter =
    /群|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|访问|支持|教程|关注|更新|作者|加入|超时|收藏|福利|邀请|好友|失联|选择|剩余|公益|发布|DIZTNA|通路|登录|禁止|定时|渠道|牢记|永久|余额|阁下|本站|刷新|导航|建议|重置|以下|防失联|⚠️|@|\bexpire\b|\bhttps?:\/\/|\.com|\btraffic\b/i;

  // 1) 去掉 direct/reject/rematch 占位类型
  // 2) 去掉名称命中 excludeFilter 的公告伪节点
  var filteredRaw = originalProxies.filter(function(proxy) {
    var type = String(proxy.type != null ? proxy.type : "").toLowerCase();
    if (type === "direct" || type === "reject" || type === "rematch") return false;
    var name = String(proxy.name != null ? proxy.name : "");
    if (excludeFilter.test(name)) return false;
    return true;
  });

  // 不做字段级去重：过滤后的节点全部保留。
  // 唯一处理：mihomo 要求显示名唯一，标准化后撞名则追加 #2/#3。
  // 顺带统计各地区是否有节点，无节点的地区不生成分组。
  var nameCount = {};
  var normalizedProxies = [];
  var regionsWithNodes = {};
  var hasOtherRegionNodes = false;
  for (var rawIndex = 0; rawIndex < filteredRaw.length; rawIndex++) { var raw = filteredRaw[rawIndex];
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

  // 每个地区拆成三层：
  //   {地区}-自动选择（url-test，内部用，不对外暴露）
  //   {地区}-负载均衡（load-balance，内部用，不对外暴露）
  //   {地区}（select，其他分组实际引用的名字不变，但内部只有以上两个
  //          选项可选，不再罗列该地区下的每个原始节点做手动选择）
  function buildRegionTrio(name, matchField) {
    var autoName = "" + name + "-自动选择";
    var lbName = "" + name + "-负载均衡";
    var common = { "include-all": true, url: "https://www.gstatic.com/generate_204", interval: 180, timeout: 3000, "expected-status": 204, icon: "", hidden: true };
    var auto = { name: autoName, type: "url-test", tolerance: 35, "max-failed-times": 2 };
    var lb = { name: lbName, type: "load-balance", strategy: "sticky-sessions" };
    for (var ck in common) { if (Object.prototype.hasOwnProperty.call(common, ck)) { auto[ck] = common[ck]; lb[ck] = common[ck]; } }
    for (var mk in matchField) { if (Object.prototype.hasOwnProperty.call(matchField, mk)) { auto[mk] = matchField[mk]; lb[mk] = matchField[mk]; } }
    var select = { name, type: "select", proxies: [autoName, lbName], icon: "" };
    return [auto, lb, select];
  }

  var regionGroups = [];
  var activeRegions = REGIONS.filter(function(r) { return Object.prototype.hasOwnProperty.call(regionsWithNodes, r.name); });
  for (var ri = 0; ri < activeRegions.length; ri++) { var r = activeRegions[ri];
    regionGroups.push.apply(regionGroups, buildRegionTrio(r.name, { filter: r.filter }));
  }
  if (hasOtherRegionNodes) {
    regionGroups.push.apply(regionGroups, buildRegionTrio(OTHER_REGION_NAME, { "exclude-filter": "(?i)(" + allRegionKeywords + ")" }));
  }

  // 供其他分组引用的"地区选择入口"名字列表：只包含实际生成了分组的地区，
  // 没有节点的地区不会出现在这里，其他分组也就不会引用到不存在的分组名
  var regionNames = activeRegions.map(function(r) { return r.name; });
  if (hasOtherRegionNodes) regionNames.push(OTHER_REGION_NAME);
  var regionNamesNoHK = regionNames.filter(function(n) { return n !== "🇭🇰 香港节点" && n !== "🇹🇼 台湾节点"; });

  var AUTO_NAME = "♻️ 自动选择";
  var LB_NAME = "⚖️ 负载均衡";
  var SELECT_NAME = "🔰 节点选择";

  var autoGroup = { name: AUTO_NAME, type: "url-test", "include-all": true, url: "https://www.gstatic.com/generate_204", interval: 180, tolerance: 35, timeout: 3000, "expected-status": 204, "max-failed-times": 2, icon: "" };
  var lbGroup = { name: LB_NAME, type: "load-balance", strategy: "sticky-sessions", "include-all": true, url: "https://www.gstatic.com/generate_204", interval: 180, timeout: 3000, "expected-status": 204, icon: "" };
  var selectGroup = { name: SELECT_NAME, type: "select", proxies: [AUTO_NAME, LB_NAME].concat(regionNames), icon: "" };
  var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT-DROP", "REJECT", "DIRECT"], icon: "" };
  var aiGroup = { name: "🤖 AI服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNamesNoHK), icon: "" };
  var claudeGroup = { name: "🤖 Claude AI", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNamesNoHK), icon: "" };
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
  // 直接在客户端里把这个分组切成 DIRECT 即可，不需要再回来改脚本
  var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "🌍 国外服务", "DIRECT"], icon: "" };

  config["proxy-groups"] = [selectGroup, autoGroup, lbGroup, adBlockGroup, aiGroup, claudeGroup, mediaGroup, youtubeGroup, googleGroup, telegramGroup, microsoftGroup, appleGroup, steamGroup, tiktokGroup, twitterGroup, spotifyGroup, globalServiceGroup, fallbackGroup, remoteToolGroup].concat(regionGroups);

  var ruleProviderCommonDomain = { type: "http", format: "mrs", interval: 86400, behavior: "domain" };
  var ruleProviderCommonIpcidr = { type: "http", format: "mrs", interval: 86400, behavior: "ipcidr" };
  var ruleProviderClassical = { type: "http", behavior: "classical", interval: 86400 };
  var ruleProviderTextDomain = { type: "http", format: "text", interval: 86400, behavior: "domain" };

  var BASE_META = "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  var BASE_BLACK = "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash";

  config["rule-providers"] = {
  "category-ads-all": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "proxy": "DIRECT",
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-ads-all.mrs",
    "path": "./ruleset/category-ads-all.mrs"
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
  },
  "fastly-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "proxy": "DIRECT",
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/fastly.mrs",
    "path": "./ruleset/fastly-ip.mrs"
  },
  "sukka-phishing": {
    "type": "http",
    "behavior": "domain",
    "format": "text",
    "interval": 86400,
    "url": "https://ruleset.skk.moe/Clash/domainset/reject_phishing.txt",
    "path": "./ruleset/sukka-phishing.txt"
  },
  "cryptocurrency": {
    "type": "http",
    "behavior": "classical",
    "format": "yaml",
    "interval": 86400,
    "url": "https://gcore.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Cryptocurrency/Cryptocurrency.yaml",
    "path": "./ruleset/cryptocurrency.yaml"
  }
};

  // Cold-start bootstrap: rule providers must not depend on proxy nodes that are
  // themselves unavailable until the subscription has finished loading.
  for (var providerName in config["rule-providers"]) {
    if (Object.prototype.hasOwnProperty.call(config["rule-providers"], providerName)) {
      config["rule-providers"][providerName].proxy = "DIRECT";
    }
  }

  config["rules"] = [
  "DOMAIN-SUFFIX,claude.ai,🤖 Claude AI",
  "AND,((IN-TYPE,TUN),(RULE-SET,private-ip)),DIRECT",
  "AND,((NETWORK,UDP),(DST-PORT,3478-3480)),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,5349-5355)),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,19302-19305)),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,3478-3480)),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,5349-5355)),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,19302-19305)),REJECT-DROP",
  "IP-CIDR6,fe80::/10,DIRECT,no-resolve",
  "IP-CIDR6,fc00::/7,DIRECT,no-resolve",
  "IP-CIDR6,::1/128,DIRECT,no-resolve",
  "IP-CIDR6,ff00::/8,REJECT-DROP,no-resolve",
  "RULE-SET,private-ip,DIRECT,no-resolve",
  "RULE-SET,cn-ip,DIRECT,no-resolve",
  "IP-CIDR,101.226.0.0/16,DIRECT,no-resolve",
  "IP-CIDR,140.207.0.0/16,DIRECT,no-resolve",
  "DOMAIN-SUFFIX,tongdun.net,DIRECT",
  "DOMAIN-SUFFIX,tongduncdn.com,DIRECT",
  "DOMAIN-SUFFIX,ishumei.com,DIRECT",
  "DOMAIN-SUFFIX,riskradar.net,DIRECT",
  "DOMAIN-SUFFIX,geetest.com,DIRECT",
  "DOMAIN-SUFFIX,trustdevice.net,DIRECT",
  "DOMAIN-SUFFIX,aegis.qq.com,DIRECT",
  "DOMAIN-SUFFIX,rongcloud.cn,DIRECT",
  "DOMAIN-SUFFIX,rongcloud.com,DIRECT",
  "DOMAIN-SUFFIX,umeng.com,DIRECT",
  "DOMAIN-SUFFIX,umengcloud.com,DIRECT",
  "DOMAIN-SUFFIX,antpay.com,DIRECT",
  "DOMAIN-SUFFIX,alipay.com,DIRECT",
  "DOMAIN-SUFFIX,alipayobjects.com,DIRECT",
  "DOMAIN-SUFFIX,12306.cn,DIRECT",
  "DOMAIN-SUFFIX,railway12306.cn,DIRECT",
  "DOMAIN-SUFFIX,chinatax.gov.cn,DIRECT",
  "DOMAIN-SUFFIX,fuwu.nhsa.gov.cn,DIRECT",
  "DOMAIN-SUFFIX,gjzwfw.gov.cn,DIRECT",
  "DOMAIN-SUFFIX,xiaojukeji.com,DIRECT",
  "DOMAIN-SUFFIX,didichuxing.com,DIRECT",
  "DOMAIN-SUFFIX,work.weixin.qq.com,DIRECT",
  "DOMAIN-SUFFIX,meeting.tencent.com,DIRECT",
  "DOMAIN-SUFFIX,taobao.com,DIRECT",
  "DOMAIN-SUFFIX,jd.com,DIRECT",
  "DOMAIN-SUFFIX,pinduoduo.com,DIRECT",
  "DOMAIN-SUFFIX,meituan.com,DIRECT",
  "DOMAIN-SUFFIX,dianping.com,DIRECT",
  "DOMAIN-SUFFIX,ele.me,DIRECT",
  "DOMAIN-SUFFIX,amap.com,DIRECT",
  "DOMAIN-SUFFIX,baidu.com,DIRECT",
  "DOMAIN-SUFFIX,xiaohongshu.com,DIRECT",
  "DOMAIN-SUFFIX,kuaishou.com,DIRECT",
  "DOMAIN-SUFFIX,163.com,DIRECT",
  "DOMAIN-SUFFIX,weibo.com,DIRECT",
  "DOMAIN-SUFFIX,zhihu.com,DIRECT",
  "DOMAIN-SUFFIX,ctrip.com,DIRECT",
  "DOMAIN-SUFFIX,qunar.com,DIRECT",
  "DOMAIN-SUFFIX,sf-express.com,DIRECT",
  "DOMAIN-SUFFIX,dingtalk.com,DIRECT",
  "DOMAIN-SUFFIX,feishu.cn,DIRECT",
  "DOMAIN-SUFFIX,xuexi.cn,DIRECT",
  "DOMAIN-SUFFIX,chsi.com.cn,DIRECT",
  "DOMAIN-SUFFIX,servicewechat.com,DIRECT",
  "DOMAIN-SUFFIX,icbc.com.cn,DIRECT",
  "DOMAIN-SUFFIX,ccb.com,DIRECT",
  "DOMAIN-SUFFIX,boc.cn,DIRECT",
  "DOMAIN-SUFFIX,bankofchina.com,DIRECT",
  "DOMAIN-SUFFIX,abchina.com,DIRECT",
  "DOMAIN-SUFFIX,abchina.com.cn,DIRECT",
  "DOMAIN-SUFFIX,cmbchina.com,DIRECT",
  "DOMAIN-SUFFIX,cmbi.com.cn,DIRECT",
  "DOMAIN-SUFFIX,bankcomm.com,DIRECT",
  "DOMAIN-SUFFIX,psbc.com,DIRECT",
  "DOMAIN-SUFFIX,spdb.com.cn,DIRECT",
  "DOMAIN-SUFFIX,cib.com.cn,DIRECT",
  "DOMAIN-SUFFIX,cmbc.com.cn,DIRECT",
  "DOMAIN-SUFFIX,pingan.com,DIRECT",
  "DOMAIN-SUFFIX,cgbchina.com.cn,DIRECT",
  "DOMAIN-SUFFIX,hxb.com.cn,DIRECT",
  "DOMAIN-SUFFIX,cebbank.com,DIRECT",
  "DOMAIN-SUFFIX,citicbank.com,DIRECT",
  "DOMAIN-SUFFIX,ecitic.com,DIRECT",
  "DOMAIN-SUFFIX,unionpaysecure.com,DIRECT",
  "DOMAIN-SUFFIX,pingan.com.cn,DIRECT",
  "DOMAIN-SUFFIX,gfbazc.com,DIRECT",
  "DOMAIN-SUFFIX,fzuol.com,DIRECT",
  "DOMAIN-SUFFIX,netsunion.org.cn,DIRECT",
  "DOMAIN-SUFFIX,cpic.com.cn,DIRECT",
  "DOMAIN-SUFFIX,zhongan.com,DIRECT",
  "DOMAIN-SUFFIX,eastmoney.com,DIRECT",
  "DOMAIN-SUFFIX,htsc.com.cn,DIRECT",
  "DOMAIN-SUFFIX,gtja.com,DIRECT",
  "DOMAIN-SUFFIX,dingxiangyun.com,DIRECT",
  "DOMAIN-SUFFIX,dingxiangyun.cn,DIRECT",
  "DOMAIN-SUFFIX,rong360.com,DIRECT",
  "DOMAIN-SUFFIX,yzf.com.cn,DIRECT",
  "DOMAIN-SUFFIX,99bill.com,DIRECT",
  "DOMAIN-SUFFIX,chinapay.com,DIRECT",
  "DOMAIN-SUFFIX,yeepay.com,DIRECT",
  "DOMAIN-SUFFIX,jdpay.com,DIRECT",
  "DOMAIN-SUFFIX,weixin.qq.com,DIRECT",
  "DOMAIN-SUFFIX,wx.qq.com,DIRECT",
  "DOMAIN-SUFFIX,weixin.com,DIRECT",
  "DOMAIN-SUFFIX,wxs.qq.com,DIRECT",
  "RULE-SET,wechat,DIRECT",
  "DOMAIN-SUFFIX,pddpic.com,DIRECT",
  "DOMAIN-SUFFIX,samsunghealth.com,DIRECT",
  "DOMAIN,connectivitycheck.gstatic.com,DIRECT",
  "DOMAIN,userlocation.googleapis.com,🌍 国外服务",
  "DOMAIN,voilatile-pa.googleapis.com,🌍 国外服务",
  "DOMAIN,geller-pa.googleapis.com,🌍 国外服务",
  "DOMAIN,mobilemaps-pa-gz.googleapis.com,🌍 国外服务",
  "DOMAIN-SUFFIX,app-measurement.com,🌍 国外服务",
  "DOMAIN-SUFFIX,firebaselogging.googleapis.com,🌍 国外服务",
  "DOMAIN-SUFFIX,in.appcenter.ms,🌍 国外服务",
  "DOMAIN-SUFFIX,mobile.events.data.microsoft.com,🌍 国外服务",
  "DOMAIN-SUFFIX,connect.facebook.net,🌍 国外服务",
  "DOMAIN-SUFFIX,a-cdn.anthropic.com,🤖 AI服务",
  "DOMAIN-SUFFIX,assets-proxy.anthropic.com,🤖 AI服务",
  "DOMAIN-SUFFIX,bing.com,🌍 国外服务",
  "DOMAIN-SUFFIX,samsungosp.com,DIRECT",
  "DOMAIN-SUFFIX,crashlytics.com,🌍 国外服务",
  "DOMAIN-SUFFIX,firebase.io,🌍 国外服务",
  "DOMAIN,browser-intake-us5-datadoghq.com,🌍 国外服务",
  "RULE-SET,sukka-phishing,REJECT-DROP",
  "RULE-SET,category-ads-all,🛑 广告拦截",
  "DOMAIN,galaxystore.ad-survey.com,REJECT",
  "DOMAIN,dls2.bigdata.samsung.com.cn,REJECT",
  "RULE-SET,private-ip,DIRECT,no-resolve",
  "DOMAIN-REGEX,^(stun|turn|stuns|turns)\\.,REJECT-DROP",
  "DOMAIN-REGEX,[-.]stun[-.],REJECT-DROP",
  "DOMAIN-REGEX,[-.]turn[-.],REJECT-DROP",
  "DOMAIN-REGEX,[-.]stuns[-.],REJECT-DROP",
  "DOMAIN-REGEX,[-.]turns[-.],REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,53),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,53),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,853),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,853),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,21),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,23),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,25),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,110),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,143),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,3478-3480)),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,5349-5355)),REJECT-DROP",