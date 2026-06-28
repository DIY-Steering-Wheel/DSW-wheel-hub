(function () {
  var module = {};

  module.bind = function (app) {
    app.byId("connectionRefreshPorts").onclick = function () {
      app.callApi("refresh_ports");
    };

    app.byId("connectionRefreshSnapshot").onclick = function () {
      app.callApi("load_device_snapshot");
    };

    app.byId("connectionPortSelect").onchange = function () {
      app.byId("dockPortSelect").value = this.value;
    };

    app.byId("connectionOpenFirmware").onclick = function () {
      app.getModal("firmwareModal").show();
    };
  };

  module.render = function (snapshot, app) {
    var wrap = app.byId("connectionPortsList");
    var index;
    app.clearChildren(wrap);

    if (!snapshot.ports.length) {
      addPortItem(wrap, "Nenhuma porta candidata encontrada.", "");
    } else {
      for (index = 0; index < snapshot.ports.length; index += 1) {
        addPortItem(
          wrap,
          snapshot.ports[index].device + " - " + app.text(snapshot.ports[index].description || snapshot.ports[index].product, "porta serial"),
          "score " + snapshot.ports[index].score + " | " + app.text(snapshot.ports[index].manufacturer, "sem fabricante")
        );
      }
    }

    app.setText("connectionActivePort", app.text(snapshot.connection.port, "-"), "-");
    app.setText("connectionState", app.text(snapshot.diagnostics.controller_state_label, "-"), "-");
    app.setText("connectionEncoder", app.text(snapshot.capabilities.encoder, "-"), "-");
    app.setText("connectionOutput", app.text(snapshot.capabilities.output, "-"), "-");
    app.setText("connectionButtons", app.text(snapshot.capabilities.button_capacity, "-"), "-");
    if (snapshot.connection.vid && snapshot.connection.pid) {
      app.setText("connectionVidPid", app.hex4(snapshot.connection.vid) + ":" + app.hex4(snapshot.connection.pid), "-");
    } else {
      app.setText("connectionVidPid", "-", "-");
    }
    app.setText(
      "connectionHint",
      snapshot.connected ? "Base conectada. As abas do app foram habilitadas conforme os recursos presentes na firmware atual." : "Conecte a base para habilitar os setores modulares do app.",
      ""
    );
    app.byId("connectionOpenFirmware").disabled = !(app.state.staticData && app.state.staticData.firmware_catalog && app.state.staticData.firmware_catalog.length);
  };

  function addPortItem(wrap, title, meta) {
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

  window.BRWheelApp.registerTab("connection", module);
}());
