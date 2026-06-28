(function () {
  var module = {};

  module.bind = function (app) {
    app.byId("serialRawSend").onclick = function () {
      app.callApi("send_raw", [app.byId("serialRawInput").value]);
    };
  };

  module.render = function (snapshot, app) {
    var wrap = app.byId("serialHistory");
    var index;
    app.clearChildren(wrap);

    if (!snapshot.history.length) {
      addItem(wrap, "Ainda nao ha historico de comandos nesta sessao.", "");
    } else {
      for (index = 0; index < snapshot.history.length && index < 24; index += 1) {
        addItem(wrap, snapshot.history[index].command + " -> " + app.text(snapshot.history[index].response, "(sem resposta)"), snapshot.history[index].time);
      }
    }

    app.byId("serialRawSend").disabled = !snapshot.connected;
  };

  function addItem(wrap, title, meta) {
    var item = document.createElement("div");
    var line = document.createElement("div");
    item.className = "serial-line";
    line.className = "serial-line-main";
    line.appendChild(document.createTextNode(title));
    item.appendChild(line);
    if (meta) {
      var small = document.createElement("small");
      small.className = "serial-line-time";
      small.appendChild(document.createTextNode(meta));
      item.appendChild(small);
    }
    wrap.appendChild(item);
  }

  window.BRWheelApp.registerTab("serial", module);
}());
