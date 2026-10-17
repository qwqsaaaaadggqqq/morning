// Утро — виджет для Scriptable: пары, погода и оплата VPN.
// Подходит для всех размеров: маленький, средний, большой и экран блокировки.
// Нажатие на виджет открывает меню: отметить оплату VPN или открыть дашборд.
// Без обратных кавычек: при вставке на айфоне они пропадают и скрипт ломается.

const CONFIG = {
  dataUrl: "https://qwqsaaaaadggqqq.github.io/morning/schedule.json",
  dashboardUrl: "https://qwqsaaaaadggqqq.github.io/morning/",
  city: { name: "СПб", lat: 59.94, lon: 30.31 },
  subgroup: 1, // 0 — обе подгруппы
  bells: { 1: ["09:00", "10:30"], 2: ["10:45", "12:15"], 3: ["12:50", "14:20"], 4: ["14:30", "16:00"], 5: ["16:10", "17:40"] },
  vpn: { day: 20, price: 500 },
};

const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e")),
  text: Color.dynamic(new Color("#1f1e1d"), new Color("#f1efe8")),
  text2: Color.dynamic(new Color("#5f5e5a"), new Color("#b4b2a9")),
  text3: Color.dynamic(new Color("#8a8983"), new Color("#7c7b75")),
  accent: Color.dynamic(new Color("#185fa5"), new Color("#85b7eb")),
  warn: Color.dynamic(new Color("#854f0b"), new Color("#fac775")),
  warnBg: Color.dynamic(new Color("#faeeda"), new Color("#633806")),
  danger: Color.dynamic(new Color("#a32d2d"), new Color("#f09595")),
  dangerBg: Color.dynamic(new Color("#fcebeb"), new Color("#791f1f")),
  ok: Color.dynamic(new Color("#3b6d11"), new Color("#c0dd97")),
  okBg: Color.dynamic(new Color("#eaf3de"), new Color("#27500a")),
};

const DOW_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const DOW = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MON_FULL = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const CAMPUS = { "Э": "Энгельса", "П": "Приморский", "О": "онлайн" };
const PAID_KEY = "morning.vpnPaidFor";

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => ("" + (d.getFullYear()) + "-" + (pad(d.getMonth() + 1)) + "-" + (pad(d.getDate())));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const atTime = (day, hhmm) => { const [h, m] = hhmm.split(":").map(Number); const d = new Date(day); d.setHours(h, m, 0, 0); return d; };
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const isCancelled = (l) => /отмен/i.test(l.subject);

/* ---------- Данные ---------- */

const fm = FileManager.local();
const cacheDir = fm.joinPath(fm.documentsDirectory(), "morning-widget");
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir, true);

// Без сети берём последнюю сохранённую копию.
async function loadJSON(url, name) {
  const path = fm.joinPath(cacheDir, name);
  try {
    const req = new Request(url);
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    if (!data || data.error) throw new Error("bad response");
    fm.writeString(path, JSON.stringify(data));
    return { data, cached: false };
  } catch (e) {
    if (fm.fileExists(path)) return { data: JSON.parse(fm.readString(path)), cached: true };
    return { data: null, cached: true };
  }
}

function weatherUrl() {
  const { lat, lon } = CONFIG.city;
  return ("https://api.open-meteo.com/v1/forecast?latitude=" + (lat) + "&longitude=" + (lon)) +
    "&current=temperature_2m,weather_code" +
    "&hourly=temperature_2m,precipitation_probability,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min,weather_code" +
    "&timezone=Europe%2FMoscow&forecast_days=3";
}

/* ---------- Расписание ---------- */

function lessonsOn(schedule, day) {
  const key = iso(day);
  const list = (schedule?.lessons || []).filter((l) => l.date === key && (!CONFIG.subgroup || !l.sub || l.sub === CONFIG.subgroup));
  const byN = new Map();
  for (const l of list) { if (!byN.has(l.n)) byN.set(l.n, []); byN.get(l.n).push(l); }
  return [...byN.entries()].sort((a, b) => a[0] - b[0]).map(([n, items]) => {
    const b = CONFIG.bells[n];
    return {
      n, items,
      cancelled: items.every(isCancelled),
      start: b ? atTime(day, b[0]) : null,
      end: b ? atTime(day, b[1]) : null,
      time: b ? b[0] : ("" + (n) + " пара"),
      subject: items.map((l) => l.subject).filter((s, i, a) => a.indexOf(s) === i).join(" / "),
      place: items.filter((l) => !isCancelled(l)).map((l) => [l.aud, CAMPUS[l.campus]].filter(Boolean).join(", ")).filter(Boolean).join(" / "),
      aud: items.filter((l) => !isCancelled(l)).map((l) => l.aud).filter(Boolean).join(" / "),
      replaced: items.some((l) => l.zam === 1 || l.zam === 3),
    };
  });
}

// Сегодня, пока пары не закончились, иначе ближайший учебный день.
function pickDay(schedule, now) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const slots = lessonsOn(schedule, today);
  const active = slots.filter((s) => !s.cancelled);
  const lastEnd = active.length ? active[active.length - 1].end : null;
  if (active.length && (!lastEnd || now < lastEnd)) return { day: today, slots, offset: 0 };
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const s = lessonsOn(schedule, d);
    if (s.length) return { day: d, slots: s, offset: i };
  }
  return { day: today, slots: [], offset: 0 };
}

function dayLabel(pick) {
  const d = pick.day;
  const name = pick.offset === 0 ? "Сегодня" : pick.offset === 1 ? "Завтра" : cap(DOW[d.getDay()]);
  return ("" + (name) + ", " + (d.getDate()) + " " + (MON[d.getMonth()]));
}

function nextSlot(pick, now) {
  const live = pick.slots.filter((s) => !s.cancelled);
  return (pick.offset === 0 ? live.find((s) => !s.end || s.end > now) : live[0]) || null;
}

/* ---------- Погода ---------- */

function symbolFor(code) {
  if (code === 0) return "sun.max";
  if (code <= 2) return "cloud.sun";
  if (code === 3) return "cloud";
  if (code <= 48) return "cloud.fog";
  if (code <= 67) return "cloud.rain";
  if (code <= 77) return "cloud.snow";
  if (code <= 82) return "cloud.heavyrain";
  if (code <= 86) return "cloud.snow";
  return "cloud.bolt.rain";
}

function weatherFor(weather, pick, now) {
  if (!weather) return null;
  const key = iso(pick.day);
  const h = weather.hourly, d = weather.daily;
  const di = d.time.indexOf(key);
  if (di < 0) return null;
  const isToday = key === iso(now);
  const at = (hh) => h.time.indexOf(("" + (key) + "T" + (pad(hh)) + ":00"));
  const hours = [6, 9, 12, 15, 18, 21].map((hh) => {
    const i = at(hh);
    return i < 0 ? null : { hh, temp: Math.round(h.temperature_2m[i]), code: h.weather_code[i], prob: h.precipitation_probability[i] };
  }).filter(Boolean);
  let rain = null;
  for (let hh = isToday ? now.getHours() : 7; hh <= 22; hh++) {
    const i = at(hh);
    if (i >= 0 && h.precipitation_probability[i] >= 50) {
      rain = { hh, prob: h.precipitation_probability[i], snow: [71, 73, 75, 77, 85, 86].includes(h.weather_code[i]) };
      break;
    }
  }
  return {
    isToday,
    // Для другого дня «текущей» температуры нет, показываем диапазон с днём недели.
    range: isToday ? ("" + (Math.round(d.temperature_2m_min[di])) + "…" + (Math.round(d.temperature_2m_max[di])) + "°") : ("" + (DOW_SHORT[pick.day.getDay()]) + " " + (Math.round(d.temperature_2m_min[di])) + "…" + (Math.round(d.temperature_2m_max[di])) + "°"),
    temp: Math.round(isToday ? weather.current.temperature_2m : d.temperature_2m_max[di]),
    code: isToday ? weather.current.weather_code : d.weather_code[di],
    min: Math.round(d.temperature_2m_min[di]),
    max: Math.round(d.temperature_2m_max[di]),
    hours, rain,
  };
}

/* ---------- VPN ---------- */

const monthKey = (d) => ("" + (d.getFullYear()) + "-" + (pad(d.getMonth() + 1)));
const getPaid = () => (Keychain.contains(PAID_KEY) ? Keychain.get(PAID_KEY) : null);

function vpnState(now) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  let due = new Date(today.getFullYear(), today.getMonth(), CONFIG.vpn.day);
  const paidThis = getPaid() === monthKey(due);
  if (paidThis) due = new Date(due.getFullYear(), due.getMonth() + 1, CONFIG.vpn.day);
  const days = Math.round((due - today) / 86400e3);
  const level = days < 0 || days === 0 ? "danger" : paidThis ? "ok" : days <= 5 ? "warn" : "none";
  const short = days < 0 ? ("просрочен " + (-days) + " дн") : days === 0 ? "сегодня" : ("" + (days) + " " + (plural(days, "день", "дня", "дней")));
  return { days, due, paidThis, level, short };
}

/* ---------- Отрисовка ---------- */

function txt(stack, s, size, opts = {}) {
  const t = stack.addText(String(s));
  t.font = opts.weight === "medium" ? Font.mediumSystemFont(size) : opts.weight === "bold" ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = opts.color || C.text;
  t.lineLimit = opts.lines || 1;
  t.minimumScaleFactor = opts.scale || 0.85;
  return t;
}

function icon(stack, name, size, color) {
  const sym = SFSymbol.named(name);
  if (!sym || !sym.image) return null;
  sym.applyFont(Font.systemFont(size));
  const img = stack.addImage(sym.image);
  img.imageSize = new Size(size, size);
  img.tintColor = color || C.text2;
  return img;
}

function pill(stack, s, level) {
  const p = stack.addStack();
  p.setPadding(2, 6, 2, 6);
  p.cornerRadius = 6;
  p.backgroundColor = level === "danger" ? C.dangerBg : level === "ok" ? C.okBg : C.warnBg;
  txt(p, s, 11, { color: level === "danger" ? C.danger : level === "ok" ? C.ok : C.warn, weight: "medium" });
  return p;
}

function hrow(stack, spacing = 4) {
  const r = stack.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  r.spacing = spacing;
  return r;
}

function slotColor(slot, pick, now) {
  if (slot.cancelled) return C.text3;
  if (pick.offset === 0 && slot.end && now >= slot.end) return C.text3;
  if (pick.offset === 0 && slot.start && now >= slot.start && now < slot.end) return C.accent;
  return C.text;
}

function emptyText(stack, data) {
  txt(stack, data.schedule ? "Пар нет на неделе" : "Нет расписания, проверь интернет", 13, { color: C.text2, lines: 2 });
}

function buildSmall(w, data, now) {
  const { pick, wx, vpn } = data;
  const top = hrow(w, 4);
  if (wx) {
    icon(top, symbolFor(wx.code), 14);
    if (wx.isToday) txt(top, ("" + (wx.temp) + "°"), 15, { weight: "medium" });
    top.addSpacer();
    txt(top, wx.range, 11, { color: C.text2 });
  } else {
    txt(top, CONFIG.city.name, 12, { color: C.text2 });
  }
  w.addSpacer(8);
  txt(w, dayLabel(pick), 11, { color: C.text2 });
  const next = nextSlot(pick, now);
  if (next) {
    txt(w, next.time, 22, { weight: "medium", color: slotColor(next, pick, now) });
    txt(w, next.subject, 13, { weight: "medium", lines: 2 });
    if (next.aud) txt(w, next.aud, 11, { color: C.text2 });
  } else {
    w.addSpacer(4);
    emptyText(w, data);
  }
  w.addSpacer();
  const bottom = hrow(w, 4);
  if (vpn.level === "warn" || vpn.level === "danger") pill(bottom, ("VPN " + (vpn.short)), vpn.level);
  else if (wx?.rain) { icon(bottom, "umbrella", 11, C.accent); txt(bottom, ("" + (pad(wx.rain.hh)) + ":00"), 11, { color: C.accent }); }
  else {
    const left = pick.slots.filter((s) => !s.cancelled && s !== next && (!next || s.n > next.n)).length;
    if (next && left) txt(bottom, ("ещё " + (left) + " " + (plural(left, "пара", "пары", "пар"))), 11, { color: C.text3 });
  }
}

function buildMedium(w, data, now) {
  const { pick, wx, vpn } = data;
  const row = w.addStack();
  row.layoutHorizontally();
  row.spacing = 12;

  const left = row.addStack();
  left.layoutVertically();
  left.size = new Size(92, 0);
  const city = hrow(left, 4);
  icon(city, wx ? symbolFor(wx.code) : "location", 12);
  txt(city, CONFIG.city.name, 11, { color: C.text2 });
  if (wx) {
    txt(left, ("" + (wx.temp) + "°"), 30, { weight: "medium" });
    txt(left, wx.range, 11, { color: C.text2 });
    if (wx.rain) {
      left.addSpacer(3);
      const r = hrow(left, 3);
      icon(r, "umbrella", 11, C.accent);
      txt(r, ("" + (pad(wx.rain.hh)) + ":00"), 11, { color: C.accent });
    }
  } else {
    txt(left, "—", 30, { color: C.text3 });
  }
  left.addSpacer();
  pill(left, ("VPN " + (vpn.short)), vpn.level === "none" ? "ok" : vpn.level);

  const right = row.addStack();
  right.layoutVertically();
  right.spacing = 4;
  txt(right, dayLabel(pick), 11, { color: C.text2 });
  if (!pick.slots.length) emptyText(right, data);
  const shown = pick.slots.slice(0, 4);
  for (const s of shown) {
    const r = hrow(right, 6);
    txt(r, s.time, 11, { color: C.text3 });
    const color = slotColor(s, pick, now);
    txt(r, s.cancelled ? "отменена" : s.aud ? ("" + (s.subject) + " · " + (s.aud)) : s.subject, 12, { color, weight: color === C.accent ? "medium" : "regular", scale: 0.75 });
  }
  if (pick.slots.length > shown.length) txt(right, ("+ ещё " + (pick.slots.length - shown.length)), 11, { color: C.text3 });
  right.addSpacer();
}

function buildLarge(w, data, now) {
  const { pick, wx, vpn } = data;
  const head = hrow(w, 6);
  txt(head, dayLabel(pick), 15, { weight: "bold" });
  head.addSpacer();
  pill(head, vpn.paidThis ? "VPN оплачен" : ("VPN · " + (vpn.short)), vpn.level === "none" ? "ok" : vpn.level);

  w.addSpacer(8);
  if (wx) {
    const t = hrow(w, 8);
    icon(t, symbolFor(wx.code), 20);
    txt(t, ("" + (wx.temp) + "°"), 26, { weight: "medium" });
    txt(t, wx.isToday ? ("сейчас, днём " + (wx.min) + "…" + (wx.max) + "°") : ("днём " + (wx.min) + "…" + (wx.max) + "°"), 12, { color: C.text2 });
    w.addSpacer(8);
    const hours = hrow(w, 0);
    for (const h of wx.hours) {
      const cell = hours.addStack();
      cell.layoutVertically();
      cell.centerAlignContent();
      const past = wx.isToday && now.getHours() >= h.hh + 3;
      const c1 = hrow(cell, 0); c1.addSpacer(); txt(c1, pad(h.hh), 10, { color: C.text3 }); c1.addSpacer();
      const c2 = hrow(cell, 0); c2.addSpacer(); icon(c2, symbolFor(h.code), 14, past ? C.text3 : C.text2); c2.addSpacer();
      const c3 = hrow(cell, 0); c3.addSpacer(); txt(c3, ("" + (h.temp) + "°"), 12, { weight: "medium", color: past ? C.text3 : h.prob >= 50 ? C.accent : C.text }); c3.addSpacer();
      hours.addSpacer();
    }
    w.addSpacer(6);
    const adv = hrow(w, 4);
    if (wx.rain) {
      icon(adv, "umbrella", 12, C.accent);
      txt(adv, ("" + (wx.rain.snow ? "Снег" : "Дождь") + " около " + (pad(wx.rain.hh)) + ":00 (" + (wx.rain.prob) + "%), возьми " + (wx.rain.snow ? "шапку" : "зонт")), 12, { color: C.accent });
    } else {
      icon(adv, "checkmark", 11, C.text2);
      txt(adv, "Без осадков", 12, { color: C.text2 });
    }
  } else {
    txt(w, "Погода не загрузилась", 12, { color: C.text3 });
  }

  w.addSpacer(12);

  if (!pick.slots.length) emptyText(w, data);
  const shown = pick.slots.slice(0, 5);
  for (const s of shown) {
    const r = w.addStack();
    r.layoutHorizontally();
    r.spacing = 8;
    txt(r, s.time, 12, { color: C.text3 });
    const col = r.addStack();
    col.layoutVertically();
    const color = slotColor(s, pick, now);
    const title = hrow(col, 4);
    txt(title, s.cancelled ? ("" + (s.n) + " пара отменена") : s.subject, 13, { color, weight: s.cancelled ? "regular" : "medium", scale: 0.8 });
    if (s.replaced && !s.cancelled) pill(title, "замена", "warn");
    if (!s.cancelled && s.place) txt(col, s.place, 11, { color: C.text2 });
    w.addSpacer(5);
  }
  w.addSpacer();
  if (data.stale) txt(w, ("Нет сети, расписание от " + (data.stale)), 10, { color: C.warn });
}

function buildRectangular(w, data, now) {
  const { pick, wx, vpn } = data;
  const next = nextSlot(pick, now);
  const prefix = pick.offset === 0 ? "" : pick.offset === 1 ? "Завтра " : ("" + (cap(DOW_SHORT[pick.day.getDay()])) + " ");
  txt(w, next ? ("" + (prefix) + (next.time) + " " + (next.subject)) : "Пар нет", 14, { weight: "bold", scale: 0.7 });
  const parts = [];
  if (next?.aud) parts.push(next.aud);
  if (wx) parts.push(("" + (wx.temp) + "°"));
  if (wx?.rain) parts.push(("" + (wx.rain.snow ? "снег" : "дождь") + " " + (pad(wx.rain.hh)) + ":00"));
  txt(w, parts.join(" · ") || dayLabel(pick), 12, { scale: 0.7 });
  if (vpn.level === "warn" || vpn.level === "danger") txt(w, ("VPN: " + (vpn.short)), 12, { scale: 0.7 });
  else {
    const rest = pick.slots.filter((s) => !s.cancelled && (!next || s.n > next.n)).length;
    txt(w, rest ? ("потом ещё " + (rest) + " " + (plural(rest, "пара", "пары", "пар"))) : dayLabel(pick), 12, { scale: 0.7 });
  }
}

function buildInline(w, data, now) {
  const next = nextSlot(data.pick, now);
  const wx = data.wx ? (" · " + (data.wx.temp) + "°") : "";
  txt(w, next ? ("" + (next.time) + " " + (next.aud || next.subject) + (wx)) : ("Пар нет" + (wx)), 12);
}

function buildCircular(w, data, now) {
  w.addAccessoryWidgetBackground = true;
  const next = nextSlot(data.pick, now);
  const top = hrow(w, 0); top.addSpacer(); txt(top, next ? next.time : "—", 14, { weight: "bold", scale: 0.6 }); top.addSpacer();
  const bottom = hrow(w, 0); bottom.addSpacer(); txt(bottom, next ? (next.aud || ("" + (next.n) + " пара")) : "пар нет", 10, { scale: 0.6 }); bottom.addSpacer();
}

async function makeWidget(family) {
  const now = new Date();
  const [sch, wth] = await Promise.all([
    loadJSON(("" + (CONFIG.dataUrl) + "?t=" + (Math.floor(now.getTime() / 600e3))), "schedule.json"),
    loadJSON(weatherUrl(), "weather.json"),
  ]);
  const schedule = sch.data;
  const pick = pickDay(schedule, now);
  const data = {
    schedule, pick,
    wx: weatherFor(wth.data, pick, now),
    vpn: vpnState(now),
    stale: sch.cached && schedule ? (() => { const u = new Date(schedule.updated); return ("" + (u.getDate()) + " " + (MON[u.getMonth()]) + " " + (pad(u.getHours())) + ":" + (pad(u.getMinutes()))); })() : null,
  };

  const w = new ListWidget();
  const accessory = family.startsWith("accessory");
  if (!accessory) {
    w.backgroundColor = C.bg;
    w.setPadding(14, 14, 14, 14);
  }
  if (family === "small") buildSmall(w, data, now);
  else if (family === "medium") buildMedium(w, data, now);
  else if (family === "accessoryRectangular") buildRectangular(w, data, now);
  else if (family === "accessoryInline") buildInline(w, data, now);
  else if (family === "accessoryCircular") buildCircular(w, data, now);
  else buildLarge(w, data, now);

  w.refreshAfterDate = new Date(now.getTime() + 20 * 60e3);
  return w;
}

/* ---------- Запуск ---------- */

async function menu() {
  const now = new Date();
  const vpn = vpnState(now);
  const thisDue = new Date(now.getFullYear(), now.getMonth(), CONFIG.vpn.day);
  const a = new Alert();
  a.title = "Утро";
  a.message = vpn.paidThis
    ? ("VPN оплачен, следующая оплата " + (vpn.due.getDate()) + " " + (MON_FULL[vpn.due.getMonth()]))
    : ("VPN: оплата " + (vpn.due.getDate()) + " " + (MON_FULL[vpn.due.getMonth()]) + ", " + (CONFIG.vpn.price) + " ₽");
  const actions = [];
  if (vpn.paidThis) { a.addAction("Снять отметку об оплате"); actions.push("unpay"); }
  else { a.addAction(("Оплатил VPN (" + (MON_FULL[thisDue.getMonth()]) + ")")); actions.push("pay"); }
  a.addAction("Открыть дашборд"); actions.push("open");
  a.addAction("Показать маленький"); actions.push("small");
  a.addAction("Показать средний"); actions.push("medium");
  a.addAction("Показать большой"); actions.push("large");
  a.addCancelAction("Закрыть");
  const i = await a.presentSheet();
  const act = actions[i];
  if (act === "pay") Keychain.set(PAID_KEY, monthKey(thisDue));
  else if (act === "unpay") Keychain.remove(PAID_KEY);
  else if (act === "open") Safari.open(CONFIG.dashboardUrl);
  else if (act === "small") await (await makeWidget("small")).presentSmall();
  else if (act === "medium") await (await makeWidget("medium")).presentMedium();
  else if (act === "large") await (await makeWidget("large")).presentLarge();
}

if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(await makeWidget(config.widgetFamily || "large"));
} else {
  await menu();
}
Script.complete();
