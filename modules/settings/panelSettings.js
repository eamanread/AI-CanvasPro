function getSettingsPanelElements() {
  return {
    settingsOverlay: document.getElementById("settingsOverlay"),
    avatarMenu: document.getElementById("avatarMenu"),
  };
}

function isSettingsPanelOpen(settingsOverlay) {
  return !!settingsOverlay && settingsOverlay.style.display === "block";
}

export function openSettingsPanel() {
  const { settingsOverlay, avatarMenu } = getSettingsPanelElements();
  if (!settingsOverlay) return false;

  settingsOverlay.style.display = "block";
  avatarMenu?.classList.remove("open");
  return true;
}

export function closeSettingsPanel() {
  const { settingsOverlay } = getSettingsPanelElements();
  if (!settingsOverlay) return false;

  settingsOverlay.style.display = "none";
  return true;
}

export function toggleSettingsPanel() {
  const { settingsOverlay } = getSettingsPanelElements();
  if (!settingsOverlay) return false;

  return isSettingsPanelOpen(settingsOverlay)
    ? closeSettingsPanel()
    : openSettingsPanel();
}

export function initSettingsPanelEvents() {
  const btnOpenSettings = document.getElementById("btnOpenSettings");
  const btnSettingsClose = document.getElementById("btnSettingsClose");
  const settingsOverlay = document.getElementById("settingsOverlay");
  const userAvatar = document.getElementById("userAvatar");

  if (!settingsOverlay) return;

  btnOpenSettings?.addEventListener("click", event => {
    event.stopPropagation();
    openSettingsPanel();
  });

  userAvatar?.addEventListener("click", event => {
    event.stopPropagation();
    openSettingsPanel();
  });

  btnSettingsClose?.addEventListener("click", () => {
    closeSettingsPanel();
  });

  settingsOverlay.addEventListener("click", event => {
    if (event.target === settingsOverlay) closeSettingsPanel();
  });

  const navItems = document.querySelectorAll(".settings-nav-item");
  const panes = document.querySelectorAll(".settings-pane");

  navItems.forEach(navItem => {
    navItem.addEventListener("click", () => {
      navItems.forEach(item => item.classList.remove("active"));
      panes.forEach(pane => pane.classList.remove("active"));

      navItem.classList.add("active");
      const pane = document.getElementById(`pane-${navItem.dataset.pane}`);
      pane?.classList.add("active");
    });
  });
}
