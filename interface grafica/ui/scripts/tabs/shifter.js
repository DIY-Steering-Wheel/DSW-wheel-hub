(function () {
  var module = {};

  module.state = {
    draft: null,
    timer: null,
    drag: null
  };

  module.bind = function (app) {
    ["shifterCfgReverse", "shifterCfgGear8", "shifterCfgInvertX", "shifterCfgInvertY"].forEach(function (id) {
      app.byId(id).onchange = function () {
        ensureDraft();
        module.state.draft.cfg = collectCfg();
        renderDraftMeta();
        queueSend();
      };
    });
    bindBoundaryDrag();
  };

  module.render = function (snapshot, app) {
    var shifter;
    var slot;
    if (!snapshot.shifter.available) {
      return;
    }

    if (!snapshot.connected) {
      module.state.draft = null;
      stopTimer();
    }

    shifter = mergeDraft(snapshot.shifter);
    slot = estimateSlot(shifter);

    app.idleCheck("shifterCfgReverse", !!shifter.cfg_flags.reverse_inverted);
    app.idleCheck("shifterCfgGear8", !!shifter.cfg_flags.gear8_mode);
    app.idleCheck("shifterCfgInvertX", !!shifter.cfg_flags.invert_x);
    app.idleCheck("shifterCfgInvertY", !!shifter.cfg_flags.invert_y);
    app.setText("shifterLiveValue", snapshot.shifter.live.x + " / " + snapshot.shifter.live.y, "");
    app.setText("shifterSlotValue", slot.label, "");
    app.setText(
      "shifterReverseHint",
      "Reverse usa a entrada " + window.BRWheelApp.text(snapshot.capabilities.reverse_button_port, "button0") + ". Ligue o botao de reverse nessa porta; quando ativado, a firmware troca a ultima faixa da grade por marcha a re.",
      ""
    );

    renderVisual(shifter, snapshot.shifter.live, slot.key);
    renderDraftMeta(shifter);
  };

  function stopTimer() {
    if (module.state.timer) {
      window.clearTimeout(module.state.timer);
      module.state.timer = null;
    }
  }

  function ensureDraft() {
    var snapshot = window.BRWheelApp.state.snapshot;
    if (!module.state.draft && snapshot) {
      module.state.draft = {
        cal: snapshot.shifter.cal.slice(0, 5),
        cfg: snapshot.shifter.cfg
      };
    }
  }

  function mergeDraft(shifter) {
    var merged = JSON.parse(JSON.stringify(shifter));
    if (module.state.draft) {
      merged.cal = module.state.draft.cal.slice(0, 5);
      merged.cfg = module.state.draft.cfg;
      merged.cfg_flags = decodeCfg(module.state.draft.cfg);
    }
    return merged;
  }

  function estimateSlot(shifter) {
    var x = Number(shifter.live.x || 0);
    var y = Number(shifter.live.y || 0);
    var a = Number(shifter.cal[0] || 0);
    var b = Number(shifter.cal[1] || 255);
    var c = Number(shifter.cal[2] || 511);
    var d = Number(shifter.cal[3] || 255);
    var e = Number(shifter.cal[4] || 511);
    var col;
    var row;
    var key = "N";
    var label = "Neutral";

    if (x < a) {
      col = 0;
    } else if (x < b) {
      col = 1;
    } else if (x < c) {
      col = 2;
    } else {
      col = 3;
    }

    if (y < d) {
      row = "top";
    } else if (y < e) {
      row = "mid";
    } else {
      row = "bottom";
    }

    if (row === "mid") {
      key = "N";
      label = "Neutral";
    } else if (col === 0) {
      key = row === "top" ? "1" : "2";
      label = key;
    } else if (col === 1) {
      key = row === "top" ? "3" : "4";
      label = key;
    } else if (col === 2) {
      key = row === "top" ? "5" : "6";
      label = key;
    } else if (shifter.cfg_flags.gear8_mode) {
      key = row === "top" ? "7" : "8";
      label = key;
    } else {
      key = "R";
      label = "Reverse";
    }

    return { key: key, label: label };
  }

  function renderVisual(shifter, live, activeKey) {
    positionBoundary("shifterBoundaryX0", "x", shifter.cal[0]);
    positionBoundary("shifterBoundaryX1", "x", shifter.cal[1]);
    positionBoundary("shifterBoundaryX2", "x", shifter.cal[2]);
    positionBoundary("shifterBoundaryY0", "y", shifter.cal[3]);
    positionBoundary("shifterBoundaryY1", "y", shifter.cal[4]);
    positionMarker(live);
    window.BRWheelApp.setText("shifterSlotRightTop", shifter.cfg_flags.gear8_mode ? "7" : "R", "");
    window.BRWheelApp.setText("shifterSlotRightBottom", shifter.cfg_flags.gear8_mode ? "8" : "R", "");
    window.BRWheelApp.setText("shifterNeutralLabel", activeKey, "");
    highlightActiveGear(activeKey);
  }

  function renderDraftMeta(shifter) {
    var active = shifter || mergeDraft(window.BRWheelApp.state.snapshot.shifter);
    var cal = active.cal;
    window.BRWheelApp.setText("shifterCalAValue", cal[0], "");
    window.BRWheelApp.setText("shifterCalBValue", cal[1], "");
    window.BRWheelApp.setText("shifterCalCValue", cal[2], "");
    window.BRWheelApp.setText("shifterCalDValue", cal[3], "");
    window.BRWheelApp.setText("shifterCalEValue", cal[4], "");
    window.BRWheelApp.setText("shifterXCutSummary", "X: " + cal[0] + " / " + cal[1] + " / " + cal[2], "");
    window.BRWheelApp.setText("shifterYCutSummary", "Y: " + cal[3] + " / " + cal[4], "");
  }

  function positionBoundary(id, axis, value) {
    var element = window.BRWheelApp.byId(id);
    var maxValue = currentAnalogLimit();
    var pct = Math.max(0, Math.min(maxValue, Number(value || 0))) / maxValue * 100;
    if (axis === "x") {
      element.style.left = pct + "%";
    } else {
      element.style.top = pct + "%";
    }
  }

  function positionMarker(live) {
    var marker = window.BRWheelApp.byId("shifterLiveMarker");
    var maxValue = currentAnalogLimit();
    marker.style.left = (Math.max(0, Math.min(maxValue, Number(live.x || 0))) / maxValue * 100) + "%";
    marker.style.top = (Math.max(0, Math.min(maxValue, Number(live.y || 0))) / maxValue * 100) + "%";
  }

  function highlightActiveGear(activeKey) {
    var labels = document.querySelectorAll(".shifter-slot-label");
    labels.forEach(function (label) {
      label.classList.toggle("active", label.textContent === String(activeKey));
    });
  }

  function bindBoundaryDrag() {
    var boundaries = document.querySelectorAll(".shifter-boundary");

    boundaries.forEach(function (boundary) {
      boundary.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        ensureDraft();
        module.state.drag = {
          axis: boundary.getAttribute("data-axis"),
          index: Number(boundary.getAttribute("data-index"))
        };
        if (boundary.setPointerCapture) {
          boundary.setPointerCapture(event.pointerId);
        }
      });
    });

    document.addEventListener("pointermove", function (event) {
      var grid;
      var rect;
      var value;
      if (!module.state.drag) {
        return;
      }
      grid = window.BRWheelApp.byId("shifterVisualGrid");
      rect = grid.getBoundingClientRect();
      if (module.state.drag.axis === "x") {
        value = Math.round(((event.clientX - rect.left) / rect.width) * currentAnalogLimit());
      } else {
        value = Math.round(((event.clientY - rect.top) / rect.height) * currentAnalogLimit());
      }
      setBoundaryValue(module.state.drag.axis, module.state.drag.index, value);
    });

    document.addEventListener("pointerup", function () {
      module.state.drag = null;
    });
  }

  function setBoundaryValue(axis, index, value) {
    var bounds;
    var shifter;
    ensureDraft();
    if (axis === "x") {
      bounds = module.state.draft.cal.slice(0, 3);
      bounds[index] = clamp(value);
      bounds.sort(sortNumber);
      module.state.draft.cal[0] = bounds[0];
      module.state.draft.cal[1] = bounds[1];
      module.state.draft.cal[2] = bounds[2];
    } else {
      bounds = module.state.draft.cal.slice(3, 5);
      bounds[index] = clamp(value);
      bounds.sort(sortNumber);
      module.state.draft.cal[3] = bounds[0];
      module.state.draft.cal[4] = bounds[1];
    }
    shifter = mergeDraft(window.BRWheelApp.state.snapshot.shifter);
    renderVisual(shifter, window.BRWheelApp.state.snapshot.shifter.live, estimateSlot(shifter).key);
    renderDraftMeta(shifter);
    queueSend();
  }

  function queueSend() {
    stopTimer();
    module.state.timer = window.setTimeout(function () {
      window.BRWheelApp.callApi("update_shifter_settings", [collectConfig()]).then(function (result) {
        if (result && result.ok) {
          module.state.draft = null;
        }
      });
    }, 220);
  }

  function collectCfg() {
    var cfg = 0;
    if (window.BRWheelApp.byId("shifterCfgReverse").checked) {
      cfg |= 1;
    }
    if (window.BRWheelApp.byId("shifterCfgGear8").checked) {
      cfg |= 2;
    }
    if (window.BRWheelApp.byId("shifterCfgInvertX").checked) {
      cfg |= 4;
    }
    if (window.BRWheelApp.byId("shifterCfgInvertY").checked) {
      cfg |= 8;
    }
    return cfg;
  }

  function collectConfig() {
    ensureDraft();
    return {
      cal_0: Number(module.state.draft.cal[0]),
      cal_1: Number(module.state.draft.cal[1]),
      cal_2: Number(module.state.draft.cal[2]),
      cal_3: Number(module.state.draft.cal[3]),
      cal_4: Number(module.state.draft.cal[4]),
      cfg: collectCfg()
    };
  }

  function decodeCfg(cfg) {
    return {
      reverse_inverted: !!(cfg & 1),
      gear8_mode: !!(cfg & 2),
      invert_x: !!(cfg & 4),
      invert_y: !!(cfg & 8)
    };
  }

  function clamp(value) {
    return Math.max(0, Math.min(currentAnalogLimit(), Number(value || 0)));
  }

  function sortNumber(a, b) {
    return a - b;
  }

  function currentAnalogLimit() {
    var snapshot = window.BRWheelApp.state.snapshot;
    return snapshot && snapshot.capabilities && snapshot.capabilities.analog_resolution ? Number(snapshot.capabilities.analog_resolution) : 1023;
  }

  window.BRWheelApp.registerTab("shifter", module);
}());
