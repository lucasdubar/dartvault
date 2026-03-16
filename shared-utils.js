/* ── DartVault Shared Utilities ── */

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
