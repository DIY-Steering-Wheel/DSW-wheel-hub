(function () {
  var module = {};

  module.bind = function (app) {
    app.byId("shifterApplyConfig").onclick = function () {
      app.callApi("update_shifter_settings", [collectConfig()]);
    };
  };

  module.render = function (snapshot, app) {
    if (!snapshot.shifter.available) {
      return;
    }

    app.idleSet("shifterCalA", snapshot.shifter.cal[0]);
    app.idleSet("shifterCalB", snapshot.shifter.cal[1]);
    app.idleSet("shifterCalC", snapshot.shifter.cal[2]);
    app.idleSet("shifterCalD", snapshot.shifter.cal[3]);
    app.idleSet("shifterCalE", snapshot.shifter.cal[4]);
    app.byId("shifterCfgReverse").checked = !!snapshot.shifter.cfg_flags.reverse_inverted;
    app.byId("shifterCfgGear8").checked = !!snapshot.shifter.cfg_flags.gear8_mode;
    app.byId("shifterCfgInvertX").checked = !!snapshot.shifter.cfg_flags.invert_x;
    app.byId("shifterCfgInvertY").checked = !!snapshot.shifter.cfg_flags.invert_y;

    app.setText("shifterLiveValue", snapshot.shifter.live.x + " / " + snapshot.shifter.live.y, "");
    setTrack("shifterAxisXBar", snapshot.shifter.live.x);
    setTrack("shifterAxisYBar", snapshot.shifter.live.y);

    var slot = estimateSlot(snapshot.shifter);
    app.setText("shifterSlotValue", slot.label, "");
    renderMatrix(snapshot.shifter, slot.key);

    app.byId("shifterApplyConfig").disabled = !snapshot.connected;
  };

  function setTrack(id, value) {
    var element = window.BRWheelApp.byId(id);
    var width = Math.round((Math.max(0, Math.min(1023, Number(value || 0))) / 1023) * 100);
    element.style.width = width + "%";
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

  function renderMatrix(shifter, activeKey) {
    var wrap = window.BRWheelApp.byId("shifterGearMatrix");
    var cells = [
      shifter.cfg_flags.gear8_mode ? "7" : "R", "5", "3", "1",
      "-", "-", "-", "-",
      shifter.cfg_flags.gear8_mode ? "8" : "R", "6", "4", "2"
    ];
    var index;
    window.BRWheelApp.clearChildren(wrap);
    for (index = 0; index < cells.length; index += 1) {
      var cell = document.createElement("div");
      cell.className = "gear-cell";
      if (cells[index] === activeKey) {
        cell.className += " active";
      }
      cell.appendChild(document.createTextNode(cells[index]));
      wrap.appendChild(cell);
    }
  }

  function collectConfig() {
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
    return {
      cal_0: Number(window.BRWheelApp.byId("shifterCalA").value),
      cal_1: Number(window.BRWheelApp.byId("shifterCalB").value),
      cal_2: Number(window.BRWheelApp.byId("shifterCalC").value),
      cal_3: Number(window.BRWheelApp.byId("shifterCalD").value),
      cal_4: Number(window.BRWheelApp.byId("shifterCalE").value),
      cfg: cfg
    };
  }

  window.BRWheelApp.registerTab("shifter", module);
}());
