(function () {
  var module = {};
  var pairs = [
    ["ffbGeneral", "ffbGeneralRange", "general_gain"],
    ["ffbConstant", "ffbConstantRange", "constant_gain"],
    ["ffbDamper", "ffbDamperRange", "damper_gain"],
    ["ffbFriction", "ffbFrictionRange", "friction_gain"],
    ["ffbPeriodic", "ffbPeriodicRange", "periodic_gain"],
    ["ffbSpring", "ffbSpringRange", "spring_gain"],
    ["ffbInertia", "ffbInertiaRange", "inertia_gain"],
    ["ffbCenter", "ffbCenterRange", "center_gain"],
    ["ffbStop", "ffbStopRange", "stop_gain"],
    ["ffbMinTorque", "ffbMinTorqueRange", "min_torque_percent_x10"]
  ];
  var mirrorPairs = [
    ["ffbCenterMirrorRange", "ffbCenterMirrorInput", "ffbCenter", "center_gain", "ffbDesktopAutoCenter"],
    ["ffbDamperMirrorRange", "ffbDamperMirrorInput", "ffbDamper", "damper_gain", "ffbDesktopDamper"],
    ["ffbInertiaMirrorRange", "ffbInertiaMirrorInput", "ffbInertia", "inertia_gain", "ffbDesktopInertia"],
    ["ffbFrictionMirrorRange", "ffbFrictionMirrorInput", "ffbFriction", "friction_gain", "ffbDesktopFriction"]
  ];

  module.state = {
    gainsDraft: null,
    outputDraft: null,
    desktopDraft: null,
    gainsTimer: null,
    outputTimer: null,
    desktopTimer: null
  };

  module.bind = function (app) {
    pairs.forEach(function (pair) {
      bindPair(pair[0], pair[1], pair[2]);
    });
    mirrorPairs.forEach(function (pair) {
      bindMirrorPair(pair[0], pair[1], pair[2], pair[3], pair[4]);
    });
    populateFrequency();

    app.byId("ffbOpenOutputModal").onclick = function () {
      app.getModal("ffbOutputModal").show();
    };
    app.byId("ffbOpenGuideModal").onclick = function () {
      renderGuide();
      app.getModal("ffbGuideModal").show();
    };

    ["ffbOutputEnabled", "ffbOutputMode", "ffbOutputFrequency", "ffbOutputPhase"].forEach(bindOutputField);
    ["ffbDesktopAutoCenter", "ffbDesktopDamper", "ffbDesktopInertia", "ffbDesktopFriction", "ffbDesktopMonitor", "ffbDesktopAxis"].forEach(bindDesktopField);
  };

  module.render = function (snapshot, app) {
    var gains;
    if (!snapshot.connected) {
      resetDrafts();
    }

    gains = module.state.gainsDraft || snapshot.settings;
    populateFrequency();

    pairs.forEach(function (pair) {
      setPair(pair[0], pair[1], gains[pair[2]]);
    });

    renderDesktop(snapshot, app);
    renderOutput(snapshot, app);
    app.toggleHidden(app.byId("ffbOpenOutputModal"), !snapshot.capabilities.supports_output_setup && !snapshot.capabilities.supports_axis_select);
    app.byId("ffbOpenOutputModal").disabled = !snapshot.connected;
  };

  function resetDrafts() {
    module.state.gainsDraft = null;
    module.state.outputDraft = null;
    module.state.desktopDraft = null;
    ["gainsTimer", "outputTimer", "desktopTimer"].forEach(function (key) {
      if (module.state[key]) {
        window.clearTimeout(module.state[key]);
        module.state[key] = null;
      }
    });
  }

  function ensureGainsDraft() {
    var snapshot = window.BRWheelApp.state.snapshot;
    if (!module.state.gainsDraft && snapshot) {
      module.state.gainsDraft = {
        general_gain: snapshot.settings.general_gain,
        constant_gain: snapshot.settings.constant_gain,
        damper_gain: snapshot.settings.damper_gain,
        friction_gain: snapshot.settings.friction_gain,
        periodic_gain: snapshot.settings.periodic_gain,
        spring_gain: snapshot.settings.spring_gain,
        inertia_gain: snapshot.settings.inertia_gain,
        center_gain: snapshot.settings.center_gain,
        stop_gain: snapshot.settings.stop_gain,
        min_torque_percent_x10: snapshot.settings.min_torque_percent_x10
      };
    }
  }

  function bindPair(numberId, rangeId, key) {
    var numberInput = window.BRWheelApp.byId(numberId);
    var rangeInput = window.BRWheelApp.byId(rangeId);
    numberInput.oninput = function () {
      ensureGainsDraft();
      module.state.gainsDraft[key] = Number(numberInput.value);
      rangeInput.value = numberInput.value;
      queueGainsSend();
    };
    rangeInput.oninput = function () {
      ensureGainsDraft();
      module.state.gainsDraft[key] = Number(rangeInput.value);
      numberInput.value = rangeInput.value;
      queueGainsSend();
    };
  }

  function setPair(numberId, rangeId, value) {
    window.BRWheelApp.idleSet(numberId, value);
    window.BRWheelApp.idleSet(rangeId, value);
  }

  function bindMirrorPair(rangeId, inputId, sourceNumberId, key, toggleId) {
    var rangeInput = window.BRWheelApp.byId(rangeId);
    var numberInput = window.BRWheelApp.byId(inputId);
    var sourceInput = window.BRWheelApp.byId(sourceNumberId);

    function update(value) {
      ensureGainsDraft();
      sourceInput.value = value;
      rangeInput.value = value;
      numberInput.value = value;
      module.state.gainsDraft[key] = Number(value);
      queueGainsSend();
    }

    rangeInput.oninput = function () {
      update(rangeInput.value);
    };
    numberInput.oninput = function () {
      update(numberInput.value);
    };

    window.BRWheelApp.byId(toggleId).onchange = function () {
      module.state.desktopDraft = collectDesktop();
      queueDesktopSend();
    };
  }

  function populateFrequency() {
    var select = window.BRWheelApp.byId("ffbOutputFrequency");
    var options = window.BRWheelApp.state.staticData.output_frequency_options || [];
    if (!select || select.options.length || !options.length) {
      return;
    }
    options.forEach(function (option) {
      var item = document.createElement("option");
      item.value = String(option.index);
      item.textContent = "Indice " + option.index + " - PWM " + option.pwm_label + " / RCM " + option.rcm_label;
      select.appendChild(item);
    });
  }

  function bindOutputField(id) {
    var element = window.BRWheelApp.byId(id);
    if (!element) {
      return;
    }
    element.oninput = function () {
      module.state.outputDraft = collectOutput();
      queueOutputSend();
    };
    element.onchange = function () {
      module.state.outputDraft = collectOutput();
      queueOutputSend();
    };
  }

  function bindDesktopField(id) {
    var element = window.BRWheelApp.byId(id);
    if (!element) {
      return;
    }
    element.oninput = function () {
      module.state.desktopDraft = collectDesktop();
      queueDesktopSend();
    };
    element.onchange = function () {
      module.state.desktopDraft = collectDesktop();
      queueDesktopSend();
    };
  }

  function queueGainsSend() {
    if (module.state.gainsTimer) {
      window.clearTimeout(module.state.gainsTimer);
    }
    module.state.gainsTimer = window.setTimeout(function () {
      window.BRWheelApp.callApi("update_ffb_settings", [collectGains()]).then(function (result) {
        if (result && result.ok) {
          module.state.gainsDraft = null;
        }
      });
    }, 260);
  }

  function queueOutputSend() {
    if (module.state.outputTimer) {
      window.clearTimeout(module.state.outputTimer);
    }
    module.state.outputTimer = window.setTimeout(function () {
      window.BRWheelApp.callApi("update_output_settings", [collectOutput()]).then(function (result) {
        if (result && result.ok) {
          module.state.outputDraft = null;
        }
      });
    }, 260);
  }

  function queueDesktopSend() {
    if (module.state.desktopTimer) {
      window.clearTimeout(module.state.desktopTimer);
    }
    module.state.desktopTimer = window.setTimeout(function () {
      window.BRWheelApp.callApi("update_desktop_effects", [collectDesktop()]).then(function (result) {
        if (result && result.ok) {
          module.state.desktopDraft = null;
        }
      });
    }, 260);
  }

  function renderDesktop(snapshot, app) {
    var desktop = module.state.desktopDraft || snapshot.settings.desktop;
    var gains = module.state.gainsDraft || snapshot.settings;
    app.idleCheck("ffbDesktopAutoCenter", desktop.auto_center);
    app.idleCheck("ffbDesktopDamper", desktop.damper);
    app.idleCheck("ffbDesktopInertia", desktop.inertia);
    app.idleCheck("ffbDesktopFriction", desktop.friction);
    app.idleCheck("ffbDesktopMonitor", desktop.monitor);
    app.idleSet("ffbDesktopAxis", desktop.axis_index);
    app.toggleHidden(app.byId("ffbDesktopAxisField"), !snapshot.capabilities.supports_axis_select);
    app.byId("ffbDesktopAxis").disabled = !snapshot.capabilities.supports_axis_select;

    setCompactPair("ffbCenterMirrorRange", "ffbCenterMirrorInput", gains.center_gain, !desktop.auto_center);
    setCompactPair("ffbDamperMirrorRange", "ffbDamperMirrorInput", gains.damper_gain, !desktop.damper);
    setCompactPair("ffbInertiaMirrorRange", "ffbInertiaMirrorInput", gains.inertia_gain, !desktop.inertia);
    setCompactPair("ffbFrictionMirrorRange", "ffbFrictionMirrorInput", gains.friction_gain, !desktop.friction);
  }

  function setCompactPair(rangeId, inputId, value, disabled) {
    window.BRWheelApp.idleSet(rangeId, value);
    window.BRWheelApp.idleSet(inputId, value);
    window.BRWheelApp.byId(rangeId).disabled = disabled;
    window.BRWheelApp.byId(inputId).disabled = disabled;
  }

  function renderOutput(snapshot, app) {
    var output = module.state.outputDraft || snapshot.settings.output;
    var usesDac = output.uses_dac;
    app.toggleHidden(app.byId("ffbOutputEnabledField"), !snapshot.capabilities.supports_output_setup || !usesDac);
    app.toggleHidden(app.byId("ffbOutputFrequencyField"), !snapshot.capabilities.supports_output_setup || usesDac);
    app.toggleHidden(app.byId("ffbOutputPhaseField"), !snapshot.capabilities.supports_output_setup || usesDac);
    app.idleCheck("ffbOutputEnabled", output.enabled);
    if (usesDac) {
      app.idleSet("ffbOutputMode", output.mode_code);
    } else {
      app.idleSet("ffbOutputMode", output.mode_label);
      app.idleSet("ffbOutputFrequency", output.frequency_index);
      app.idleCheck("ffbOutputPhase", output.phase_correct);
    }
  }

  function collectGains() {
    var payload = {};
    pairs.forEach(function (pair) {
      payload[pair[2]] = Number(window.BRWheelApp.byId(pair[0]).value);
    });
    return payload;
  }

  function collectDesktop() {
    return {
      auto_center: window.BRWheelApp.byId("ffbDesktopAutoCenter").checked,
      damper: window.BRWheelApp.byId("ffbDesktopDamper").checked,
      inertia: window.BRWheelApp.byId("ffbDesktopInertia").checked,
      friction: window.BRWheelApp.byId("ffbDesktopFriction").checked,
      monitor: window.BRWheelApp.byId("ffbDesktopMonitor").checked,
      axis_index: Number(window.BRWheelApp.byId("ffbDesktopAxis").value)
    };
  }

  function collectOutput() {
    var usesDac = window.BRWheelApp.state.snapshot && window.BRWheelApp.state.snapshot.settings.output.uses_dac;
    if (usesDac) {
      return {
        uses_dac: true,
        enabled: window.BRWheelApp.byId("ffbOutputEnabled").checked,
        mode_code: Number(window.BRWheelApp.byId("ffbOutputMode").value)
      };
    }
    return {
      uses_dac: false,
      phase_correct: window.BRWheelApp.byId("ffbOutputPhase").checked,
      frequency_index: Number(window.BRWheelApp.byId("ffbOutputFrequency").value),
      mode_label: window.BRWheelApp.byId("ffbOutputMode").value
    };
  }

  function renderGuide() {
    var wrap = window.BRWheelApp.byId("ffbGuideList");
    var items = [
      "Ganho geral: escala principal aplicada antes dos demais efeitos do jogo.",
      "Constante, periodic, spring, inertia, friction e damper ajustam familias diferentes de efeito vindas do jogo.",
      "Auto-center desktop: recentro local para uso fora do jogo ou testes rapidos.",
      "Damper desktop: adiciona resistencia proporcional ao movimento do volante.",
      "Inertia desktop: simula massa e oposicao a mudancas bruscas de velocidade.",
      "Friction desktop: adiciona atrito seco em movimentos pequenos e lentos.",
      "Monitor serial do FFB: envia telemetria pela serial para diagnostico.",
      "PWM com correcao de fase: altere apenas se o conjunto motor/driver responder melhor nesse modo.",
      "Eixo xFFB: so aparece quando a firmware realmente permite remapear o eixo analogico do FFB."
    ];
    window.BRWheelApp.clearChildren(wrap);
    items.forEach(function (item) {
      var note = document.createElement("div");
      note.className = "note";
      note.textContent = item;
      wrap.appendChild(note);
    });
  }

  window.BRWheelApp.registerTab("ffb", module);
}());
