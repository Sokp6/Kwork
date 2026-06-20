/* ==========================================================
   parser.js — получение и разбор ленты заказов Kwork

   КАК ОБХОДИМ CORS:
   Браузерный fetch() к kwork.ru заблокируется политикой CORS.
   Поэтому в APK используем CapacitorHttp — нативный HTTP-запрос
   с уровня Android, который CORS не касается.
   В обычном браузере (PWA) парсинг работать НЕ будет — только в APK.

   ВАЖНО: структура страницы Kwork может отличаться от ожидаемой.
   Парсер пробует несколько стратегий. Если ни одна не сработала —
   возвращает сырой ответ, чтобы можно было разобраться.
   ========================================================== */

window.KworkParser = (function () {

  // URL публичной ленты заказов (биржа). c= — категория.
  function buildUrl(category, page) {
    const base = "https://kwork.ru/projects";
    const params = [];
    if (category && category !== "all") {
      params.push("c=" + category);
    }
    if (page && page > 1) {
      params.push("page=" + page);
    }
    return params.length ? `${base}?${params.join("&")}` : base;
  }

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // ---- Получение HTML страницы ----
  async function fetchHtml(url) {
    // Способ 1: нативный HTTP через Capacitor (обходит CORS) — для APK
    if (isNative() && window.Capacitor.Plugins.CapacitorHttp) {
      const res = await window.Capacitor.Plugins.CapacitorHttp.get({
        url: url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Android) KworkFeed/1.0",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      if (res.status >= 200 && res.status < 400) {
        return typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      }
      throw new Error("HTTP " + res.status);
    }

    // Способ 2: обычный fetch — сработает только если нет CORS (т.е. почти никогда для Kwork)
    const res = await fetch(url, {
      headers: { "Accept": "text/html" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  }

  // ---- Разбор HTML в список заказов ----
  // Kwork отдаёт заказы внутри JS-переменной (window.stateData или похожей),
  // а также дублирует часть в HTML. Пробуем оба пути.
  function parseOrders(html) {
    const orders = [];

    // --- Стратегия A: данные в JSON внутри <script> ---
    // Kwork часто кладёт стейт в window.__INITIAL_STATE__ или stateData
    const jsonOrders = tryParseJsonState(html);
    if (jsonOrders && jsonOrders.length) {
      return jsonOrders;
    }

    // --- Стратегия B: парсим HTML-карточки через DOMParser ---
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");

      // Пробуем разные селекторы карточек заказов
      const selectors = [
        ".want-card",
        "[data-project-id]",
        ".project-card",
        ".wants-card",
        "article.card",
      ];

      let cards = [];
      for (const sel of selectors) {
        cards = doc.querySelectorAll(sel);
        if (cards.length) break;
      }

      cards.forEach((card) => {
        const order = extractFromCard(card);
        if (order && order.title) orders.push(order);
      });
    } catch (e) {
      console.warn("[Parser] DOMParser стратегия упала:", e);
    }

    return orders;
  }

  // Попытка вытащить заказы из JSON-стейта в HTML
  function tryParseJsonState(html) {
    const patterns = [
      /window\.stateData\s*=\s*(\{[\s\S]*?\});/,
      /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/,
      /"wants"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          const wants = data.wants || data.projects || (Array.isArray(data) ? data : null);
          if (wants && Array.isArray(wants)) {
            return wants.map(normalizeJsonOrder).filter((o) => o.title);
          }
        } catch (e) {
          // не распарсилось — пробуем следующий паттерн
        }
      }
    }
    return null;
  }

  function normalizeJsonOrder(w) {
    const id = w.id || w.want_id || "";
    return {
      id: String(id),
      title: w.name || w.title || "",
      description: stripHtml(w.description || w.desc || ""),
      budget: parseInt(w.priceLimit || w.price || w.budget || 0, 10) || 0,
      offers: w.kwork_count || w.offers || 0,
      timeLeft: w.timeLeft || w.date_expire || "",
      url: id ? `https://kwork.ru/projects/${id}/view` : "https://kwork.ru/projects",
      category: w.category_name || "",
    };
  }

  // Вытащить данные из одной HTML-карточки
  function extractFromCard(card) {
    const getText = (sel) => {
      const el = card.querySelector(sel);
      return el ? el.textContent.trim() : "";
    };

    const titleEl = card.querySelector("a[href*='/projects/'], .wants-card__header-title, h1, h2, .title");
    const title = titleEl ? titleEl.textContent.trim() : "";

    let url = "";
    const linkEl = card.querySelector("a[href*='/projects/']");
    if (linkEl) {
      url = linkEl.getAttribute("href");
      if (url && !url.startsWith("http")) url = "https://kwork.ru" + url;
    }

    // Бюджет — ищем по символу ₽ или классам цены
    let budgetText = getText(".wants-card__price, .price, [class*='price']");
    const budget = parseInt(budgetText.replace(/[^\d]/g, ""), 10) || 0;

    const description = getText(".wants-card__description, .description, [class*='desc']");

    return {
      id: card.getAttribute("data-project-id") || card.getAttribute("data-want-id") || "",
      title,
      description,
      budget,
      offers: 0,
      timeLeft: "",
      url: url || "https://kwork.ru/projects",
      category: "",
    };
  }

  function stripHtml(str) {
    if (!str) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = str;
    return (tmp.textContent || tmp.innerText || "").trim();
  }

  // ---- Главная функция: получить заказы ----
  async function getOrders(category, limit) {
    const url = buildUrl(category, 1);
    const html = await fetchHtml(url);

    const orders = parseOrders(html);

    if (!orders.length) {
      // Парсер ничего не нашёл — кидаем ошибку с куском ответа,
      // чтобы можно было понять, что отдал Kwork
      const err = new Error("Заказы не распознаны в ответе Kwork");
      err.rawSample = html.slice(0, 1500);
      err.htmlLength = html.length;
      throw err;
    }

    return limit ? orders.slice(0, limit) : orders;
  }

  return { getOrders, buildUrl, isNative };
})();
