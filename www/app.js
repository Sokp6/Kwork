/* ==========================================================
   app.js — логика приложения «Kwork Лента»
   ========================================================== */

(function () {
  "use strict";

  const state = {
    screen: "feed",
    category: "all",
    searchText: "",
    allOrders: [],      // всё что загрузили
    settings: window.Store.getSettings(),
  };

  // ==================== НАВИГАЦИЯ ====================

  function go(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById("screen-" + name).classList.add("active");
    document.querySelectorAll(".nav-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.nav === name));
    state.screen = name;

    if (name === "feed") renderFeed();
    if (name === "saved") renderSaved();
    if (name === "settings") renderSettings();
  }

  // ==================== ЗАГРУЗКА ЛЕНТЫ ====================

  async function loadOrders() {
    showLoading(true);
    hideError();

    try {
      const limit = state.settings.limit || 30;
      const orders = await window.KworkParser.getOrders(state.category, limit);
      state.allOrders = orders;
      showLoading(false);
      renderFeed();
    } catch (err) {
      showLoading(false);
      showError(err);
    }
  }

  // ==================== РЕНДЕР ЛЕНТЫ ====================

  function renderFeed() {
    const list = document.getElementById("ordersList");
    const emptyFilter = document.getElementById("emptyFilter");

    const filtered = applyFilters(state.allOrders);

    if (!state.allOrders.length) {
      list.innerHTML = "";
      emptyFilter.classList.add("hidden");
      return;
    }

    if (!filtered.length) {
      list.innerHTML = "";
      emptyFilter.classList.remove("hidden");
      return;
    }

    emptyFilter.classList.add("hidden");
    list.innerHTML = filtered.map(renderOrderCard).join("");
    attachCardEvents(list);
  }

  function applyFilters(orders) {
    let result = orders.slice();

    // Фильтр по словам
    const q = state.searchText.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/);
      result = result.filter((o) => {
        const text = (o.title + " " + o.description).toLowerCase();
        return words.some((w) => text.includes(w));
      });
    }

    // Фильтр по бюджету
    const min = state.settings.minBudget || 0;
    const max = state.settings.maxBudget || 0;
    if (min > 0) result = result.filter((o) => o.budget >= min);
    if (max > 0) result = result.filter((o) => o.budget <= max);

    return result;
  }

  function renderOrderCard(o) {
    const saved = window.Store.isSaved(o.id);
    const budgetStr = o.budget > 0 ? `${o.budget.toLocaleString("ru-RU")} ₽` : "Бюджет не указан";

    return `
      <article class="order-card" data-id="${esc(o.id)}">
        <div class="order-card-top">
          <h3 class="order-card-title">${esc(o.title)}</h3>
          <button class="save-star ${saved ? "saved" : ""}" data-save="${esc(o.id)}">${saved ? "★" : "☆"}</button>
        </div>
        ${o.description ? `<p class="order-card-desc">${esc(o.description)}</p>` : ""}
        <div class="order-card-meta">
          <span class="order-budget">${budgetStr}</span>
          ${o.offers ? `<span class="order-offers">${o.offers} откликов</span>` : ""}
          ${o.timeLeft ? `<span class="order-time">${esc(o.timeLeft)}</span>` : ""}
        </div>
        <button class="btn-open" data-url="${esc(o.url)}">Открыть заказ →</button>
      </article>`;
  }

  function attachCardEvents(container) {
    container.querySelectorAll(".save-star").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.save;
        const order = state.allOrders.find((o) => o.id === id)
          || window.Store.getSaved().find((o) => o.id === id);
        if (order) {
          window.Store.toggleSaved(order);
          if (state.screen === "feed") renderFeed();
          else renderSaved();
        }
      });
    });

    container.querySelectorAll(".btn-open").forEach((btn) => {
      btn.addEventListener("click", () => openOrder(btn.dataset.url));
    });
  }

  function openOrder(url) {
    if (!url) return;
    // В APK откроется в браузере/WebView, где можно залогиниться и откликнуться
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
      window.Capacitor.Plugins.Browser.open({ url, presentationStyle: "fullscreen" });
    } else {
      window.open(url, "_blank");
    }
  }

  // ==================== ИЗБРАННОЕ ====================

  function renderSaved() {
    const list = document.getElementById("savedList");
    const empty = document.getElementById("savedEmpty");
    const saved = window.Store.getSaved();

    if (!saved.length) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    list.innerHTML = saved.map(renderOrderCard).join("");
    attachCardEvents(list);
  }

  // ==================== НАСТРОЙКИ ====================

  function renderSettings() {
    document.getElementById("minBudget").value = state.settings.minBudget || "";
    document.getElementById("maxBudget").value = state.settings.maxBudget || "";
    document.getElementById("limitSelect").value = String(state.settings.limit || 30);

    const note = document.getElementById("modeNote");
    note.textContent = window.KworkParser.isNative()
      ? "Режим: APK (парсинг работает)"
      : "Режим: браузер (парсинг недоступен — нужен APK)";
  }

  // ==================== СОСТОЯНИЯ UI ====================

  function showLoading(on) {
    document.getElementById("loadingState").classList.toggle("hidden", !on);
    if (on) {
      document.getElementById("ordersList").innerHTML = "";
      document.getElementById("emptyFilter").classList.add("hidden");
    }
  }

  function showError(err) {
    const box = document.getElementById("parseError");
    box.classList.remove("hidden");
    document.getElementById("ordersList").innerHTML = "";

    let msg;
    if (!window.KworkParser.isNative()) {
      msg = "Ты в браузере. Парсинг заказов работает только в собранном APK (там обходится защита CORS). Установи приложение из APK.";
      document.getElementById("peTitle").textContent = "Нужен APK, а не браузер";
    } else if (err && err.rawSample) {
      msg = "Kwork ответил, но структура страницы не распозналась. Возможно, они её изменили. Покажи технические детали ниже разработчику.";
      document.getElementById("peTitle").textContent = "Заказы не распознаны";
    } else {
      msg = "Не удалось получить ответ от Kwork: " + (err && err.message ? err.message : "сеть недоступна");
      document.getElementById("peTitle").textContent = "Ошибка загрузки";
    }
    document.getElementById("peMessage").textContent = msg;
    document.getElementById("peRaw").textContent =
      (err && err.rawSample ? "Длина ответа: " + err.htmlLength + " символов\n\nПервые 1500 символов:\n" + err.rawSample : (err && err.stack) || "нет данных");
  }

  function hideError() {
    document.getElementById("parseError").classList.add("hidden");
  }

  // ==================== СОБЫТИЯ ====================

  function setupEvents() {
    // Навигация
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => go(el.dataset.nav));
    });

    // Обновить
    document.getElementById("refreshBtn").addEventListener("click", loadOrders);

    // Поиск (с задержкой)
    let searchTimer;
    document.getElementById("searchInput").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.searchText = e.target.value;
        renderFeed();
      }, 300);
    });

    // Категории
    document.querySelectorAll(".cat-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".cat-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.category = chip.dataset.cat;
        loadOrders();
      });
    });

    // Кнопка фильтров → настройки
    document.getElementById("filterBtn").addEventListener("click", () => go("settings"));

    // Ошибки
    document.getElementById("peRetry").addEventListener("click", loadOrders);
    document.getElementById("peOpenSite").addEventListener("click", () => openOrder("https://kwork.ru/projects"));

    // Настройки
    document.getElementById("minBudget").addEventListener("change", (e) => {
      state.settings.minBudget = parseInt(e.target.value, 10) || 0;
      window.Store.saveSettings(state.settings);
    });
    document.getElementById("maxBudget").addEventListener("change", (e) => {
      state.settings.maxBudget = parseInt(e.target.value, 10) || 0;
      window.Store.saveSettings(state.settings);
    });
    document.getElementById("limitSelect").addEventListener("change", (e) => {
      state.settings.limit = parseInt(e.target.value, 10) || 30;
      window.Store.saveSettings(state.settings);
      loadOrders();
    });
    document.getElementById("clearBtn").addEventListener("click", () => {
      if (confirm("Очистить избранное и настройки?")) {
        window.Store.clearAll();
        state.settings = window.Store.getSettings();
        renderSettings();
      }
    });
  }

  // ==================== УТИЛИТЫ ====================

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  // ==================== СТАРТ ====================

  function init() {
    setupEvents();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
    loadOrders();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
