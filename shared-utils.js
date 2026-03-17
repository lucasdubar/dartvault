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

// ── TTS (Text-to-Speech) ──
function speak(text, delay) {
  if (localStorage.getItem('dartvault_tts') === 'off') return;
  if (!window.speechSynthesis) return;
  setTimeout(function(){
    window.speechSynthesis.cancel();
    var clean = text.replace(/[\u{1F000}-\u{1FFFF}|\u{2600}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F900}-\u{1F9FF}|\u{200D}|\u{20E3}|\u{E0020}-\u{E007F}|\u{2702}-\u{27B0}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{2B50}|\u{23CF}|\u{23E9}-\u{23F3}|\u{231A}-\u{231B}]/gu, '').replace(/\s+/g,' ').trim();
    var u = new SpeechSynthesisUtterance(clean);
    u.lang = (window.DV_LANG && DV_LANG.get() === 'en') ? 'en-US' : 'fr-FR';
    u.rate = 1.2;
    u.pitch = 0.8;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  }, delay || 0);
}

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
