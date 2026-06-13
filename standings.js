const standingsTabs = document.querySelectorAll("[data-standings-tab]");
const standingsPanels = document.querySelectorAll(".standings__panel");

standingsTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = `${tab.dataset.standingsTab}-standings`;

    standingsTabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
    });

    standingsPanels.forEach((panel) => {
      const active = panel.id === target;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  });
});
