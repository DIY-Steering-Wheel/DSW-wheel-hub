(function () {
  var module = {};
  var pairs = [
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

  module.state = {
    gainsDraft: null,
    outputDraft: null,
    desktopDraft: null,
    gainsTimer: null,
    outputTimer: null,
    desktopTimer: null
  };

  module.bind = function (app) {
    var index;
    for (index = 0; index < pairs.length; index += 1) {
      bindPair(pairs[index][0], pairs[index][1], pairs[index][2]);
    }
    populateFrequency();

    app.byId("ffbOpenOutputModal").onclick = function () {
      app.getModal("ffbOutputModal").show();
    };
    app.byId("ffbOpenGuideModal").onclick = function () {
      renderGuide();
      app.getModal("ffbGuideModal").show();
    };
    bindOutputDraft();
    bindDesktopDraft();
    bindDesktopRanges();
  };

  module.render = function (snapshot, app) {
    if (!snapshot.connected) {
      module.state.gainsDraft = null;
      module.state.outputDraft = null;
      module.state.desktopDraft = null;
      clearTimers();
    }
    var gains = module.state.gainsDraft || snapshot.settings;
    populateFrequency();

    setPair("ffbConstant", "ffbConstantRange", gains.constant_gain);
    setPair("ffbDamper", "ffbDamperRange", gains.damper_gain);
    setPair("ffbFriction", "ffbFrictionRange", gains.friction_gain);
    setPair("ffbPeriodic", "ffbPeriodicRange", gains.periodic_gain);
    setPair("ffbSpring", "ffbSpringRange", gains.spring_gain);
    setPair("ffbInertia", "ffbInertiaRange", gains.inertia_gain);
    setPair("ffbCenter", "ffbCenterRange", gains.center_gain);
    setPair("ffbStop", "ffbStopRange", gains.stop_gain);
    setPair("ffbMinTorque", "ffbMinTorqueRange", gains.min_torque_percent_x10);

    renderDesktop(snapshot, app);
    renderOutput(snapshot, app);
    renderSummaries(snapshot, app);

    app.toggleHidden(app.byId("ffbOpenOutputModal"), !snapshot.capabilities.supports_output_setup && !snapshot.capabilities.supports_axis_select);
    app.byId("ffbOpenOutputModal").disabled = !snapshot.connected;
  };

  function clearTimers() {
    if (module.state.gainsTimer) {
      window.clearTimeout(module.state.gainsTimer);
      module.state.gainsTimer = null;
    }
    if (module.state.outputTimer) {
      window.clearTimeout(module.state.outputTimer);
      module.state.outputTimer = null;
    }
    if (module.state.desktopTimer) {
      window.clearTimeout(module.state.desktopTimer);
      module.state.desktopTimer = null;
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

  function ensureGainsDraft() {
    if (!module.state.gainsDraft && window.BRWheelApp.state.snapshot) {
      module.state.gainsDraft = {
        general_gain: window.BRWheelApp.state.snapshot.settings.general_gain,
        constant_gain: window.BRWheelApp.state.snapshot.settings.constant_gain,
        damper_gain: window.BRWheelApp.state.snapshot.settings.damper_gain,
        friction_gain: window.BRWheelApp.state.snapshot.settings.friction_gain,
        periodic_gain: window.BRWheelApp.state.snapshot.settings.periodic_gain,
        spring_gain: window.BRWheelApp.state.snapshot.settings.spring_gain,
        inertia_gain: window.BRWheelApp.state.snapshot.settings.inertia_gain,
        center_gain: window.BRWheelApp.state.snapshot.settings.center_gain,
        stop_gain: window.BRWheelApp.state.snapshot.settings.stop_gain,
        min_torque_percent_x10: window.BRWheelApp.state.snapshot.settings.min_torque_percent_x10
      };
    }
  }

  function setPair(numberId, rangeId, value) {
    window.BRWheelApp.idleSet(numberId, value);
    window.BRWheelApp.idleSet(rangeId, value);
  }

  function populateFrequency() {
    var select = window.BRWheelApp.byId("ffbOutputFrequency");
    var options = window.BRWheelApp.state.staticData.output_frequency_options || [];
    var index;
    if (!select || select.options.length || !options.length) {
      return;
    }
    for (index = 0; index < options.length; index += 1) {
      var option = document.createElement("option");
      option.value = String(options[index].index);
      option.appendChild(
        document.createTextNode(
          "Indice " + options[index].index + " - PWM " + options[index].pwm_label + " / RCM " + options[index].rcm_label
        )
      );
      select.appendChild(option);
    }
  }

  function bindOutputDraft() {
    ["ffbOutputEnabled", "ffbOutputMode", "ffbOutputFrequency", "ffbOutputPhase"].forEach(function (id) {
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
    });
  }

  function bindDesktopDraft() {
    ["ffbDesktopAutoCenter", "ffbDesktopDamper", "ffbDesktopInertia", "ffbDesktopFriction", "ffbDesktopMonitor", "ffbDesktopAxis"].forEach(function (id) {
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
    });
  }

  function bindDesktopRanges() {
    linkMirrorRange("ffbCenterMirrorRange", "ffbCenter", "center_gain");
    linkMirrorRange("ffbDamperMirrorRange", "ffbDamper", "damper_gain");
    linkMirrorRange("ffbInertiaMirrorRange", "ffbInertia", "inertia_gain");
    linkMirrorRange("ffbFrictionMirrorRange", "ffbFriction", "friction_gain");
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
    }, 220);
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
    }, 220);
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
    }, 220);
  }

  function renderDesktop(snapshot, app) {
    var desktop = module.state.desktopDraft || snapshot.settings.desktop;
    app.idleCheck("ffbDesktopAutoCenter", desktop.auto_center);
    app.idleCheck("ffbDesktopDamper", desktop.damper);
    app.idleCheck("ffbDesktopInertia", desktop.inertia);
    app.idleCheck("ffbDesktopFriction", desktop.friction);
    app.idleCheck("ffbDesktopMonitor", desktop.monitor);
    app.idleSet("ffbDesktopAxis", desktop.axis_index);
    app.toggleHidden(app.byId("ffbDesktopAxisField"), !snapshot.capabilities.supports_axis_select);
    app.byId("ffbDesktopAxis").disabled = !snapshot.capabilities.supports_axis_select;
    app.idleSet("ffbCenterMirrorRange", (module.state.gainsDraft || snapshot.settings).center_gain);
    app.idleSet("ffbDamperMirrorRange", (module.state.gainsDraft || snapshot.settings).damper_gain);
    app.idleSet("ffbInertiaMirrorRange", (module.state.gainsDraft || snapshot.settings).inertia_gain);
    app.idleSet("ffbFrictionMirrorRange", (module.state.gainsDraft || snapshot.settings).friction_gain);
    app.byId("ffbCenterMirrorRange").disabled = !desktop.auto_center;
    app.byId("ffbDamperMirrorRange").disabled = !desktop.damper;
    app.byId("ffbInertiaMirrorRange").disabled = !desktop.inertia;
    app.byId("ffbFrictionMirrorRange").disabled = !desktop.friction;
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

  function renderSummaries(snapshot, app) {
    var output = module.state.outputDraft || snapshot.settings.output;
    var desktop = module.state.desktopDraft || snapshot.settings.desktop;
    var effectNames = [];

    if (desktop.auto_center) {
      effectNames.push("Auto-center");
    }
    if (desktop.damper) {
      effectNames.push("Damper");
    }
    if (desktop.inertia) {
      effectNames.push("Inertia");
    }
    if (desktop.friction) {
      effectNames.push("Friction");
    }
    if (desktop.monitor) {
      effectNames.push("Monitor");
    }

    app.setText("ffbOutputSummary", output.uses_dac ? output.mode_label : (output.mode_label + " / " + output.frequency_label), "-");
    app.setText("ffbAxisSummary", snapshot.capabilities.supports_axis_select ? (desktop.axis_label || ["X", "Y", "Z", "RX", "RY"][desktop.axis_index] || "-") : "Fixo na firmware", "-");
    app.setText("ffbEffectsSummary", effectNames.length ? effectNames.join(", ") : "Nenhum", "-");
  }

  function collectGains() {
    return {
      constant_gain: Number(window.BRWheelApp.byId("ffbConstant").value),
      damper_gain: Number(window.BRWheelApp.byId("ffbDamper").value),
      friction_gain: Number(window.BRWheelApp.byId("ffbFriction").value),
      periodic_gain: Number(window.BRWheelApp.byId("ffbPeriodic").value),
      spring_gain: Number(window.BRWheelApp.byId("ffbSpring").value),
      inertia_gain: Number(window.BRWheelApp.byId("ffbInertia").value),
      center_gain: Number(window.BRWheelApp.byId("ffbCenter").value),
      stop_gain: Number(window.BRWheelApp.byId("ffbStop").value),
      min_torque_percent_x10: Number(window.BRWheelApp.byId("ffbMinTorque").value)
    };
  }

  function collectDesktop() {
    return {
      auto_center: window.BRWheelApp.byId("ffbDesktopAutoCenter").checked,
      damper: window.BRWheelApp.byId("ffbDesktopDamper").checked,
      inertia: window.BRWheelApp.byId("ffbDesktopInertia").checked,
      friction: window.BRWheelApp.byId("ffbDesktopFriction").checked,
      monitor: window.BRWheelApp.byId("ffbDesktopMonitor").checked,
      axis_index: Number(window.BRWheelApp.byId("ffbDesktopAxis").value),
      axis_label: ["X", "Y", "Z", "RX", "RY"][Number(window.BRWheelApp.byId("ffbDesktopAxis").value)] || "X",
      supports_axis_select: !window.BRWheelApp.byId("ffbDesktopAxis").disabled
    };
  }

  function collectOutput() {
    var usesDac = window.BRWheelApp.state.snapshot && window.BRWheelApp.state.snapshot.settings.output.uses_dac;
    if (usesDac) {
      return {
        uses_dac: true,
        enabled: window.BRWheelApp.byId("ffbOutputEnabled").checked,
        mode_code: Number(window.BRWheelApp.byId("ffbOutputMode").value),
        mode_label: window.BRWheelApp.byId("ffbOutputMode").options[window.BRWheelApp.byId("ffbOutputMode").selectedIndex].text
      };
    }
    return {
      uses_dac: false,
      phase_correct: window.BRWheelApp.byId("ffbOutputPhase").checked,
      frequency_index: Number(window.BRWheelApp.byId("ffbOutputFrequency").value),
      frequency_label: window.BRWheelApp.byId("ffbOutputFrequency").options[window.BRWheelApp.byId("ffbOutputFrequency").selectedIndex].text,
      mode_label: window.BRWheelApp.byId("ffbOutputMode").value
    };
  }

  function linkMirrorRange(mirrorId, sourceNumberId, key) {
    var mirror = window.BRWheelApp.byId(mirrorId);
    var source = window.BRWheelApp.byId(sourceNumberId);
    mirror.oninput = function () {
      ensureGainsDraft();
      source.value = mirror.value;
      module.state.gainsDraft[key] = Number(mirror.value);
      queueGainsSend();
    };
  }

  function renderGuide() {
    var wrap = window.BRWheelApp.byId("ffbGuideList");
    var items = [
      "Ganho geral: fica na aba Basico e multiplica a intensidade total dos efeitos vindos do jogo.",
      "Constante: pesa forcas continuas, como empurroes uniformes.",
      "Damper: adiciona resistencia proporcional a velocidade do movimento.",
      "Friction: adiciona atrito seco, segurando o volante perto de pequenas mudancas.",
      "Periodic: regula seno, quadrada, serrilha e outras ondas periodicas.",
      "Spring: pesa molas condicionais vindas do jogo.",
      "Inertia: simula massa e oposicao a aceleracao do volante.",
      "Auto-center: controla a forca do recentro de desktop.",
      "End stop: define a pancada nas extremidades de curso.",
      "Min torque: compensa zonas mortas do motor em baixas forcas."
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
