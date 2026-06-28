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
        encoder_cpr: Number(module.state.draft.encoder_cpr)
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
    var labels = [];

    app.setText("wheelDeviceState", monitor.connected ? (monitor.matched ? "Encontrado" : "Parcial") : "Offline", "-");
    app.setText("wheelDeviceName", app.text(monitor.device_name || snapshot.connection.product, "-"), "-");
    if (snapshot.connection.vid && snapshot.connection.pid) {
      app.setText("wheelDeviceVidPid", app.hex4(snapshot.connection.vid) + ":" + app.hex4(snapshot.connection.pid), "-");
    } else {
      app.setText("wheelDeviceVidPid", "-", "-");
    }
    app.setText("wheelDeviceButtons", (monitor.buttons_pressed || []).length ? monitor.buttons_pressed.join(", ") : "Nenhum", "-");
    app.setText("wheelDeviceStatus", app.text(monitor.status, "Aguardando conexao."), "");

    app.clearChildren(axesWrap);
    (monitor.axes || []).forEach(function (axis) {
      var row = document.createElement("div");
      var label = document.createElement("span");
      var track = document.createElement("div");
      var fill = document.createElement("div");
      row.className = "device-axis-row";
      label.textContent = axis.label + " (" + axis.value + "%)";
      track.className = "device-axis-track";
      fill.className = "device-axis-fill";
      fill.style.width = Math.max(0, Math.min(100, Number(axis.value || 0))) + "%";
      track.appendChild(fill);
      row.appendChild(label);
      row.appendChild(track);
      axesWrap.appendChild(row);
    });

    app.clearChildren(buttonsWrap);
    (monitor.buttons_pressed || []).forEach(function (buttonId) {
      var badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "B" + buttonId;
      buttonsWrap.appendChild(badge);
      labels.push("B" + buttonId);
    });
    if (!labels.length) {
      var note = document.createElement("div");
      note.className = "note";
      note.textContent = "Nenhum botao pressionado no momento.";
      buttonsWrap.appendChild(note);
    }
  }

  window.BRWheelApp.registerTab("wheel", module);
}());
