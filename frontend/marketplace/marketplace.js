const API = "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || "Не удалось выполнить запрос");
  return response.json();
}

function element(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

/** Экспорт для подключения участником 1 из frontend/app.js. */
export function createCatalogScreen({ onOpenTask } = {}) {
  const root = element(`<section class="marketplace-screen">
    <h2>Каталог задач</h2><form><label>Тема <input name="topic" placeholder="например, кафе"></label>
    <label>Готовность <select name="readiness"><option value="">Все уровни</option><option value="draft">Черновик</option><option value="working">В работе</option><option value="ready">Готово</option><option value="priority">Приоритет</option></select></label><button>Найти</button></form>
    <p data-status></p><div data-cards></div></section>`);
  const cards = root.querySelector("[data-cards]");
  const status = root.querySelector("[data-status]");
  async function load() {
    const form = new FormData(root.querySelector("form"));
    const query = new URLSearchParams(Object.entries(Object.fromEntries(form)).filter(([, value]) => value));
    try {
      const tasks = await request(`/catalog?${query}`);
      status.textContent = tasks.length ? `Найдено задач: ${tasks.length}` : "Задачи не найдены.";
      cards.replaceChildren(...tasks.map((task) => {
        const card = element(`<article class="marketplace-card"><h3></h3><p></p><p></p><button>Откликнуться</button></article>`);
        card.querySelector("h3").textContent = task.fields.title || task.fields.topic || "Задача без названия";
        card.querySelector("p").textContent = task.fields.need || "Описание ещё уточняется";
        card.querySelectorAll("p")[1].textContent = `${task.score}/100 · ${task.readiness}`;
        card.querySelector("button").addEventListener("click", () => onOpenTask?.(task));
        return card;
      }));
    } catch (error) { status.textContent = error.message; }
  }
  root.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); load(); });
  load();
  return root;
}

export function createProposalScreen(task, { onSubmitted } = {}) {
  const root = element(`<section class="marketplace-screen"><h2>Отклик на задачу</h2><p></p><form>
    <label>Команда <select name="teamId" required></select></label><label>Идея <textarea name="idea" minlength="10" required></textarea></label>
    <label>План <textarea name="plan" minlength="10" required></textarea></label><label>Срок <input name="deadline" required placeholder="2 недели"></label>
    <label>Ссылка на прототип <input name="prototypeUrl" type="url"></label><button>Отправить предложение</button></form><p data-status></p></section>`);
  root.querySelector("p").textContent = task.fields.title || task.fields.topic || "Задача";
  const status = root.querySelector("[data-status]");
  request("/teams").then((teams) => {
    const select = root.querySelector("select");
    select.replaceChildren(...teams.map((team) => new Option(`${team.name} · ${team.skills.join(", ")}`, team.id)));
    if (!teams.length) status.textContent = "Сначала создайте профиль команды через POST /api/teams.";
  }).catch((error) => { status.textContent = error.message; });
  root.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!values.prototypeUrl) delete values.prototypeUrl;
    try { await request("/proposals", { method: "POST", body: JSON.stringify({ ...values, taskId: task.taskId }) }); status.textContent = "Предложение отправлено."; onSubmitted?.(); }
    catch (error) { status.textContent = error.message; }
  });
  return root;
}

export function createProposalReviewScreen(task, { onChanged } = {}) {
  const root = element(`<section class="marketplace-screen"><h2>Отклики команд</h2><p data-status></p><div data-list></div></section>`);
  const list = root.querySelector("[data-list]");
  async function load() {
    try {
      const proposals = await request(`/tasks/${encodeURIComponent(task.taskId)}/proposals`);
      root.querySelector("[data-status]").textContent = proposals.length ? `Откликов: ${proposals.length}` : "Откликов пока нет.";
      list.replaceChildren(...proposals.map((proposal) => {
        const item = element(`<article class="marketplace-card"><h3></h3><p></p><p></p><button data-selected>Выбрать</button> <button data-rejected>Отклонить</button></article>`);
        item.querySelector("h3").textContent = proposal.team.name;
        item.querySelector("p").textContent = proposal.idea;
        item.querySelectorAll("p")[1].textContent = `Статус: ${proposal.status}; срок: ${proposal.deadline}`;
        for (const [selector, status] of [["[data-selected]", "selected"], ["[data-rejected]", "rejected"]]) item.querySelector(selector).addEventListener("click", async () => { await request(`/proposals/${proposal.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); onChanged?.(); load(); });
        return item;
      }));
    } catch (error) { root.querySelector("[data-status]").textContent = error.message; }
  }
  load();
  return root;
}

/** Список профилей и форма создания команды для сценария студента. */
export function createTeamsScreen({ onCreated } = {}) {
  const root = element(`<section class="marketplace-screen"><h2>Команды</h2><form>
    <label>Название <input name="name" minlength="2" required></label>
    <label>Интересы <input name="interests" required placeholder="аналитика, образование"></label>
    <label>Навыки <input name="skills" required placeholder="Python, UX"></label>
    <label>Технологии <input name="technologies" placeholder="FastAPI, SQLite"></label>
    <button>Создать профиль</button></form><p data-status></p><div data-list></div></section>`);
  const status = root.querySelector("[data-status]");
  const list = root.querySelector("[data-list]");
  const tags = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);
  async function load() {
    try {
      const teams = await request("/teams");
      list.replaceChildren(...teams.map((team) => {
        const card = element(`<article class="marketplace-card"><h3></h3><p></p><p></p></article>`);
        card.querySelector("h3").textContent = team.name;
        card.querySelector("p").textContent = `Навыки: ${team.skills.join(", ")}`;
        card.querySelectorAll("p")[1].textContent = `Интересы: ${team.interests.join(", ")} · Баллы: ${team.progressPoints}`;
        return card;
      }));
      if (!teams.length) list.textContent = "Профилей пока нет.";
    } catch (error) { status.textContent = error.message; }
  }
  root.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = { ...values, interests: tags(values.interests), skills: tags(values.skills), technologies: tags(values.technologies) };
    try {
      const team = await request("/teams", { method: "POST", body: JSON.stringify(body) });
      status.textContent = `Профиль «${team.name}» создан.`;
      event.currentTarget.reset();
      onCreated?.(team);
      load();
    } catch (error) { status.textContent = error.message; }
  });
  load();
  return root;
}

/** Создание доказанного этапа и его явное подтверждение бизнесом. */
export function createMilestoneScreen(task, { onCreated, onConfirmed } = {}) {
  const root = element(`<section class="marketplace-screen"><h2>Подтверждение этапа</h2><form>
    <label>Выбранная команда <select name="teamId" required></select></label>
    <label>Что сделано <textarea name="description" minlength="5" required></textarea></label>
    <label>Ссылка или иное доказательство <input name="evidence" minlength="3" required></label>
    <button>Зафиксировать этап</button></form><p data-status></p><div data-milestone hidden><p></p><button>Подтвердить и начислить +10</button></div></section>`);
  const status = root.querySelector("[data-status]");
  const pending = root.querySelector("[data-milestone]");
  let milestone;
  request(`/tasks/${encodeURIComponent(task.taskId)}/proposals`).then((proposals) => {
    const selected = proposals.filter((proposal) => proposal.status === "selected");
    const select = root.querySelector("select");
    select.replaceChildren(...selected.map((proposal) => new Option(proposal.team.name, proposal.teamId)));
    if (!selected.length) status.textContent = "Сначала выберите команду в списке откликов.";
  }).catch((error) => { status.textContent = error.message; });
  root.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      milestone = await request("/milestones", { method: "POST", body: JSON.stringify({ ...values, taskId: task.taskId }) });
      pending.hidden = false;
      pending.querySelector("p").textContent = "Этап зафиксирован. Баллы будут начислены только после ручного подтверждения.";
      status.textContent = "";
      onCreated?.(milestone);
    } catch (error) { status.textContent = error.message; }
  });
  pending.querySelector("button").addEventListener("click", async () => {
    if (!milestone) return;
    try {
      const result = await request(`/milestones/${milestone.id}/confirm`, { method: "POST" });
      pending.querySelector("button").disabled = true;
      pending.querySelector("p").textContent = result.awarded ? "Этап подтверждён: команде начислено +10 баллов." : "Этап уже был подтверждён ранее.";
      onConfirmed?.(result.milestone);
    } catch (error) { status.textContent = error.message; }
  });
  return root;
}
