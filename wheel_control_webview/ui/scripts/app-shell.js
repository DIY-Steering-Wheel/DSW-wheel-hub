(function () {
  var app = {
    state: {
      snapshot: null,
      currentTab: "connection",
      pollHandle: null,
      apiWaitHandle: null,
      booted: false,
      apiReady: false,
      firmwareMatches: [],
      firmwareFilterState: {},
      staticData: {
        firmware_catalog: [],
        firmware_feature_options: []
      }
    },
    tabs: {}
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function hasApi() {
    return !!(window.pywebview && window.pywebview.api);
  }

  function text(value, fallback) {
    if (value === null || value === undefined || value === "") {
      return fallback || "-";
    }
    return String(value);
  }

  function setText(id, value, fallback) {
    var element = byId(id);
    if (!element) {
      return;
    }
    element.textContent = text(value, fallback);
  }

  function clearChildren(element) {
    while (element && element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function addClass(element, className) {
    if (element && element.classList) {
      element.classList.add(className);
    }
  }

  function removeClass(element, className) {
    if (element && element.classList) {
      element.classList.remove(className);
    }
  }

  function toggleHidden(element, hidden) {
    if (!element) {
      return;
    }
    if (hidden) {
      addClass(element, "is-hidden");
    } else {
      removeClass(element, "is-hidden");
    }
  }

  function idleSet(id, value) {
    var element = byId(id);
    if (!element || document.activeElement === element) {
      return;
    }
    element.value = value === null || value === undefined ? "" : value;
  }

  function percent(value) {
    var number = Number(value || 0);
    if (number < 0) {
      number = 0;
    }
    if (number > 100) {
      number = 100;
    }
    return number.toFixed(2).replace(".00", "") + "%";
  }

  function hex4(value) {
    var raw = Number(value || 0).toString(16).toUpperCase();
    while (raw.length < 4) {
      raw = "0" + raw;
    }
    return raw;
  }

  function boolText(value) {
    return value ? "Sim" : "Nao";
  }

  function appendOption(select, value, label, selected) {
    var option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = !!selected;
    select.appendChild(option);
  }

  function getModal(id) {
    if (!window.bootstrap) {
      return null;
    }
    return window.bootstrap.Modal.getOrCreateInstance(byId(id));
  }

  function setButtonState(id, enabled) {
    var button = byId(id);
    if (button) {
      button.disabled = !enabled;
    }
  }

  function renderPortSelect(id, ports, activePort) {
    var select = byId(id);
    var index;
    if (!select) {
      return;
    }
    clearChildren(select);
    if (!ports.length) {
      appendOption(select, "", "Nenhuma porta encontrada", true);
      return;
    }
    for (index = 0; index < ports.length; index += 1) {
      appendOption(
        select,
        ports[index].device,
        (ports[index].likely ? "* " : "") + ports[index].device + " - " + text(ports[index].description || ports[index].product, "porta serial"),
        ports[index].device === activePort
      );
    }
  }

  function renderPortSelects(snapshot) {
    renderPortSelect("connectionPortSelect", snapshot.ports, snapshot.connection.port);
    renderPortSelect("dockPortSelect", snapshot.ports, snapshot.connection.port);
  }

  function renderProfiles(snapshot) {
    var select = byId("dockProfileSelect");
    var index;
    if (!select) {
      return;
    }
    clearChildren(select);
    appendOption(select, "", "Perfis", true);
    for (index = 0; index < snapshot.profiles.length; index += 1) {
      appendOption(
        select,
        snapshot.profiles[index].file,
        snapshot.profiles[index].name + (snapshot.profiles[index].firmware ? " - " + snapshot.profiles[index].firmware : ""),
        false
      );
    }
  }

  function hasSelectedProfile() {
    var select = byId("dockProfileSelect");
    return !!(select && select.value);
  }

  function syncPortSelects(sourceId, targetId) {
    var source = byId(sourceId);
    var target = byId(targetId);
    if (source && target) {
      target.value = source.value;
    }
  }

  function feedback(message, kind) {
    var serialPanel = byId("serialFeedback");
    var connectionHint = byId("connectionHint");
    var statusBadge = byId("dockStatus");

    if (serialPanel) {
      serialPanel.className = "note-panel";
      if (kind === "success") {
        addClass(serialPanel, "success");
      }
      if (kind === "error") {
        addClass(serialPanel, "error");
      }
      serialPanel.textContent = message || "";
    }

    if (connectionHint && app.state.currentTab === "connection" && message) {
      connectionHint.textContent = message;
    }

    if (statusBadge && message) {
      statusBadge.title = message;
    }
  }

  function callApi(method, args) {
    args = args || [];
    if (!hasApi()) {
      feedback("Backend serial ainda nao ficou pronto no WebView.", "error");
      return {
        then: function (resolve) {
          resolve({ ok: false, message: "api-unavailable" });
        }
      };
    }
    try {
      return window.pywebview.api[method].apply(window.pywebview.api, args).then(
        function (result) {
          if (result && result.data) {
            app.render(result.data);
          }
          if (result && result.message) {
            feedback(result.message, result.ok ? "success" : "error");
          }
          return result;
        },
        function (error) {
          feedback(String(error), "error");
          return { ok: false, message: String(error) };
        }
      );
    } catch (error) {
      feedback(String(error), "error");
      return {
        then: function (resolve) {
          resolve({ ok: false, message: String(error) });
        }
      };
    }
  }

  function buildCurrentProfileJson(snapshot, name) {
    return JSON.stringify(
      {
        schema_version: 1,
        name: name || "",
        created_at: "",
        firmware_version: snapshot.firmware.version,
        firmware_flags: snapshot.firmware.flags,
        settings: snapshot.settings,
        shifter: snapshot.shifter,
        manual_calibration: snapshot.manual_calibration
      },
      null,
      2
    );
  }

  function renderSummary(snapshot) {
    var dockStatus = byId("dockStatus");
    setText("sidebarFirmware", text(snapshot.firmware.version, "-"), "-");
    setText("sidebarBoard", text(snapshot.capabilities.board_family, "-"), "-");
    setText("sidebarStatus", snapshot.connected ? "Online" : "Offline", "");
    setText("dockTx", percent(snapshot.serial_stats.tx_usage_percent), "");
    setText("dockRx", percent(snapshot.serial_stats.rx_usage_percent), "");
    setText("dockCmd", text(snapshot.serial_stats.commands_total, "0"), "0");
    setText("dockStatus", snapshot.connected ? "Online" : "Offline", "");

    if (dockStatus) {
      dockStatus.className = "badge";
      addClass(dockStatus, snapshot.connected ? "text-bg-success" : "text-bg-secondary");
    }
  }

  function activateTab(tabName) {
    var buttons = document.querySelectorAll(".nav-tab");
    var pages = document.querySelectorAll(".tab-page");
    var index;

    for (index = 0; index < buttons.length; index += 1) {
      removeClass(buttons[index], "active");
      if (buttons[index].getAttribute("data-tab") === tabName) {
        addClass(buttons[index], "active");
      }
    }

    for (index = 0; index < pages.length; index += 1) {
      removeClass(pages[index], "active");
      if (pages[index].id === "tab-" + tabName) {
        addClass(pages[index], "active");
      }
    }

    app.state.currentTab = tabName;
  }

  function bindTabs() {
    var buttons = document.querySelectorAll(".nav-tab");
    var index;
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].onclick = function () {
        if (!this.disabled) {
          activateTab(this.getAttribute("data-tab"));
        }
      };
    }
  }

  function lockTabs(snapshot) {
    var buttons = document.querySelectorAll(".nav-tab");
    var index;
    for (index = 0; index < buttons.length; index += 1) {
      var tabName = buttons[index].getAttribute("data-tab");
      var enabled = tabName === "connection" || tabName === "about";
      if (snapshot.connected) {
        enabled = true;
      }
      if (tabName === "shifter") {
        enabled = snapshot.connected && snapshot.shifter.available;
      }
      buttons[index].disabled = !enabled;
      if (enabled) {
        removeClass(buttons[index], "is-locked");
      } else {
        addClass(buttons[index], "is-locked");
      }
    }

    toggleHidden(document.querySelector('.nav-tab[data-tab="shifter"]'), !snapshot.shifter.available);

    if (!snapshot.connected && app.state.currentTab !== "connection" && app.state.currentTab !== "about") {
      activateTab("connection");
    }
    if (!snapshot.shifter.available && app.state.currentTab === "shifter") {
      activateTab("about");
    }
  }

  function renderFooterLocks(snapshot) {
    setButtonState("dockConnect", !!byId("dockPortSelect").value);
    setButtonState("dockDisconnect", snapshot.connected);
    setButtonState("dockProfileSave", snapshot.connected);
    setButtonState("dockProfileEdit", hasSelectedProfile());
    setButtonState("dockLoadProfile", snapshot.connected && hasSelectedProfile());
    setButtonState("dockDeleteProfile", hasSelectedProfile());
  }

  function renderFirmwareFeatureFilters(snapshot) {
    var wrap = byId("firmwareFeatureFilters");
    var options = app.state.staticData.firmware_feature_options || [];
    var index;
    if (!wrap) {
      return;
    }

    if (!wrap.getAttribute("data-built")) {
      clearChildren(wrap);
      for (index = 0; index < options.length; index += 1) {
        var item = document.createElement("label");
        var checkbox = document.createElement("input");
        var span = document.createElement("span");
        item.className = "form-check filter-chip";
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input firmware-filter";
        checkbox.value = options[index].flag;
        checkbox.checked = !!app.state.firmwareFilterState[options[index].flag];
        span.className = "form-check-label";
        span.textContent = options[index].title;
        item.appendChild(checkbox);
        item.appendChild(span);
        wrap.appendChild(item);
      }
      wrap.setAttribute("data-built", "1");
    }
  }

  function selectedFirmwareFilters() {
    var inputs = document.querySelectorAll(".firmware-filter");
    var flags = [];
    var index;
    for (index = 0; index < inputs.length; index += 1) {
      app.state.firmwareFilterState[inputs[index].value] = inputs[index].checked;
      if (inputs[index].checked) {
        flags.push(inputs[index].value);
      }
    }
    return flags;
  }

  function currentFirmwarePool(snapshot) {
    if (app.state.firmwareMatches.length) {
      return app.state.firmwareMatches;
    }
    return app.state.staticData.firmware_catalog || [];
  }

  function renderFirmwareSelect(snapshot, preferredName) {
    var select = byId("firmwareSelect");
    var pool = currentFirmwarePool(snapshot);
    var selected = preferredName || (select ? select.value : "");
    var index;
    if (!select) {
      return;
    }

    clearChildren(select);
    if (!pool.length) {
      appendOption(select, "", "Nenhum firmware encontrado", true);
      renderFirmwareDescription(snapshot, null);
      return;
    }

    for (index = 0; index < pool.length; index += 1) {
      appendOption(select, pool[index].name, pool[index].code + " - " + pool[index].folder, pool[index].name === selected || (!selected && index === 0));
    }

    renderFirmwareDescription(snapshot, findFirmwareRecord(select.value, snapshot) || pool[0]);
  }

  function findFirmwareRecord(name, snapshot) {
    var pool = currentFirmwarePool(snapshot);
    var index;
    for (index = 0; index < pool.length; index += 1) {
      if (pool[index].name === name) {
        return pool[index];
      }
    }
    return null;
  }

  function renderFirmwareDescription(snapshot, record) {
    var panel = byId("firmwareDescription");
    var log = byId("firmwareFlashLog");
    if (!panel) {
      return;
    }
    if (!record) {
      panel.textContent = "Escolha um firmware para ver os recursos.";
    } else {
      panel.textContent =
        (record.description_pt || record.description_en || "Sem descricao.") +
        (record.minimum_app_version ? " Requer wheel control " + record.minimum_app_version + " ou mais novo." : "");
    }
    setText("firmwareBootloaderPort", text(snapshot.flash_state.bootloader_port, "Sem porta"), "Sem porta");
    if (log) {
      log.value = text(snapshot.flash_state.last_log, "");
    }
    setButtonState("firmwareProgram", !!(record && snapshot.flash_state.bootloader_port) && !snapshot.flash_state.busy);
  }

  function openProfileCreateModal() {
    var snapshot = app.state.snapshot;
    if (!snapshot) {
      return;
    }
    byId("profileModalFile").value = "";
    byId("profileModalName").value = "perfil-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    byId("profileModalJson").value = buildCurrentProfileJson(snapshot, byId("profileModalName").value);
    getModal("profileModal").show();
  }

  function openProfileEditModal() {
    if (!hasSelectedProfile()) {
      return;
    }
    callApi("get_profile_detail", [byId("dockProfileSelect").value]).then(function (result) {
      if (!result || !result.ok || !result.profile) {
        return;
      }
      byId("profileModalFile").value = result.profile.file;
      byId("profileModalName").value = result.profile.name;
      byId("profileModalJson").value = result.profile.json_text;
      getModal("profileModal").show();
    });
  }

  function bindProfileModal() {
    byId("profileModalSave").onclick = function () {
      callApi("upsert_profile", [
        byId("profileModalFile").value,
        byId("profileModalName").value,
        byId("profileModalJson").value
      ]).then(function (result) {
        if (result && result.ok) {
          getModal("profileModal").hide();
        }
      });
    };
  }

  function bindFirmwareModal() {
    byId("firmwareFindBest").onclick = function () {
      callApi("recommend_firmwares", [selectedFirmwareFilters()]).then(function (result) {
        app.state.firmwareMatches = result && result.matches ? result.matches : [];
        renderFirmwareSelect(app.state.snapshot || {}, result && result.best ? result.best.name : "");
      });
    };

    byId("firmwareCaptureBaseline").onclick = function () {
      callApi("capture_bootloader_baseline");
    };

    byId("firmwareDetectBootloader").onclick = function () {
      callApi("detect_bootloader_port");
    };

    byId("firmwareProgram").onclick = function () {
      callApi("flash_firmware", [
        byId("firmwareSelect").value,
        text(app.state.snapshot.flash_state.bootloader_port, "")
      ]);
    };

    byId("firmwareSelect").onchange = function () {
      renderFirmwareDescription(app.state.snapshot || {}, findFirmwareRecord(this.value, app.state.snapshot || {}));
    };
  }

  function bindDock() {
    byId("dockRefreshPorts").onclick = function () {
      callApi("refresh_ports");
    };

    byId("dockConnect").onclick = function () {
      callApi("connect", [byId("dockPortSelect").value]).then(function (result) {
        if (result && result.ok) {
          activateTab("wheel");
        }
      });
    };

    byId("dockDisconnect").onclick = function () {
      callApi("disconnect").then(function () {
        activateTab("connection");
      });
    };

    byId("dockProfileSave").onclick = openProfileCreateModal;
    byId("dockProfileEdit").onclick = openProfileEditModal;

    byId("dockLoadProfile").onclick = function () {
      if (hasSelectedProfile()) {
        callApi("apply_profile", [byId("dockProfileSelect").value]);
      }
    };

    byId("dockDeleteProfile").onclick = function () {
      if (hasSelectedProfile()) {
        callApi("delete_profile", [byId("dockProfileSelect").value]);
      }
    };

    byId("dockPortSelect").onchange = function () {
      syncPortSelects("dockPortSelect", "connectionPortSelect");
      renderFooterLocks(app.state.snapshot || { connected: false });
    };

    byId("dockProfileSelect").onchange = function () {
      renderFooterLocks(app.state.snapshot || { connected: false });
    };
  }

  function registerTab(name, module) {
    app.tabs[name] = module;
  }

  function render(snapshot) {
    var tabName;
    app.state.snapshot = snapshot;
    renderPortSelects(snapshot);
    renderProfiles(snapshot);
    renderSummary(snapshot);
    lockTabs(snapshot);
    renderFooterLocks(snapshot);
    renderFirmwareFeatureFilters(snapshot);
    renderFirmwareSelect(snapshot, "");
    renderFirmwareDescription(snapshot, findFirmwareRecord(byId("firmwareSelect").value, snapshot));

    for (tabName in app.tabs) {
      if (app.tabs.hasOwnProperty(tabName) && app.tabs[tabName].render) {
        app.tabs[tabName].render(snapshot, app);
      }
    }
  }

  function hydrateFromApi() {
    if (!hasApi()) {
      return;
    }

    window.pywebview.api.get_static_data().then(function (staticData) {
      app.state.staticData = staticData || app.state.staticData;
      return window.pywebview.api.get_snapshot();
    }).then(function (snapshot) {
      app.state.apiReady = true;
      render(snapshot);
      return callApi("refresh_ports");
    }).then(function () {
      if (app.state.pollHandle) {
        return;
      }
      app.state.pollHandle = window.setInterval(function () {
        if (!hasApi()) {
          return;
        }
        window.pywebview.api.get_snapshot().then(
          function (snapshot) {
            render(snapshot);
          },
          function (error) {
            feedback(String(error), "error");
          }
        );
      }, 800);
    });
  }

  function waitForApi() {
    if (app.state.apiReady || app.state.apiWaitHandle) {
      return;
    }
    if (hasApi()) {
      hydrateFromApi();
      return;
    }
    app.state.apiWaitHandle = window.setInterval(function () {
      if (!hasApi()) {
        return;
      }
      window.clearInterval(app.state.apiWaitHandle);
      app.state.apiWaitHandle = null;
      hydrateFromApi();
    }, 250);
  }

  function bootstrap() {
    var tabName;
    if (app.state.booted) {
      waitForApi();
      return;
    }
    app.state.booted = true;

    bindTabs();
    bindDock();
    bindProfileModal();
    bindFirmwareModal();

    for (tabName in app.tabs) {
      if (app.tabs.hasOwnProperty(tabName) && app.tabs[tabName].bind) {
        app.tabs[tabName].bind(app);
      }
    }
    waitForApi();
  }

  app.byId = byId;
  app.text = text;
  app.setText = setText;
  app.clearChildren = clearChildren;
  app.idleSet = idleSet;
  app.percent = percent;
  app.hex4 = hex4;
  app.boolText = boolText;
  app.callApi = callApi;
  app.feedback = feedback;
  app.registerTab = registerTab;
  app.activateTab = activateTab;
  app.render = render;
  app.toggleHidden = toggleHidden;
  app.getModal = getModal;
  app.state = app.state;

  window.BRWheelApp = app;
  if (document.readyState === "complete" || document.readyState === "interactive") {
    bootstrap();
  } else {
    window.addEventListener("DOMContentLoaded", bootstrap);
  }
  window.addEventListener("load", bootstrap);
  window.addEventListener("pywebviewready", bootstrap);
}());
