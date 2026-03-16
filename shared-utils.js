/* ── DartVault Shared Utilities ── */

// ── Autodarts: hide setup option if not enabled in hub ──
(function(){
  var adEnabled = localStorage.getItem('dartvault_autodarts_enabled') === '1';
  if (!adEnabled) {
    document.addEventListener('DOMContentLoaded', function(){
      var chk = document.getElementById('chk-autodarts');
      if (chk) {
        var label = chk.closest('label');
        if (label) label.style.display = 'none';
      }
      var ipRow = document.getElementById('autodarts-ip-row');
      if (ipRow) ipRow.style.display = 'none';
    });
  }
})();

// ── Viewport fix (Android height recalc) ──
function fixViewport(){
  document.documentElement.style.setProperty('--real-vh', window.innerHeight + 'px');
  document.body.style.height = window.innerHeight + 'px';
  document.body.style.maxHeight = window.innerHeight + 'px';
}
fixViewport();
window.addEventListener('resize', fixViewport);
if(screen.orientation){
  screen.orientation.addEventListener('change', function(){
    setTimeout(fixViewport, 100);
    setTimeout(fixViewport, 300);
  });
}
