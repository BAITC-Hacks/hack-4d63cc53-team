const FIELDS = [
  { key: "context", label: "Контекст", hint: "Расскажите о компании, текущей ситуации и что уже пробовали.", placeholder: "Опишите, что происходит сейчас и почему это важно.", rows: 3 },
  { key: "need", label: "Потребность", hint: "Какую задачу нужно решить и зачем это важно?", placeholder: "Сформулируйте проблему, которую нужно решить.", rows: 2 },
  { key: "users", label: "Пользователи", hint: "Кто будет пользоваться решением? Укажите основные группы.", placeholder: "Например: сотрудники, клиенты или партнёры.", rows: 2 },
  { key: "data", label: "Данные и материалы", hint: "Какие данные, доступы и материалы вы можете предоставить?", placeholder: "Укажите доступные данные, примеры или источники.", rows: 2 },
  { key: "expectedResult", label: "Ожидаемый результат", hint: "Что должно быть на выходе: формат, уровень готовности, ключевые элементы?", placeholder: "Опишите, что команда должна подготовить.", rows: 2 },
  { key: "successCriteria", label: "Критерии успеха", hint: "По каким проверяемым условиям вы примете результат?", placeholder: "Например: метрика, пороговое значение и способ проверки.", rows: 2 },
  { key: "constraints", label: "Ограничения", hint: "Сроки, технологии, доступы, бюджет или другие границы.", placeholder: "Опишите обязательные условия и ограничения.", rows: 2 },
  { key: "contact", label: "Контакт", hint: "Кто со стороны бизнеса отвечает за задачу?", placeholder: "Имя и удобный рабочий контакт.", rows: 1 },
  { key: "interactionFormat", label: "Формат взаимодействия", hint: "Как команде связываться с вами?", placeholder: "Например: короткая встреча раз в неделю и вопросы в рабочие дни.", rows: 2 },
  { key: "feedbackProcess", label: "Обратная связь", hint: "Как быстро команда получит комментарии по результату?", placeholder: "Опишите порядок и сроки обратной связи.", rows: 2 },
];

const INITIAL_TASK = {
  title: "Ускорить приём заказов в кафе",
  topic: "Автоматизация процессов",
  rawDescription: "Хотим сократить очереди в кафе и ускорить приём заказов.",
  context: "Кафе «Зелёный лист». В часы пик гости долго ждут у кассы, а сотрудники кухни получают заказы неравномерно. Пробовали добавить сотрудника на кассу — расходы выросли, а время ожидания почти не изменилось.",
  need: "Нужно сократить время приёма заказов и сделать поток заказов предсказуемее, сохранив качество обслуживания.",
  users: "Гости кафе, кассиры, бариста и администратор смены.",
  data: "Есть обезличенная таблица заказов за последние 3 месяца: время приёма, состав заказа и время выдачи. Также доступны примерное расписание зала и меню.",
  expectedResult: "Предложения по улучшению процесса и проверяемый прототип решения с коротким планом внедрения.",
  successCriteria: "В тестовый период среднее время приёма заказа снижается минимум на 20%, без роста числа ошибок и жалоб.",
  constraints: "",
  contact: "",
  interactionFormat: "Короткая встреча с администратором раз в неделю; вопросы — в рабочее время.",
  feedbackProcess: "",
};

const DEMO_QUESTIONS = [
  { id: "users", question: "Кто будет пользоваться решением и кто сильнее всего сталкивается с проблемой?", answer: INITIAL_TASK.users },
  { id: "data", question: "Какие данные или материалы вы готовы предоставить команде?", answer: INITIAL_TASK.data },
  { id: "successCriteria", question: "По каким измеримым критериям вы поймёте, что решение помогло?", answer: INITIAL_TASK.successCriteria },
];

const SCORE_WEIGHTS = [
  { label: "Контекст и потребность", weight: 20, keys: ["context", "need"] },
  { label: "Данные и материалы", weight: 20, keys: ["data"] },
  { label: "Ожидаемый результат", weight: 15, keys: ["expectedResult"] },
  { label: "Критерии успеха", weight: 15, keys: ["successCriteria"] },
  { label: "Ограничения", weight: 10, keys: ["constraints"] },
  { label: "Пользователи", weight: 10, keys: ["users"] },
  { label: "Связь с бизнесом", weight: 10, keys: ["contact", "interactionFormat", "feedbackProcess"] },
];

const DEMO_ANSWERS = [
  "Например, укажите конкретные сроки, доступы, технологии или ресурсы, которые команда должна учитывать.",
  "Назовите основные группы пользователей и коротко опишите, чем отличается их опыт.",
  "Добавьте имя ответственного и способ регулярной связи, чтобы команда могла проверять решения по ходу работы.",
];

function emptyScore() {
  return { score: 0, breakdown: [], missingFields: FIELDS.filter(({ key }) => !String(INITIAL_TASK[key] || "").trim()).map(({ key, label }) => ({ key, label })), readiness: "draft" };
}

function demoScore(fields, confirmedFields) {
  const confirmed = new Set(confirmedFields || []);
  const breakdown = SCORE_WEIGHTS.map((item) => {
    const filled = item.keys.every((key) => String(fields[key] || "").trim());
    const verified = item.keys.every((key) => confirmed.has(key));
    return { criterion: item.label, label: item.label, earned: filled && verified ? item.weight : 0, max: item.weight, weight: item.weight };
  });
  const score = breakdown.reduce((total, item) => total + item.earned, 0);
  const missingFields = FIELDS.filter(({ key }) => !String(fields[key] || "").trim()).map(({ key, label }) => ({ key, label }));
  return { score, breakdown, missingFields, readiness: score >= 90 ? "priority" : score >= 70 ? "ready" : score >= 40 ? "workable" : "draft" };
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function readinessName(value, score) {
  if (value === "priority" || score >= 90) return "Приоритетная";
  if (value === "ready" || score >= 70) return "Готовая";
  if (value === "workable" || score >= 40) return "Рабочая";
  return "Низкая готовность";
}

export function mountBusiness(root, dependencies = {}) {
  let step = "description";
  let task = { ...INITIAL_TASK };
  let rawDescription = task.rawDescription;
  let questions = [];
  let score = null;
  let confirmedFields = new Set();
  let changedAfterConfirm = false;
  let published = false;
  let expanded = false;
  let busy = false;
  let errorMessage = "";
  let generation = 0;
  let activeRequest = 0;
  let toastTimer;

  const notify = (message, isError = false) => {
    const region = document.querySelector("#toast-region");
    if (!region) return;
    region.innerHTML = `<div class="toast${isError ? " is-error" : ""}" role="status">${escapeHtml(message)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { region.replaceChildren(); }, 3500);
  };

  const go = (next) => { step = next; errorMessage = ""; render(); root.focus({ preventScroll: true }); };
  const titleBlock = (eyebrow, title, copy) => `<header class="page-heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${copy}</p></header>`;
  const stepper = () => {
    const steps = [["description", "Описание"], ["questions", "Уточнения"], ["card", "Карточка"], ["review", "Публикация"]];
    const index = steps.findIndex(([id]) => id === step);
    return `<nav class="wizard" aria-label="Этап создания задачи">${steps.map(([id, label], i) => `<div class="wizard-step${i < index ? " is-done" : ""}${i === index ? " is-active" : ""}"${i === index ? ' aria-current="step"' : ""}><span class="step-dot">${i < index ? "✓" : i + 1}</span><strong>${label}</strong></div>${i < steps.length - 1 ? `<span class="step-line${i < index ? " is-done" : ""}"></span>` : ""}`).join("")}</nav>`;
  };
  const rail = (options = {}) => `<aside class="side-rail"><div class="ai-note"><span class="ai-spark" aria-hidden="true">✳</span><div><strong>${options.aiTitle || "ИИ · локальный режим"}</strong><p>${options.aiCopy || "Помогает структурировать текст. Данные никуда не передаются."}</p></div></div>${options.content || ""}</aside>`;

  function render() {
    root.innerHTML = `<div class="business-page">${stepper()}${step === "description" ? renderDescription() : step === "questions" ? renderQuestions() : step === "card" ? renderCard() : renderReview()}</div>`;
    bindEvents();
  }

  function renderDescription() {
    const topics = ["Не выбрана", "Автоматизация процессов", "Клиентский опыт", "Аналитика данных", "Маркетинг", "Другое"];
    return `<div class="work-area"><section class="editor">${titleBlock("Новая задача", "Опишите задачу своими словами", "Начните с того, что хотите улучшить. Мы поможем собрать понятный бриф для студенческих команд.")}
      <label class="field-label" for="raw-description">Описание задачи</label><textarea class="description-input" id="raw-description" rows="6" maxlength="2400" placeholder="Например: в часы пик гости долго ждут заказ, а сотрудники не успевают обслужить всех…">${escapeHtml(rawDescription)}</textarea>
      <div class="description-tools"><label class="topic-select"><span>Тема задачи</span><select id="task-topic">${topics.map((topic) => `<option${task.topic === topic ? " selected" : ""}>${topic}</option>`).join("")}</select></label><span class="char-count" id="description-count">${rawDescription.length} / 2400</span></div>
      ${errorMessage ? `<p class="form-error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}<div class="form-actions description-actions"><span class="small-note">Черновик останется у вас, пока не подтвердите публикацию.</span><button class="button button-primary" data-action="analyze"${busy ? " disabled" : ""}>${busy ? "Разбираем…" : "Разобрать задачу"}<span class="arrow" aria-hidden="true">→</span></button></div>
      </section>${rail({ content: `<h2 class="rail-heading">Что будет дальше</h2><p class="rail-copy">Зададим уточняющие вопросы, соберём редактируемую карточку, а после вашего подтверждения покажем рейтинг и публикацию.</p>` })}</div>`;
  }

  function renderQuestions() {
    const cards = questions.length ? questions : DEMO_QUESTIONS;
    return `<div class="work-area"><section class="editor">${titleBlock("Шаг 2 из 4", "Уточним задачу", "Ответы помогут командам оценить задачу и предложить подходящее решение.")}
      <div class="source-summary"><span class="source-label">Ваше описание</span><p>${escapeHtml(rawDescription)}</p><button class="text-button" data-action="back-description">Изменить</button></div>
      <div class="question-list">${cards.map((item, index) => `<section class="question-item"><label class="field-label" for="answer-${escapeHtml(item.id || index)}">${escapeHtml(item.question || item.text || `Вопрос ${index + 1}`)}</label><textarea id="answer-${escapeHtml(item.id || index)}" class="question-answer" data-field="${escapeHtml(item.field || item.id || "answer")}" rows="3" maxlength="1000" placeholder="Добавьте ответ…">${escapeHtml(item.answer || "")}</textarea><div class="char-count">${String(item.answer || "").length} / 1000</div></section>`).join("")}</div>
      ${errorMessage ? `<p class="form-error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}<div class="form-actions question-actions"><button class="button button-secondary" data-action="back-description">Назад</button><button class="button button-primary" data-action="to-card">Собрать карточку<span class="arrow" aria-hidden="true">→</span></button></div>
      </section>${rail({ content: `<h2 class="rail-heading">Почему эти вопросы?</h2><p class="rail-copy">Уточняем пользователей, доступные данные и проверяемый результат — три детали, которые помогают командам начать работу.</p>` })}</div>`;
  }

  function renderField(field) {
    const value = task[field.key] || "";
    return `<div class="field-row"><div class="field-meta"><label class="field-label" for="field-${field.key}">${field.label}</label><span class="field-hint">${field.hint}</span></div><div class="field-control"><textarea id="field-${field.key}" data-task-field="${field.key}" rows="${field.rows}" maxlength="2000" placeholder="${field.placeholder}">${escapeHtml(value)}</textarea><div class="field-bottom"><span class="field-error" data-error-for="${field.key}"></span><span class="char-count" data-count-for="${field.key}">${value.length} / 2000</span></div></div></div>`;
  }

  function renderCard() {
    const mainFields = FIELDS.slice(0, 6);
    const extra = FIELDS.slice(6);
    return `<div class="work-area"><section class="editor">${titleBlock("Шаг 3 из 4 · Рабочая копия", "Проверьте карточку задачи", "Поля можно редактировать. В каталог попадёт только версия, которую вы подтвердите вручную.")}
      <div class="draft-state">${changedAfterConfirm ? "Есть неподтверждённые изменения" : "Черновик · можно редактировать"}</div><input class="title-input" id="task-title" data-task-field="title" maxlength="120" aria-label="Название задачи" value="${escapeHtml(task.title || "")}" placeholder="Название задачи" />
      <div class="field-list">${mainFields.map(renderField).join("")}</div>
      <section class="extra-fields"><button class="extra-toggle" type="button" data-action="toggle-extra" aria-expanded="${expanded}"><span class="toggle-caret" aria-hidden="true">›</span><span>${expanded ? "Скрыть дополнительные поля" : "Ещё 5 полей"}</span><span class="extra-summary">Ограничения, контакт, формат взаимодействия, обратная связь и тема</span></button>${expanded ? `<div class="field-list">${extra.slice(0, 4).map(renderField).join("")}<div class="field-row"><div class="field-meta"><label class="field-label" for="field-topic">Тема задачи</label><span class="field-hint">Поможет командам найти задачу по теме.</span></div><div class="field-control"><select id="field-topic" data-task-field="topic"><option value="">Выберите тему</option>${["Автоматизация процессов", "Клиентский опыт", "Аналитика данных", "Маркетинг", "Операционная эффективность", "Другое"].map((value) => `<option${task.topic === value ? " selected" : ""}>${value}</option>`).join("")}</select></div></div></div>` : ""}</section>
      ${errorMessage ? `<p class="form-error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}<div class="form-actions"><button class="button button-secondary" data-action="back-questions">К уточнениям</button><button class="button button-primary" data-action="confirm"${busy ? " disabled" : ""}>${busy ? "Сохраняем…" : "Подтвердить и рассчитать"}<span class="arrow" aria-hidden="true">→</span></button></div>
      </section>${rail({ content: `<h2 class="rail-heading">Перед подтверждением</h2><p class="rail-copy">Проверьте, что заполнено всё важное. Подтверждение пересчитает рейтинг. Пустые поля можно дополнить позже.</p>${renderMissing(false)}` })}</div>`;
  }

  function renderMissing(withLinks) {
    const missing = FIELDS.filter(({ key }) => !String(task[key] || "").trim());
    if (!missing.length) return `<p class="all-complete">Все основные сведения заполнены.</p>`;
    return `<ul class="missing-list">${missing.map(({ key, label }) => `<li class="missing-item is-missing"><span class="missing-icon" aria-hidden="true">!</span><span>${label}<small>${withLinks ? "Можно дополнить после подтверждения" : "Пока не заполнено"}</small></span></li>`).join("")}</ul>`;
  }

  function renderScore() {
    const value = score || emptyScore();
    const readiness = value.readiness || value.level || "draft";
    const missing = value.missingFields || [];
    const breakdown = value.breakdown || [];
    return `<div class="score-block"><div class="score-label"><span>Качество карточки <span class="help-tip" title="Рейтинг учитывает только подтверждённые сведения." aria-label="Рейтинг учитывает только подтверждённые сведения">i</span></span><span class="version-label">${changedAfterConfirm ? "Предыдущая подтверждённая версия" : "Подтверждено вручную"}</span></div><div class="score-value"><strong>${Number(value.score) || 0}</strong><span>/ 100</span></div><div class="score-track" role="meter" aria-label="Рейтинг задачи" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number(value.score) || 0}"><div class="score-fill" style="width:${Math.max(0, Math.min(100, Number(value.score) || 0))}%"></div></div><p class="score-status">${readinessName(readiness, Number(value.score) || 0)}</p>
      ${breakdown.length ? `<div class="score-breakdown">${breakdown.map((row) => { const earned = row.earned ?? row.score ?? 0; const max = row.max ?? row.weight ?? 0; return `<div class="score-row"><span>${escapeHtml(row.criterion || row.label || "Критерий")}</span><strong>${earned} / ${max}</strong></div>`; }).join("")}</div>` : ""}
      <p class="score-explain">Баллы начисляются за заполненные и подтверждённые сведения. ${missing.length ? `Можно дополнить: <strong>${missing.map((field) => escapeHtml(field.label || field.key)).join(", ")}</strong>.` : "Все ключевые сведения указаны."} Низкий рейтинг не мешает публикации.</p></div>`;
  }

  function renderReview() {
    const editable = changedAfterConfirm;
    return `<div class="work-area"><section class="editor">${titleBlock("Шаг 4 из 4", published ? "Задача опубликована" : "Задача готова к публикации", published ? "Задачу увидят все команды в общем каталоге." : "Последний раз проверьте карточку и решите, когда открыть задачу командам.")}
      <div class="review-title"><span class="eyebrow">${escapeHtml(task.topic || "Тема не выбрана")}</span><h2>${escapeHtml(task.title || "Новая задача")}</h2><button class="text-button" data-action="edit-card">${editable ? "Вернуться к изменениям" : "Посмотреть все поля"}</button></div>
      <div class="review-fields">${FIELDS.slice(0, 6).filter(({ key }) => task[key]).map(({ key, label }) => `<section class="review-field"><h3>${label}</h3><p>${escapeHtml(task[key])}</p></section>`).join("")}</div>
      ${errorMessage ? `<p class="form-error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}${published ? `<div class="published-notice" role="status"><strong>Опубликовано</strong>Теперь задача доступна всем командам в каталоге.</div>` : `<div class="publish-actions"><button class="button button-secondary" data-action="edit-card">${editable ? "Исправить карточку" : "Дополнить карточку"}</button><button class="button button-primary" data-action="publish"${busy || editable ? " disabled" : ""}>${busy ? "Публикуем…" : "Опубликовать задачу"}</button></div><p class="publish-note">${editable ? "Сначала подтвердите изменения, чтобы обновить рейтинг и опубликовать актуальную версию." : "После публикации задачу увидят все команды. Низкий рейтинг не мешает публикации."}</p>`}
      </section>${rail({ content: renderScore() })}</div>`;
  }

  function bindEvents() {
    root.querySelector("#raw-description")?.addEventListener("input", (event) => {
      rawDescription = event.currentTarget.value;
      root.querySelector("#description-count").textContent = `${rawDescription.length} / 2400`;
    });
    root.querySelector("#task-topic")?.addEventListener("change", (event) => { task.topic = event.currentTarget.value; });
    root.querySelectorAll("[data-task-field]").forEach((element) => {
      const update = () => {
        const { taskField } = element.dataset;
        task[taskField] = element.value;
        if (confirmedFields.has(taskField)) changedAfterConfirm = true;
        if (element.tagName === "TEXTAREA") {
          const counter = root.querySelector(`[data-count-for="${taskField}"]`);
          if (counter) counter.textContent = `${element.value.length} / 2000`;
        }
        const error = root.querySelector(`[data-error-for="${taskField}"]`);
        if (error) error.textContent = "";
        const state = root.querySelector(".draft-state");
        if (state && changedAfterConfirm) state.textContent = "Есть неподтверждённые изменения";
      };
      element.addEventListener("input", update);
      element.addEventListener("change", update);
    });
    root.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
      const { action } = button.dataset;
      if (action === "analyze") return analyze();
      if (action === "back-description") return go("description");
      if (action === "back-questions") return go("questions");
      if (action === "to-card") return collectAnswersAndGo();
      if (action === "edit-card") { published = false; return go("card"); }
      if (action === "toggle-extra") { expanded = !expanded; return render(); }
      if (action === "confirm") return confirmCard();
      if (action === "publish") return publish();
    }));
  }

  async function analyze() {
    rawDescription = root.querySelector("#raw-description").value.trim();
    task.topic = root.querySelector("#task-topic").value;
    if (rawDescription.length < 20) {
      errorMessage = "Добавьте немного больше деталей — хотя бы одно-два предложения.";
      render(); return;
    }
    busy = true; errorMessage = ""; render();
    const request = ++generation;
    activeRequest = request;
    try {
      const result = dependencies.analyzeDraft ? await dependencies.analyzeDraft(rawDescription, {}) : null;
      if (request !== activeRequest) return;
      const returnedFields = result?.fields || {};
      task = { ...task, ...returnedFields, rawDescription, topic: task.topic };
      questions = Array.isArray(result?.questions) && result.questions.length >= 3 ? result.questions.slice(0, 8) : DEMO_QUESTIONS;
      go("questions");
      if (!dependencies.analyzeDraft) notify("Локальный демо-анализ: показаны три примера вопросов.");
    } catch (error) {
      if (request !== activeRequest) return;
      errorMessage = error?.message || "Не удалось разобрать описание. Текст сохранён — попробуйте ещё раз.";
      busy = false; render();
    } finally {
      if (request === activeRequest) busy = false;
    }
  }

  function collectAnswersAndGo() {
    const answers = [...root.querySelectorAll(".question-answer")].map((element) => ({ field: element.dataset.field, answer: element.value.trim() })).filter((item) => item.answer);
    if (answers.length < 3) {
      errorMessage = "Ответьте хотя бы на три уточняющих вопроса, чтобы собрать карточку.";
      render(); return;
    }
    for (const { field, answer } of answers) if (FIELDS.some((item) => item.key === field)) task[field] = answer;
    if (!task.context.trim()) task.context = rawDescription;
    questions = questions.map((question, index) => ({ ...question, answer: root.querySelectorAll(".question-answer")[index]?.value || question.answer || "" }));
    go("card");
  }

  async function confirmCard() {
    const title = root.querySelector("#task-title")?.value.trim() || "";
    task.title = title;
    if (!title) { errorMessage = "Добавьте название задачи перед подтверждением."; render(); root.querySelector("#task-title")?.focus(); return; }
    for (const element of root.querySelectorAll("[data-task-field]")) task[element.dataset.taskField] = element.value;
    const edited = Object.keys(task).filter((key) => FIELDS.some((field) => field.key === key) || key === "title");
    for (const key of edited) if (String(task[key] || "").trim()) confirmedFields.add(key);
    busy = true; errorMessage = ""; render();
    try {
      const saved = dependencies.saveTask ? await dependencies.saveTask({ ...task, confirmedFields: [...confirmedFields], publicationStatus: "draft" }) : { ...task, confirmedFields: [...confirmedFields] };
      const result = dependencies.calculateScore ? await dependencies.calculateScore(saved, [...confirmedFields]) : demoScore(saved, [...confirmedFields]);
      score = result;
      task = { ...task, ...saved };
      changedAfterConfirm = false;
      go("review");
    } catch (error) {
      errorMessage = error?.message || "Не удалось сохранить карточку. Ваши изменения остались на экране.";
      busy = false; render();
    } finally { busy = false; }
  }

  async function publish() {
    busy = true; errorMessage = ""; render();
    try {
      const result = dependencies.publishTask ? await dependencies.publishTask(task.id, { ...task, confirmedFields: [...confirmedFields] }) : { ...task, publicationStatus: "published" };
      task = { ...task, ...result, publicationStatus: "published" };
      published = true;
      notify("Задача опубликована и доступна командам.");
      render();
    } catch (error) {
      errorMessage = error?.message || "Не получилось опубликовать задачу. Попробуйте ещё раз.";
      busy = false; render();
    } finally { busy = false; }
  }

  function collectState() { return { step, task: { ...task }, questions: [...questions], score, confirmedFields: [...confirmedFields], changedAfterConfirm, published }; }
  render();
  return { getState: collectState, setTask(nextTask = {}) { task = { ...task, ...nextTask }; render(); }, destroy() { root.replaceChildren(); clearTimeout(toastTimer); } };
}
