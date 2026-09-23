import { request } from "../shared/api.js";

const levels = { draft: "Черновик", working: "В работе", ready: "Готово", priority: "Приоритет" };
const decisions = { pending: "Ожидает решения", selected: "Выбрана", rejected: "Отклонена" };
const fields = { topic: "Тема", title: "Название", context: "Контекст", need: "Потребность", users: "Пользователи", data: "Данные", constraints: "Ограничения", expectedResult: "Ожидаемый результат", successCriteria: "Критерии успеха", contact: "Контакт", interactionFormat: "Формат взаимодействия", feedbackProcess: "Обратная связь" };
function element(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}
function text(parent, tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  parent.append(node);
  return node;
}
function details(parent, values) {
  const dl = document.createElement("dl");
  for (const [label, value] of Object.entries(values)) {
    text(dl, "dt", label);
    text(dl, "dd", value || "Не указано");
  }
  parent.append(dl);
}
function profile(parent, team) {
  details(parent, { Интересы: team.interests.join(", "), Навыки: team.skills.join(", "), Технологии: team.technologies.join(", "), "Баллы за этапы": String(team.progressPoints) });
}
function screen(title, markup = "") {
  const root = element(`<section class="marketplace-screen"><h2></h2>${markup}<p data-status role="status" aria-live="polite"></p><div data-list></div></section>`);
  root.querySelector("h2").textContent = title;
  return root;
}
function status(root, message) { root.querySelector("[data-status]").textContent = message; }
// Keep the form reference before await; currentTarget is cleared after dispatch.
function submit(root, handler) {
  const form = root.querySelector("form");
  let busy = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const button = form.querySelector("button");
    button.disabled = true;
    try { await handler(Object.fromEntries(new FormData(form)), form); }
    catch (error) { status(root, error.message); }
    finally { busy = false; button.disabled = false; }
  });
}
function action(parent, label, handler) {
  const button = text(parent, "button", label);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}
function safeLink(parent, url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return;
    const link = text(parent, "a", "Открыть прототип");
    link.href = parsed.href; link.target = "_blank"; link.rel = "noopener noreferrer";
  } catch { /* Missing optional link. */ }
}
export function createCatalogScreen({ onOpenTask } = {}) {
  const root = screen("Каталог задач", `<form><label>Тема<input name="topic" placeholder="например, кафе"></label><label>Готовность<select name="readiness"><option value="">Все уровни</option>${Object.entries(levels).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label><button>Найти</button></form>`);
  let sequence = 0;
  async function load(values = {}) {
    const current = ++sequence;
    status(root, "Загрузка каталога…");
    try {
      const query = new URLSearchParams(Object.entries(values).filter(([, value]) => value.trim()));
      const tasks = await request(`/catalog?${query}`);
      if (current !== sequence) return;
      root.querySelector("[data-list]").replaceChildren(...tasks.map((task) => {
        const card = element(`<article class="marketplace-card"></article>`);
        card.classList.toggle("marketplace-priority", task.readiness === "priority");
        text(card, "h3", task.fields.title || task.fields.topic || "Задача без названия");
        text(card, "p", `${task.score}/100 · ${levels[task.readiness]}`);
        details(card, Object.fromEntries(Object.entries(fields).map(([key, label]) => [label, task.fields[key]])));
        if (onOpenTask) action(card, "Открыть задачу", () => onOpenTask(task));
        return card;
      }));
      status(root, tasks.length ? `Задач: ${tasks.length}. Порядок: по рейтингу. Все уровни принимают отклики.` : "Задачи не найдены.");
    } catch (error) { if (current === sequence) status(root, error.message); }
  }
  submit(root, load); load(); return root;
}
export function createTeamsScreen({ onCreated } = {}) {
  const root = screen("Команды", `<form><label>Название<input name="name" minlength="2" maxlength="120" required></label><label>Интересы (через запятую)<input name="interests" required></label><label>Навыки (через запятую)<input name="skills" required></label><label>Технологии (через запятую)<input name="technologies"></label><button>Создать профиль</button></form>`);
  let sequence = 0;
  async function load() {
    const current = ++sequence;
    try {
      const teams = await request("/teams");
      if (current !== sequence) return;
      root.querySelector("[data-list]").replaceChildren(...teams.map((team) => {
        const card = element('<article class="marketplace-card"></article>');
        text(card, "h3", team.name); profile(card, team); return card;
      }));
    } catch (error) { if (current === sequence) status(root, error.message); }
  }
  submit(root, async (values, form) => {
    for (const key of ["interests", "skills", "technologies"]) values[key] = values[key].split(",").map((item) => item.trim()).filter(Boolean);
    const team = await request("/teams", { method: "POST", body: values });
    form.reset(); status(root, `Профиль «${team.name}» создан.`); await onCreated?.(team); await load();
  });
  load(); return root;
}
export function createProposalScreen(task, { onSubmitted, teamId } = {}) {
  const root = screen("Отклик на задачу", `<form><label>Команда<select name="teamId" required></select></label><label>Идея<textarea name="idea" minlength="10" maxlength="4000" required></textarea></label><label>План<textarea name="plan" minlength="10" maxlength="4000" required></textarea></label><label>Срок<input name="deadline" minlength="2" maxlength="100" required></label><label>Прототип (http или https, необязательно)<input name="prototypeUrl" type="url" pattern="https?://.+"></label><button>Отправить предложение</button></form>`);
  text(root.querySelector("h2"), "small", ` — ${task.fields.title || task.fields.topic || "Задача"}`);
  request("/teams").then((teams) => {
    const select = root.querySelector("select");
    select.replaceChildren(...teams.map((team) => new Option(team.name, team.id)));
    if (teams.some((team) => team.id === teamId)) select.value = teamId;
    if (!teams.length) status(root, "Создайте профиль на экране «Команды».");
  }).catch((error) => status(root, error.message));
  submit(root, async (values, form) => {
    if (!values.prototypeUrl) delete values.prototypeUrl;
    const proposal = await request("/proposals", { method: "POST", body: { ...values, taskId: task.taskId } });
    form.reset(); status(root, "Предложение отправлено. Решение принимает бизнес; баллы за отклик не начисляются."); onSubmitted?.(proposal);
  });
  return root;
}
export function createProposalReviewScreen(task, { onChanged } = {}) {
  const root = screen("Отклики команд");
  async function load() {
    const proposals = await request(`/tasks/${encodeURIComponent(task.taskId)}/proposals`);
    status(root, proposals.length ? "Можно выбрать несколько команд, отклонить предложения или оставить их без решения." : "Откликов пока нет.");
    root.querySelector("[data-list]").replaceChildren(...proposals.map((proposal) => {
      const card = element('<article class="marketplace-card"></article>');
      text(card, "h3", proposal.team.name); profile(card, proposal.team);
      details(card, { Идея: proposal.idea, План: proposal.plan, Срок: proposal.deadline, Статус: decisions[proposal.status] });
      safeLink(card, proposal.prototypeUrl);
      let busy = false;
      for (const [decision, label] of [["selected", "Выбрать"], ["rejected", "Отклонить"]]) {
        const button = action(card, label, async () => {
          if (busy) return;
          busy = true; card.querySelectorAll("button").forEach((item) => { item.disabled = true; });
          try {
            await request(`/proposals/${encodeURIComponent(proposal.id)}`, { method: "PATCH", body: { status: decision } });
            await load(); onChanged?.();
          } catch (error) {
            status(root, error.message); busy = false;
            card.querySelectorAll("button").forEach((item) => { item.disabled = item.dataset.decision === proposal.status; });
          }
        });
        button.dataset.decision = decision; button.disabled = proposal.status === decision;
      }
      return card;
    }));
  }
  load().catch((error) => status(root, error.message)); return root;
}
export function createMilestoneScreen(task, { onCreated, onConfirmed } = {}) {
  const root = screen("Этапы и подтверждение", `<form><label>Выбранная команда<select name="teamId" required></select></label><label>Что сделано<textarea name="description" minlength="5" maxlength="4000" required></textarea></label><label>Ссылка или описание результата<input name="evidence" minlength="3" maxlength="2000" required></label><button>Зафиксировать этап</button></form>`);
  const path = `/tasks/${encodeURIComponent(task.taskId)}`;
  async function load() {
    const [proposals, milestones] = await Promise.all([request(`${path}/proposals`), request(`${path}/milestones`)]);
    const selected = new Map(proposals.filter((item) => item.status === "selected").map((item) => [item.teamId, item.team.name]));
    const select = root.querySelector("select"); const previous = select.value;
    select.replaceChildren(...Array.from(selected, ([id, name]) => new Option(name, id)));
    if (selected.has(previous)) select.value = previous;
    if (!selected.size) status(root, "Сначала выберите команду в откликах. Сохранённые этапы показаны ниже.");
    root.querySelector("[data-list]").replaceChildren(...milestones.map((milestone) => {
      const card = element('<article class="marketplace-card"></article>');
      text(card, "h3", milestone.team.name);
      details(card, { Этап: milestone.description, Результат: milestone.evidence, Статус: milestone.confirmedAt ? `Подтверждён · +${milestone.pointsAwarded} баллов` : "Ожидает подтверждения бизнеса" });
      if (!milestone.confirmedAt) {
        const button = action(card, "Подтвердить и начислить +10", async () => {
          if (button.disabled) return;
          button.disabled = true;
          try {
            const result = await request(`/milestones/${encodeURIComponent(milestone.id)}/confirm`, { method: "POST" });
            await load(); status(root, result.awarded ? "Этап подтверждён: +10 баллов команде." : "Этап уже подтверждён. Повторных баллов нет."); onConfirmed?.(result.milestone);
          } catch (error) { status(root, error.message); button.disabled = false; }
        });
        button.disabled = !selected.has(milestone.teamId);
      }
      return card;
    }));
  }
  submit(root, async (values, form) => {
    const milestone = await request("/milestones", { method: "POST", body: { ...values, taskId: task.taskId } });
    form.reset(); await load(); status(root, "Этап сохранён. Для начисления баллов подтвердите результат."); onCreated?.(milestone);
  });
  load().catch((error) => status(root, error.message)); return root;
}
