(function () {
  var module = {};

  module.state = {
    draft: null,
    timer: null
  };

  module.bind = function (app) {
    bindPair("wheelRotationDeg", "wheelRotationDegRange", "rotation_deg");
    bindPair("wheelGeneralGain", "wheelGeneralGainRange", "general_gain");
    bindEncoderInputs();

    app.byId("wheelCenter").onclick = function () {
      app.callApi("run_action", ["center"]);
    };
    app.byId("wheelCalibrate").onclick = function () {
      app.callApi("run_action", ["recalibrate_wheel"]);
    };
    app.byId("wheelResetZ").onclick = function () {
      app.callApi("run_action", ["reset_zindex"]);
    };
  };

  module.render = function (snapshot, app) {
    var values;
    if (!snapshot.connected) {
      module.state.draft = null;
      clearTimer();
    }

    values = module.state.draft || snapshot.settings;
    app.idleSet("wheelRotationDeg", values.rotation_deg);
    app.idleSet("wheelRotationDegRange", values.rotation_deg);
    app.idleSet("wheelGeneralGain", values.general_gain);
    app.idleSet("wheelGeneralGainRange", values.general_gain);
    app.idleSet("wheelEncoderCpr", values.encoder_cpr);
    app.idleSet("wheelEncoderPpr", values.encoder_ppr || Math.max(1, Math.round(Number(values.encoder_cpr || 0) / 4)));
    app.idleSet("wheelOutputResolution", snapshot.settings.output_resolution_label || snapshot.settings.output_resolution);
    app.setText("wheelOutputResolutionHint", app.text(snapshot.settings.output_resolution_hint, "Aguardando leitura da firmware."), "");
    app.toggleHidden(app.byId("wheelOutputResolutionBox"), !snapshot.capabilities.supports_output_setup);

    app.byId("wheelCenter").disabled = !snapshot.connected;
    app.byId("wheelCalibrate").disabled = !snapshot.connected;
    app.toggleHidden(app.byId("wheelResetZ"), !snapshot.capabilities.supports_z_reset);
    app.byId("wheelResetZ").disabled = !snapshot.connected || !snapshot.capabilities.supports_z_reset;

    renderDeviceMonitor(snapshot, app);
  };

  function clearTimer() {
    if (module.state.timer) {
      window.clearTimeout(module.state.timer);
      module.state.timer = null;
    }
  }

  function ensureDraft() {
    var snapshot = window.BRWheelApp.state.snapshot;
    if (!module.state.draft && snapshot) {
      module.state.draft = {
        rotation_deg: snapshot.settings.rotation_deg,
        encoder_cpr: snapshot.settings.encoder_cpr,
        encoder_ppr: snapshot.settings.encoder_ppr || Math.max(1, Math.round(Number(snapshot.settings.encoder_cpr || 0) / 4)),
        general_gain: snapshot.settings.general_gain
      };
    }
  }

  function queueSend() {
    clearTimer();
    module.state.timer = window.setTimeout(function () {
      var payload;
      if (!module.state.draft) {
        return;
      }
      payload = {
        rotation_deg: Number(module.state.draft.rotation_deg),
        encoder_cpr: Number(module.state.draft.encoder_cpr),
        encoder_ppr: Number(module.state.draft.encoder_ppr)
      };
      window.BRWheelApp.callApi("update_basic_settings", [payload]).then(function (result) {
        if (!(result && result.ok)) {
          return;
        }
        return window.BRWheelApp.callApi("update_ffb_settings", [{ general_gain: Number(module.state.draft.general_gain) }]).then(function (ffbResult) {
          if (ffbResult && ffbResult.ok) {
            module.state.draft = null;
          }
        });
      });
    }, 260);
  }

  function bindPair(numberId, rangeId, key) {
    var numberInput = window.BRWheelApp.byId(numberId);
    var rangeInput = window.BRWheelApp.byId(rangeId);
    numberInput.oninput = function () {
      ensureDraft();
      module.state.draft[key] = Number(numberInput.value);
      rangeInput.value = numberInput.value;
      queueSend();
    };
    rangeInput.oninput = function () {
      ensureDraft();
      module.state.draft[key] = Number(rangeInput.value);
      numberInput.value = rangeInput.value;
      queueSend();
    };
  }

  function bindEncoderInputs() {
    var cprInput = window.BRWheelApp.byId("wheelEncoderCpr");
    var pprInput = window.BRWheelApp.byId("wheelEncoderPpr");

    cprInput.oninput = function () {
      ensureDraft();
      module.state.draft.encoder_cpr = Number(cprInput.value);
      module.state.draft.encoder_ppr = Math.max(1, Math.round(Number(cprInput.value || 0) / 4));
      pprInput.value = module.state.draft.encoder_ppr;
      queueSend();
    };

    pprInput.oninput = function () {
      ensureDraft();
      module.state.draft.encoder_ppr = Number(pprInput.value);
      module.state.draft.encoder_cpr = Math.max(4, Number(pprInput.value || 0) * 4);
      cprInput.value = module.state.draft.encoder_cpr;
      queueSend();
    };
  }

  function renderDeviceMonitor(snapshot, app) {
    var monitor = snapshot.device_monitor || {};
    var axesWrap = app.byId("wheelDeviceAxes");
    var buttonsWrap = app.byId("wheelDeviceButtonList");
    var pressedButtons = new Set(monitor.buttons_pressed || []);
    var buttonCount = Number(monitor.button_count || 0);
    if (!buttonCount && pressedButtons.size) {
      buttonCount = Math.max.apply(null, Array.from(pressedButtons));
    }
    var buttonNames = [];

    for (var id = 1; id <= buttonCount; id += 1) {
      buttonNames.push("B" + id);
    }

    app.setText("wheelDeviceState", monitor.connected ? (monitor.matched ? "Encontrado" : "Parcial") : "Offline", "-");
    app.setText("wheelDeviceName", app.text(monitor.device_name || snapshot.connection.product, "-"), "-");
    if (snapshot.connection.vid && snapshot.connection.pid) {
      app.setText("wheelDeviceVidPid", app.hex4(snapshot.connection.vid) + ":" + app.hex4(snapshot.connection.pid), "-");
    } else {
      app.setText("wheelDeviceVidPid", "-", "-");
    }
    app.setText("wheelDeviceButtons", buttonNames.length ? buttonNames.join(", ") : "Nenhum", "-");
    app.setText("wheelDeviceStatus", app.text(monitor.status, "Aguardando conexao."), "");

    app.clearChildren(axesWrap);
    (monitor.axes || []).forEach(function (axis) {
      axesWrap.appendChild(buildAxisGauge(axis));
    });

    app.clearChildren(buttonsWrap);
    if (buttonCount) {
      for (var buttonId = 1; buttonId <= buttonCount; buttonId += 1) {
        buttonsWrap.appendChild(buildButtonBadge(buttonId, pressedButtons.has(buttonId)));
      }
    } else {
      var note = document.createElement("div");
      note.className = "wheel-empty-state";
      note.textContent = "Nenhum botao detectado no monitor.";
      buttonsWrap.appendChild(note);
    }
  }

  function buildAxisGauge(axis) {
    var value = Math.max(0, Math.min(100, Number(axis.value || 0)));
    var card = document.createElement("div");
    card.className = "wheel-axis-card";

    var title = document.createElement("strong");
    title.className = "device-axis-card-title";
    title.textContent = axis.label;

    var gauge = document.createElement("div");
    gauge.className = "wheel-axis-bar-wrap";

    var line = document.createElement("div");
    line.className = "wheel-axis-bar-line";

    var fill = document.createElement("div");
    fill.className = "wheel-axis-bar-fill";
    fill.style.width = value + "%";

    line.appendChild(fill);
    gauge.appendChild(line);

    var meta = document.createElement("div");
    meta.className = "wheel-axis-card-value";
    meta.textContent = value.toFixed(0) + "%";

    card.appendChild(title);
    card.appendChild(gauge);
    card.appendChild(meta);
    return card;
  }

  function buildButtonBadge(buttonId, pressed) {
    var badge = document.createElement("span");
    badge.className = "wheel-button-pill" + (pressed ? " is-pressed" : "");
    badge.textContent = "B" + buttonId;
    return badge;
  }

  window.BRWheelApp.registerTab("wheel", module);
}());
