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

  module.state = {
    gainsDraft: null,
    outputDraft: null,
    desktopDraft: null
  };

  module.bind = function (app) {
    var index;
    for (index = 0; index < pairs.length; index += 1) {
      bindPair(pairs[index][0], pairs[index][1], pairs[index][2]);
    }
    populateFrequency();

    app.byId("ffbApplyGains").onclick = function () {
      app.callApi("update_ffb_settings", [collectGains()]).then(function (result) {
        if (result && result.ok) {
          module.state.gainsDraft = null;
        }
      });
    };
    app.byId("ffbApplyOutput").onclick = function () {
      app.callApi("update_output_settings", [collectOutput()]).then(function (result) {
        if (result && result.ok) {
          module.state.outputDraft = null;
        }
      });
    };
    app.byId("ffbApplyDesktop").onclick = function () {
      app.callApi("update_desktop_effects", [collectDesktop()]).then(function (result) {
        if (result && result.ok) {
          module.state.desktopDraft = null;
        }
      });
    };
    app.byId("ffbOpenOutputModal").onclick = function () {
      app.getModal("ffbOutputModal").show();
    };
    app.byId("ffbResetDraft").onclick = function () {
      module.state.gainsDraft = null;
      module.state.outputDraft = null;
      module.state.desktopDraft = null;
      if (app.state.snapshot) {
        module.render(app.state.snapshot, app);
      }
    };
    bindOutputDraft();
    bindDesktopDraft();
  };

  module.render = function (snapshot, app) {
    if (!snapshot.connected) {
      module.state.gainsDraft = null;
      module.state.outputDraft = null;
      module.state.desktopDraft = null;
    }
    var gains = module.state.gainsDraft || snapshot.settings;
    populateFrequency();

    setPair("ffbGeneral", "ffbGeneralRange", gains.general_gain);
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

    app.byId("ffbApplyGains").disabled = !snapshot.connected;
    app.byId("ffbApplyOutput").disabled = !snapshot.connected || !snapshot.capabilities.supports_output_setup;
    app.byId("ffbApplyDesktop").disabled = !snapshot.connected;
    app.byId("ffbOpenOutputModal").disabled = !snapshot.connected;
  };

  function bindPair(numberId, rangeId, key) {
    var numberInput = window.BRWheelApp.byId(numberId);
    var rangeInput = window.BRWheelApp.byId(rangeId);
    numberInput.oninput = function () {
      ensureGainsDraft();
      module.state.gainsDraft[key] = Number(numberInput.value);
      rangeInput.value = numberInput.value;
    };
    rangeInput.oninput = function () {
      ensureGainsDraft();
      module.state.gainsDraft[key] = Number(rangeInput.value);
      numberInput.value = rangeInput.value;
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
      };
      element.onchange = function () {
        module.state.outputDraft = collectOutput();
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
      };
      element.onchange = function () {
        module.state.desktopDraft = collectDesktop();
      };
    });
  }

  function renderDesktop(snapshot, app) {
    var desktop = module.state.desktopDraft || snapshot.settings.desktop;
    app.idleCheck("ffbDesktopAutoCenter", desktop.auto_center);
    app.idleCheck("ffbDesktopDamper", desktop.damper);
    app.idleCheck("ffbDesktopInertia", desktop.inertia);
    app.idleCheck("ffbDesktopFriction", desktop.friction);
    app.idleCheck("ffbDesktopMonitor", desktop.monitor);
    app.idleSet("ffbDesktopAxis", desktop.axis_index);
    app.byId("ffbDesktopAxis").disabled = !snapshot.capabilities.supports_axis_select;
  }

  function renderOutput(snapshot, app) {
    var output = module.state.outputDraft || snapshot.settings.output;
    var usesDac = output.uses_dac;
    app.toggleHidden(app.byId("ffbOutputEnabledField"), !usesDac);
    app.toggleHidden(app.byId("ffbOutputFrequencyField"), usesDac);
    app.toggleHidden(app.byId("ffbOutputPhaseField"), usesDac);
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
    app.setText("ffbAxisSummary", snapshot.capabilities.supports_axis_select ? (desktop.axis_label || ["X", "Y", "Z", "RX", "RY", "RZ"][desktop.axis_index] || "-") : "Fixo na firmware", "-");
    app.setText("ffbEffectsSummary", effectNames.length ? effectNames.join(", ") : "Nenhum", "-");
  }

  function collectGains() {
    return {
      general_gain: Number(window.BRWheelApp.byId("ffbGeneral").value),
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
      axis_label: ["X", "Y", "Z", "RX", "RY", "RZ"][Number(window.BRWheelApp.byId("ffbDesktopAxis").value)] || "X",
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

  window.BRWheelApp.registerTab("ffb", module);
}());
