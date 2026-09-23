import { request } from "../shared/api.js";
import { createCatalogScreen, createTeamsScreen, createProposalScreen, createProposalReviewScreen, createMilestoneScreen } from "./marketplace.js";

const role = document.querySelector("#role");
const team = document.querySelector("#team");
const task = document.querySelector("#task");
const message = document.querySelector("#message");
let tasks = [];
let page = "catalog";
async function refresh() {
  const [catalog, teams] = await Promise.all([request("/catalog"), request("/teams")]);
  tasks = catalog;
  for (const [select, values, id, name] of [[task, catalog, "taskId", (item) => item.fields.title || item.fields.topic || "Задача"], [team, teams, "id", (item) => item.name]]) {
    const previous = select.value || sessionStorage.getItem(`marketplace-${select.id}`);
    select.replaceChildren(...values.map((item) => new Option(name(item), item[id])));
    if (values.some((item) => item[id] === previous)) select.value = previous;
  }
}
function render(next = page) {
  page = next; message.textContent = "";
  const selected = tasks.find((item) => item.taskId === task.value);
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.hidden = (role.value === "team" && ["review", "milestones"].includes(button.dataset.page)) || (role.value === "business" && button.dataset.page === "proposal");
    button.setAttribute("aria-current", button.dataset.page === page ? "page" : "false");
  });
  let view;
  if (page === "catalog") view = createCatalogScreen({ onOpenTask: (item) => { task.value = item.taskId; sessionStorage.setItem("marketplace-task", item.taskId); render(role.value === "team" ? "proposal" : "review"); } });
  else if (page === "teams") view = createTeamsScreen({ onCreated: async (item) => { await refresh(); team.value = item.id; sessionStorage.setItem("marketplace-team", item.id); } });
  else if (!selected) { message.textContent = "Сначала опубликуйте задачу на основном экране или загрузите демоданные."; view = document.createElement("p"); }
  else if (page === "proposal") view = createProposalScreen(selected, { teamId: team.value });
  else if (page === "review") view = createProposalReviewScreen(selected);
  else view = createMilestoneScreen(selected, { teamId: team.value, onConfirmed: () => refresh().catch((error) => { message.textContent = error.message; }) });
  document.querySelector("#screen").replaceChildren(view);
}
document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => render(button.dataset.page)));
role.value = sessionStorage.getItem("marketplace-role") || "team";
role.addEventListener("change", () => { sessionStorage.setItem("marketplace-role", role.value); render("catalog"); });
for (const select of [task, team]) select.addEventListener("change", () => { sessionStorage.setItem(`marketplace-${select.id}`, select.value); render(); });
refresh().then(() => render()).catch((error) => { message.textContent = error.message; });
