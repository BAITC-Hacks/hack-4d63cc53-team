const DESCRIPTIVE_FIELDS = new Set([
  "context", "need", "users", "data", "constraints", "expectedResult",
  "successCriteria", "interactionFormat", "feedbackProcess",
]);

const UNKNOWN_ANSWERS = new Set([
  "не знаю", "пока не знаю", "неизвестно", "пока неизвестно", "не определено",
]);

const METRIC_EXAMPLE = "Пример измеримого критерия: среднее ожидание сократилось с 12 до 8 минут за неделю. Выберите метрику, подходящую вашей задаче.";

// Advice only: never changes field values, confirmation or the server's score.
export function getTextQualityHint(key, value) {
  const text = typeof value === "string" ? value.trim() : "";
  const normalized = text.toLocaleLowerCase("ru-RU").replace(/[.!?,:;…]+$/u, "").trim().replace(/\s+/gu, " ");
  let hint = "";

  if (UNKNOWN_ANSWERS.has(normalized)) {
    hint = "Уточните, что уже известно и какие сведения ещё нужно выяснить. Неизвестные факты можно оставить незаполненными.";
  } else if (DESCRIPTIVE_FIELDS.has(key) && (/^\p{L}$/u.test(text) || /^[.?…—–-]+$/u.test(text))) {
    hint = "Такой ответ может быть непонятен команде. Добавьте конкретное пояснение, если оно уже известно.";
  }

  return [hint, key === "successCriteria" ? METRIC_EXAMPLE : ""].filter(Boolean).join(" ");
}
