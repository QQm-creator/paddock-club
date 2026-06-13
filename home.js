(function () {
  var cta = document.getElementById('hero-cta');
  var showroom = document.getElementById('race');

  if (window.location.hash === '#race') {
    history.replaceState(null, '', window.location.pathname);
  }

  window.addEventListener('beforeunload', function () {
    if (window.location.hash === '#race') {
      history.replaceState(null, '', window.location.pathname);
    }
  });

  if (cta && showroom) {
    cta.addEventListener('click', function (event) {
      event.preventDefault();
      showroom.scrollIntoView({ behavior: 'smooth' });
    });
  }
})();
