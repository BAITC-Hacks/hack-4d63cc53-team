const EXAMPLES = {
  context: ["Что происходит сейчас?", "Например: в часы пик гости ждут заказ до 15 минут."],
  need: ["Какую проблему нужно решить?", "Например: сократить время ожидания заказа."],
  data: ["Какие данные доступны команде?", "Например: выгрузка заказов за последние 6 месяцев."],
  expectedResult: ["Какой результат ожидается?", "Например: прототип прогноза загрузки по часам."],
  successCriteria: ["Как вы измерите успех?", "Например: среднее время ожидания снизилось на 20%."],
  constraints: ["Какие есть рамки?", "Например: без покупки нового оборудования."],
  users: ["Для кого создаётся решение?", "Например: для кассиров и менеджера смены."],
  contact: ["Кто ответит на вопросы команды?", "Например: управляющий кафе, связь в Telegram."],
  interactionFormat: ["Как команда будет с вами общаться?", "Например: еженедельный созвон на 20 минут."],
  feedbackProcess: ["Как вы дадите обратную связь?", "Например: комментарии к демо в течение двух рабочих дней."],
};

export function createRatingGuide({ task, fields, confirmedFields, labels }) {
  const rows = Array.isArray(task && task.scoreBreakdown) ? task.scoreBreakdown : [];
  if (!rows.length) return null;
  const confirmed = new Set(confirmedFields);
  const serverConfirmed = new Set(task.confirmedFields || []);
  const label = (key) => labels[key] || key;
  const groups = rows.map((row) => {
    const keys = Array.isArray(row.fields) ? row.fields : [];
    return {
      ...row, keys,
      missing: keys.filter((key) => !(fields[key] || "").trim()),
      unchecked: keys.filter((key) => (fields[key] || "").trim() && !confirmed.has(key)),
      changed: keys.filter((key) => (task[key] || "") !== (fields[key] || "") || serverConfirmed.has(key) !== confirmed.has(key)),
    };
  });
  const stale = groups.find((group) => Number(group.points) === Number(group.maxPoints) && group.changed.length);
  if (stale) {
    const key = stale.changed[0];
    return { state: "stale", title: "Изменения ждут пересчёта",
      text: "Серверный рейтинг пока учитывает прежнее значение «" + label(key) + "». Сохраните и пересчитайте карточку, чтобы увидеть фактический результат.",
      action: "Перейти к изменённому полю", target: { type: "field", key }, remaining: stale.keys.map(label) };
  }
  const candidates = groups.filter((group) => Number(group.points) < Number(group.maxPoints));
  if (!candidates.length) return { state: "complete", title: "Все группы подтверждены", text: "Текущий рейтинг рассчитан сервером по сохранённой карточке." };
  const priority = (group) => group.missing.length === 0 && group.unchecked.length === 0 ? 0 : group.missing.length === 0 ? 1 : 2;
  candidates.sort((a, b) => priority(a) - priority(b) || Number(b.maxPoints) - Number(a.maxPoints) || a.missing.length - b.missing.length);
  const group = candidates[0];
  const gain = Math.max(0, (Number(group.maxPoints) || 0) - (Number(group.points) || 0));
  if (!group.missing.length && !group.unchecked.length) return {
    state: "save", title: "Следующий шаг: пересчитать «" + group.label + "»",
    text: "Все данные этой группы готовы. Сохраните и подтвердите карточку, чтобы сервер проверил возможный прирост до +" + gain + " баллов.",
    action: "К сохранению и пересчёту", target: { type: "save" }, remaining: group.keys.map(label)
  };
  if (!group.missing.length) {
    const key = group.unchecked[0];
    return { state: "confirm", title: "Следующий шаг: подтвердите «" + group.label + "»",
      text: "Данные заполнены. Подтвердите все поля группы и сохраните карточку — сервер сможет добавить до +" + gain + " баллов.",
      action: "Перейти к подтверждению", target: { type: "confirm", key }, remaining: group.unchecked.map(label) };
  }
  const key = group.missing[0];
  const example = EXAMPLES[key] || ["Уточните поле «" + label(key) + "».", "Добавьте конкретный факт, который команда сможет использовать."];
  return { state: "fill", title: "Следующий шаг: «" + group.label + "»",
    text: example[0] + " " + example[1] + " После заполнения подтвердите поля группы — сервер сможет добавить до +" + gain + " баллов.",
    action: "Заполнить поле", target: { type: "field", key }, remaining: [...group.missing, ...group.unchecked].map(label) };
}
