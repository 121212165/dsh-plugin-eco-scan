// v3: assertion-phrase enrichment. Only explicit feature claims in the tagline /
// feature bullets / npm keywords count. v2 (context-paired keywords) measured
// repo-level 44% / browser 39% / webui 87%; bare capability words in README are
// dominated by incidental mentions because the candidate pool is already
// capability-word-free in name/desc/topics.
import { TOPIC_STOP, TAX } from './taxonomy.mjs';

const GENERIC = new Set(['agent','session','skill','workspace','llm','misc','cli','code','file','doc','awesome']);

const GATES = {
  browser: /浏览器自动化|browser automation|控制浏览器|browser control|browser[- ]driver|headless (?:chrome|browser)/,
  webui: /web ?ui ?(?:tab|panel|page)|web (?:ui|interface) (?:tab|panel|page)|侧边栏(?:面板|入口|页面)|侧栏(?:面板|页面)|内置 ?web|自带 ?web|web 面板|管理面板|可视化(?:面板|看板)|看板/,
  desktop: /桌面(?:客户端|应用)(?:插件|功能|版)|desktop (?:app|client) (?:plugin|feature)|electron|tauri/,
  remote: /远程(?:控制|连接|终端|主机|运维)|remote (?:control|access|desktop)|ssh (?:client|terminal)|sftp|隧道|port forwarding|端口转发/,
  memory: /长期记忆|记忆(?:存储|系统|库)|memory (?:layer|store|system|bank)|remember(?:s|ed)? (?:your|the user)|mem0/,
  git: /提交(?:代码|信息)|commit message|pull request|分支管理|git (?:操作|工作流|提交)|rebase|cherry-pick/,
  screen: /截图(?:识别|分析|理解)|屏幕(?:识别|理解|感知)|screen (?:capture|understanding|reading)|screenshot (?:analysis|understanding)/,
  shell: /执行命令|命令执行|shell (?:工具|命令)|run (?:shell|bash|command)|command execution|终端执行/,
  mobile: /android (?:app|client)|ios (?:app|client)|移动端(?:客户端|app)|mobile (?:app|client)/,
  search: /全文搜索|搜索(?:功能|框|栏|会话|消息|文件|技能|笔记|历史)|search (?:across|through)|full[- ]text search/,
  context: /上下文(?:压缩|管理|优化|窗口)|context (?:compression|management)|compact (?:conversation|history)|压缩(?:历史|上下文)/,
  image: /图像(?:生成|编辑|处理)|图片(?:生成|编辑|处理)|image (?:generation|editing|processing)|generate images/,
  video: /视频(?:生成|编辑|处理)|分镜|storyboard|video (?:generation|editing|processing)/,
  voice: /语音(?:合成|识别|播报)|文本转语音|\btts\b|speech (?:synthesis|recognition)/,
  vision: /视觉(?:理解|识别|模型)|多模态(?:理解|模型)|multimodal|识图|图像理解/,
  export: /导出(?:会话|聊天|记录|数据|为|成)|export (?:sessions?|chats?|conversations?|data|to)|备份(?:文件|配置|数据)|backup (?:files?|config|data)/,
  persona: /\bpersona\b|人格|人设|桌宠|宠物|陪伴/,
  rag: /知识库(?:检索|问答|管理)|rag (?:检索|系统|管道)|retrieval[- ]augmented|向量(?:检索|数据库)|embeddings? and reranking/,
  social: /(?:discord|slack|telegram|feishu|飞书|微信|wechat|bilibili|twitter) (?:集成|通知|推送|bot|机器人)|集成 (?:discord|slack|telegram|feishu)/,
  automation: /(?:gui|ui|界面)自动化|自动化(?:操作|点击|填写)|computer[- ]use|\brpa\b|自动(?:点击|填写)/,
  mcp: /\bmcp\b (?:server|tool|client|协议|服务器|工具)|model context protocol/,
  routing: /模型路由|路由(?:策略|配置)|llm (?:router|routing)|gateway|failover|负载均衡/,
  cost: /成本(?:统计|分析|优化)|额度(?:查询|监控|管理)|token (?:消耗|统计|成本)|quota (?:check|monitor)|余额(?:查询|监控)/,
  analytics: /统计(?:分析|面板)|使用(?:统计|分析)|telemetry|usage (?:stats|analytics)|报表/,
  database: /数据库(?:管理|查询|浏览)|sqlite|postgres|sql (?:editor|client)/,
  design: /设计(?:工具|系统)|排版|ppt(?:生成|制作)|卡片(?:生成|设计)|主题(?:切换|定制)|壁纸/,
  i18n: /中文本地化|汉化|补全中文|中文(?:语言包|界面(?:补全|适配))|多语言|\bi18n\b|localization/,
  security: /安全(?:审计|扫描|检查)|加密|权限(?:管理|控制)|密钥管理|jailbreak|越狱/,
  market: /插件市场|plugin (?:market|marketplace)/,
  manager: /插件(?:管理|安装|升级)|plugin (?:manager|installer)|版本管理/,
  notify: /通知(?:推送|中心)|提醒|定时发送|notif(?:y|ication)|alert/,
  productivity: /待办(?:清单|管理)|日历|日程|习惯(?:追踪|养成)|todo (?:list|manager)/,
  game: /游戏|galgame|桌宠|抽卡|meme/,
  tui: /终端(?:界面|ui)|\btui\b/,
  workflow: /工作流(?:编排|引擎|管理)|workflow (?:engine|orchestration)|pipeline 编排/,
};

const NEG = /(?:不支持|不会|不要|无需|没有|不提供|不污染|不属于|而非|并不|不能|不(?:执行|提供|支持|包含|包括|接入|开放|宣称|承诺|是|会|能)|无浏览器|无远程|无界面|无面板|无桌面|无视觉|未提供|未实现|未包含|不含|不包括|未接入|未开放|不宣称|不承诺|does not|do not|doesn't|didn't|without|rather than|not a |never|no longer|not supported|unsupported|not included|outside|remain outside|stay outside|out of scope|cannot|can't|no (?:extra )?(?:telemetry|persona|support|network)|would bypass)/i;
const NEG_AFTER = /(?:stay|remain|kept|left) outside|out of scope|not supported|unsupported|not included/i;
const QUESTION = /[?？]/;
const COMPARE = /定位不同|不重造|不同于|区别于|与[^，。；]{0,16}不同|不像|compared (?:to|with)|as opposed to|instead of/i;
const HOST = /宿主|运行时|兼容|目标运行|host (?:app|environment|runtime)|runtime|在浏览器|浏览器(?:打开|中|里|半|本地| profile)|browser (?:opens|half|profile|local)|web 客户端|web client|web\s*\/\s*桌面|官方(?:右侧栏|侧边栏|面板)|official (?:right )?sidebar|插件管理(?:页|面板)|plugin manager (?:page|panel)/i;
const HOST_PRONE = new Set(['browser','desktop','webui','mobile','screen','shell']);
const INSTALL = /npm (?:i|install)|git clone|git pull|git install|git ls-remote|pip install|brew install|cargo install|安装步骤|dsh plugin (?:add|install)|profile plugin manager|pnpm|插件安装|前置条件|prerequisite|another terminal|另一个终端/i;

export function cleanReadme(raw) {
  let t = String(raw || '');
  t = t.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ')
       .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
       .replace(/https?:\/\/\S+/g, ' ');
  t = t.replace(/(^|\n)(#{1,6})\s*(?:installation|install|setup|getting started|quick start|development|developing|building|build|testing|tests|usage|deploy(?:ment)?|安装|快速开始|使用|开发|构建|测试|部署)[^\n]*\n[\s\S]*?(?=\n#{1,6}\s|\n*$)/gi, '$1');
  t = t.replace(/[|]/g, ' ').replace(/\s+/g, ' ');
  return t;
}

// Assertion zones: tagline + feature bullets only; incidental prose elsewhere is ignored.
export function signalZones(raw) {
  let t = String(raw || '');
  t = t.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ')
       .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
       .replace(/https?:\/\/\S+/g, ' ');
  const lines = t.split('\n');
  const bullets = lines.filter((l) => /^\s*[-*+]\s+\S/.test(l) && !/^\s*[-*+]\s*(?:\[|!\[|https?:|npm |git |pip |brew )/.test(l));
  let body = t.replace(/^#\s+[^\n]*\n/, '');
  const h = body.search(/\n#{1,6}\s/);
  if (h >= 0) body = body.slice(0, h);
  const intro = body.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  const feat = bullets.join(' ').replace(/[|]/g, ' ').replace(/\s+/g, ' ').slice(0, 1200);
  return { intro, feat };
}

export function rejected(text, idx, len, tag) {
  const before = text.slice(Math.max(0, idx - 35), idx + len);
  const after = text.slice(idx + len, idx + len + 35);
  const around = text.slice(Math.max(0, idx - 45), idx + len + 45);
  if (NEG.test(before) || NEG_AFTER.test(after)) return true;
  if (QUESTION.test(around)) return true;
  if (COMPARE.test(around)) return true;
  if (INSTALL.test(around)) return true;
  if (HOST_PRONE.has(tag) && HOST.test(around)) return true;
  if (tag === 'i18n' && /(?:见|参见|链接|link|see )/.test(around)) return true;
  if (tag === 'social' && /交流群|加群|群二维码|QQ 群/.test(around)) return true;
  if (tag === 'search' && /alpha|beta|算法|不属于|topic:|检索 `/.test(around)) return true;
  if (tag === 'analytics' && /(?:关掉|关闭|禁用|turn [^.]{0,20}off|disable|opt[- ]out)/i.test(around)) return true;
  if (tag === 'routing' && /模型路由/.test(around)) return true;
  if (tag === 'routing' && !/模型|model|llm|网关|gateway|proxy|代理/i.test(around) && /负载均衡|load balanc/i.test(around)) return true;
  if (tag === 'productivity' && /no todo list|没有待办/i.test(around)) return true;
  if (tag === 'notify' && /只提醒|仅提醒/.test(around) && !/通知|推送|提醒(?:功能|用户|设置)/.test(around)) return true;
  if (tag === 'manager' && /插件管理(?:页|面板)|plugin manager (?:page|panel)|profile plugin manager|dsh plugin (?:add|install)/i.test(around)) return true;
  if (tag === 'tui' && /保持 ?tui|tui\/cli|alternate (?:tui|interface)/i.test(around)) return true;
  if (tag === 'shell' && /另一个终端|another terminal|前提|prerequisite/i.test(around)) return true;
  if (tag === 'database' && /skill\.md|\.md\b|副档名|filename|file name|schema-design/i.test(around)) return true;
  if (tag === 'security' && /加密行情|行情|加密货币|crypto (?:market|price|currency)/i.test(around)) return true;
  return false;
}

// Only tags whose per-tag precision passed the 2026-11-09 audit (>=0.8) may be added.
// database (0.73) and security (0.67) failed and are baseline-only.
const ALLOWED = new Set(['browser', 'webui', 'mcp', 'search', 'export', 'image', 'productivity', 'social']);

// Returns up to 2 capability tags with an explicit assertion (intro/keywords first).
export function enrichCapabilities(readmeRaw, keywords) {
  const { intro, feat } = signalZones(readmeRaw);
  const kwText = (keywords || []).join(' ');
  const zones = [
    { text: (intro + ' ' + kwText).toLowerCase(), strong: true },
    { text: feat.toLowerCase(), strong: false },
  ];
  const scored = [];
  for (const [tag, re] of Object.entries(GATES)) {
    if (GENERIC.has(tag)) continue;
    let best = 0;
    for (const z of zones) {
      const g = new RegExp(re.source, 'gi');
      let m;
      while ((m = g.exec(z.text))) {
        if (!rejected(z.text, m.index, m[0].length, tag)) { best = Math.max(best, z.strong ? 2 : 1); break; }
        if (m.index === g.lastIndex) g.lastIndex++;
      }
      if (best === 2) break;
    }
    if (best > 0 && ALLOWED.has(tag)) scored.push({ tag, best });
  }
  scored.sort((a, b) => b.best - a.best);
  return scored.slice(0, 2).map((s) => s.tag);
}

export { GENERIC, GATES };