(() => {
  const key = "swipequest-theme-v1";
  const allowed = new Set(["cherry-editorial", "after-dark"]);
  let theme = "cherry-editorial";

  try {
    const saved = localStorage.getItem(key);
    if (allowed.has(saved)) theme = saved;
  } catch (_) {
    // Browser storage may be unavailable; Cherry Editorial remains the safe default.
  }

  document.documentElement.dataset.theme = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "after-dark" ? "#141315" : "#f8f1e7";
})();
