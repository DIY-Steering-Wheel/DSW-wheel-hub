(function () {
  var app = {
    state: {
      snapshot: null,
      currentTab: "connection",
      pollHandle: null,
      apiWaitHandle: null,
      booted: false,
      apiReady: false,
      profileSelection: "",
      firmwareUiStep: 1,
      firmwareMatches: [],
      firmwareSearch: null,
      firmwareFilterState: {},
      staticData: {
        firmware_catalog: [],
        firmware_feature_options: [],
        output_frequency_options: []
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

  function idleCheck(id, value) {
    var element = byId(id);
    if (!element || document.activeElement === element) {
      return;
    }
    element.checked = !!value;
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
    var currentValue = select ? select.value : "";
    var selectedValue = activePort || currentValue;
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
        ports[index].device === selectedValue
      );
    }

    if (!select.value && ports.length) {
      select.value = selectedValue || ports[0].device;
    }
  }

  function renderPortSelects(snapshot) {
    renderPortSelect("connectionPortSelect", snapshot.ports, snapshot.connection.port);
    renderPortSelect("dockPortSelect", snapshot.ports, snapshot.connection.port);
  }

  function renderProfiles(snapshot) {
    var select = byId("dockProfileSelect");
    var current = app.state.profileSelection || (select ? select.value : "");
    var exists = false;
    var index;
    if (!select) {
      return;
    }

    clearChildren(select);
    appendOption(select, "", "Perfis salvos", !current);
    for (index = 0; index < snapshot.profiles.length; index += 1) {
      appendOption(
        select,
        snapshot.profiles[index].file,
        snapshot.profiles[index].name + (snapshot.profiles[index].firmware ? " - " + snapshot.profiles[index].firmware : ""),
        snapshot.profiles[index].file === current
      );
      if (snapshot.profiles[index].file === current) {
        exists = true;
      }
    }

    if (!exists) {
      current = "";
      select.value = "";
    }
    app.state.profileSelection = current;
  }

  function renderPortsPreview(ports) {
    var wrap = byId("firmwarePortsPreview");
    var index;
    if (!wrap) {
      return;
    }

    clearChildren(wrap);
    if (!ports || !ports.length) {
      wrap.textContent = "Nenhuma porta listada.";
      return;
    }

    for (index = 0; index < ports.length; index += 1) {
      var item = document.createElement("div");
      var strong = document.createElement("strong");
      var small = document.createElement("small");
      item.className = "port-preview-item" + (ports[index].likely ? " likely" : "");
      strong.textContent = ports[index].device;
      small.textContent = text(ports[index].description || ports[index].product, "porta serial");
      item.appendChild(strong);
      item.appendChild(small);
      wrap.appendChild(item);
    }
  }

  function hasSelectedProfile() {
    return !!app.state.profileSelection;
  }

  function selectedProfileFile() {
    return app.state.profileSelection || "";
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

  function flagTitle(flag) {
    var options = app.state.staticData.firmware_feature_options || [];
    var index;
    for (index = 0; index < options.length; index += 1) {
      if (options[index].flag === flag) {
        return options[index].title;
      }
    }
    return String(flag || "").toUpperCase();
  }

  function joinFlagTitles(flags) {
    var labels = [];
    var index;
    for (index = 0; index < (flags || []).length; index += 1) {
      labels.push(flagTitle(flags[index]));
    }
    return labels.join(", ");
  }

  function renderSummary(snapshot) {
    var dockStatus = byId("dockStatus");
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
    var hasProfiles = snapshot.profiles && snapshot.profiles.length;
    setButtonState("dockConnect", !!byId("dockPortSelect").value && !snapshot.connected);
    setButtonState("dockDisconnect", snapshot.connected);
    setButtonState("dockSaveEeprom", snapshot.connected && snapshot.capabilities && snapshot.capabilities.supports_save);
    setButtonState("dockProfileEdit", !!hasProfiles || snapshot.connected);
  }

  function renderFirmwareFeatureFilters() {
    var wrap = byId("firmwareFeatureFilters");
    var options = app.state.staticData.firmware_feature_options || [];
    var index;
    if (!wrap) {
      return;
    }

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
  }

  function renderFirmwareBoardSelect(snapshot) {
    var select = byId("firmwareBoardSelect");
    var source = snapshot && snapshot.firmware_board ? snapshot.firmware_board : app.state.staticData.firmware_board;
    var options = source && source.options ? source.options : [];
    var selected = source && source.selected ? source.selected : "promicro";
    var index;
    if (!select) {
      return;
    }

    clearChildren(select);
    for (index = 0; index < options.length; index += 1) {
      appendOption(select, options[index].key, options[index].title, options[index].key === selected);
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

  function currentFirmwarePool() {
    if (app.state.firmwareMatches.length) {
      return app.state.firmwareMatches;
    }
    return app.state.staticData.firmware_catalog || [];
  }

  function findFirmwareRecord(name) {
    var pool = currentFirmwarePool();
    var index;
    for (index = 0; index < pool.length; index += 1) {
      if (pool[index].name === name) {
        return pool[index];
      }
    }
    return null;
  }

  function renderFirmwareSelect(preferredName) {
    var snapshot = app.state.snapshot || { flash_state: {} };
    var select = byId("firmwareSelect");
    var pool = currentFirmwarePool();
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
      appendOption(
        select,
        pool[index].name,
        pool[index].code + " - " + pool[index].folder,
        pool[index].name === selected || (!selected && index === 0)
      );
    }

    renderFirmwareDescription(snapshot, findFirmwareRecord(select.value) || pool[0]);
  }

  function renderFirmwareDescription(snapshot, record) {
    var flash = snapshot.flash_state || {};
    var panel = byId("firmwareDescription");
    var log = byId("firmwareFlashLog");
    var recommendation = byId("firmwareRecommendationState");
    var perfect;

    if (!panel) {
      return;
    }

    if (!record) {
      panel.textContent = "Escolha um firmware para ver os recursos.";
    } else {
      perfect = !record.missing_flags || !record.missing_flags.length;
      panel.textContent =
        (record.description_pt || record.description_en || "Sem descricao.") +
        (record.minimum_app_version ? " Requer wheel control " + record.minimum_app_version + " ou mais novo." : "") +
        (record.matched_flags && record.matched_flags.length ? " Recursos atendidos: " + joinFlagTitles(record.matched_flags) + "." : "") +
        (!perfect ? " Recursos desejados que faltam: " + joinFlagTitles(record.missing_flags) + "." : "") +
        (record.extra_flags && record.extra_flags.length ? " Extras presentes: " + joinFlagTitles(record.extra_flags) + "." : "");
    }

    if (recommendation) {
      if (!record) {
        recommendation.textContent = "Selecione as funcoes desejadas para procurar o build mais compativel.";
      } else if (record.missing_flags && record.missing_flags.length) {
        recommendation.textContent = "Nao existe combinacao perfeita para esse filtro. Este build cobre " + record.match_count + " recurso(s) e nao possui: " + joinFlagTitles(record.missing_flags) + ".";
      } else {
        recommendation.textContent = "Build totalmente compativel com o filtro atual.";
      }
    }

    setText("firmwareSummaryPort", text(flash.bootloader_port, "Sem porta"), "Sem porta");
    setText("firmwareSummaryFirmware", record ? record.code + " - " + record.folder : "Nenhum", "Nenhum");
    setText("firmwareBootloaderPort", text(flash.bootloader_port, "Sem porta"), "Sem porta");
    setText("firmwareBaselineCount", String((flash.baseline_ports || []).length), "0");
    if (log) {
      log.value = text(flash.last_log, "");
    }
  }

  function paintWizardStep(id, state) {
    var node = byId(id);
    if (!node) {
      return;
    }
    node.className = "wizard-step";
    addClass(node, state);
  }

  function stepReady(snapshot, step) {
    var flash = snapshot.flash_state || {};
    var record = findFirmwareRecord(byId("firmwareSelect").value);
    if (step === 1) {
      return true;
    }
    if (step === 2) {
      return !!(flash.baseline_ports && flash.baseline_ports.length);
    }
    if (step === 3) {
      return !!flash.detected_bootloader_port;
    }
    if (step === 4) {
      return !!record;
    }
    return false;
  }

  function wizardNote(snapshot) {
    var flash = snapshot.flash_state || {};
    if (flash.wizard_stage === "baseline-captured") {
      return "Etapa 1 pronta. Agora pressione o botao vermelho da placa e avance para detectar o bootloader.";
    }
    if (flash.wizard_stage === "bootloader-detected") {
      return "Bootloader encontrado. Agora procure o firmware mais compativel e avance.";
    }
    if (flash.wizard_stage === "armed") {
      return "Gravacao armada. Pressione o botao vermelho de novo. Quando o bootloader reaparecer, a gravacao comeca sozinha.";
    }
    if (flash.wizard_stage === "flashing") {
      return "Bootloader reapareceu e a gravacao esta em andamento.";
    }
    if (flash.wizard_stage === "flash-complete") {
      return "Firmware gravado com sucesso.";
    }
    if (flash.wizard_stage === "flash-error" || flash.wizard_stage === "flash-timeout") {
      return "A gravacao falhou. Revise o log, volte etapas se necessario e tente novamente.";
    }
    if (app.state.firmwareUiStep === 2) {
      return "Entre no bootloader pelo botao vermelho e deixe o app capturar a nova porta.";
    }
    if (app.state.firmwareUiStep === 3) {
      return "Selecione as funcoes desejadas para o firmware e compare os builds disponiveis.";
    }
    if (app.state.firmwareUiStep === 4) {
      return "Na ultima etapa, o app fica armado esperando o bootloader reaparecer para gravar sozinho.";
    }
    return "Comece capturando as portas atuais.";
  }

  function renderFirmwareFooter(snapshot) {
    var flash = snapshot.flash_state || {};
    var cancelButton = byId("firmwareCancel");
    var nextButton = byId("firmwareNextStep");
    var prevButton = byId("firmwarePrevStep");
    var record = findFirmwareRecord(byId("firmwareSelect").value);
    var hasSearch = !!app.state.firmwareSearch;
    var step = app.state.firmwareUiStep;

    if (!nextButton || !prevButton) {
      return;
    }

    prevButton.disabled = step <= 1 || !!flash.busy;
    if (cancelButton) {
      cancelButton.disabled = !!flash.busy;
    }

    if (flash.wizard_stage === "flash-complete") {
      nextButton.textContent = "Concluido";
      nextButton.disabled = true;
      return;
    }

    if (step === 1) {
      nextButton.textContent = flash.baseline_ports && flash.baseline_ports.length ? "Avancar" : "Capturar e avancar";
      nextButton.disabled = !!flash.busy;
      return;
    }
    if (step === 2) {
      nextButton.textContent = flash.detected_bootloader_port ? "Avancar" : "Detectar e avancar";
      nextButton.disabled = !!flash.busy || !(flash.baseline_ports && flash.baseline_ports.length);
      return;
    }
    if (step === 3) {
      nextButton.textContent = hasSearch && record ? "Avancar" : "Procurar firmware";
      nextButton.disabled = !!flash.busy;
      return;
    }

    nextButton.textContent = flash.busy ? "Aguardando bootloader..." : "Armar gravacao";
    nextButton.disabled = !!flash.busy || !flash.detected_bootloader_port || !record;
  }

  function renderFirmwareWizard(snapshot) {
    var flash = snapshot.flash_state || {};
    var selectedRecord = findFirmwareRecord(byId("firmwareSelect").value);
    var hasSearch = !!app.state.firmwareSearch;
    var baselineDone = !!(flash.baseline_ports && flash.baseline_ports.length);
    var detectedDone = !!flash.detected_bootloader_port;
    var step = app.state.firmwareUiStep;
    var index;

    if (step > 2 && !baselineDone) {
      step = 1;
    } else if (step > 3 && !detectedDone) {
      step = 2;
    } else if (step > 4 || (step === 4 && (!selectedRecord || !hasSearch))) {
      step = hasSearch && selectedRecord ? 4 : (detectedDone ? 3 : (baselineDone ? 2 : 1));
    }
    app.state.firmwareUiStep = step;

    for (index = 1; index <= 4; index += 1) {
      toggleHidden(byId("firmwarePage" + index), index !== step);
    }

    paintWizardStep("firmwareStep1", baselineDone ? "is-done" : (step === 1 ? "is-current" : "is-waiting"));
    paintWizardStep("firmwareStep2", detectedDone ? "is-done" : (step === 2 ? "is-current" : "is-waiting"));
    paintWizardStep("firmwareStep3", hasSearch && selectedRecord ? "is-done" : (step === 3 ? "is-current" : "is-waiting"));
    paintWizardStep("firmwareStep4", flash.wizard_stage === "flash-complete" ? "is-done" : (step === 4 ? "is-current" : "is-waiting"));

    setText("firmwareWizardNote", wizardNote(snapshot), "");
    renderPortsPreview(snapshot.ports || []);
    renderFirmwareDescription(snapshot, selectedRecord);
    renderFirmwareFooter(snapshot);
  }

  function fillProfileOptions(snapshot) {
    var selected = selectedProfileFile();
    var selectedProfile = null;
    var index;

    for (index = 0; index < snapshot.profiles.length; index += 1) {
      if (snapshot.profiles[index].file === selected) {
        selectedProfile = snapshot.profiles[index];
        break;
      }
    }

    setText("profileOptionsCurrentName", selectedProfile ? selectedProfile.name : "Nenhum perfil selecionado", "Nenhum perfil selecionado");
    setText(
      "profileOptionsHint",
      selectedProfile ? "Use a engrenagem para renomear, sobrescrever ou excluir o perfil selecionado." : "Sem perfil selecionado. Se a base estiver conectada, voce pode criar um novo perfil a partir da configuracao atual.",
      ""
    );

    if (selectedProfile) {
      idleSet("profileRenameName", selectedProfile.name);
    } else {
      idleSet("profileRenameName", "");
    }
    if (!byId("profileCreateName").value && snapshot.connected) {
      idleSet("profileCreateName", "perfil-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"));
    }

    setButtonState("profileCreateNew", snapshot.connected);
    setButtonState("profileOptionOverwrite", snapshot.connected && hasSelectedProfile());
    setButtonState("profileOptionRename", hasSelectedProfile());
    setButtonState("profileOptionDelete", hasSelectedProfile());
    setButtonState("profileOptionOpenJson", hasSelectedProfile());
  }

  function openProfileOptionsModal() {
    var snapshot = app.state.snapshot || { connected: false, profiles: [] };
    fillProfileOptions(snapshot);
    getModal("profileOptionsModal").show();
  }

  function openProfileJsonModal() {
    if (!hasSelectedProfile()) {
      return;
    }
    callApi("get_profile_detail", [selectedProfileFile()]).then(function (result) {
      if (!result || !result.ok || !result.profile) {
        return;
      }
      byId("profileModalFile").value = result.profile.file;
      byId("profileModalName").value = result.profile.name;
      byId("profileModalJson").value = result.profile.json_text;
      getModal("profileModal").show();
    });
  }

  function chooseProfileFromResult(result, preferredName) {
    var profiles = result && result.data && result.data.profiles ? result.data.profiles : [];
    var select = byId("dockProfileSelect");
    var index;
    for (index = 0; index < profiles.length; index += 1) {
      if (profiles[index].name === preferredName) {
        app.state.profileSelection = profiles[index].file;
        if (select) {
          select.value = profiles[index].file;
        }
        return;
      }
    }
  }

  function bindProfileOptionsModal() {
    byId("profileCreateNew").onclick = function () {
      var name = byId("profileCreateName").value;
      callApi("save_profile", [name]).then(function (result) {
        if (result && result.ok) {
          chooseProfileFromResult(result, name);
          fillProfileOptions(app.state.snapshot || { connected: false, profiles: [] });
        }
      });
    };

    byId("profileOptionOverwrite").onclick = function () {
      if (!hasSelectedProfile()) {
        return;
      }
      callApi("overwrite_profile", [selectedProfileFile()]);
    };

    byId("profileOptionRename").onclick = function () {
      var newName = byId("profileRenameName").value;
      if (!hasSelectedProfile()) {
        return;
      }
      callApi("rename_profile", [selectedProfileFile(), newName]).then(function (result) {
        if (result && result.ok) {
          chooseProfileFromResult(result, newName);
          fillProfileOptions(app.state.snapshot || { connected: false, profiles: [] });
        }
      });
    };

    byId("profileOptionDelete").onclick = function () {
      if (!hasSelectedProfile()) {
        return;
      }
      callApi("delete_profile", [selectedProfileFile()]).then(function (result) {
        if (result && result.ok) {
          app.state.profileSelection = "";
          getModal("profileOptionsModal").hide();
        }
      });
    };

    byId("profileOptionOpenJson").onclick = function () {
      if (!hasSelectedProfile()) {
        return;
      }
      getModal("profileOptionsModal").hide();
      openProfileJsonModal();
    };
  }

  function bindProfileJsonModal() {
    byId("profileModalSave").onclick = function () {
      callApi("upsert_profile", [
        byId("profileModalFile").value,
        byId("profileModalName").value,
        byId("profileModalJson").value
      ]).then(function (result) {
        if (result && result.ok) {
          chooseProfileFromResult(result, byId("profileModalName").value);
          getModal("profileModal").hide();
        }
      });
    };
  }

  function openFirmwareWizard() {
    app.state.firmwareUiStep = 1;
    app.state.firmwareMatches = [];
    app.state.firmwareSearch = null;
    renderFirmwareSelect("");
    renderFirmwareWizard(app.state.snapshot || { flash_state: {} });
  }

  function advanceFirmwareWizard() {
    var snapshot = app.state.snapshot || { flash_state: {} };
    var flash = snapshot.flash_state || {};
    var step = app.state.firmwareUiStep;
    var selectedRecord = findFirmwareRecord(byId("firmwareSelect").value);

    if (step === 1) {
      if (flash.baseline_ports && flash.baseline_ports.length) {
        app.state.firmwareUiStep = 2;
        renderFirmwareWizard(snapshot);
      } else {
        callApi("capture_bootloader_baseline").then(function (result) {
          if (result && result.ok) {
            app.state.firmwareUiStep = 2;
            renderFirmwareWizard(app.state.snapshot || snapshot);
          }
        });
      }
      return;
    }

    if (step === 2) {
      if (flash.detected_bootloader_port) {
        app.state.firmwareUiStep = 3;
        renderFirmwareWizard(snapshot);
      } else {
        callApi("detect_bootloader_port").then(function (result) {
          if (result && result.ok) {
            app.state.firmwareUiStep = 3;
            renderFirmwareWizard(app.state.snapshot || snapshot);
          }
        });
      }
      return;
    }

    if (step === 3) {
      if (app.state.firmwareSearch && selectedRecord) {
        app.state.firmwareUiStep = 4;
        renderFirmwareWizard(snapshot);
      } else {
        callApi("recommend_firmwares", [selectedFirmwareFilters()]).then(function (result) {
          app.state.firmwareMatches = result && result.matches ? result.matches : [];
          app.state.firmwareSearch = result || null;
          renderFirmwareSelect(result && result.best ? result.best.name : "");
          if (result && result.best) {
            app.state.firmwareUiStep = 4;
          }
          renderFirmwareWizard(app.state.snapshot || snapshot);
        });
      }
      return;
    }

    if (step === 4 && selectedRecord) {
      callApi("arm_and_flash_firmware", [selectedRecord.name]);
    }
  }

  function retreatFirmwareWizard() {
    var snapshot = app.state.snapshot || { flash_state: {} };
    if ((snapshot.flash_state && snapshot.flash_state.busy) || app.state.firmwareUiStep <= 1) {
      return;
    }
    app.state.firmwareUiStep -= 1;
    renderFirmwareWizard(snapshot);
  }

  function cancelFirmwareWizard() {
    callApi("reset_flash_wizard").then(function () {
      app.state.firmwareUiStep = 1;
      app.state.firmwareMatches = [];
      app.state.firmwareSearch = null;
      getModal("firmwareModal").hide();
    });
  }

  function bindFirmwareModal() {
    byId("firmwareFindBest").onclick = function () {
      callApi("recommend_firmwares", [selectedFirmwareFilters()]).then(function (result) {
        app.state.firmwareMatches = result && result.matches ? result.matches : [];
        app.state.firmwareSearch = result || null;
        renderFirmwareSelect(result && result.best ? result.best.name : "");
        renderFirmwareWizard(app.state.snapshot || { flash_state: {} });
      });
    };

    byId("firmwareCaptureBaseline").onclick = function () {
      callApi("capture_bootloader_baseline");
    };

    byId("firmwareDetectBootloader").onclick = function () {
      callApi("detect_bootloader_port");
    };

    byId("firmwareSelect").onchange = function () {
      renderFirmwareDescription(app.state.snapshot || { flash_state: {} }, findFirmwareRecord(this.value));
      renderFirmwareWizard(app.state.snapshot || { flash_state: {} });
    };

    byId("firmwareBoardSelect").onchange = function () {
      app.state.firmwareMatches = [];
      app.state.firmwareSearch = null;
      app.state.firmwareFilterState = {};
      callApi("set_firmware_board", [this.value]).then(function () {
        if (!hasApi()) {
          return;
        }
        window.pywebview.api.get_static_data().then(function (staticData) {
          app.state.staticData = staticData || app.state.staticData;
          renderFirmwareFeatureFilters();
          renderFirmwareBoardSelect(app.state.snapshot || {});
          renderFirmwareSelect("");
          renderFirmwareWizard(app.state.snapshot || { flash_state: {} });
        });
      });
    };

    byId("firmwarePrevStep").onclick = retreatFirmwareWizard;
    byId("firmwareCancel").onclick = cancelFirmwareWizard;
    byId("firmwareNextStep").onclick = advanceFirmwareWizard;

    byId("firmwareModal").addEventListener("show.bs.modal", function () {
      openFirmwareWizard();
    });
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

    byId("dockSaveEeprom").onclick = function () {
      callApi("run_action", ["save_eeprom"]);
    };

    byId("dockProfileEdit").onclick = openProfileOptionsModal;

    byId("dockPortSelect").onchange = function () {
      syncPortSelects("dockPortSelect", "connectionPortSelect");
      renderFooterLocks(app.state.snapshot || { connected: false, capabilities: {}, profiles: [] });
    };

    byId("dockProfileSelect").onchange = function () {
      app.state.profileSelection = this.value;
      renderFooterLocks(app.state.snapshot || { connected: false, capabilities: {}, profiles: [] });
      if (this.value && app.state.snapshot && app.state.snapshot.connected) {
        callApi("apply_profile", [this.value]);
      }
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
    renderFirmwareBoardSelect(snapshot);
    renderFirmwareFeatureFilters();
    renderFirmwareSelect();
    renderFirmwareWizard(snapshot);
    fillProfileOptions(snapshot);

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
    bindProfileOptionsModal();
    bindProfileJsonModal();
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
  app.idleCheck = idleCheck;
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
