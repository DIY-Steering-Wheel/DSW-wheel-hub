(function () {
  var module = {};
  var pairs = [
    ["ffbGeneral", "ffbGeneralRange"],
    ["ffbConstant", "ffbConstantRange"],
    ["ffbDamper", "ffbDamperRange"],
    ["ffbFriction", "ffbFrictionRange"],
    ["ffbPeriodic", "ffbPeriodicRange"],
    ["ffbSpring", "ffbSpringRange"],
    ["ffbInertia", "ffbInertiaRange"],
    ["ffbCenter", "ffbCenterRange"],
    ["ffbStop", "ffbStopRange"],
    ["ffbMinTorque", "ffbMinTorqueRange"]
  ];

  module.bind = function (app) {
    var index;
    for (index = 0; index < pairs.length; index += 1) {
      bindPair(pairs[index][0], pairs[index][1]);
    }
    populateFrequency();

    app.byId("ffbApplyGains").onclick = function () {
      app.callApi("update_ffb_settings", [collectGains()]);
    };
    app.byId("ffbApplyOutput").onclick = function () {
      app.callApi("update_output_settings", [collectOutput()]);
    };
    app.byId("ffbApplyDesktop").onclick = function () {
      app.callApi("update_desktop_effects", [collectDesktop()]);
    };
  };

  module.render = function (snapshot, app) {
    populateFrequency();
    setPair("ffbGeneral", "ffbGeneralRange", snapshot.settings.general_gain);
    setPair("ffbConstant", "ffbConstantRange", snapshot.settings.constant_gain);
    setPair("ffbDamper", "ffbDamperRange", snapshot.settings.damper_gain);
    setPair("ffbFriction", "ffbFrictionRange", snapshot.settings.friction_gain);
    setPair("ffbPeriodic", "ffbPeriodicRange", snapshot.settings.periodic_gain);
    setPair("ffbSpring", "ffbSpringRange", snapshot.settings.spring_gain);
    setPair("ffbInertia", "ffbInertiaRange", snapshot.settings.inertia_gain);
    setPair("ffbCenter", "ffbCenterRange", snapshot.settings.center_gain);
    setPair("ffbStop", "ffbStopRange", snapshot.settings.stop_gain);
    setPair("ffbMinTorque", "ffbMinTorqueRange", snapshot.settings.min_torque_percent_x10);

    app.byId("ffbDesktopAutoCenter").checked = !!snapshot.settings.desktop.auto_center;
    app.byId("ffbDesktopDamper").checked = !!snapshot.settings.desktop.damper;
    app.byId("ffbDesktopInertia").checked = !!snapshot.settings.desktop.inertia;
    app.byId("ffbDesktopFriction").checked = !!snapshot.settings.desktop.friction;
    app.byId("ffbDesktopMonitor").checked = !!snapshot.settings.desktop.monitor;
    app.idleSet("ffbDesktopAxis", snapshot.settings.desktop.axis_index);
    app.byId("ffbDesktopAxis").disabled = !snapshot.capabilities.supports_axis_select;

    renderOutput(snapshot, app);

    app.byId("ffbApplyGains").disabled = !snapshot.connected;
    app.byId("ffbApplyOutput").disabled = !snapshot.connected || !snapshot.capabilities.supports_output_setup;
    app.byId("ffbApplyDesktop").disabled = !snapshot.connected;
  };

  function bindPair(numberId, rangeId) {
    var numberInput = window.BRWheelApp.byId(numberId);
    var rangeInput = window.BRWheelApp.byId(rangeId);
    numberInput.oninput = function () {
      rangeInput.value = numberInput.value;
    };
    rangeInput.oninput = function () {
      numberInput.value = rangeInput.value;
    };
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

  function renderOutput(snapshot, app) {
    var usesDac = snapshot.settings.output.uses_dac;
    app.toggleHidden(app.byId("ffbOutputEnabledField"), !usesDac);
    app.toggleHidden(app.byId("ffbOutputFrequencyField"), usesDac);
    app.toggleHidden(app.byId("ffbOutputPhaseField"), usesDac);
    app.byId("ffbOutputEnabled").checked = !!snapshot.settings.output.enabled;
    if (usesDac) {
      app.idleSet("ffbOutputMode", snapshot.settings.output.mode_code);
    } else {
      app.idleSet("ffbOutputMode", snapshot.settings.output.mode_label);
      app.idleSet("ffbOutputFrequency", snapshot.settings.output.frequency_index);
      app.byId("ffbOutputPhase").checked = !!snapshot.settings.output.phase_correct;
    }
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
      axis_index: Number(window.BRWheelApp.byId("ffbDesktopAxis").value)
    };
  }

  function collectOutput() {
    var usesDac = window.BRWheelApp.state.snapshot && window.BRWheelApp.state.snapshot.settings.output.uses_dac;
    if (usesDac) {
      return {
        enabled: window.BRWheelApp.byId("ffbOutputEnabled").checked,
        mode_code: Number(window.BRWheelApp.byId("ffbOutputMode").value)
      };
    }
    return {
      phase_correct: window.BRWheelApp.byId("ffbOutputPhase").checked,
      frequency_index: Number(window.BRWheelApp.byId("ffbOutputFrequency").value),
      mode_label: window.BRWheelApp.byId("ffbOutputMode").value
    };
  }

  window.BRWheelApp.registerTab("ffb", module);
}());
