import { mountBusiness } from "./business.js";

const root = document.querySelector("#business-root");
const current = { screen: null };

// Участник 2 подключает analyzeDraft, calculateScore, saveTask и publishTask здесь.
const services = window.praktikaServices || {};
current.screen = mountBusiness(root, {
  analyzeDraft: services.analyzeDraft,
  calculateScore: services.calculateScore,
  saveTask: services.saveTask,
  publishTask: services.publishTask,
  onNavigate: (view) => window.dispatchEvent(new CustomEvent("praktika:navigate", { detail: { view } })),
});

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  const view = button.dataset.view;
  if (view === "business") {
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-current", item === button));
    current.screen?.destroy();
    current.screen = mountBusiness(root, services);
    return;
  }
  const navigated = window.dispatchEvent(new CustomEvent("praktika:navigate", { detail: { view }, cancelable: true }));
  if (navigated) {
    const label = view === "catalog" ? "Каталог командных задач подключается участником 3." : "Раздел пока недоступен.";
    root.innerHTML = `<section class="empty-module"><span class="eyebrow">Практика · ${view === "catalog" ? "Каталог" : "Раздел"}</span><h1>${label}</h1><p>Создание и подтверждение задач бизнеса доступно в разделе «Мои задачи».</p><button class="button button-primary" type="button" data-return-business>Вернуться к моим задачам</button></section>`;
    root.querySelector("[data-return-business]")?.addEventListener("click", () => document.querySelector('[data-view="business"]').click());
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-current", item === button));
  }
}));

document.querySelectorAll(".role-option").forEach((button) => button.addEventListener("click", () => {
  const teamMode = button.textContent.trim() === "Команда";
  document.querySelectorAll(".role-option").forEach((option) => {
    const selected = option === button;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
  if (teamMode) {
    root.innerHTML = `<section class="empty-module"><span class="eyebrow">Демо-профиль команды</span><h1>Командный сценарий</h1><p>Каталог задач и отклики подключает участник 3. Переключитесь обратно в режим бизнеса, чтобы продолжить работу над карточкой.</p><button class="button button-primary" type="button" data-return-business>Вернуться к бизнесу</button></section>`;
    root.querySelector("[data-return-business]")?.addEventListener("click", () => document.querySelectorAll(".role-option")[0].click());
    return;
  }
  current.screen?.destroy();
  current.screen = mountBusiness(root, services);
}));

window.addEventListener("praktika:services-ready", (event) => {
  current.screen?.destroy();
  Object.assign(services, event.detail || {});
  current.screen = mountBusiness(root, services);
});
