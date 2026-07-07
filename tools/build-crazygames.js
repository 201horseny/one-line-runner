// Builds CrazyGames submission versions of each game from the source HTML.
// - Injects the CrazyGames HTML5 SDK v3 (init, gameplayStart/Stop)
// - Shows a midgame (interstitial) ad on Retry, muting game audio during the ad
// - Removes the "‹ 미니마니모" hub link (portal builds must be self-contained)
// Everything is guarded so the games still run standalone (no SDK present).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'crazygames');

const SDK_TAG = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n';

const CG_HELPER = `
  // ---- CrazyGames SDK (guarded — game still runs without it) ----
  var CG = (window.CrazyGames && window.CrazyGames.SDK) || null;
  var sdkReady = false;
  if (CG) { CG.init().then(function () { sdkReady = true; }).catch(function () {}); }
  function cgGameplayStart() { if (CG && sdkReady) { try { CG.game.gameplayStart(); } catch (e) {} } }
  function cgGameplayStop() { if (CG && sdkReady) { try { CG.game.gameplayStop(); } catch (e) {} } }
  function cgInterstitial(then) {
    if (!CG || !sdkReady) { then(); return; }
    var wasMuted = muted, done = false;
    var finish = function () { if (done) return; done = true; muted = wasMuted; then(); };
    try { CG.ad.requestAd('midgame', { adStarted: function () { muted = true; }, adFinished: finish, adError: finish }); }
    catch (e) { finish(); }
  }
`;

function replaceOnce(src, find, repl, label) {
  const i = src.indexOf(find);
  if (i === -1) throw new Error('anchor not found: ' + label);
  if (src.indexOf(find, i + 1) !== -1) throw new Error('anchor not unique: ' + label);
  return src.slice(0, i) + repl + src.slice(i + find.length);
}

function common(src) {
  // 1) inject SDK script tag before the first <style> (in <head>)
  src = replaceOnce(src, '<style>', SDK_TAG + '<style>', 'style tag');
  // 2) remove the hub link (regex — attributes vary a little)
  src = src.replace(/\s*<a href="\/"[^>]*>‹ 미니마니모<\/a>/, '');
  // 3) inject the SDK helper right after the standalone updateMuteBtn() call
  src = replaceOnce(src, '\n  updateMuteBtn();\n', '\n  updateMuteBtn();\n' + CG_HELPER, 'updateMuteBtn');
  return src;
}

function buildRunner() {
  let src = fs.readFileSync(path.join(ROOT, 'dagdak-dagdak.html'), 'utf8');
  src = common(src);
  src = replaceOnce(src, 'reset(); state = STATE.PLAY;', 'reset(); state = STATE.PLAY; cgGameplayStart();', 'runner start');
  src = replaceOnce(src, '    sndOver();\n', '    sndOver(); cgGameplayStop();\n', 'runner over');
  src = replaceOnce(src,
    "retryBtn.addEventListener('click', e => { e.stopPropagation(); startGame(mode); });",
    "retryBtn.addEventListener('click', e => { e.stopPropagation(); cgInterstitial(function () { startGame(mode); }); });",
    'runner retry');
  return src;
}

function buildCircle() {
  let src = fs.readFileSync(path.join(ROOT, 'bing-bing.html'), 'utf8');
  src = common(src);
  src = replaceOnce(src, '    state = STATE_PLAY;\n', '    state = STATE_PLAY; cgGameplayStart();\n', 'circle start');
  src = replaceOnce(src, '    sndMiss();\n', '    sndMiss(); cgGameplayStop();\n', 'circle over');
  src = replaceOnce(src,
    'document.getElementById("retryBtn").addEventListener("click", startGame);',
    'document.getElementById("retryBtn").addEventListener("click", function () { cgInterstitial(startGame); });',
    'circle retry');
  return src;
}

const builds = [
  { slug: 'dagdak-dagdak', html: buildRunner() },
  { slug: 'bing-bing', html: buildCircle() },
];

for (const b of builds) {
  const dir = path.join(OUT, b.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), b.html);
  // sanity: inline script still parses
  const m = b.html.match(/<script>([\s\S]*?)<\/script>/g);
  console.log(b.slug + ': written (' + b.html.length + ' bytes, ' + (m ? m.length : 0) + ' inline scripts)');
}
console.log('done -> ' + OUT);
