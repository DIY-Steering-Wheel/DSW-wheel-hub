(function () {
  var state = {
    snapshot: null,
    pollHandle: null,
    currentTab: "tab-connection"
  };

  var gainPairs = [
    ["generalGain", "generalGainRange"],
    ["constantGain", "constantGainRange"],
    ["damperGain", "damperGainRange"],
    ["frictionGain", "frictionGainRange"],
    ["periodicGain", "periodicGainRange"],
    ["springGain", "springGainRange"],
    ["inertiaGain", "inertiaGainRange"],
    ["centerGain", "centerGainRange"],
    ["stopGain", "stopGainRange"],
    ["minTorque", "minTorqueRange"]
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function safeText(value, fallback) {
    if (value === null || value === undefined || value === "") {
      return fallback || "-";
    }
    return String(value);
  }

  function safePercent(value) {
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
    var number = Number(value || 0).toString(16).toUpperCase();
    while (number.length < 4) {
      number = "0" + number;
    }
    return number;
  }

  function boolText(value) {
    return value ? "Sim" : "Nao";
  }

  function feedback(message, type) {
    var bar = byId("feedbackBar");
    bar.className = "feedback-box";
    if (type) {
      bar.className += " " + type;
    }
    bar.innerHTML = "";
    bar.appendChild(document.createTextNode(message));
  }

  function setWidth(id, percent) {
    byId(id).style.width = Math.max(0, Math.min(100, Number(percent || 0))) + "%";
  }

  function idleSet(id, value) {
    var element = byId(id);
    if (!element) {
      return;
    }
    if (document.activeElement === element) {
      return;
    }
    element.value = value === null || value === undefined ? "" : value;
  }

  function setDisabled(ids, disabled) {
    var parts = ids.split(",");
    var i;
    for (i = 0; i < parts.length; i += 1) {
      var element = document.querySelector(parts[i]);
      if (element) {
        element.disabled = disabled;
      }
    }
  }

  function bindRangePairs() {
    var i;
    for (i = 0; i < gainPairs.length; i += 1) {
      bindRangePair(gainPairs[i][0], gainPairs[i][1]);
    }
  }

  function bindRangePair(numberId, rangeId) {
    var numberInput = byId(numberId);
    var rangeInput = byId(rangeId);
    function sync(source, target) {
      target.value = source.value;
    }
    rangeInput.addEventListener("input", function () {
      sync(rangeInput, numberInput);
    });
    numberInput.addEventListener("input", function () {
      sync(numberInput, rangeInput);
    });
  }

  function unlockTabs(snapshot) {
    var buttons = document.querySelectorAll(".tab-btn");
    var i;
    for (i = 0; i < buttons.length; i += 1) {
      var button = buttons[i];
      var target = button.getAttribute("data-target");
      var lock = target !== "tab-connection" && !snapshot.connected;
      button.disabled = lock;
      if (lock) {
        addClass(button, "is-locked");
      } else {
        removeClass(button, "is-locked");
      }
    }

    var shifterTab = byId("shifterTabBtn");
    if (snapshot.connected && snapshot.shifter.available) {
      removeClass(shifterTab, "is-hidden");
    } else {
      addClass(shifterTab, "is-hidden");
      if (state.currentTab === "tab-shifter") {
        activateTab("tab-connection");
      }
    }

    if (!snapshot.connected && state.currentTab !== "tab-connection") {
      activateTab("tab-connection");
    }
  }

  function addClass(element, className) {
    if (!element) {
      return;
    }
    if (element.className.indexOf(className) === -1) {
      element.className += " " + className;
    }
  }

  function removeClass(element, className) {
    if (!element) {
      return;
    }
    var classes = element.className.split(/\s+/);
    var filtered = [];
    var i;
    for (i = 0; i < classes.length; i += 1) {
      if (classes[i] && classes[i] !== className) {
        filtered.push(classes[i]);
      }
    }
    element.className = filtered.join(" ");
  }

  function activateTab(targetId) {
    var tabs = document.querySelectorAll(".tab-btn");
    var panels = document.querySelectorAll(".tab-panel");
    var i;

    for (i = 0; i < tabs.length; i += 1) {
      removeClass(tabs[i], "active");
      if (tabs[i].getAttribute("data-target") === targetId) {
        addClass(tabs[i], "active");
      }
    }

    for (i = 0; i < panels.length; i += 1) {
      removeClass(panels[i], "active");
      if (panels[i].id === targetId) {
        addClass(panels[i], "active");
      }
    }

    state.currentTab = targetId;
  }

  function callApi(method, args) {
    args = args || [];
    try {
      return window.pywebview.api[method].apply(window.pywebview.api, args).then(function (result) {
        if (result && result.data) {
          render(result.data);
        }
        if (result && result.message) {
          feedback(result.message, result.ok ? "success" : "error");
        }
        return result;
      }, function (error) {
        feedback(String(error), "error");
        return { ok: false, message: String(error) };
      });
    } catch (error) {
      feedback(String(error), "error");
      return {
        then: function (resolve) {
          resolve({ ok: false, message: String(error) });
        }
      };
    }
  }

  function renderPorts(snapshot) {
    var select = byId("portSelect");
    var currentValue = select.value;
    var i;
    select.innerHTML = "";

    if (!snapshot.ports.length) {
      appendOption(select, "", "Nenhuma porta encontrada");
      return;
    }

    for (i = 0; i < snapshot.ports.length; i += 1) {
      var port = snapshot.ports[i];
      var label = (port.likely ? "* " : "") + port.device + " - " + (port.description || port.product || "porta serial");
      var option = appendOption(select, port.device, label);
      if (port.device === snapshot.connection.port || port.device === currentValue) {
        option.selected = true;
      }
    }
  }

  function appendOption(select, value, label) {
    var option = document.createElement("option");
    option.value = value;
    option.appendChild(document.createTextNode(label));
    select.appendChild(option);
    return option;
  }

  function renderBadges(snapshot) {
    var wrap = byId("capabilityBadges");
    var i;
    wrap.innerHTML = "";
    for (i = 0; i < snapshot.firmware.flag_details.length; i += 1) {
      var item = snapshot.firmware.flag_details[i];
      var badge = document.createElement("div");
      badge.className = "badge";
      badge.title = item.description;
      badge.appendChild(document.createTextNode(item.flag.toUpperCase() + " - " + item.title));
      wrap.appendChild(badge);
    }
  }

  function renderNotes(snapshot) {
    var wrap = byId("notesBox");
    var i;
    wrap.innerHTML = "";
    for (i = 0; i < snapshot.notes.length; i += 1) {
      appendNote(wrap, snapshot.notes[i]);
    }
    if (snapshot.last_error) {
      appendNote(wrap, "Ultimo erro: " + snapshot.last_error);
    }
  }

  function appendNote(wrap, message) {
    var note = document.createElement("div");
    note.className = "note";
    note.appendChild(document.createTextNode(message));
    wrap.appendChild(note);
  }

  function renderHistory(snapshot) {
    var wrap = byId("historyList");
    var i;
    wrap.innerHTML = "";
    if (!snapshot.history.length) {
      appendListItem(wrap, "Ainda nao ha historico de comandos nesta sessao.", "");
      return;
    }
    for (i = 0; i < snapshot.history.length && i < 20; i += 1) {
      var entry = snapshot.history[i];
      var body = entry.command + " -> " + (entry.response || "(sem resposta)");
      appendListItem(wrap, body, entry.time);
    }
  }

  function renderProfiles(snapshot) {
    var wrap = byId("profilesList");
    var i;
    wrap.innerHTML = "";
    if (!snapshot.profiles.length) {
      appendListItem(wrap, "Nenhum perfil salvo ainda.", "");
      return;
    }

    for (i = 0; i < snapshot.profiles.length; i += 1) {
      appendProfileItem(wrap, snapshot.profiles[i]);
    }
  }

  function appendListItem(wrap, title, meta) {
    var item = document.createElement("div");
    item.className = "list-item";
    item.appendChild(document.createTextNode(title));
    if (meta) {
      var small = document.createElement("small");
      small.appendChild(document.createTextNode(meta));
      item.appendChild(small);
    }
    wrap.appendChild(item);
  }

  function appendProfileItem(wrap, profile) {
    var item = document.createElement("div");
    item.className = "list-item";

    var title = document.createElement("div");
    title.appendChild(document.createTextNode(profile.name));
    item.appendChild(title);

    var meta = document.createElement("small");
    meta.appendChild(document.createTextNode((profile.firmware || "firmware desconhecida") + " - " + (profile.created_at || "")));
    item.appendChild(meta);

    var actions = document.createElement("div");
    actions.className = "profile-actions";

    var applyButton = document.createElement("button");
    applyButton.className = "btn btn-soft";
    applyButton.appendChild(document.createTextNode("Aplicar"));
    applyButton.onclick = function (fileName) {
      return function () {
        callApi("apply_profile", [fileName]);
      };
    }(profile.file);

    var deleteButton = document.createElement("button");
    deleteButton.className = "btn btn-ghost";
    deleteButton.appendChild(document.createTextNode("Excluir"));
    deleteButton.onclick = function (fileName) {
      return function () {
        callApi("delete_profile", [fileName]);
      };
    }(profile.file);

    actions.appendChild(applyButton);
    actions.appendChild(deleteButton);
    item.appendChild(actions);
    wrap.appendChild(item);
  }

  function renderTelemetry(snapshot) {
    var stats = snapshot.serial_stats;
    byId("serialTxUsage").innerHTML = safePercent(stats.tx_usage_percent);
    byId("serialRxUsage").innerHTML = safePercent(stats.rx_usage_percent);
    byId("serialTxUsageLarge").innerHTML = safePercent(stats.tx_usage_percent);
    byId("serialRxUsageLarge").innerHTML = safePercent(stats.rx_usage_percent);
    byId("serialTxBytes").innerHTML = safeText(stats.tx_bytes_total, 0) + " bytes enviados";
    byId("serialRxBytes").innerHTML = safeText(stats.rx_bytes_total, 0) + " bytes recebidos";
    byId("serialCommandsTotal").innerHTML = safeText(stats.commands_total, 0);
    setWidth("serialTxBar", Number(stats.tx_usage_percent || 0));
    setWidth("serialRxBar", Number(stats.rx_usage_percent || 0));
  }

  function renderPedalMode(snapshot) {
    var title = "Modo de pedal desconhecido";
    var text = "Conecte a serial para descobrir o mapa de pedal atual.";
    if (snapshot.connected) {
      title = snapshot.capabilities.pedal_calibration === "Automatica" ? "Pedais em autocalibracao" : "Pedais em calibracao manual";
      text = "Brake scaling atual: " + snapshot.settings.brake_pressure + ". ";
      if (snapshot.capabilities.has_load_cell) {
        text += "Firmware com load cell HX711 para o freio. ";
      } else {
        text += "Firmware sem load cell; o comando B vira balanceamento de PWM. ";
      }
      if (snapshot.capabilities.has_ads1015) {
        text += "ADS1015 detectado para entradas analogicas.";
      } else if (snapshot.capabilities.has_averaging) {
        text += "Media analogica habilitada.";
      } else {
        text += "Leituras analogicas diretas na placa.";
      }
    }

    byId("pedalModeTitle").innerHTML = title;
    byId("pedalModeText").innerHTML = text;
    byId("pedalBrakePressureValue").innerHTML = safeText(snapshot.settings.brake_pressure, "-");
    byId("pedalCalibrationType").innerHTML = safeText(snapshot.capabilities.pedal_calibration, "-");
    byId("pedalLoadCell").innerHTML = boolText(snapshot.capabilities.has_load_cell);
    byId("pedalAds").innerHTML = boolText(snapshot.capabilities.has_ads1015);
  }

  function renderShifter(snapshot) {
    var available = snapshot.shifter.available;
    toggleHidden("shifterCard", !available);

    if (!available) {
      return;
    }

    idleSet("shifterA", snapshot.shifter.cal[0]);
    idleSet("shifterB", snapshot.shifter.cal[1]);
    idleSet("shifterC", snapshot.shifter.cal[2]);
    idleSet("shifterD", snapshot.shifter.cal[3]);
    idleSet("shifterE", snapshot.shifter.cal[4]);

    byId("shifterAView").innerHTML = safeText(snapshot.shifter.cal[0], "0");
    byId("shifterBView").innerHTML = safeText(snapshot.shifter.cal[1], "0");
    byId("shifterCView").innerHTML = safeText(snapshot.shifter.cal[2], "0");
    byId("shifterDView").innerHTML = safeText(snapshot.shifter.cal[3], "0");
    byId("shifterEView").innerHTML = safeText(snapshot.shifter.cal[4], "0");

    byId("shifterReverse").checked = !!snapshot.shifter.cfg_flags.reverse_inverted;
    byId("shifterGear8").checked = !!snapshot.shifter.cfg_flags.gear8_mode;
    byId("shifterInvertX").checked = !!snapshot.shifter.cfg_flags.invert_x;
    byId("shifterInvertY").checked = !!snapshot.shifter.cfg_flags.invert_y;

    byId("shifterLive").innerHTML = snapshot.shifter.live.x + " / " + snapshot.shifter.live.y;
    setWidth("shifterXBar", Math.round((Number(snapshot.shifter.live.x || 0) / 1023) * 100));
    setWidth("shifterYBar", Math.round((Number(snapshot.shifter.live.y || 0) / 1023) * 100));
  }

  function render(snapshot) {
    state.snapshot = snapshot;
    renderPorts(snapshot);
    renderBadges(snapshot);
    renderNotes(snapshot);
    renderHistory(snapshot);
    renderProfiles(snapshot);
    renderTelemetry(snapshot);
    renderPedalMode(snapshot);
    renderShifter(snapshot);
    unlockTabs(snapshot);

    byId("statusPill").innerHTML = snapshot.connected ? "Conectado" : "Desconectado";
    byId("statusPill").className = snapshot.connected ? "status-pill online" : "status-pill offline";
    byId("firmwareVersion").innerHTML = safeText(snapshot.firmware.version, "-");
    byId("activePort").innerHTML = safeText(snapshot.connection.port, "-");
    byId("boardFamily").innerHTML = safeText(snapshot.capabilities.board_family, "-");
    byId("controllerState").innerHTML = safeText(snapshot.diagnostics.controller_state_label, "-");
    byId("encoderType").innerHTML = safeText(snapshot.capabilities.encoder, "-");
    byId("outputType").innerHTML = safeText(snapshot.capabilities.output, "-");
    byId("buttonCapacity").innerHTML = safeText(snapshot.capabilities.button_capacity, "-");
    byId("connectionHint").innerHTML = snapshot.connected
      ? "Firmware " + safeText(snapshot.firmware.version, "-") + " conectada. Os setores foram liberados conforme as macros reportadas pela serial."
      : "Conecte a base para liberar os setores do app.";

    if (snapshot.connection.vid && snapshot.connection.pid) {
      byId("vidPid").innerHTML = hex4(snapshot.connection.vid) + ":" + hex4(snapshot.connection.pid);
    } else {
      byId("vidPid").innerHTML = "-";
    }

    idleSet("rotationDeg", snapshot.settings.rotation_deg);
    idleSet("encoderCpr", snapshot.settings.encoder_cpr);
    idleSet("brakePressure", snapshot.settings.brake_pressure);
    idleSet("outputResolution", snapshot.settings.output_resolution);
    byId("brakePressureLabel").innerHTML = snapshot.settings.brake_pressure_label;

    idleSet("generalGain", snapshot.settings.general_gain);
    idleSet("generalGainRange", snapshot.settings.general_gain);
    idleSet("constantGain", snapshot.settings.constant_gain);
    idleSet("constantGainRange", snapshot.settings.constant_gain);
    idleSet("damperGain", snapshot.settings.damper_gain);
    idleSet("damperGainRange", snapshot.settings.damper_gain);
    idleSet("frictionGain", snapshot.settings.friction_gain);
    idleSet("frictionGainRange", snapshot.settings.friction_gain);
    idleSet("periodicGain", snapshot.settings.periodic_gain);
    idleSet("periodicGainRange", snapshot.settings.periodic_gain);
    idleSet("springGain", snapshot.settings.spring_gain);
    idleSet("springGainRange", snapshot.settings.spring_gain);
    idleSet("inertiaGain", snapshot.settings.inertia_gain);
    idleSet("inertiaGainRange", snapshot.settings.inertia_gain);
    idleSet("centerGain", snapshot.settings.center_gain);
    idleSet("centerGainRange", snapshot.settings.center_gain);
    idleSet("stopGain", snapshot.settings.stop_gain);
    idleSet("stopGainRange", snapshot.settings.stop_gain);
    idleSet("minTorque", snapshot.settings.min_torque_percent_x10);
    idleSet("minTorqueRange", snapshot.settings.min_torque_percent_x10);

    byId("desktopAutoCenter").checked = !!snapshot.settings.desktop.auto_center;
    byId("desktopDamper").checked = !!snapshot.settings.desktop.damper;
    byId("desktopInertia").checked = !!snapshot.settings.desktop.inertia;
    byId("desktopFriction").checked = !!snapshot.settings.desktop.friction;
    byId("desktopMonitor").checked = !!snapshot.settings.desktop.monitor;
    idleSet("desktopAxis", snapshot.settings.desktop.axis_index);
    byId("desktopAxis").disabled = !snapshot.capabilities.supports_axis_select;

    idleSet("brakeMin", snapshot.manual_calibration.brake_min);
    idleSet("brakeMax", snapshot.manual_calibration.brake_max);
    idleSet("accelMin", snapshot.manual_calibration.accel_min);
    idleSet("accelMax", snapshot.manual_calibration.accel_max);
    idleSet("clutchMin", snapshot.manual_calibration.clutch_min);
    idleSet("clutchMax", snapshot.manual_calibration.clutch_max);
    idleSet("hbrakeMin", snapshot.manual_calibration.hbrake_min);
    idleSet("hbrakeMax", snapshot.manual_calibration.hbrake_max);
    toggleHidden("manualCalibCard", !snapshot.manual_calibration.available);

    renderOutputState(snapshot);
    renderLocks(snapshot);
  }

  function renderOutputState(snapshot) {
    var usesDac = snapshot.settings.output.uses_dac;
    toggleHidden("outputEnabledField", !usesDac);
    toggleHidden("outputPhaseField", usesDac);
    toggleHidden("outputFrequencyField", usesDac);
    byId("outputEnabled").checked = !!snapshot.settings.output.enabled;
    if (usesDac) {
      idleSet("outputMode", snapshot.settings.output.mode_code);
    } else {
      idleSet("outputMode", snapshot.settings.output.mode_label);
      idleSet("outputFrequency", snapshot.settings.output.frequency_index);
      byId("outputPhase").checked = !!snapshot.settings.output.phase_correct;
    }
  }

  function renderLocks(snapshot) {
    var disabledActions = {
      recalibrate_pedals: !snapshot.capabilities.supports_pedal_reset,
      reset_zindex: !snapshot.capabilities.supports_z_reset,
      save_eeprom: !snapshot.capabilities.supports_save
    };
    var buttons = document.querySelectorAll(".action-btn");
    var i;
    for (i = 0; i < buttons.length; i += 1) {
      var action = buttons[i].getAttribute("data-action");
      buttons[i].disabled = !snapshot.connected || !!disabledActions[action];
    }

    byId("saveBasicBtn").disabled = !snapshot.connected;
    byId("saveFfbBtn").disabled = !snapshot.connected;
    byId("saveDesktopBtn").disabled = !snapshot.connected;
    byId("saveOutputBtn").disabled = !snapshot.connected || !snapshot.capabilities.supports_output_setup;
    byId("saveManualCalibBtn").disabled = !snapshot.connected || !snapshot.manual_calibration.available;
    byId("saveShifterBtn").disabled = !snapshot.connected || !snapshot.shifter.available;
    byId("sendRawBtn").disabled = !snapshot.connected;
    byId("saveProfileBtn").disabled = !snapshot.connected;
  }

  function toggleHidden(id, hidden) {
    var element = byId(id);
    if (hidden) {
      addClass(element, "is-hidden");
    } else {
      removeClass(element, "is-hidden");
    }
  }

  function collectBasicSettings() {
    return {
      rotation_deg: Number(byId("rotationDeg").value),
      encoder_cpr: Number(byId("encoderCpr").value),
      brake_pressure: Number(byId("brakePressure").value)
    };
  }

  function collectFfbSettings() {
    return {
      general_gain: Number(byId("generalGain").value),
      constant_gain: Number(byId("constantGain").value),
      damper_gain: Number(byId("damperGain").value),
      friction_gain: Number(byId("frictionGain").value),
      periodic_gain: Number(byId("periodicGain").value),
      spring_gain: Number(byId("springGain").value),
      inertia_gain: Number(byId("inertiaGain").value),
      center_gain: Number(byId("centerGain").value),
      stop_gain: Number(byId("stopGain").value),
      min_torque_percent_x10: Number(byId("minTorque").value)
    };
  }

  function collectDesktopSettings() {
    return {
      auto_center: byId("desktopAutoCenter").checked,
      damper: byId("desktopDamper").checked,
      inertia: byId("desktopInertia").checked,
      friction: byId("desktopFriction").checked,
      monitor: byId("desktopMonitor").checked,
      axis_index: Number(byId("desktopAxis").value)
    };
  }

  function collectOutputSettings() {
    var usesDac = state.snapshot && state.snapshot.settings && state.snapshot.settings.output && state.snapshot.settings.output.uses_dac;
    if (usesDac) {
      return {
        enabled: byId("outputEnabled").checked,
        mode_code: Number(byId("outputMode").value)
      };
    }
    return {
      phase_correct: byId("outputPhase").checked,
      frequency_index: Number(byId("outputFrequency").value),
      mode_label: byId("outputMode").value
    };
  }

  function collectShifterSettings() {
    var cfg = 0;
    if (byId("shifterReverse").checked) {
      cfg |= 1;
    }
    if (byId("shifterGear8").checked) {
      cfg |= 2;
    }
    if (byId("shifterInvertX").checked) {
      cfg |= 4;
    }
    if (byId("shifterInvertY").checked) {
      cfg |= 8;
    }
    return {
      cal_0: Number(byId("shifterA").value),
      cal_1: Number(byId("shifterB").value),
      cal_2: Number(byId("shifterC").value),
      cal_3: Number(byId("shifterD").value),
      cal_4: Number(byId("shifterE").value),
      cfg: cfg
    };
  }

  function collectManualCalibration() {
    return {
      brake_min: Number(byId("brakeMin").value),
      brake_max: Number(byId("brakeMax").value),
      accel_min: Number(byId("accelMin").value),
      accel_max: Number(byId("accelMax").value),
      clutch_min: Number(byId("clutchMin").value),
      clutch_max: Number(byId("clutchMax").value),
      hbrake_min: Number(byId("hbrakeMin").value),
      hbrake_max: Number(byId("hbrakeMax").value)
    };
  }

  function bindTabs() {
    var buttons = document.querySelectorAll(".tab-btn");
    var i;
    for (i = 0; i < buttons.length; i += 1) {
      buttons[i].onclick = function () {
        if (this.disabled) {
          return;
        }
        activateTab(this.getAttribute("data-target"));
      };
    }
  }

  function bindEvents() {
    var i;
    bindRangePairs();
    bindTabs();

    for (i = 0; i <= 12; i += 1) {
      appendOption(byId("outputFrequency"), String(i), "Indice " + i);
    }

    byId("refreshPortsBtn").onclick = function () {
      callApi("refresh_ports");
    };
    byId("connectBtn").onclick = function () {
      callApi("connect", [byId("portSelect").value]).then(function (result) {
        if (result && result.ok) {
          activateTab("tab-wheel");
        }
      });
    };
    byId("disconnectBtn").onclick = function () {
      callApi("disconnect").then(function () {
        activateTab("tab-connection");
      });
    };
    byId("saveBasicBtn").onclick = function () {
      callApi("update_basic_settings", [collectBasicSettings()]);
    };
    byId("saveFfbBtn").onclick = function () {
      callApi("update_ffb_settings", [collectFfbSettings()]);
    };
    byId("saveDesktopBtn").onclick = function () {
      callApi("update_desktop_effects", [collectDesktopSettings()]);
    };
    byId("saveOutputBtn").onclick = function () {
      callApi("update_output_settings", [collectOutputSettings()]);
    };
    byId("saveShifterBtn").onclick = function () {
      callApi("update_shifter_settings", [collectShifterSettings()]);
    };
    byId("saveManualCalibBtn").onclick = function () {
      callApi("update_manual_calibration", [collectManualCalibration()]);
    };
    byId("sendRawBtn").onclick = function () {
      callApi("send_raw", [byId("rawCommand").value]);
    };
    byId("saveProfileBtn").onclick = function () {
      callApi("save_profile", [byId("profileName").value]);
    };

    var actionButtons = document.querySelectorAll(".action-btn");
    for (i = 0; i < actionButtons.length; i += 1) {
      actionButtons[i].onclick = function () {
        callApi("run_action", [this.getAttribute("data-action")]);
      };
    }
  }

  function bootstrap() {
    bindEvents();
    window.pywebview.api.get_snapshot().then(function (snapshot) {
      render(snapshot);
      return callApi("refresh_ports");
    }).then(function () {
      state.pollHandle = window.setInterval(function () {
        window.pywebview.api.get_snapshot().then(function (snapshot) {
          render(snapshot);
        }, function (error) {
          feedback(String(error), "error");
        });
      }, 900);
    }, function (error) {
      feedback(String(error), "error");
    });
  }

  window.addEventListener("pywebviewready", bootstrap);
}());
