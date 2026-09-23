import assert from "node:assert/strict";
import test from "node:test";
import { createRatingGuide } from "./rating-guide.js";

const taskWith = (scoreBreakdown, values = {}, confirmedFields = []) => ({
  scoreBreakdown,
  confirmedFields,
  ...values,
});
const group = (label, fields, points, maxPoints) => ({ label, fields, points, maxPoints });
const labels = { context: "Контекст", need: "Проблема", data: "Данные", title: "Название" };

test("selects a fillable group with the largest available score gain", () => {
  const task = taskWith([
    group("Контекст", ["context"], 5, 10),
    group("Проблема", ["need"], 0, 30),
    group("Данные", ["data"], 0, 20),
  ]);

  const guide = createRatingGuide({ task, fields: { need: "", data: "" }, confirmedFields: [], labels });

  assert.equal(guide.state, "fill");
  assert.deepEqual(guide.target, { type: "field", key: "need" });
  assert.match(guide.text, /до \+30 баллов/);
  assert.deepEqual(guide.remaining, ["Проблема"]);
});

test("uses the server breakdown gain and includes every missing or unchecked field", () => {
  const task = taskWith([
    group("Измеримость", ["successCriteria", "data", "context"], 10, 25),
  ], { successCriteria: "Сократить ожидание", data: "Продажи за год", context: "Часы пик" }, ["successCriteria"]);
  const fields = { successCriteria: "Сократить ожидание", data: "Продажи за год", context: "Часы пик" };

  const guide = createRatingGuide({ task, fields, confirmedFields: ["successCriteria"], labels: { ...labels, successCriteria: "Критерий успеха" } });

  assert.equal(guide.state, "confirm");
  assert.deepEqual(guide.target, { type: "confirm", key: "data" });
  assert.match(guide.text, /до \+15 баллов/);
  assert.deepEqual(guide.remaining, ["Данные", "Контекст"]);
});

test("treats whitespace-only values as missing and lists missing plus unchecked fields", () => {
  const task = taskWith([group("Подготовка", ["context", "need", "data"], 0, 18)]);
  const guide = createRatingGuide({
    task,
    fields: { context: " \n\t", need: "Понятная проблема", data: "Данные" },
    confirmedFields: [],
    labels,
  });

  assert.equal(guide.state, "fill");
  assert.deepEqual(guide.target, { type: "field", key: "context" });
  assert.deepEqual(guide.remaining, ["Контекст", "Проблема", "Данные"]);
  assert.match(guide.text, /до \+18 баллов/);
});

test("offers save and server recalculation when a whole incomplete-score group is confirmed", () => {
  const task = taskWith([group("Результат", ["need", "data"], 8, 20)], {
    need: "Сократить ожидание",
    data: "История заказов",
  }, ["need", "data"]);

  const guide = createRatingGuide({
    task,
    fields: { need: "Сократить ожидание", data: "История заказов" },
    confirmedFields: ["need", "data"],
    labels,
  });

  assert.equal(guide.state, "save");
  assert.deepEqual(guide.target, { type: "save" });
  assert.match(guide.text, /до \+12 баллов/);
  assert.deepEqual(guide.remaining, ["Проблема", "Данные"]);
});

test("prioritizes a group ready for confirmation over a higher-value group that still needs filling", () => {
  const task = taskWith([
    group("Почти готово", ["context", "need"], 8, 12),
    group("Большой потенциал", ["data"], 0, 40),
  ], { context: "Часы пик", need: "Сократить ожидание", data: "" }, ["context"]);
  const guide = createRatingGuide({
    task,
    fields: { context: "Часы пик", need: "Сократить ожидание", data: "" },
    confirmedFields: ["context"],
    labels,
  });

  assert.equal(guide.state, "confirm");
  assert.deepEqual(guide.target, { type: "confirm", key: "need" });
  assert.match(guide.text, /до \+4 баллов/);
});

test("does not count a checked but empty field as confirmed or complete", () => {
  const task = taskWith([group("Проблема", ["need"], 0, 15)], { need: "" });
  const guide = createRatingGuide({ task, fields: { need: "" }, confirmedFields: ["need"], labels });

  assert.equal(guide.state, "fill");
  assert.deepEqual(guide.target, { type: "field", key: "need" });
  assert.deepEqual(guide.remaining, ["Проблема"]);
});
test("asks to save a changed field when its server group still shows 100 percent", () => {
  const task = taskWith([group("Проблема", ["need"], 20, 20)], { need: "Старая формулировка" }, ["need"]);
  const guide = createRatingGuide({
    task,
    fields: { need: "Новая формулировка" },
    confirmedFields: ["need"],
    labels,
  });

  assert.equal(guide.state, "stale");
  assert.deepEqual(guide.target, { type: "field", key: "need" });
  assert.match(guide.text, /прежнее значение/);
});

test("ignores changed non-scored metadata when all scored groups are complete", () => {
  const task = taskWith([group("Контекст", ["context"], 10, 10)], {
    context: "Часы пик",
    title: "Старое название",
  }, ["context"]);

  const guide = createRatingGuide({
    task,
    fields: { context: "Часы пик", title: "Новое название" },
    confirmedFields: ["context"],
    labels,
  });

  assert.equal(guide.state, "complete");
});

test("returns null if there is no server score breakdown", () => {
  assert.equal(createRatingGuide({ task: null, fields: {}, confirmedFields: [], labels }), null);
  assert.equal(createRatingGuide({ task: { score: 42 }, fields: {}, confirmedFields: [], labels }), null);
  assert.equal(createRatingGuide({ task: taskWith([]), fields: {}, confirmedFields: [], labels }), null);
});

test("does not mutate server task or caller field and confirmation collections", () => {
  const task = taskWith([group("Задача", ["context", "need"], 0, 30)], {
    context: "Контекст есть",
    need: "",
  }, ["context"]);
  const fields = { context: "Контекст есть", need: "" };
  const confirmedFields = ["context"];
  const taskBefore = structuredClone(task);
  const fieldsBefore = structuredClone(fields);
  const confirmedBefore = [...confirmedFields];

  createRatingGuide({ task, fields, confirmedFields, labels });

  assert.deepEqual(task, taskBefore);
  assert.deepEqual(fields, fieldsBefore);
  assert.deepEqual(confirmedFields, confirmedBefore);
});
