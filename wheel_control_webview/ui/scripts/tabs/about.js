(function () {
  var module = {};

  module.render = function (snapshot, app) {
    var badges = app.byId("aboutBadges");
    var notes = app.byId("aboutNotes");
    var index;

    app.clearChildren(badges);
    for (index = 0; index < snapshot.firmware.flag_details.length; index += 1) {
      var badge = document.createElement("div");
      badge.className = "badge";
      badge.title = snapshot.firmware.flag_details[index].description;
      badge.appendChild(document.createTextNode(snapshot.firmware.flag_details[index].flag.toUpperCase() + " - " + snapshot.firmware.flag_details[index].title));
      badges.appendChild(badge);
    }

    app.clearChildren(notes);
    for (index = 0; index < snapshot.notes.length; index += 1) {
      appendNote(notes, snapshot.notes[index]);
    }
    if (snapshot.last_error) {
      appendNote(notes, "Ultimo erro: " + snapshot.last_error);
    }

    app.setText("aboutFirmware", app.text(snapshot.firmware.version, "-"), "-");
    app.setText("aboutBoard", app.text(snapshot.capabilities.board_family, "-"), "-");
    app.setText("aboutCalibration", app.text(snapshot.capabilities.pedal_calibration, "-"), "-");
    app.setText("aboutLoadCell", app.boolText(snapshot.capabilities.has_load_cell), "-");
    app.setText("aboutAds", app.boolText(snapshot.capabilities.has_ads1015), "-");
    app.setText("aboutTwoAxis", app.boolText(snapshot.capabilities.has_two_ffb_axis), "-");
  };

  function appendNote(wrap, message) {
    var note = document.createElement("div");
    note.className = "note";
    note.appendChild(document.createTextNode(message));
    wrap.appendChild(note);
  }

  window.BRWheelApp.registerTab("about", module);
}());
