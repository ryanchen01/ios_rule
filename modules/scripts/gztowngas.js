// 广州港华余额 v1.0.0。仅查询用户指定的户号，不创建订单、不缴费。
// 户号和 usession 由手机上的模块参数传入；源码不保存个人查询凭据。
(function () {
  "use strict";
  const REQUEST = {
  "URL": "https://www.gztowngas.com/api/ajax/post",
  "USER_AGENT": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Mac MacWechat/WMPF MacWechat/3.8.7(0x13080712) UnifiedPCMacWechat(0xf2641f50) XWEB/25755",
  "REFERER": "https://servicewechat.com/wx0040be326894e0ed/18/page-frame.html"
};
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  let STATE_KEY;
  let LOCK_KEY;
  const now = Date.now();
  const trigger = typeof $trigger === "string" ? $trigger : "";
  const isPanel = typeof $input !== "undefined" && $input.purpose === "panel";
  let state = {};
  let cfg;
  let lockOwned = false;
  let finished = false;

  function readJSON(key) {
    try {
      const value = JSON.parse($persistentStore.read(key) || "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
  }

  function money(value) {
    if ((typeof value !== "number" && typeof value !== "string") ||
        !/^-?\d+(?:\.\d{1,2})?$/.test(String(value).trim())) {
      throw new Error("接口没有返回有效金额，旧余额未更新");
    }
    const cents = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error("金额超出有效范围");
    return cents;
  }

  function config() {
    const args = {};
    String(typeof $argument === "undefined" ? "" : $argument).split("&").forEach(function (item) {
      const at = item.indexOf("=");
      if (at > 0) args[item.slice(0, at)] = decodeURIComponent(item.slice(at + 1));
    });
    const account = String(args.account || "").trim();
    const session = String(args.usession || "").trim();
    if (!/^\d{10}$/.test(account)) throw new Error("请在模块参数 account 填写 10 位户号");
    if (!session || !/^[A-Za-z0-9+/]+={0,2}$/.test(session) || session.length % 4 !== 0) {
      throw new Error("请在模块参数 usession 填写抓取的会话参数");
    }
    const threshold = args.threshold === undefined ? "20" : args.threshold;
    if (!/^\d+(?:\.\d{1,2})?$/.test(threshold)) throw new Error("threshold 须为非负金额，最多两位小数");
    const interval = args.interval_hours === undefined ? "6" : args.interval_hours;
    if (!/^\d+$/.test(interval) || Number(interval) < 1 || Number(interval) > 8760) {
      throw new Error("interval_hours 须为 1–8760 的整数");
    }
    return { account: account, session: session, threshold: money(threshold), hours: Number(interval), mode: args.mode || "panel" };
  }

  function displayMoney(cents) { return (cents / 100).toFixed(2); }
  function displayTime(ms) {
    const d = new Date(ms);
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function hasBalance() { return Number.isSafeInteger(state.balance) && Number.isFinite(state.checkedAt); }
  function save() {
    if (!$persistentStore.write(JSON.stringify(state), STATE_KEY)) {
      throw new Error("Surge 存储失败，无法保存查询时间和提醒状态");
    }
  }
  function panel(error, extra) {
    const known = hasBalance();
    const low = known && cfg && state.balance < cfg.threshold;
    const lines = ["户号 " + (cfg ? cfg.account : "未配置")];
    if (known) {
      lines.push("应缴 ¥" + displayMoney(state.amount) + " · 更新 " + displayTime(state.checkedAt));
    }
    if (error) lines.push("查询失败：" + error + (known ? "；上方为旧余额" : ""));
    if (cfg) lines.push("低于 ¥" + displayMoney(cfg.threshold) + " 提醒 · 每 " + cfg.hours + " 小时查询");
    if (cfg && Number.isFinite(state.lastCronHour)) {
      lines.push("下次定时 " + displayTime((state.lastCronHour + cfg.hours) * HOUR));
    }
    if (extra) lines.push(extra);
    return {
      title: "广州港华 " + (known ? "¥" + displayMoney(state.balance) : "余额待查询"),
      content: lines.join("\n"),
      style: error ? "error" : low ? "alert" : known ? "good" : "info"
    };
  }
  function finish(error, extra) {
    if (finished) return;
    finished = true;
    if (lockOwned) $persistentStore.write(null, LOCK_KEY);
    const result = panel(error || state.error, extra);
    if (!isPanel) console.log(result.title + "\n" + result.content);
    $done(isPanel ? result : {});
  }
  function notify(title, subtitle, body) {
    try { $notification.post(title, subtitle, body); }
    catch (_) { console.log("无法发送通知，请检查 Surge 的通知权限"); }
  }
  function fail(error) {
    const message = error instanceof Error ? error.message : String(error);
    const firstFailure = !state.failureNotified;
    state.error = message;
    state.failedAt = Date.now();
    state.failureNotified = true;
    try {
      save();
      if (firstFailure) notify("广州港华查询失败", "户号 " + (cfg ? cfg.account : "未配置"),
        message + "。请在面板手动刷新；若持续失败，需检查查询参数。");
    } catch (_) { /* 面板仍显示错误，不重复发送无法记住状态的通知。 */ }
    finish(message);
  }

  // 户号 JSON 只含 ASCII，直接编码，不依赖浏览器 btoa。
  function encodeASCII(text) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    for (let i = 0; i < text.length; i += 3) {
      const a = text.charCodeAt(i);
      const b = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      const c = i + 2 < text.length ? text.charCodeAt(i + 2) : 0;
      result += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)] +
        (i + 1 < text.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=") +
        (i + 2 < text.length ? alphabet[c & 63] : "=");
    }
    return result;
  }

  // 响应为 Base64(百分号编码 JSON)，无需浏览器 atob / TextDecoder。
  function decodeData(value) {
    if (typeof value !== "string" || value.length > 65536 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
      throw new Error("接口返回格式变化，旧余额未更新");
    }
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let buffer = 0, bits = 0, decoded = "";
    for (let i = 0; i < value.length && value[i] !== "="; i++) {
      buffer = (buffer << 6) | alphabet.indexOf(value[i]);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        decoded += String.fromCharCode((buffer >> bits) & 255);
      }
    }
    try { return JSON.parse(decodeURIComponent(decoded)); }
    catch (_) { throw new Error("无法解析接口响应，旧余额未更新"); }
  }

  try {
    cfg = config();
    STATE_KEY = "gztowngas." + cfg.account + ".state.v1";
    LOCK_KEY = "gztowngas." + cfg.account + ".lock.v1";
    state = readJSON(STATE_KEY) || {};
    const manual = ["button", "editor", "http-api", "intent"].indexOf(trigger) >= 0;
    const scheduled = cfg.mode === "cron" && !manual;
    const hour = Math.floor(now / HOUR);
    if (scheduled && Number.isFinite(state.lastCronHour) &&
        hour >= state.lastCronHour && hour - state.lastCronHour < cfg.hours) {
      finish(); return;
    }
    // 打开面板只展示已保存的结果；点刷新按钮始终重新请求。
    if (!scheduled && trigger === "auto-interval" && hasBalance()) {
      finish(); return;
    }
    const lock = readJSON(LOCK_KEY);
    if (lock && now >= lock.at && now - lock.at < 30000) {
      finish(null, "正在查询，请稍后刷新"); return;
    }
    if (!$persistentStore.write(JSON.stringify({ at: now }), LOCK_KEY)) {
      throw new Error("Surge 存储不可用");
    }
    lockOwned = true;
    if (scheduled) state.lastCronHour = hour;
    save();
    $httpClient.post({
      url: REQUEST.URL,
      policy: "DIRECT",
      timeout: 15,
      "auto-cookie": false,
      "auto-redirect": false,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": REQUEST.USER_AGENT,
        "Referer": REQUEST.REFERER,
        "xweb_xhr": "1"
      },
      body: "classid=com.ghrq.account.Wx_UserPay_Info&action=doSearchUserId&usession=" +
        encodeURIComponent(cfg.session) + "&params=" +
        encodeURIComponent(encodeASCII(JSON.stringify({ userid: cfg.account })))
    }, function (error, response, body) {
      if (error) { fail(new Error("网络请求失败")); return; }
      try {
        if (!response || response.status !== 200) throw new Error("接口 HTTP " + (response ? response.status : "无响应"));
        let envelope;
        try { envelope = JSON.parse(body); }
        catch (_) { throw new Error("接口返回非 JSON 内容"); }
        if (envelope.success !== true) throw new Error("接口拒绝查询，查询参数可能已失效");
        const data = decodeData(envelope.data);
        const rows = data && Array.isArray(data.wx_userpay_info) ? data.wx_userpay_info : [];
        const account = rows.find(function (row) { return row && String(row.userid) === (cfg ? cfg.account : "未配置"); });
        if (!account) throw new Error("响应中没有指定户号");
        const balance = money(account.prestore);
        const amount = money(account.amount);
        const checkedAt = Date.now();
        const low = balance < cfg.threshold;
        const shouldNotify = low && (!state.low || state.alertThreshold !== cfg.threshold ||
          !Number.isFinite(state.lastLowNotification) || checkedAt - state.lastLowNotification >= DAY);
        state.balance = balance;
        state.amount = amount;
        state.checkedAt = checkedAt;
        state.error = null;
        state.failureNotified = false;
        state.low = low;
        state.alertThreshold = cfg.threshold;
        if (shouldNotify) state.lastLowNotification = checkedAt;
        if (!low) state.lastLowNotification = null;
        save();
        if (shouldNotify) notify("广州港华余额不足", "气费余额 ¥" + displayMoney(balance),
          "户号 " + (cfg ? cfg.account : "未配置") + "，已低于设置的 ¥" + displayMoney(cfg.threshold) + "。请按需充值。");
        finish();
      } catch (e) { fail(e); }
    });
  } catch (e) {
    // 参数或存储错误不发送余额通知，也不会发起网络请求。
    finish(e.message || String(e));
  }
})();
