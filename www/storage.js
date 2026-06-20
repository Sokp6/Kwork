/* ==========================================================
   storage.js — избранное и настройки (localStorage)
   ========================================================== */

window.Store = (function () {
  const K = {
    saved: "kworkfeed_saved",
    settings: "kworkfeed_settings",
  };

  function load(key, fb) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; }
    catch (e) { return fb; }
  }
  function save(key, d) { localStorage.setItem(key, JSON.stringify(d)); }

  // --- Избранное (массив заказов) ---
  function getSaved() { return load(K.saved, []); }
  function isSaved(id) { return getSaved().some((o) => o.id === id); }
  function toggleSaved(order) {
    let list = getSaved();
    if (list.some((o) => o.id === order.id)) {
      list = list.filter((o) => o.id !== order.id);
    } else {
      list.unshift({ ...order, savedAt: Date.now() });
    }
    save(K.saved, list);
    return isSaved(order.id);
  }
  function removeSaved(id) {
    save(K.saved, getSaved().filter((o) => o.id !== id));
  }

  // --- Настройки ---
  function getSettings() {
    return load(K.settings, { minBudget: 0, maxBudget: 0, limit: 30 });
  }
  function saveSettings(s) { save(K.settings, s); }

  function clearAll() {
    localStorage.removeItem(K.saved);
    localStorage.removeItem(K.settings);
  }

  return { getSaved, isSaved, toggleSaved, removeSaved, getSettings, saveSettings, clearAll };
})();
