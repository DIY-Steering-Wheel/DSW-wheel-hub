(function () {
  var module = {};
  var licenses = [
    "pywebview: janela nativa embutindo HTML local.",
    "pyserial: comunicacao serial com a controladora.",
    "Bootstrap 5.3 e Bootstrap Icons: componentes visuais e iconografia locais.",
    "avrdude: gravacao de firmware AVR109 para placas ATmega32U4.",
    "Os direitos e licencas especificos de cada dependencia continuam pertencendo aos respectivos autores."
  ];
  var terms = [
    "A gravacao de firmware deve ser feita com a placa correta e com energia estavel.",
    "Perfis aplicam configuracoes diretamente no hardware conectado.",
    "Combinar firmware e hardware de forma incorreta pode gerar comportamento inesperado.",
    "Antes de sobrescrever perfil ou firmware, confirme se a base atual e a desejada sao compativeis."
  ];
  var legal = [
    "Este app opera localmente no computador e nao depende de servicos externos para controlar a base.",
    "Os arquivos de perfil ficam na pasta local do projeto e podem ser revisados manualmente.",
    "A deteccao de portas usa heuristica local por VID, PID, descricao e resposta serial.",
    "O uso e a redistribuicao de firmware de terceiros devem respeitar a licenca original de cada build."
  ];
  var warnings = [
    "Nao desconecte o cabo USB durante a gravacao.",
    "Durante o wizard de firmware, o botao vermelho deve ser pressionado apenas nas etapas indicadas.",
    "Se um perfil foi criado para outra combinacao de macros, revise os recursos antes de aplicar.",
    "Sempre confira encoder, saida FFB, pedais e cambio apos trocar de firmware."
  ];

  module.render = function (snapshot, app) {
    fill(app.byId("aboutLicenses"), licenses, app);
    fill(app.byId("aboutTerms"), terms, app);
    fill(app.byId("aboutLegal"), legal, app);
    fill(app.byId("aboutWarnings"), warnings, app);
  };

  function fill(wrap, items, app) {
    var index;
    app.clearChildren(wrap);
    for (index = 0; index < items.length; index += 1) {
      appendNote(wrap, items[index]);
    }
  }

  function appendNote(wrap, message) {
    var note = document.createElement("div");
    note.className = "note";
    note.appendChild(document.createTextNode(message));
    wrap.appendChild(note);
  }

  window.BRWheelApp.registerTab("about", module);
}());
