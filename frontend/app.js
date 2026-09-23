import { api, ApiError, request } from "./shared/api.js";
import { createRatingGuide } from "./business/rating-guide.js";
import { getTextQualityHint } from "./business/text-quality.js";
import {
  createCatalogScreen,
  createMilestoneScreen,
  createProposalReviewScreen,
  createProposalScreen,
  createTeamsScreen,
} from "./marketplace/marketplace.js";

const FIELDS = [
  ["topic", "Тема", "Направление задачи"], ["title", "Название", "Короткое и понятное название"],
  ["context", "Контекст", "Что происходит сейчас и почему задача важна?"], ["need", "Потребность", "Какую проблему нужно решить?"],
  ["users", "Пользователи", "Для кого создаётся решение?"], ["data", "Данные", "Какие данные доступны команде?"],
  ["constraints", "Ограничения", "Бюджет, сроки, правила, технические рамки"], ["expectedResult", "Ожидаемый результат", "Что должна получить компания?"],
  ["successCriteria", "Критерии успеха", "Как вы поймёте, что решение сработало?"], ["contact", "Контакт", "Кто будет отвечать на вопросы команды?"],
  ["interactionFormat", "Формат взаимодействия", "Как команда сможет общаться с вами?"], ["feedbackProcess", "Обратная связь", "Как и когда вы будете давать комментарии?"]
];
const FIELD_KEYS = FIELDS.map(([key]) => key);
const FIELD_LABELS = Object.fromEntries(FIELDS.map(([key, label]) => [key, label]));
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { task: null, analysis: null, answers: {}, fields: blankFields(), saving: false, conflictTask: null, toastTimer: null, tasks: [], role: "business", view: "business", activeTask: null, selectedTeamLoadId: 0, editorOpen: false, navigationId: 0 };

function blankFields() { return Object.fromEntries(FIELD_KEYS.map((key) => [key, ""])); }
function safeString(value) { return typeof value === "string" ? value : ""; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}
function setStatus(message, kind = "success", actions = "") {
  const box = $("#status-message");
  box.className = `status-message ${kind}`;
  box.innerHTML = `${escapeHTML(message)}${actions}`;
  box.hidden = false;
}
function clearStatus() { const box = $("#status-message"); box.hidden = true; box.replaceChildren(); }
function toast(message, kind = "success") {
  const box = $("#toast");
  box.textContent = message;
  box.className = `toast ${kind}`;
  box.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { box.hidden = true; }, 3600);
}
function friendlyError(error) {
  if (error instanceof ApiError) {
    if (error.status === 422) return "Сервер не принял данные. Проверьте заполненные поля и попробуйте ещё раз.";
    if (error.status === 404) return "Эта задача больше не найдена на сервере. Обновите список задач.";
    return error.message;
  }
  return "Что-то пошло не так. Введённый текст сохранён в форме — попробуйте ещё раз.";
}
function setServerConnection(online) {
  const connection = $("#server-connection");
  if (!connection) return;
  connection.className = online ? "connection" : "connection offline";
  const indicator = document.createElement("i");
  connection.replaceChildren(indicator, document.createTextNode(online ? "Подключено к серверу" : "Нет связи с сервером"));
}
function showStage(number) {
  const names = ["description", "questions", "card", "published"];
  names.forEach((name, index) => { $(`#stage-${name}`).hidden = index + 1 !== number; });
  $$("[data-step-indicator]").forEach((el) => {
    const item = Number(el.dataset.stepIndicator);
    el.classList.toggle("active", item === number);
    el.classList.toggle("done", item < number);
  });
  clearStatus();
}
function openEditor({ task = null } = {}) {
  if (state.saving) { toast("Дождитесь завершения текущей операции.", "warning"); return; }
  state.navigationId += 1;
  state.editorOpen = true;
  state.task = task;
  state.analysis = null;
  state.answers = {};
  state.conflictTask = null;
  state.fields = task ? fieldsFromTask(task) : blankFields();
  $("#description").value = task?.rawDescription || "";
  $("#description-count").textContent = `${$("#description").value.length.toLocaleString("ru-RU")} / 10 000`;
  $("#editor-title").textContent = task ? (task.title || "Продолжить задачу") : "Новая задача";
  $("#editor").hidden = false;
  $("#stage-description").hidden = true;
  $("#stage-questions").hidden = true;
  $("#stage-card").hidden = true;
  $("#stage-published").hidden = true;
  if (task) {
    renderCard(task);
    const published = task.publicationStatus === "published";
    const hasPublication = published && renderPublished(task);
    showStage(hasPublication ? 4 : 3);
    if (published && !hasPublication) setStatus("В опубликованной версии нет подтверждённых сведений. Проверьте название, потребность и ожидаемый результат, затем сохраните и подтвердите заполненные поля.", "warning");
  } else showStage(1);
  $("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
}
function closeEditor() {
  state.navigationId += 1;
  state.editorOpen = false;
  $("#editor").hidden = true;
}
function fieldsFromTask(task) {
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, safeString(task?.[key] ?? task?.fields?.[key])]));
}
function validAnalysis(payload) {
  return payload && typeof payload === "object" && payload.fields && typeof payload.fields === "object" &&
    Array.isArray(payload.questions) && payload.questions.length >= 3 &&
    payload.questions.every((item) => typeof item === "string" && item.trim()) &&
    FIELD_KEYS.every((key) => typeof payload.fields[key] === "string");
}
function normalizeAnalysis(payload, description) {
  if (validAnalysis(payload)) {
    return { ...payload, fields: Object.fromEntries(FIELD_KEYS.map((key) => [key, payload.fields[key]])) };
  }
  const questions = ["Какую конкретную потребность нужно закрыть?", "Кто будет пользоваться результатом?", "Как вы поймёте, что задача выполнена успешно?"];
  return {
    fields: { ...blankFields(), context: description.slice(0, 4000) }, questions,
    missingFields: FIELD_KEYS.filter((key) => key !== "context"), mode: "fallback",
    reason: "Сервер прислал неполный или некорректный ответ. Показаны базовые уточнения; описание сохранено."
  };
}
function renderMode(target, analysis) {
  const fallback = analysis?.mode !== "openai";
  const reason = analysis?.reason?.startsWith("AI_MODE=fallback:")
    ? "Базовые вопросы помогут заполнить карточку вручную"
    : analysis?.reason || "AI-провайдер недоступен";
  const text = fallback ? `Резервный AI-режим · ${reason}` : "AI-анализ готов · проверьте каждое предложение";
  target.innerHTML = `<span class="ai-mode ${fallback ? "fallback" : ""}">${escapeHTML(text)}</span>`;
}
function renderQuestions(analysis) {
  const root = $("#questions-list");
  const suggestedMissing = Array.isArray(analysis.missingFields) ? analysis.missingFields.filter((key) => FIELD_KEYS.includes(key)) : [];
  const questionBindings = analysis.questions.map((question, index) => guessQuestionField(question) || suggestedMissing[index] || FIELD_KEYS[0]);
  state.questionBindings = questionBindings;
  root.innerHTML = analysis.questions.slice(0, 12).map((question, index) => `
    <div class="question-card"><label for="answer-${index}"><span class="question-index">${String(index + 1).padStart(2, "0")}</span>${escapeHTML(question)}</label>
    <div class="answer-field-map"><label for="answer-field-${index}">Сохранить ответ в поле</label><select id="answer-field-${index}" data-answer-field="${index}">${FIELDS.map(([key, label]) => `<option value="${key}" ${questionBindings[index] === key ? "selected" : ""}>${escapeHTML(label)}</option>`).join("")}</select></div>
    <textarea class="answer-input" id="answer-${index}" data-answer-index="${index}" maxlength="4000" placeholder="Ваш ответ (можно оставить пустым)">${escapeHTML(state.answers[index] || "")}</textarea></div>`).join("");
  renderMode($("#ai-mode"), analysis);
}
function guessQuestionField(question) {
  const text = question.toLocaleLowerCase("ru");
  const patterns = [
    [/потребност|проблем|нужно решить/, "need"], [/пользоват|для кого|кто сталкивает/, "users"],
    [/данн|материал|источник/, "data"], [/результат/, "expectedResult"],
    [/критери|успеш|метрик|как вы пойм/, "successCriteria"], [/огранич|срок|бюджет|технолог/, "constraints"],
    [/контакт|кто сможет подтверд/, "contact"], [/обратн.*связ|комментар/, "feedbackProcess"],
    [/формат.*взаимодейств|как.*обща/, "interactionFormat"], [/контекст|сейчас|текущ/, "context"],
    [/назван/, "title"], [/тем/, "topic"],
  ];
  return patterns.find(([pattern]) => pattern.test(text))?.[1] || null;
}
function gatherQuestionAnswers() {
  const mapped = {};
  $$("[data-answer-index]").forEach((input) => {
    const value = input.value.trim();
    const index = Number(input.dataset.answerIndex);
    const key = $(`[data-answer-field="${index}"]`)?.value || state.questionBindings[index];
    if (value && FIELD_KEYS.includes(key)) mapped[key] = mapped[key] ? `${mapped[key]}\n${value}` : value;
    state.answers[input.dataset.answerIndex] = input.value;
  });
  return mapped;
}
async function analyzeDescription() {
  const description = $("#description").value.trim();
  if (!description) { setStatus("Добавьте короткое описание, чтобы начать анализ.", "warning"); $("#description").focus(); return; }
  if (state.saving) return;
  state.saving = true;
  $("#analyze").disabled = true;
  $("#analyze").innerHTML = '<span class="spinner"></span> Анализируем…';
  clearStatus();
  try {
    let result;
    try { result = await api.analyze(description); }
    catch (error) {
      if (error.status === 0 || error.status >= 500 || error.status === 404) {
        result = { fields: { ...blankFields(), context: description.slice(0, 4000) }, questions: ["Какую потребность важно закрыть?", "Кто будет пользоваться решением?", "Как определить успешный результат?"], missingFields: ["need", "users", "successCriteria"], mode: "fallback", reason: friendlyError(error) };
      } else throw error;
    }
    state.analysis = normalizeAnalysis(result, description);
    if (state.analysis.mode === "fallback" && result !== state.analysis && !result.reason) state.analysis.reason = "Проверьте предложенную структуру вручную.";
    state.fields = { ...state.analysis.fields };
    renderQuestions(state.analysis);
    showStage(2);
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    state.saving = false;
    $("#analyze").disabled = false;
    $("#analyze").innerHTML = 'Проанализировать <span>→</span>';
  }
}
async function applyAnswers() {
  if (!state.analysis) return;
  const answers = gatherQuestionAnswers();
  const description = $("#description").value.trim();
  if (Object.keys(answers).length) {
    $("#apply-answers").disabled = true;
    $("#apply-answers").textContent = "Учитываем ответы…";
    try {
      const enriched = await api.analyze(description, answers);
      const normalized = normalizeAnalysis(enriched, description);
      state.analysis = normalized;
      state.fields = { ...normalized.fields, ...answers };
    } catch (error) {
      // Answers remain in the form and are applied locally if the follow-up request fails.
      state.fields = { ...state.analysis.fields, ...answers };
      if (error.status === 0 || error.status >= 500 || error.status === 404) {
        state.analysis = { ...state.analysis, mode: "fallback", reason: `${friendlyError(error)} Ответы внесены в карточку локально.` };
      } else {
        setStatus(friendlyError(error), "error");
        $("#apply-answers").disabled = false;
        $("#apply-answers").innerHTML = 'Перейти к карточке <span>→</span>';
        return;
      }
    } finally {
      $("#apply-answers").disabled = false;
      $("#apply-answers").innerHTML = 'Перейти к карточке <span>→</span>';
    }
  }
  renderCard(null);
  showStage(3);
}
function renderCard(task, draftFields = null, draftConfirmations = []) {
  $("#editor-title").textContent = task ? (task.title || "Продолжить задачу") : "Новая задача";
  if (draftFields) state.fields = { ...draftFields };
  else if (task) state.fields = fieldsFromTask(task);
  const confirmed = new Set((task?.confirmedFields || []).filter((key) => state.fields[key] === safeString(task[key])));
  draftConfirmations.forEach((key) => confirmed.add(key));
  const root = $("#fields-grid");
  root.innerHTML = FIELDS.map(([key, label, hint]) => {
    const large = ["context", "need", "data", "constraints", "expectedResult", "successCriteria", "interactionFormat", "feedbackProcess"].includes(key);
    const val = state.fields[key] || "";
    const qualityHint = getTextQualityHint(key, val);
    return `<div class="field-card"><div class="field-card-top"><label for="field-${key}">${escapeHTML(label)}</label><label class="confirm-control"><input type="checkbox" data-confirm-field="${key}" ${confirmed.has(key) ? "checked" : ""}><span>Подтверждаю</span></label></div>
      <textarea class="field-input ${large ? "multiline" : ""}" id="field-${key}" data-field="${key}" maxlength="4000" placeholder="${escapeHTML(hint)}" aria-describedby="field-hint-${key}${qualityHint ? ` field-quality-${key}` : ""}">${escapeHTML(val)}</textarea>
      <div id="field-hint-${key}" class="field-hint">${escapeHTML(hint)}</div><div id="field-quality-${key}" class="field-quality-hint" ${qualityHint ? "" : "hidden"}>${escapeHTML(qualityHint)}</div></div>`;
  }).join("");
  $("#source-description").textContent = safeString(state.task?.rawDescription ?? $("#description").value) || "Исходное описание не указано.";
  renderPublicPreview();
  renderMode($("#card-mode"), state.analysis || { mode: "fallback", reason: "Открыта сохранённая карточка" });
  $("#revision-label").textContent = task ? `Версия ${task.revision} · сохранено ${formatDate(task.updatedAt)}` : "Ещё не сохранено";
  $("#score-panel").hidden = !task;
  if (task) renderScore(task);
  const publishUpdate = Boolean(task?.publishedVersion && publicationChanged(task));
  $("#publish").disabled = !task || (task.publicationStatus === "published" && !publishUpdate);
  $("#publish").innerHTML = `${publishUpdate ? "Опубликовать обновление" : "Опубликовать задачу"} <span>→</span>`;
  $("#save-draft").textContent = task ? "Сохранить черновик" : "Создать черновик";
}
function publicFieldsFromTask(task) {
  const confirmed = new Set(task?.confirmedFields || []);
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, confirmed.has(key) ? safeString(task?.[key]) : ""]));
}
function hasPublicContent(fields) {
  return FIELD_KEYS.some((key) => safeString(fields?.[key]).trim());
}
function publicFieldsMarkup(fields) {
  return `<dl class="public-fields">${FIELDS.map(([key, label]) => `<div><dt>${escapeHTML(label)}</dt><dd${safeString(fields?.[key]).trim() ? "" : ' class="public-field-empty"'}>${escapeHTML(safeString(fields?.[key]).trim() ? fields[key] : "Не указано")}</dd></div>`).join("")}</dl>`;
}
function publicPreviewPending() {
  if (!state.task) return true;
  return FIELD_KEYS.some((key) => $(`[data-field="${key}"]`)?.value !== safeString(state.task[key])) ||
    selectedConfirmations().some((key) => !state.task.confirmedFields?.includes(key));
}
function renderPublicPreview() {
  const root = $("#public-preview");
  const fields = publicFieldsFromTask(state.task);
  const filledCount = FIELD_KEYS.filter((key) => fields[key].trim()).length;
  root.innerHTML = `<div class="public-preview-heading"><h4>Что увидят команды</h4><span>${filledCount} из ${FIELD_KEYS.length} полей</span></div>
    <p>В публикацию попадут сохранённые и подтверждённые сведения. Неподтверждённые поля останутся пустыми.</p>
    <p id="public-preview-pending" class="public-preview-notice" ${publicPreviewPending() ? "" : "hidden"}>Предпросмотр обновится после сохранения и подтверждения изменений.</p>
    ${filledCount ? `<details class="public-preview-details" open><summary>Публичный предпросмотр</summary>${publicFieldsMarkup(fields)}</details>` : '<p class="public-preview-empty">Пока нет сведений для публикации. Проверьте название, потребность и ожидаемый результат. Заполните хотя бы одно поле, отметьте «Подтверждаю» и нажмите «Сохранить и пересчитать».</p>'}`;
}
function updateCardHints(key) {
  if (key) {
    const input = $(`[data-field="${key}"]`);
    const hint = $(`#field-quality-${key}`);
    const text = getTextQualityHint(key, input.value);
    hint.textContent = text;
    hint.hidden = !text;
    input.setAttribute("aria-describedby", `field-hint-${key}${text ? ` field-quality-${key}` : ""}`);
  }
  const pending = $("#public-preview-pending");
  if (pending) pending.hidden = !publicPreviewPending();
}
function publicationChanged(task) {
  const snapshot = task?.publishedVersion;
  if (!snapshot) return false;
  const currentConfirmed = [...(task.confirmedFields || [])].sort();
  const publishedConfirmed = [...(snapshot.confirmedFields || [])].sort();
  if (JSON.stringify(currentConfirmed) !== JSON.stringify(publishedConfirmed)) return true;
  return FIELD_KEYS.some((key) => {
    const currentValue = currentConfirmed.includes(key) ? safeString(task[key]) : "";
    return currentValue !== safeString(snapshot.fields?.[key]);
  });
}
function renderScore(task) {
  const panel = $("#score-panel");
  panel.hidden = false;
  const score = Number.isFinite(task.score) ? task.score : 0;
  const readiness = ({ draft: "Черновик", working: "В работе", ready: "Готова к публикации", priority: "Высокая готовность" })[task.readiness] || "Оценка готовности";
  const breakdown = Array.isArray(task.scoreBreakdown) ? task.scoreBreakdown : [];
  const missing = Array.isArray(task.missingFields) ? task.missingFields : [];
  panel.innerHTML = `<div class="score-header"><div class="score-ring" style="--score-angle:${score * 3.6}deg"><strong>${score}</strong></div><div class="score-copy"><strong>Готовность описания · ${score}/100</strong><p>${escapeHTML(readiness)} — оценка опирается на заполненные и подтверждённые сведения</p></div></div>
    <div class="score-breakdown">${breakdown.map((row) => `<div class="score-row"><span>${escapeHTML(row.label || "Показатель")}</span><b>${Number(row.points) || 0}/${Number(row.maxPoints) || 0}</b></div>`).join("")}</div>
    ${missing.length ? `<div class="missing-list"><b>Чтобы усилить задачу:</b> ${missing.map((key) => escapeHTML(FIELDS.find(([name]) => name === key)?.[1] || key)).join(" · ")}</div>` : `<div class="missing-list">Все оцениваемые сведения подтверждены.</div>`}`;
  renderRatingGuide();
}
function renderRatingGuide() {
  const panel = $("#score-panel");
  if (!panel || !state.task) return;
  let root = $("#rating-guide");
  if (!root) {
    root = document.createElement("div");
    root.id = "rating-guide";
    panel.append(root);
  }
  const guide = createRatingGuide({ task: state.task, fields: currentFieldValues(), confirmedFields: selectedConfirmations(), labels: FIELD_LABELS });
  root.replaceChildren();
  if (!guide) return;
  const box = document.createElement("div");
  box.className = "rating-guide rating-guide-" + guide.state;
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = guide.title;
  const text = document.createElement("p");
  text.textContent = guide.text;
  copy.append(title, text);
  if (guide.remaining?.length) {
    const remaining = document.createElement("small");
    remaining.textContent = "Группа: " + guide.remaining.join(" · ");
    copy.append(remaining);
  }
  box.append(copy);
  if (guide.action) {
    const action = document.createElement("button");
    action.className = "button button-secondary rating-guide-action";
    action.textContent = guide.action;
    action.dataset.ratingGuideAction = guide.target.type;
    action.dataset.ratingGuideKey = guide.target.key || "";
    box.append(action);
  }
  root.append(box);
}
function focusRatingGuideTarget(button) {
  const type = button.dataset.ratingGuideAction;
  const key = button.dataset.ratingGuideKey;
  const target = type === "save" ? $("#save-confirm") : type === "confirm" ? $('[data-confirm-field="' + key + '"]') : $('[data-field="' + key + '"]');
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.focus({ preventScroll: true });
}
function currentFieldValues() {
  const result = {};
  $$("[data-field]").forEach((element) => { result[element.dataset.field] = element.value; });
  return result;
}
function selectedConfirmations() {
  return $$("[data-confirm-field]:checked").map((element) => element.dataset.confirmField).filter((key) => FIELD_KEYS.includes(key));
}
function updateStateFromTask(task) {
  state.task = task;
  state.fields = fieldsFromTask(task);
  $("#description").value = task.rawDescription || "";
  $("#description-count").textContent = `${$("#description").value.length.toLocaleString("ru-RU")} / 10 000`;
  renderCard(task);
  refreshTasks().catch(() => {});
}
function conflictActions() {
  return '<div class="conflict-actions"><button class="button button-quiet" data-conflict="load">Загрузить серверную версию</button> <button class="button button-secondary" data-conflict="retry">Сохранить мои изменения поверх неё</button></div>';
}
function handleConflict(error, confirmAfter = false) {
  if (error.status === 409 && error.task) {
    state.conflictTask = error.task;
    const actions = conflictActions().replace('data-conflict="retry"', `data-conflict="retry" data-confirm-after="${confirmAfter}"`);
    setStatus(`Задачу успели изменить в другой вкладке (серверная версия ${error.task.revision}). Ваши изменения пока остались в форме. Выберите, какую версию оставить.`, "warning", actions);
    return true;
  }
  return false;
}
async function persistDraft({ confirm = false } = {}) {
  if (state.saving) return;
  const rawDescription = $("#description").value.trim();
  const previousScore = Number(state.task?.score) || 0;
  const editedFields = currentFieldValues();
  const requestedConfirmations = confirm ? selectedConfirmations() : [];
  const descriptionNotPersisted = Boolean(state.task && state.task.rawDescription !== rawDescription);
  if (!rawDescription) { setStatus("Описание нужно сохранить вместе с карточкой.", "warning"); showStage(1); return; }
  if (Object.values(editedFields).some((value) => value.length > 4000)) { setStatus("Одно из полей превышает лимит 4 000 символов.", "warning"); return; }
  state.saving = true;
  const saveButton = confirm ? $("#save-confirm") : $("#save-draft");
  saveButton.disabled = true;
  saveButton.dataset.original = saveButton.textContent;
  saveButton.textContent = "Сохраняем…";
  clearStatus();
  try {
    if (!state.task) {
      state.task = await api.createTask(rawDescription, editedFields);
      state.fields = fieldsFromTask(state.task);
    } else {
      const diff = Object.fromEntries(FIELD_KEYS.filter((key) => editedFields[key] !== safeString(state.task[key])).map((key) => [key, editedFields[key]]));
      if (Object.keys(diff).length) {
        state.task = await api.patchTask(state.task.id, state.task.revision, diff);
      }
    }
    let confirmedCount = 0;
    if (confirm) {
      const currentFields = currentFieldValues();
      const selectedNow = new Set(selectedConfirmations());
      const selected = requestedConfirmations.filter((key) => selectedNow.has(key) && currentFields[key] === safeString(state.task[key]));
      confirmedCount = selected.length;
      if (selected.length) state.task = await api.confirmTask(state.task.id, state.task.revision, selected);
    }
    const preserveInputs = currentFieldValues();
    const preserveConfirmations = selectedConfirmations();
    const hasUnsavedChanges = FIELD_KEYS.some((key) => preserveInputs[key] !== safeString(state.task[key]));
    renderCard(state.task, preserveInputs, preserveConfirmations);
    if (state.task.publicationStatus !== "published") $("#publish").disabled = false;
    let successMessage = confirm
      ? confirmedCount ? "Черновик сохранён, выбранные поля подтверждены, оценка обновлена." : "Черновик сохранён. Отметьте поля, за которые готовы отвечать, и подтвердите их для пересчёта рейтинга."
      : "Черновик надёжно сохранён на сервере.";
    if (confirm && state.task.score > previousScore) successMessage += " Рейтинг вырос с " + previousScore + " до " + state.task.score + "/100 по расчёту сервера.";
    if (hasUnsavedChanges) successMessage += " Новые изменения остались в форме — сохраните их отдельно.";
    setStatus(descriptionNotPersisted
      ? `${successMessage} Изменение исходного описания не поддерживается сервером; сохранены поля карточки, на сервере осталось прежнее описание.`
      : successMessage, descriptionNotPersisted || hasUnsavedChanges ? "warning" : "success");
    toast(confirm ? "Карточка сохранена и пересчитана" : "Черновик сохранён");
    await refreshTasks();
  } catch (error) {
    renderPublicPreview();
    if (!handleConflict(error, confirm)) setStatus(friendlyError(error), "error");
  } finally {
    state.saving = false;
    saveButton.disabled = false;
    saveButton.textContent = saveButton.dataset.original || (confirm ? "Сохранить и пересчитать" : "Сохранить черновик");
  }
}
async function publishTask() {
  if (!state.task || state.saving || (state.task.publicationStatus === "published" && !publicationChanged(state.task))) return;
  const unconfirmed = FIELD_KEYS.filter((key) => $(`[data-confirm-field="${key}"]`)?.checked && !state.task.confirmedFields?.includes(key));
  if (unconfirmed.length) {
    setStatus("Сначала сохраните и подтвердите выбранные поля — тогда публикация включит их в карточку команды.", "warning");
    return;
  }
  if (FIELD_KEYS.some((key) => $(`[data-field="${key}"]`)?.value !== safeString(state.task[key]))) {
    setStatus("Сначала сохраните изменения карточки.", "warning");
    return;
  }
  if (!hasPublicContent(publicFieldsFromTask(state.task))) {
    setStatus("Нельзя опубликовать пустую карточку. Заполните и подтвердите хотя бы одно поле, например название задачи. Проверьте также потребность и ожидаемый результат.", "warning");
    $("#field-title").focus();
    return;
  }
  state.saving = true;
  $("#publish").disabled = true;
  $("#publish").textContent = "Публикуем…";
  try {
    state.task = await api.publishTask(state.task.id, state.task.revision);
    if (!renderPublished(state.task)) {
      renderCard(state.task, currentFieldValues(), selectedConfirmations());
      showStage(3);
      setStatus("Сервер не вернул публичную версию с подтверждёнными сведениями. Публикация не подтверждена. Введённый текст остался в форме; проверьте карточку и попробуйте ещё раз.", "error");
      await refreshTasks();
      return;
    }
    showStage(4);
    await refreshTasks();
  } catch (error) {
    if (!handleConflict(error)) setStatus(friendlyError(error), "error");
    $("#publish").disabled = false;
  } finally {
    state.saving = false;
    $("#publish").innerHTML = 'Опубликовать задачу <span>→</span>';
  }
}
function renderPublished(task) {
  const version = task?.publishedVersion;
  if (!hasPublicContent(version?.fields)) {
    $("#stage-published").replaceChildren();
    return false;
  }
  const title = safeString(version.fields.title).trim() ? version.fields.title : "Без названия";
  $("#editor-title").textContent = title;
  const score = Number.isFinite(version.score) ? `${version.score}/100` : "пока недоступен";
  $("#stage-published").innerHTML = `<div class="success-mark">✓</div><h3>Задача опубликована</h3><p>Команды увидят подтверждённые сведения и смогут подготовить предложения. Рейтинг этой версии — ${escapeHTML(score)}.</p>
    <div class="publication-preview"><strong>${escapeHTML(title)}</strong><p>Версия ${escapeHTML(version.version ?? "—")} · опубликовано ${escapeHTML(formatDate(version.publishedAt))} · статус: опубликована</p><details class="public-preview-details"><summary>Сведения опубликованной версии</summary>${publicFieldsMarkup(version.fields)}</details></div>
    <button id="back-to-card" class="button button-secondary">Вернуться к карточке</button> <button id="new-after-publish" class="button button-primary">Создать ещё одну задачу <span>→</span></button>`;
  $("#back-to-card").addEventListener("click", () => { renderCard(state.task, currentFieldValues(), selectedConfirmations()); showStage(3); });
  $("#new-after-publish").addEventListener("click", () => openEditor());
  return true;
}
async function refreshTasks() {
  const root = $("#task-list");
  try {
    const result = await api.listTasks();
    if (!Array.isArray(result)) throw new ApiError("Список задач имеет неожиданный формат.", 200, result);
    state.tasks = result;
    renderTaskList();
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><strong>Не удалось загрузить задачи</strong><p>${escapeHTML(friendlyError(error))}</p><button class="button button-secondary" id="retry-list">Повторить</button></div>`;
    $("#retry-list")?.addEventListener("click", () => refreshTasks());
    $("#stat-total").textContent = "—"; $("#stat-published").textContent = "—"; $("#stat-score").textContent = "—";
  }
}
function renderTaskList() {
  const query = $("#task-search").value.trim().toLocaleLowerCase("ru");
  const visible = state.tasks.filter((task) => `${task.title || ""} ${task.topic || ""} ${task.rawDescription || ""}`.toLocaleLowerCase("ru").includes(query));
  $("#stat-total").textContent = String(state.tasks.length);
  $("#stat-published").textContent = String(state.tasks.filter((task) => task.publicationStatus === "published").length);
  const scored = state.tasks.filter((task) => Number.isFinite(task.score));
  $("#stat-score").textContent = scored.length ? `${Math.round(scored.reduce((sum, task) => sum + task.score, 0) / scored.length)}%` : "—";
  if (!visible.length) {
    $("#task-list").innerHTML = query ? `<div class="empty-state"><strong>Ничего не найдено</strong><p>Попробуйте изменить запрос.</p></div>` : `<div class="empty-state"><strong>Здесь появятся ваши проекты</strong><p>Создайте первую задачу — AI поможет оформить идею, а вы проверите и опубликуете карточку.</p><button class="button button-secondary" id="empty-create">＋ Создать задачу</button></div>`;
    $("#empty-create")?.addEventListener("click", () => openEditor());
    return;
  }
  $("#task-list").innerHTML = visible.map((task) => `<div class="task-row"><div class="task-main"><strong>${escapeHTML(task.title || task.topic || task.rawDescription || "Без названия")}</strong><small>${escapeHTML(task.topic || "Бизнес-задача")} · обновлено ${escapeHTML(formatDate(task.updatedAt))}</small></div><span class="task-status ${task.publicationStatus === "published" ? "published" : ""}">${task.publicationStatus === "published" ? "Опубликована" : "Черновик"}</span><span class="task-score">${Number.isFinite(task.score) ? task.score : 0}/100 · готовность</span><span class="task-updated">Версия ${escapeHTML(task.revision)}</span><div class="task-actions"><button class="button button-secondary task-open" data-open-task="${escapeHTML(task.id)}">Открыть</button>${task.publicationStatus === "published" ? `<button class="button button-quiet task-review" data-review-task="${escapeHTML(task.id)}">Отклики</button>` : ""}</div></div>`).join("");
  $$('[data-open-task]').forEach((button) => button.addEventListener("click", () => openExistingTask(button.dataset.openTask)));
  $$('[data-review-task]').forEach((button) => button.addEventListener("click", () => openProposalReviewById(button.dataset.reviewTask)));
}
async function openExistingTask(id) {
  const navigationId = ++state.navigationId;
  try {
    const task = await api.getTask(id);
    if (navigationId === state.navigationId) openEditor({ task });
  } catch (error) { if (navigationId === state.navigationId) toast(friendlyError(error), "error"); }
}
function adaptMarketplaceTask(task) {
  return {
    ...task,
    taskId: String(task?.taskId || task?.id || ""),
    fields: task?.fields && typeof task.fields === "object" ? task.fields : task?.publishedVersion?.fields || fieldsFromTask(task || {}),
  };
}
function navigate(view) {
  state.navigationId += 1;
  state.view = view;
  const business = view === "business";
  $$(".business-view-block").forEach((element) => { element.hidden = !business || (element.id === "editor" && !state.editorOpen); });
  $("#marketplace-view").hidden = business;
  $("#milestone-start").hidden = view !== "review";
  $$("[data-view]").forEach((link) => link.classList.toggle("active", link.dataset.view === view || (view === "proposal" && link.dataset.view === "catalog") || (view === "review" && link.dataset.view === "business") || (view === "milestone" && link.dataset.view === "business")));
  $("#selected-team").hidden = view !== "review";
  const titles = { business: "Мои задачи", catalog: "Каталог проектов", teams: "Команды", proposal: "Отклик на задачу", review: "Отклики команд", milestone: "Этап проекта" };
  $(".breadcrumbs strong").textContent = titles[view] || "Рабочее пространство";
}
function showMarketplaceScreen(view, screen, task = null) {
  state.activeTask = task ? adaptMarketplaceTask(task) : state.activeTask;
  navigate(view);
  $("#marketplace-content").replaceChildren(screen);
  $("#marketplace-context").textContent = state.role === "team" ? "РАБОТА ДЛЯ КОМАНД" : "РАБОТА С КОМАНДАМИ";
  $("#marketplace-view").scrollIntoView({ behavior: "smooth", block: "start" });
}
function isActiveMarketplaceScreen(view, screen) {
  return state.view === view && $("#marketplace-content").firstElementChild === screen;
}
function openCatalog() {
  state.role = "team";
  syncRoleControls();
  const screen = createCatalogScreen({ onOpenTask: (task) => openProposal(adaptMarketplaceTask(task)) });
  showMarketplaceScreen("catalog", screen);
}
function openProposal(task) {
  state.activeTask = adaptMarketplaceTask(task);
  const screen = createProposalScreen(state.activeTask, { onSubmitted: () => {
    if (!isActiveMarketplaceScreen("proposal", screen)) return;
    toast("Предложение отправлено бизнесу");
    openCatalog();
  } });
  showMarketplaceScreen("proposal", screen, task);
}
function openTeams() {
  state.role = "team";
  syncRoleControls();
  const screen = createTeamsScreen({ onCreated: (team) => {
    if (isActiveMarketplaceScreen("teams", screen)) toast(`Профиль «${team.name}» создан`);
  } });
  showMarketplaceScreen("teams", screen);
}
async function openProposalReviewById(id) {
  const navigationId = ++state.navigationId;
  try {
    const task = await api.getTask(id);
    if (navigationId === state.navigationId) showProposalReview(task);
  } catch (error) { if (navigationId === state.navigationId) toast(friendlyError(error), "error"); }
}
function showProposalReview(task) {
  state.role = "business";
  syncRoleControls();
  const normalized = adaptMarketplaceTask(task);
  state.activeTask = normalized;
  const screen = createProposalReviewScreen(normalized, { onChanged: () => {
    if (isActiveMarketplaceScreen("review", screen)) loadSelectedProposalTeams(state.activeTask);
  } });
  showMarketplaceScreen("review", screen, normalized);
  loadSelectedProposalTeams(normalized);
}
async function loadSelectedProposalTeams(task) {
  const loadId = ++state.selectedTeamLoadId;
  const isCurrent = () => loadId === state.selectedTeamLoadId && state.view === "review" && state.activeTask?.taskId === task.taskId;
  const select = $("#selected-team");
  select.replaceChildren(new Option("Загружаем выбранные команды…", ""));
  select.disabled = true;
  try {
    const proposals = await request(`/tasks/${encodeURIComponent(task.taskId)}/proposals`);
    if (!isCurrent()) return;
    const selected = proposals.filter((proposal) => proposal.status === "selected");
    if (!selected.length) {
      select.replaceChildren(new Option("Сначала выберите команду в откликах", ""));
      state.activeTask = { ...task, selectedTeamId: "" };
    } else {
      const previous = state.activeTask?.selectedTeamId;
      select.replaceChildren(...selected.map((proposal) => new Option(proposal.team.name, proposal.teamId)));
      select.value = selected.some((proposal) => proposal.teamId === previous) ? previous : selected[0].teamId;
      state.activeTask = { ...task, selectedTeamId: select.value };
    }
  } catch (error) {
    if (!isCurrent()) return;
    select.replaceChildren(new Option("Не удалось загрузить выбранные команды", ""));
    toast(error.message || "Не удалось загрузить выбранные команды.", "error");
  } finally {
    if (isCurrent()) select.disabled = false;
  }
}
function showMilestone() {
  if (!state.activeTask?.taskId) { toast("Не выбрана опубликованная задача.", "warning"); return; }
  const teamId = $("#selected-team").value;
  if (!teamId) { toast("Сначала выберите команду на экране откликов.", "warning"); return; }
  const task = { ...adaptMarketplaceTask(state.activeTask), selectedTeamId: teamId };
  const screen = createMilestoneScreen(task, {
    teamId,
    onCreated: () => { if (isActiveMarketplaceScreen("milestone", screen)) toast("Этап записан. Подтвердите его после проверки результата."); },
    onConfirmed: () => { if (isActiveMarketplaceScreen("milestone", screen)) toast("Этап подтверждён"); },
  });
  showMarketplaceScreen("milestone", screen, task);
}
function syncRoleControls() {
  const isTeam = state.role === "team";
  $$('[data-role]').forEach((button) => {
    const active = button.dataset.role === state.role;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $$('[data-nav-role]').forEach((item) => { item.hidden = item.dataset.navRole !== state.role; });
  $("#workspace-name").textContent = isTeam ? "Профиль команды" : "Кофейня «Север»";
  $("#workspace-subtitle").textContent = isTeam ? "Кабинет команды" : "Кабинет бизнеса";
  $("#profile-role").textContent = isTeam ? "Участник команды" : "Представитель бизнеса";
}
function onConflictAction(event) {
  const action = event.target.closest("[data-conflict]")?.dataset.conflict;
  if (!action || !state.conflictTask) return;
  if (action === "load") {
    const remote = state.conflictTask;
    state.conflictTask = null;
    updateStateFromTask(remote);
    setStatus("Загружена последняя версия с сервера.", "success");
  } else {
    state.task = state.conflictTask;
    state.conflictTask = null;
    setStatus("Повторно сохраняем ваши значения поверх актуальной версии…", "warning");
    persistDraft({ confirm: event.target.closest("[data-conflict]").dataset.confirmAfter === "true" });
  }
}
function init() {
  window.addEventListener("api-connection", (event) => setServerConnection(event.detail?.online === true));
  $("#description").addEventListener("input", (event) => { $("#description-count").textContent = `${event.target.value.length.toLocaleString("ru-RU")} / 10 000`; });
  $("#new-task").addEventListener("click", () => openEditor());
  $("#close-editor").addEventListener("click", closeEditor);
  $("#analyze").addEventListener("click", analyzeDescription);
  $("#apply-answers").addEventListener("click", applyAnswers);
  $("#save-draft").addEventListener("click", () => persistDraft());
  $("#save-confirm").addEventListener("click", () => persistDraft({ confirm: true }));
  $("#publish").addEventListener("click", publishTask);
  $("#task-search").addEventListener("input", renderTaskList);
  $$('[data-role]').forEach((button) => button.addEventListener("click", () => {
    state.role = button.dataset.role;
    syncRoleControls();
    if (state.role === "team") openCatalog();
    else navigate("business");
  }));
  $$('[data-view]').forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    if (link.dataset.view === "business") navigate("business");
    else if (link.dataset.view === "catalog") openCatalog();
    else if (link.dataset.view === "teams") openTeams();
  }));
  $("#marketplace-back").addEventListener("click", () => {
    if (state.view === "proposal") openCatalog();
    else if (state.view === "milestone" && state.activeTask) showProposalReview(state.activeTask);
    else if (state.view === "review") navigate("business");
    else if (state.view === "teams") openCatalog();
    else {
      state.role = "business";
      syncRoleControls();
      navigate("business");
    }
  });
  $("#selected-team").addEventListener("change", (event) => {
    if (state.activeTask) state.activeTask = { ...state.activeTask, selectedTeamId: event.target.value };
  });
  $("#milestone-start").addEventListener("click", showMilestone);
  $("#editor").addEventListener("click", (event) => {
    const back = event.target.closest("[data-back]");
    if (back) { showStage(Number(back.dataset.back)); return; }
    const guideAction = event.target.closest("[data-rating-guide-action]");
    if (guideAction) { focusRatingGuideTarget(guideAction); return; }
    onConflictAction(event);
  });
  $("#editor").addEventListener("input", (event) => {
    if (event.target.matches("[data-field]")) {
      const key = event.target.dataset.field;
      const changed = state.fields[key] !== event.target.value;
      state.fields[key] = event.target.value;
      if (changed) {
        const confirmation = $(`[data-confirm-field="${key}"]`);
        if (confirmation?.checked) {
          confirmation.checked = false;
          if (state.task?.confirmedFields?.includes(key)) {
            setStatus("Изменение поля снимает его подтверждение. Сохраните значение, затем подтвердите его снова.", "warning");
          }
        }
      }
      updateCardHints(key);
    }
  });
  $("#editor").addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-confirm-field]");
    if (!checkbox || checkbox.checked) return;
    const key = checkbox.dataset.confirmField;
    if (state.task?.confirmedFields?.includes(key) && currentFieldValues()[key] === safeString(state.task[key])) {
      checkbox.checked = true;
      setStatus("Чтобы отозвать подтверждение, измените значение поля и сохраните черновик.", "warning");
    }
  });
  $("#editor").addEventListener("change", (event) => {
    if (event.target.matches("[data-confirm-field]")) updateCardHints();
  });
  $("#editor").addEventListener("input", () => renderRatingGuide());
  $("#editor").addEventListener("change", () => renderRatingGuide());
  state.role = "business";
  syncRoleControls();
  refreshTasks();
}

init();
