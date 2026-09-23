import assert from "node:assert/strict";
import test from "node:test";

// Small DOM double for event/data-flow regressions; this is not browser layout QA.
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.disabled = false;
    this.value = "";
    this.classList = { toggle() {} };
    this.resetCount = 0;
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) {
    this.children = nodes;
    if (this.tag === "select") this.value = nodes[0]?.value || "";
  }
  get textContent() { return (this.text || "") + this.children.map((node) => node.textContent).join(""); }
  set textContent(value) { this.text = String(value); this.children = []; }
  querySelectorAll(selector) {
    const matches = (node) => selector.startsWith("[")
      ? Object.hasOwn(node.attributes, selector.slice(1, -1))
      : node.tag === selector;
    return this.children.flatMap((node) => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  async dispatch(type) {
    const event = { currentTarget: this, preventDefault() {} };
    const pending = (this.listeners[type] || []).map((handler) => handler(event));
    // A native dispatched event loses currentTarget before async continuations.
    event.currentTarget = null;
    await Promise.all(pending);
  }
  reset() {
    this.resetCount++;
    for (const input of controls(this)) input.value = input.tag === "select" ? input.children[0]?.value || "" : "";
  }
  set innerHTML(markup) {
    const fragment = new Node("fragment");
    const stack = [fragment];
    for (const token of markup.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith("</")) { stack.pop(); continue; }
      if (!token.startsWith("<")) { stack.at(-1).text = (stack.at(-1).text || "") + token; continue; }
      const node = new Node(token.match(/^<(\w+)/)[1]);
      for (const match of token.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        node.attributes[match[1]] = match[2] || "";
      }
      node.value = node.attributes.value || "";
      stack.at(-1).append(node);
      if (!["input", "br"].includes(node.tag)) stack.push(node);
    }
    this.content = { firstElementChild: fragment.children[0] };
  }
}
function controls(form) {
  return ["input", "select", "textarea"].flatMap((tag) => form.querySelectorAll(tag));
}
function fill(form, values) {
  for (const input of controls(form)) {
    if (Object.hasOwn(values, input.attributes.name)) input.value = values[input.attributes.name];
  }
}
globalThis.document = { createElement: (tag) => new Node(tag) };
// The shared HTTP client reports reachability through a browser event.
// Keep this small double compatible with that browser contract as well.
globalThis.window = {
  API_BASE: "http://test.invalid/api",
  location: { hostname: "test.invalid", protocol: "http:" },
  dispatchEvent() { return true; },
};
globalThis.FormData = class {
  constructor(form) { this.entries = controls(form).map((node) => [node.attributes.name, node.value]); }
  [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
};
globalThis.Option = class extends Node {
  constructor(label, value) { super("option"); this.textContent = label; this.value = value; }
};
const { createCatalogScreen, createTeamsScreen, createProposalScreen, createProposalReviewScreen, createMilestoneScreen } = await import("./marketplace.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const list = (screen) => screen.querySelector("[data-list]");
const status = (screen) => screen.querySelector("[data-status]").textContent;
const button = (root, label) => root.querySelectorAll("button").find((node) => node.textContent === label);
const task = { taskId: "task-1", fields: { title: "Demo" } };
const team = { id: "team-1", name: "Team", interests: ["UX"], skills: ["JS"], technologies: [], progressPoints: 0 };
const secondTeam = { ...team, id: "team-2", name: "Second team" };
const selectedProposals = [team, secondTeam].map((item) => ({ teamId: item.id, team: item, status: "selected" }));
function mockApi(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const request = { url: new URL(url), method: options.method || "GET", body: options.body === undefined ? undefined : JSON.parse(options.body) };
    calls.push(request);
    const result = await handler(request);
    return { ok: !result?.error, status: result?.error ? 409 : 200, text: async () => JSON.stringify(result?.error ? { detail: result.error } : result) };
  };
  return calls;
}

function mockMilestones({ proposals = selectedProposals, milestones = [], awarded = true } = {}) {
  return mockApi(({ url, method, body }) => {
    if (url.pathname.endsWith("/proposals")) return proposals;
    if (url.pathname.endsWith("/confirm")) {
      const milestone = milestones.find((item) => url.pathname === `/api/milestones/${item.id}/confirm`);
      assert.ok(milestone, "confirmation must target an existing milestone");
      Object.assign(milestone, { confirmedAt: "2026-09-23", pointsAwarded: 10 });
      return { awarded, milestone };
    }
    if (method === "POST") {
      const selected = proposals.find((item) => item.teamId === body.teamId && item.status === "selected");
      assert.ok(selected, "milestone must target a selected team");
      const milestone = { ...body, id: `stage-${milestones.length + 1}`, team: selected.team, confirmedAt: null };
      milestones.push(milestone);
      return milestone;
    }
    return milestones;
  });
}

test("team creation sends an object body, resets after await and invokes callback", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let created;
  const calls = mockApi(async ({ method }) => method === "POST" ? pending : []);
  const root = createTeamsScreen({ onCreated: async (value) => { created = value; } });
  await tick();
  const form = root.querySelector("form");
  fill(form, { name: "Team", interests: "UX, data", skills: " JS, ", technologies: "" });
  const submitting = form.dispatch("submit");
  assert.equal(form.querySelector("button").disabled, true);
  await form.dispatch("submit");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  release(team);
  await submitting;
  assert.deepEqual(calls.find((call) => call.method === "POST").body, { name: "Team", interests: ["UX", "data"], skills: ["JS"], technologies: [] });
  assert.equal(form.resetCount, 1);
  assert.deepEqual(created, team);
  assert.equal(form.querySelector("button").disabled, false);
  assert.match(status(root), /создан/);
});

test("all readiness levels omit empty filter and low-score tasks stay visible", async () => {
  const calls = mockApi(() => [{ ...task, score: 0, readiness: "draft" }]);
  const root = createCatalogScreen();
  await tick();
  const form = root.querySelector("form");
  fill(form, { topic: "кафе", readiness: "ready" });
  await form.dispatch("submit");
  assert.equal(calls.at(-1).url.searchParams.get("readiness"), "ready");
  fill(form, { topic: "  ", readiness: "" });
  await form.dispatch("submit");
  assert.equal(calls.at(-1).url.searchParams.has("readiness"), false);
  assert.equal(calls.at(-1).url.searchParams.has("topic"), false);
  assert.match(list(root).textContent, /0\/100/);
});

test("proposal preselects the requested team and submits its task and fields before callback", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let submitted;
  const calls = mockApi(({ method }) => method === "POST" ? pending : [team, secondTeam]);
  const root = createProposalScreen(task, { teamId: secondTeam.id, onSubmitted: (value) => { submitted = value; } });
  await tick();
  const form = root.querySelector("form");
  assert.equal(form.querySelector("select").value, secondTeam.id);
  const fields = { idea: "A useful prototype", plan: "Build and validate", deadline: "2 weeks", prototypeUrl: "https://example.test/demo" };
  fill(form, fields);
  const submitting = form.dispatch("submit");
  const post = calls.find((call) => call.method === "POST");
  assert.equal(post.url.pathname, "/api/proposals");
  assert.deepEqual(post.body, { ...fields, taskId: task.taskId, teamId: secondTeam.id });
  assert.equal(submitted, undefined);
  const proposal = { ...post.body, id: "proposal-2", status: "pending" };
  release(proposal);
  await submitting;
  assert.deepEqual(submitted, proposal);
  assert.equal(form.resetCount, 1);
  assert.match(status(root), /Предложение отправлено/);
});

test("manual choice reloads status; failed rejection preserves selection and allows retry", async () => {
  let decision = "pending";
  let fail = false;
  let changed = 0;
  const calls = mockApi(({ method, body }) => {
    if (method === "PATCH") {
      if (fail) return { error: "Решение не сохранено" };
      decision = body.status;
      return { status: decision };
    }
    return [{ id: "proposal-1", teamId: team.id, team, idea: "Idea", plan: "Plan", deadline: "2 weeks", status: decision }];
  });
  const root = createProposalReviewScreen(task, { onChanged: () => { changed++; } });
  await tick();
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 0);
  await button(root, "Выбрать").dispatch("click");
  assert.equal(changed, 1);
  assert.equal(button(root, "Выбрать").disabled, true);
  assert.match(list(root).textContent, /Выбрана/);
  fail = true;
  await button(root, "Отклонить").dispatch("click");
  assert.equal(changed, 1);
  assert.match(status(root), /Решение не сохранено/);
  assert.equal(button(root, "Выбрать").disabled, true);
  assert.equal(button(root, "Отклонить").disabled, false);
  fail = false;
  await button(root, "Отклонить").dispatch("click");
  assert.match(list(root).textContent, /Отклонена/);
  assert.equal(changed, 2);
});

test("persisted milestones reload, confirmation cannot repeat and a new stage can be added", async () => {
  const milestones = [{ id: "stage-1", teamId: team.id, team, description: "First stage", evidence: "Demo", confirmedAt: null }];
  const calls = mockApi(({ url, method, body }) => {
    if (url.pathname.endsWith("/proposals")) return [{ teamId: team.id, team, status: "selected" }];
    if (url.pathname.endsWith("/confirm")) {
      milestones[0] = { ...milestones[0], confirmedAt: "2026-09-23", pointsAwarded: 10 };
      return { awarded: true, milestone: milestones[0] };
    }
    if (method === "POST") {
      const milestone = { ...body, id: "stage-2", team, confirmedAt: null };
      milestones.push(milestone);
      return milestone;
    }
    return milestones;
  });
  const root = createMilestoneScreen(task);
  await tick();
  assert.match(list(root).textContent, /First stage/);
  const confirm = button(root, "Подтвердить и начислить +10");
  await Promise.all([confirm.dispatch("click"), confirm.dispatch("click")]);
  assert.equal(calls.filter((call) => call.url.pathname.endsWith("/confirm")).length, 1);
  assert.equal(button(root, "Подтвердить и начислить +10"), undefined);
  const reloaded = createMilestoneScreen(task);
  await tick();
  assert.match(list(reloaded).textContent, /Подтверждён · \+10/);
  assert.equal(button(reloaded, "Подтвердить и начислить +10"), undefined);
  const form = reloaded.querySelector("form");
  fill(form, { teamId: team.id, description: "Second stage", evidence: "New demo" });
  await form.dispatch("submit");
  assert.equal(form.resetCount, 1);
  assert.equal(list(reloaded).children.length, 2);
  assert.match(list(reloaded).textContent, /Second stage/);
  assert.equal(reloaded.querySelectorAll("button").filter((node) => node.textContent === "Подтвердить и начислить +10").length, 1);
});

test("milestones preselect the requested second selected team", async () => {
  mockMilestones();
  const root = createMilestoneScreen(task, { teamId: secondTeam.id });
  await tick();
  const select = root.querySelector("select");
  assert.deepEqual(select.children.map((option) => option.value), [team.id, secondTeam.id]);
  assert.equal(select.value, secondTeam.id);
});

test("milestone creation preserves the submitted second team after form reset", async () => {
  let created;
  const calls = mockMilestones();
  const root = createMilestoneScreen(task, { onCreated: (value) => { created = value; } });
  await tick();
  const form = root.querySelector("form");
  fill(form, { teamId: secondTeam.id, description: "Second team stage", evidence: "Working demo" });
  await form.dispatch("submit");
  assert.deepEqual(calls.find((call) => call.method === "POST").body, {
    taskId: task.taskId, teamId: secondTeam.id, description: "Second team stage", evidence: "Working demo",
  });
  assert.equal(form.resetCount, 1);
  assert.equal(form.querySelector("select").value, secondTeam.id);
  assert.equal(created.teamId, secondTeam.id);
  assert.match(list(root).textContent, /Second team stage/);
});

test("manual milestone team choice survives confirmation and creation without reverting to the incoming team", async () => {
  const milestones = [{ id: "stage-1", teamId: team.id, team, description: "Existing stage", evidence: "Demo", confirmedAt: null }];
  const calls = mockMilestones({ milestones });
  const root = createMilestoneScreen(task, { teamId: secondTeam.id });
  await tick();
  const form = root.querySelector("form");
  fill(form, { teamId: team.id });
  await form.querySelector("select").dispatch("change");
  await button(root, "Подтвердить и начислить +10").dispatch("click");
  assert.equal(form.querySelector("select").value, team.id);
  fill(form, { description: "Manually selected team stage", evidence: "New demo" });
  await form.dispatch("submit");
  assert.equal(calls.find((call) => call.url.pathname === "/api/milestones" && call.method === "POST").body.teamId, team.id);
  assert.equal(form.querySelector("select").value, team.id);
});

test("unavailable incoming milestone teams fall back to an eligible selected team", async () => {
  const rejectedTeam = { ...team, id: "rejected-team", name: "Rejected team" };
  for (const teamId of [rejectedTeam.id, "missing-team"]) {
    mockMilestones({ proposals: [...selectedProposals, { teamId: rejectedTeam.id, team: rejectedTeam, status: "rejected" }] });
    const root = createMilestoneScreen(task, { teamId });
    await tick();
    const select = root.querySelector("select");
    assert.equal(select.value, team.id);
    assert.deepEqual(select.children.map((option) => option.value), [team.id, secondTeam.id]);
  }
});

test("milestones without selected proposals leave the team empty instead of using a rejected team", async () => {
  const calls = mockMilestones({ proposals: [
    { teamId: team.id, team, status: "rejected" },
    { teamId: secondTeam.id, team: secondTeam, status: "pending" },
  ] });
  const root = createMilestoneScreen(task, { teamId: team.id });
  await tick();
  const select = root.querySelector("select");
  assert.equal(select.value, "");
  assert.equal(select.children.length, 0);
  assert.match(status(root), /Сначала выберите команду/);
  assert.equal(calls.filter((call) => call.method === "POST").length, 0);
});

test("an already confirmed milestone reports no new points when awarded is false", async () => {
  const milestones = [{ id: "stage-1", teamId: team.id, team, description: "Existing stage", evidence: "Demo", confirmedAt: null }];
  let confirmed;
  const calls = mockMilestones({ milestones, awarded: false });
  const root = createMilestoneScreen(task, { onConfirmed: (value) => { confirmed = value; } });
  await tick();
  await button(root, "Подтвердить и начислить +10").dispatch("click");
  assert.equal(calls.filter((call) => call.url.pathname.endsWith("/confirm")).length, 1);
  assert.match(status(root), /уже подтверждён.*Повторных баллов нет/);
  assert.doesNotMatch(status(root), /\+10/);
  assert.deepEqual(confirmed, milestones[0]);
  assert.equal(button(root, "Подтвердить и начислить +10"), undefined);
});
