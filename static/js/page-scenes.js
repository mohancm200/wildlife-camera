/* ==========================================================
   WildSense – Realistic live 3D forest background (v2)
   Drop-in replacement for static/js/page-scenes.js

   Uses your REAL forest photos and turns them into a living,
   interactive 3D scene: depth parallax, volumetric light rays,
   drifting mist, floating pollen, glowing spores, leaf sway.
   Pure WebGL – no Three.js, works offline.
   Draws into <div id="forest3d-background"> (already in index.html).
   ========================================================== */
/* ==========================================================
   Sidebar wildlife (inserted automatically, no HTML changes)
   1) Night-forest strip at the bottom with animals walking
   2) Each menu item has its own animal: click an option and the
      animal walks along that item, leaves paw prints, then rests.
      It also follows the "active" item while you scroll.
   ========================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function uri(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }

  function pine(cx, hgt, wd, H) {
    var top = H - hgt;
    return '<polygon points="' + (cx - wd / 2) + ',' + H + ' ' + cx + ',' + top + ' ' + (cx + wd / 2) + ',' + H + '"/>' +
           '<polygon points="' + (cx - wd * 0.4) + ',' + (H - hgt * 0.35) + ' ' + cx + ',' + (top - hgt * 0.12) +
           ' ' + (cx + wd * 0.4) + ',' + (H - hgt * 0.35) + '"/>';
  }
  function treeTile(W, H, list, fill) {
    var p = '';
    list.forEach(function (t) { p += pine(t[0], t[1], t[2], H); });
    return uri('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '"><g fill="' + fill + '">' + p + '</g></svg>');
  }
  var farTrees = treeTile(120, 50, [[14, 34, 20], [46, 46, 24], [78, 32, 18], [104, 42, 22]], '#12402b');
  var midTrees = treeTile(150, 62, [[20, 50, 28], [72, 58, 32], [118, 44, 26]], '#0a2616');
  var grass = uri('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="12" viewBox="0 0 48 12">' +
    '<path fill="#1d5c33" d="M0 12L2 3L4 12L7 5L9 12L13 1L16 12L20 6L22 12L27 3L30 12L34 7L36 12L41 2L44 12L48 12Z"/></svg>');

  function legs(list, y, h, w) {
    return list.map(function (l) {
      return '<rect class="ws-leg ' + l[1] + '" x="' + l[0] + '" y="' + y + '" width="' + w +
             '" height="' + h + '" rx="' + (w / 2) + '"/>';
    }).join('');
  }

  /* ---------- animals (side view, facing right) ---------- */
  var deer =
    '<svg viewBox="0 -7 64 51" width="58" height="47" style="--a:24deg;--d:.8s">' +
    '<g fill="#b98d52">' + legs([[16, 'b'], [21, 'a'], [34, 'a'], [39, 'b']], 24, 20, 2.6) +
    '<g class="ws-body"><ellipse cx="28" cy="20" rx="15" ry="7.5"/>' +
    '<path d="M38 16L47 6L51 9L43 22Z"/><path d="M46 6L56 9L57 12L50 13Z"/>' +
    '<path d="M46 5L44 1L49 4Z"/><path d="M13 16L9 13L12 19Z"/>' +
    '<path d="M48 5L46 -1L43 -3M46 -1L48 -5" fill="none" stroke="#d9c08a" stroke-width="1.2" stroke-linecap="round"/>' +
    '<ellipse cx="22" cy="23" rx="8" ry="2" fill="#e6cf9f" opacity=".5"/></g></g></svg>';

  function cat(color, marks, muzzle) {
    return '<svg viewBox="0 0 80 40" width="66" height="33" style="--a:28deg;--d:.6s">' +
      '<g fill="' + color + '">' + legs([[18, 'b'], [24, 'a'], [50, 'a'], [56, 'b']], 25, 15, 3.4) +
      '<g class="ws-body"><path d="M14 18Q3 18 5 5" fill="none" stroke="' + color + '" stroke-width="3.4" stroke-linecap="round"/>' +
      '<ellipse cx="36" cy="19" rx="22" ry="8.5"/><ellipse cx="62" cy="15" rx="9" ry="7"/>' +
      '<circle cx="57" cy="8.5" r="2.6"/><circle cx="66" cy="8.5" r="2.6"/>' +
      '<ellipse cx="69" cy="18" rx="3.6" ry="2.6" fill="' + muzzle + '"/>' +
      '<circle cx="65" cy="14" r=".9" fill="#1b0d03"/>' + marks + '</g></g></svg>';
  }
  var tiger = cat('#e1892b',
    '<path d="M24 12L26 25M31 11L33 26M38 11L39 26M45 12L45 24M58 9L60 13M62 8L63 12" fill="none" stroke="#2a1405" stroke-width="1.6" stroke-linecap="round"/>',
    '#f3d9b0');
  var elephant =
    '<svg viewBox="0 0 92 62" width="78" height="52" style="--a:13deg;--d:1.5s">' +
    '<g fill="#8b9a93">' + legs([[22, 'b'], [30, 'a'], [48, 'a'], [56, 'b']], 40, 22, 8) +
    '<g class="ws-body"><path d="M14 22Q8 30 11 40" fill="none" stroke="#8b9a93" stroke-width="2" stroke-linecap="round"/>' +
    '<ellipse cx="42" cy="28" rx="28" ry="18"/><ellipse cx="72" cy="26" rx="13" ry="14"/>' +
    '<ellipse cx="64" cy="27" rx="8" ry="11" fill="#6c7a74"/>' +
    '<path d="M80 28Q92 34 87 54L81 54Q85 40 76 34Z"/>' +
    '<path d="M78 36Q86 38 84 44" fill="none" stroke="#f1ede0" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="76" cy="21" r="1.1" fill="#161c19"/></g></g></svg>';

  /* ---------- shared CSS ---------- */
  var css =
    '.sidebar-bottom::before,.sb-bottom::before{display:none!important}' +
    '.ws-wild{position:relative;height:100px;margin:0 0 12px;overflow:hidden;border-radius:12px;' +
    'border:1px solid rgba(139,224,144,.2);background:linear-gradient(180deg,#0a2a3a 0%,#123b2b 62%,#0b2415 100%)}' +
    '.ws-wild .ws-moon{position:absolute;top:10px;right:20px;width:13px;height:13px;border-radius:50%;background:#f3f7e8;' +
    'box-shadow:0 0 14px 4px rgba(220,240,200,.35)}' +
    '.ws-wild .ws-layer{position:absolute;left:0;right:0;bottom:12px;background-repeat:repeat-x;background-position:0 100%;' +
    'animation:ws-scroll var(--sp) linear infinite}' +
    '.ws-wild .far{height:50px;background-image:' + farTrees + ';--tw:120px;--sp:70s;opacity:.85}' +
    '.ws-wild .mid{height:62px;background-image:' + midTrees + ';--tw:150px;--sp:34s}' +
    '.ws-wild .ground{position:absolute;left:0;right:0;bottom:0;height:16px;background:linear-gradient(#0f3320,#06150c)}' +
    '.ws-wild .grass{position:absolute;left:0;right:0;bottom:10px;height:12px;z-index:5;background-image:' + grass +
    ';background-repeat:repeat-x;background-position:0 100%;--tw:48px;animation:ws-scroll 9s linear infinite}' +
    '.ws-walker{position:absolute;left:0;z-index:3;animation:ws-walk-r var(--dur) linear infinite;animation-delay:var(--delay)}' +
    '.ws-walker.rev{animation-name:ws-walk-l}' +
    '.ws-walker.rev svg{transform:scaleX(-1)}' +
    '.ws-walker svg{display:block;overflow:visible;filter:drop-shadow(0 0 3px rgba(0,0,0,.5))}' +
    '.ws-leg{transform-box:fill-box;transform-origin:50% 8%;animation:ws-leg var(--d) ease-in-out infinite}' +
    '.ws-leg.b{fill-opacity:.72;animation-delay:calc(var(--d) * -.5)}' +
    '.ws-body{animation:ws-bob calc(var(--d) / 2) ease-in-out infinite}' +
    '.ws-ff{position:absolute;z-index:4;width:3px;height:3px;border-radius:50%;background:#d6ff7a;' +
    'box-shadow:0 0 6px 2px rgba(214,255,122,.7);animation:ws-fly 6s ease-in-out infinite}' +
    '@keyframes ws-walk-r{from{transform:translateX(-95px)}to{transform:translateX(300px)}}' +
    '@keyframes ws-walk-l{from{transform:translateX(300px)}to{transform:translateX(-95px)}}' +
    '@keyframes ws-leg{0%,100%{transform:rotate(calc(var(--a) * -1))}50%{transform:rotate(var(--a))}}' +
    '@keyframes ws-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.2px)}}' +
    '@keyframes ws-scroll{from{background-position-x:0}to{background-position-x:calc(var(--tw) * -1)}}' +
    '@keyframes ws-fly{0%,100%{transform:translate(0,0);opacity:.15}50%{transform:translate(var(--dx),var(--dy));opacity:1}}' +
    '@media (prefers-reduced-motion:reduce){.ws-wild *{animation:none!important}}';

  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- 1) bottom strip ---------- */
  var bottom = document.querySelector('.sidebar-bottom') || document.querySelector('.sb-bottom');
  if (bottom && !bottom.querySelector('.ws-wild')) {
    var flies = '';
    for (var i = 0; i < 7; i++) {
      flies += '<i class="ws-ff" style="left:' + (8 + Math.round(Math.random() * 84)) + '%;top:' +
        (22 + Math.round(Math.random() * 46)) + '%;--dx:' + (Math.round(Math.random() * 24) - 12) + 'px;--dy:' +
        (Math.round(Math.random() * 18) - 9) + 'px;animation-delay:-' + (Math.random() * 6).toFixed(1) +
        's;animation-duration:' + (4 + Math.random() * 4).toFixed(1) + 's"></i>';
    }
    var walker = function (cls, svg, dur, delay, rev, b) {
      return '<div class="ws-walker ' + cls + (rev ? ' rev' : '') + '" style="--dur:' + dur + 's;--delay:' + delay +
             's;bottom:' + b + 'px">' + svg + '</div>';
    };
    var strip = document.createElement('div');
    strip.className = 'ws-wild';
    strip.setAttribute('aria-hidden', 'true');
    strip.innerHTML =
      '<span class="ws-moon"></span><div class="ws-layer far"></div><div class="ws-layer mid"></div>' + flies +
      walker('deer', deer, 24, -3, false, 11) + walker('tiger', tiger, 18, -12, false, 10) +
      walker('elephant', elephant, 40, -14, true, 10) +
      '<div class="ground"></div><div class="grass"></div>';
    bottom.insertBefore(strip, bottom.firstChild);

    /* lion photo (golden hour) as the full sidebar background */
    var sb = document.querySelector('.sidebar');
    if (sb && !sb.querySelector('.ws-sbg')) {
      var sbCss =
        '.ws-sbg{position:absolute;left:0;top:0;right:0;bottom:0;z-index:0;overflow:hidden;pointer-events:none}' +
        '.sidebar>*:not(.ws-sbg){position:relative;z-index:1}' +
        '.sidebar nav a,.sidebar .brand,.sidebar-bottom,.sb-bottom{text-shadow:0 1px 5px rgba(0,0,0,.7)}' +
        '.ws-sbg img{position:absolute;left:-1%;top:-2%;width:104%;height:104%;object-fit:cover;object-position:0% 30%;' +
        'transform-origin:15% 22%;transition:translate .5s ease-out;animation:ws-kb 28s ease-in-out infinite alternate}' +
        '.ws-sbg::after{content:"";position:absolute;left:0;top:0;right:0;bottom:0;' +
        'background:linear-gradient(180deg,rgba(2,14,8,.30),rgba(2,14,8,.46) 50%,rgba(2,14,8,.80) 100%),' +
        'radial-gradient(circle at 80% 8%,rgba(255,190,80,.22),rgba(255,190,80,0) 55%);animation:ws-glint 7s ease-in-out infinite alternate}' +
        '.ws-dust{position:absolute;z-index:1;width:3px;height:3px;border-radius:50%;background:#ffe3a0;' +
        'box-shadow:0 0 6px 2px rgba(255,200,100,.6);animation:ws-rise linear infinite}' +
        '@keyframes ws-kb{from{transform:scale(1)}to{transform:scale(1.07)}}' +
        '@keyframes ws-glint{from{opacity:.8}to{opacity:1}}' +
        '@keyframes ws-rise{0%{transform:translate(0,0);opacity:0}15%{opacity:.9}100%{transform:translate(var(--dx),-240px);opacity:0}}' +
        '@media (prefers-reduced-motion:reduce){.ws-sbg img,.ws-sbg::after,.ws-dust{animation:none!important}}';
      var sbSt = document.createElement('style');
      sbSt.textContent = sbCss;
      document.head.appendChild(sbSt);

      var dust = '';
      for (var d = 0; d < 26; d++) {
        dust += '<i class="ws-dust" style="left:' + Math.round(Math.random() * 96) + '%;bottom:' + Math.round(Math.random() * 90) +
          '%;--dx:' + (Math.round(Math.random() * 40) - 20) + 'px;animation-duration:' + (6 + Math.random() * 5).toFixed(1) +
          's;animation-delay:-' + (Math.random() * 10).toFixed(1) + 's"></i>';
      }
      var bg = document.createElement('div');
      bg.className = 'ws-sbg';
      bg.setAttribute('aria-hidden', 'true');
      bg.innerHTML = '<img alt="" src="' + (window.WILDSENSE_LION || '/static/images/wildsense-lion.jpg') + '">' + dust;
      var lionTried = false;
      bg.firstChild.addEventListener('error', function () {
        if (!lionTried && !window.WILDSENSE_LION) { lionTried = true; this.src = '/static/images/static/images/wildsense-lion.jpg'; }
        else bg.remove();
      });
      sb.insertBefore(bg, sb.firstChild);

      if (!reduce) {
        window.addEventListener('pointermove', function (e) {
          var px = e.clientX / window.innerWidth - 0.5, py = e.clientY / window.innerHeight - 0.5;
          bg.firstChild.style.translate = (px * -16) + 'px ' + (py * -12) + 'px';
        }, { passive: true });
      }
    }
  }

})();


(function () {
  'use strict';

  var host = document.getElementById('forest3d-background');
  if (!host) {
    host = document.createElement('div');
    host.id = 'forest3d-background';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:-1;overflow:hidden;pointer-events:none;background:#102719';
    document.body.insertBefore(host, document.body.firstChild);
  }

  /* ---------- scenes (same sections / images as before) ---------- */
  var IMG = '/static/images/';
  var VID = '/static/videos/';
  var DEFAULT_SCENES = {
    overview: {
      image: IMG + 'wildsense-rainforest.jpg', video: VID + 'wildsense-rainforest.mp4', sun: [0.52, 0.78], rayCol: [1, 0.76, 0.44],
      grade: [1.03, 1.02, 0.98], ray: 0.9, mist: 0.6, pollen: 0.5, spore: 1
    },
    cameras: {
      image: IMG + 'wildsense-camera-network.jpg', video: VID + 'wildsense-camera-network.mp4', sun: [0.48, 0.88], rayCol: [1, 0.9, 0.62],
      grade: [1, 1, 1], ray: 0.8, mist: 0.5, pollen: 1, spore: 0
    },
    'connected-camera-devices': {
      image: IMG + 'wildsense-connected-devices.jpg', video: VID + 'wildsense-connected-devices.mp4', sun: [0.32, 0.83], rayCol: [1, 0.88, 0.6],
      grade: [1, 1, 1], ray: 0.8, mist: 1.0, pollen: 0.8, spore: 0
    },
    analysis: {
      image: IMG + 'wildsense-image-analysis.jpg', video: VID + 'wildsense-image-analysis.mp4', sun: [0.3, 1.0], rayCol: [0.85, 1, 0.8],
      grade: [1, 1, 1], ray: 0.6, mist: 0.5, pollen: 0, spore: 0, rain: 1
    },
    history: {
      image: IMG + 'wildsense-history-reports.jpg', video: VID + 'wildsense-history-reports.mp4', sun: [0.56, 0.8], rayCol: [1, 0.92, 0.7],
      grade: [1, 1, 1], ray: 0.7, mist: 1.2, pollen: 0.6, spore: 0
    },
    reports: {
      image: IMG + 'wildsense-history-reports.jpg', video: VID + 'wildsense-history-reports.mp4', sun: [0.56, 0.8], rayCol: [0.9, 1, 0.95],
      grade: [0.97, 1.03, 1.05], ray: 0.7, mist: 1.0, pollen: 0.5, spore: 0
    }
  };
  var SCENES = window.WILDSENSE_SCENES || DEFAULT_SCENES;
  var SECTION_IDS = ['cameras', 'connected-camera-devices', 'analysis', 'history', 'reports'];

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* hide the old CSS firefly overlay; style the canvas */
  var st = document.createElement('style');
  st.textContent =
    '#forest3d-background::after{display:none!important}' +
    '#forest3d-background canvas{position:absolute;inset:0;width:100%;height:100%;display:block}';
  document.head.appendChild(st);

  function cssFallback() {
    var s = SCENES.overview || SCENES[Object.keys(SCENES)[0]];
    host.replaceChildren();
    host.style.background = 'linear-gradient(rgba(5,16,10,.25),rgba(5,16,10,.45)),url("' +
      s.image + '") center/cover no-repeat';
  }

  host.replaceChildren();
  var canvas = document.createElement('canvas');
  host.appendChild(canvas);

  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' }) ||
           canvas.getContext('experimental-webgl');
  if (!gl) { cssFallback(); return; }
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); cssFallback(); });

  /* ---------- shaders ---------- */
  var VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FS = [
    'precision highp float;',
    'uniform sampler2D uC0,uD0,uC1,uD1;',
    'uniform vec2 uRes,uAsp,uM,uClick;',
    'uniform float uT,uMix,uScroll,uPulse,uRay0,uRay1,uMist0,uMist1,uPol0,uPol1;',
    'uniform vec3 uG0,uG1;',
    'uniform vec2 uS0,uS1;uniform float uSp0,uSp1,uRn0,uRn1;',
    'uniform vec3 uRC0,uRC1;uniform vec2 uP;uniform float uFocus;',

    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(7.1,3.7);a*=.5;}return v;}',

    'vec2 cover(vec2 uv,float ia){float sa=uRes.x/uRes.y;vec2 s=vec2(1.);',
    ' if(sa>ia)s.y=ia/sa;else s.x=sa/ia;return (uv-.5)*s+.5;}',

    /* returns rgb + farness in w; near objects shift more with the mouse */
    'vec4 scene(sampler2D c,sampler2D d,float ia,vec2 uv,vec3 g){',
    ' float zoom=1.09+uScroll*.05;',
    ' vec2 b=(cover(uv,ia)-.5)/zoom+.5;',
    ' b.y+=uScroll*.02;',
    ' float f0=texture2D(d,b).r;',
    ' vec2 w=vec2(sin(b.y*21.+uT*1.2+b.x*7.),cos(b.x*17.+uT*.9+b.y*5.))*.0006*(1.-f0)*smoothstep(.15,.85,b.y);',
    ' b+=w;',
    ' float f=texture2D(d,b+uM*(.5-f0)*.022).r;',
    ' vec2 o=uM*(.5-f)*.022;',
    ' vec2 p=clamp(b+o,.003,.997);',
    ' vec2 pb=(cover(uP,ia)-.5)/zoom+.5;pb.y+=uScroll*.02;',
    ' float fd=texture2D(d,pb).r;',
    ' float coc=clamp(abs(f-fd)*2.4-.1,0.,1.)*uFocus;',
    ' vec2 e=vec2(1.4)/uRes;vec3 c0=texture2D(c,p).rgb;',
    ' if(coc>.03){vec2 rad=coc*vec2(5.5)/uRes;vec3 acc=c0;',
    '  for(int i=0;i<8;i++){float ang=float(i)*2.39996;float rr=sqrt((float(i)+.5)/8.);',
    '   acc+=texture2D(c,p+vec2(cos(ang),sin(ang))*rr*rad).rgb;}',
    '  c0=acc/9.;}',
    ' vec3 bl=(texture2D(c,p+vec2(e.x,0.)).rgb+texture2D(c,p-vec2(e.x,0.)).rgb+texture2D(c,p+vec2(0.,e.y)).rgb+texture2D(c,p-vec2(0.,e.y)).rgb)*.25;',
    ' return vec4(max(c0+(c0-bl)*.5*(1.-coc),0.)*g,f);}',

    'float motes(vec2 uv,float sc,float sp,float seed,float r){',
    ' vec2 p=uv*vec2(sc*uRes.x/uRes.y,sc);p.y+=uT*sp;p.x+=sin(uT*.3+seed)*.3;',
    ' vec2 id=floor(p),f=fract(p)-.5;float h=hash(id+seed);',
    ' vec2 o=(vec2(hash(id+seed+1.7),hash(id+seed+3.1))-.5)*.5;',
    ' o+=.12*vec2(sin(uT*(.5+h)+h*6.28),cos(uT*(.4+h)+h*5.));',
    ' float d=length(f-o);float tw=.5+.5*sin(uT*(1.+h*2.)+h*20.);',
    ' float s=1.-smoothstep(0.,r,d);return step(.55,h)*tw*s*s;}',

    'float rain(vec2 uv,float sc,float sp,float seed){',
    ' vec2 p=vec2((uv.x+uv.y*.06)*uRes.x/uRes.y*sc,uv.y*sc*.3+uT*sp);',
    ' vec2 id=floor(p),f=fract(p);float h=hash(id+seed);',
    ' float on=step(.55,hash(id+seed+4.));',
    ' float w=1.-smoothstep(0.,.035,abs(f.x-(.2+.6*h)));',
    ' float tail=(1.-smoothstep(.15,1.,f.y))*step(.12,f.y);',
    ' return on*w*tail;}',

    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes;float asp=uRes.x/uRes.y;',
    ' vec4 A=scene(uC0,uD0,uAsp.x,uv,uG0);',
    ' vec3 col=A.rgb;float fr=A.w;float ray=uRay0,mist=uMist0,pol=uPol0,spo=uSp0,rn=uRn0;vec2 sunp=uS0;vec3 rc=uRC0;',
    ' if(uMix>.001){vec4 B=scene(uC1,uD1,uAsp.y,uv,uG1);',
    '  col=mix(A.rgb,B.rgb,uMix);fr=mix(A.w,B.w,uMix);',
    '  ray=mix(uRay0,uRay1,uMix);mist=mix(uMist0,uMist1,uMix);pol=mix(uPol0,uPol1,uMix);spo=mix(uSp0,uSp1,uMix);sunp=mix(uS0,uS1,uMix);rn=mix(uRn0,uRn1,uMix);rc=mix(uRC0,uRC1,uMix);}',

    /* volumetric light shafts */
    ' vec2 sun=sunp+uM*.03;vec2 d=(uv-sun)*vec2(asp,1.);',
    ' float ang=atan(d.y,d.x);',
    ' float r=noise(vec2(ang*9.+uT*.04,uT*.05))*.6+noise(vec2(ang*23.-uT*.03,3.))*.4;',
    ' r=smoothstep(.35,.9,r);',
    ' float fall=exp(-length(d)*1.25);',
    ' col+=rc*r*fall*ray*(.3+.7*fr)*(.8+.2*sin(uT*.4+ang*4.))*.24;',

    /* drifting ground mist */
    ' float m=fbm(vec2(uv.x*asp*1.6+uT*.015,uv.y*2.4-uT*.008))*.6+',
    '         fbm(vec2(uv.x*asp*3.-uT*.02+10.,uv.y*4.+uT*.01))*.4;',
    ' float band=(1.-smoothstep(0.,.8,uv.y))*.8+.15;',
    ' col=mix(col,vec3(.55,.72,.64)*.62,clamp(m*band*mist*(.2+.45*fr),0.,.22));',

    /* soft light that follows the pointer */
    ' vec2 dm=(uv-(uM*.5+.5))*vec2(asp,1.);',
    ' col+=vec3(1.,.95,.75)*exp(-dot(dm,dm)*10.)*.05;',

    /* pollen + glowing spores, each layer parallaxes differently */
    ' float pl=motes(uv+uM*vec2(.03,.02),14.,.02,1.3,.04)*.5',
    '        +motes(uv+uM*vec2(.07,.045),8.,.035,5.7,.05)*.7',
    '        +motes(uv+uM*vec2(.14,.09),4.,.05,9.1,.07)*.8;',
    ' col+=vec3(1.,.92,.68)*pl*pol*.4;',
    ' float sp=motes(uv+uM*.05,9.,-.03,22.4,.09)*(1.-smoothstep(0.,.55,uv.y));',
    ' col+=vec3(.35,1.,.85)*sp*.45*pol*spo;',
    ' col+=vec3(.75,.88,1.)*(rain(uv,70.,9.,2.1)*.5+rain(uv,40.,6.,7.7)*.7)*rn*.35;',

    /* click ripple of light */
    ' if(uPulse>.001){vec2 cd=(uv-uClick)*vec2(asp,1.);float rr=length(cd);',
    '  float rad=(1.-uPulse)*.7;float q=(rr-rad)*22.;col+=vec3(.6,1.,.8)*exp(-q*q)*uPulse*.22;}',

    /* vignette, contrast, grain */
    ' float vg=1.-smoothstep(.35,1.15,length((uv-.5)*vec2(asp*.8,1.1)));',
    ' col*=mix(.72,1.,vg)*.97;',
    ' col=pow(max(col,0.),vec3(.96));',
    ' col+=(hash(gl_FragCoord.xy+fract(uT)*100.)-.5)*.012;',
    ' gl_FragColor=vec4(col,1.);}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('[WildSense 3D] shader error:', e); cssFallback(); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U_ = {};
  ['uC0', 'uD0', 'uC1', 'uD1', 'uRes', 'uAsp', 'uM', 'uClick', 'uT', 'uMix', 'uScroll', 'uPulse',
   'uRay0', 'uRay1', 'uMist0', 'uMist1', 'uPol0', 'uPol1', 'uG0', 'uG1', 'uS0', 'uS1', 'uSp0', 'uSp1', 'uRn0', 'uRn1', 'uRC0', 'uRC1', 'uP', 'uFocus'].forEach(function (n) {
    U_[n] = gl.getUniformLocation(prog, n);
  });
  gl.uniform1i(U_.uC0, 0); gl.uniform1i(U_.uD0, 1);
  gl.uniform1i(U_.uC1, 2); gl.uniform1i(U_.uD1, 3);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  function makeTex(src) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /* ---------- depth estimation (distant = bright + high in frame) ---------- */
  function boxBlur(a, w, h, r) {
    var t = new Float32Array(a.length), x, y, i, s, n, xx, yy;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; n = 0;
      for (i = -r; i <= r; i++) { xx = x + i; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } }
      t[y * w + x] = s / n;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; n = 0;
      for (i = -r; i <= r; i++) { yy = y + i; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } }
      a[y * w + x] = s / n;
    }
  }

  function depthCanvas(img, asp) {
    var W = 256, H = Math.max(16, Math.round(W / asp));
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
    var f = new Float32Array(W * H), i, x, y, lum = true, data;
    try { data = g.getImageData(0, 0, W, H).data; } catch (e) { lum = false; }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      var L = lum ? (data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114) / 255 : .5;
      f[i] = .5 * L + .5 * (1 - y / H);
    }
    boxBlur(f, W, H, 4); boxBlur(f, W, H, 4);
    var mn = 1e9, mx = -1e9;
    for (i = 0; i < f.length; i++) { if (f[i] < mn) mn = f[i]; if (f[i] > mx) mx = f[i]; }
    var out = g.createImageData(W, H);
    for (i = 0; i < f.length; i++) {
      var v = Math.round(255 * (f[i] - mn) / Math.max(1e-4, mx - mn));
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    return c;
  }

  /* ---------- scene loading (cached) ---------- */
  var cache = {};

  /* finds the picture even if it was saved one folder too deep (static/images/static/images/) */
  function altPaths(u) {
    var out = [u];
    if (u.indexOf('/static/images/') !== 0 || u.indexOf('/static/images/static/') === 0) return out;
    var nest = function (x) { return x.replace('/static/images/', '/static/images/static/images/'); };
    out.push(nest(u));
    var m = /\.(jpg|jpeg|png|webp)$/i.exec(u);
    if (m) ['png', 'jpeg', 'webp'].forEach(function (e) {
      if (e !== m[1].toLowerCase()) { var v = u.slice(0, u.length - m[0].length) + '.' + e; out.push(v); out.push(nest(v)); }
    });
    return out;
  }

  /* optional real-wildlife video: replaces the photo once it has loaded */
  function attachVideo(c, cfg) {
    if (!cfg.video || reduceMotion) return;
    var v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.addEventListener('loadeddata', function () {
      if (!v.videoWidth) return;
      try {
        var d = makeTex(depthCanvas(v, v.videoWidth / v.videoHeight));
        gl.deleteTexture(c.depth); c.depth = d;
      } catch (e) { /* keep the photo's depth map */ }
      c.asp = v.videoWidth / v.videoHeight; c.video = v; c.vlast = -1;
      syncVideos();
    });
    v.addEventListener('error', function () { c.video = null; });
    v.src = cfg.video;
    v.load();
  }

  function syncVideos() {
    Object.keys(cache).forEach(function (k) {
      var c = cache[k];
      if (!c || !c.video) return;
      var want = (c === A || c === B);
      if (want && c.video.paused) {
        var pr = c.video.play(); if (pr && pr.catch) pr.catch(function () {});
      } else if (!want && !c.video.paused) c.video.pause();
    });
  }

  function uploadVideo(c) {
    var v = c && c.video;
    if (!v || v.readyState < 2 || v.paused || v.currentTime === c.vlast) return;
    c.vlast = v.currentTime;
    gl.bindTexture(gl.TEXTURE_2D, c.color);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
  }

  function loadScene(id, cb) {
    var c = cache[id];
    if (c && c.ready) return cb(c);
    if (c && c.failed) return cb(null);
    if (c && c.waiting) { c.waiting.push(cb); return; }
    c = cache[id] = { waiting: [cb] };
    var cfg = SCENES[id], urls = altPaths(cfg.image);
    if (cfg.fallback) urls.push(cfg.fallback);

    function flush(v) { var w = c.waiting; c.waiting = null; w.forEach(function (f) { f(v); }); }
    function build(img) {
      var w = img.naturalWidth, h = img.naturalHeight, src = img;
      if (w > 2048) {
        var cv = document.createElement('canvas');
        cv.width = 2048; cv.height = Math.round(h * 2048 / w);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        src = cv; w = cv.width; h = cv.height;
      }
      c.color = makeTex(src);
      c.depth = makeTex(depthCanvas(img, w / h));
      c.asp = w / h; c.cfg = cfg; c.ready = true;
      flush(c);
      attachVideo(c, cfg);
    }
    (function next(i) {
      if (i >= urls.length) { c.failed = true; flush(null); return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { try { build(img); } catch (e) { console.warn(e); next(i + 1); } };
      img.onerror = function () { next(i + 1); };
      img.src = urls[i];
    })(0);
  }

  /* ---------- state ---------- */
  var A = null, B = null, mix = 0, fading = false, fadeT = 0, currentId = '';
  var mx = 0, my = 0, tmx = 0, tmy = 0, scrollT = 0, scrollS = 0;
  var focusAmt = 0, focusT = 0;
  var pulse = 0, clickX = .5, clickY = .5, time = 2, dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  function setScene(id) {
    if (!SCENES[id]) id = 'overview';
    if (!SCENES[id] || id === currentId) return;
    currentId = id;
    loadScene(id, function (c) {
      if (!c || currentId !== id) return;
      faunaEnter(id);
      if (c.video) { try { c.video.currentTime = 0; } catch (e) {} }
      if (!A) { A = c; B = c; mix = 0; fading = false; syncVideos(); if (reduceMotion) draw(0.016); return; }
      if (fading) { A = B; mix = 0; }
      if (c === A) { fading = false; syncVideos(); return; }
      B = c; fading = true; fadeT = 0; syncVideos();
      if (reduceMotion) { A = B; mix = 0; fading = false; draw(0.016); }
    });
  }

  var lastNav = { id: '', t: 0 };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href').length > 1) { lastNav = { id: a.getAttribute('href').slice(1), t: Date.now() }; pickSection(); }
  });

  function sceneFor(id) {
    if (SCENES[id]) return id;
    var t = id.toLowerCase();
    if (/overview|home|dashboard/.test(t)) return 'overview';
    if (/history|archive/.test(t)) return 'history';
    if (/device|connect|station|webcam/.test(t)) return 'connected-camera-devices';
    if (/health|camera|network/.test(t)) return 'cameras';
    if (/analy|detect|image|wildlife|upload/.test(t)) return 'analysis';
    if (/report|reliab/.test(t)) return 'reports';
    return 'overview';
  }

  function pickSection() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollT = Math.min(1, (window.scrollY || 0) / max);
    if (window.__wsPage) { setScene(sceneFor(window.__wsPage)); return; }
    var ids = [], links = document.querySelectorAll('.sidebar a[href^="#"], nav a[href^="#"]');
    [].forEach.call(links, function (l) {
      var id = l.getAttribute('href').slice(1);
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    if (!ids.length) ids = SECTION_IDS;
    var cur = 'overview', best = -1e9, lim = window.innerHeight * 0.45;
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var top = el.getBoundingClientRect().top;
      if (top <= lim && top > best) { best = top; cur = id; }
    });
    // at the very bottom of the page, show the last menu section (Reports lives in the footer)
    if (max > 200 && (window.scrollY || 0) >= max - 40) {
      for (var q = ids.length - 1; q >= 0; q--) {
        if (document.getElementById(ids[q])) { cur = ids[q]; break; }
      }
    }
    // a menu click wins for a moment, so the scene always matches the link you pressed
    if (Date.now() - lastNav.t < 2200 && document.getElementById(lastNav.id)) cur = lastNav.id;
    setScene(sceneFor(cur));
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; pickSection(); }); }
  }, { passive: true });
  window.addEventListener('hashchange', pickSection);
  window.addEventListener('ws-page', pickSection);

  if (!reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      tmx = (e.clientX / window.innerWidth) * 2 - 1;
      tmy = -((e.clientY / window.innerHeight) * 2 - 1);
      focusT = e.pointerType === 'touch' ? 0 : 1;
    }, { passive: true });
    window.addEventListener('pointerdown', function (e) {
      pulse = 1; clickX = e.clientX / window.innerWidth; clickY = 1 - e.clientY / window.innerHeight;
    }, { passive: true });
  }

  function resize() {
    faunaResize();
    canvas.width = Math.max(2, Math.floor(window.innerWidth * dpr));
    canvas.height = Math.max(2, Math.floor(window.innerHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.063, 0.157, 0.098, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (reduceMotion && A) draw(0.016);
  }
  window.addEventListener('resize', resize);

  /* ---------- living wildlife layer (no video needed) ----------
     flocks of birds, butterflies, drifting leaves, eyes in the dark.
     Drawn on a transparent canvas above the photo; reacts to sidebar clicks. */
  var FAUNA = {
    'overview': { birds: 1, leaves: 3 },
    'cameras': { birds: 1, butterflies: 3, leaves: 7 },
    'connected-camera-devices': { birds: 1, leaves: 3 },
    'analysis': {},
    'history': { birds: 1, leaves: 4 },
    'reports': { birds: 1, leaves: 2 }
  };
  var faunaOn = !reduceMotion;
  var fcv, fctx, fw = 1, fh = 1, fdpr = 1, fItems = [], fScene = '', fT = 0, fNextBird = 1e9, fNextEye = 1e9, fLastEvent = -9;
  var fR = function (a, b) { return a + Math.random() * (b - a); };
  var fLastCX = 0, fLastCY = 0, fWind = 0, fLastStartle = -9;

  if (faunaOn) {
    fcv = document.createElement('canvas');
    host.appendChild(fcv);
    fctx = fcv.getContext('2d');
  }

  function faunaResize() {
    if (!faunaOn) return;
    fdpr = Math.min(window.devicePixelRatio || 1, 1.5);
    fw = window.innerWidth; fh = window.innerHeight;
    fcv.width = Math.floor(fw * fdpr); fcv.height = Math.floor(fh * fdpr);
  }

  function fCfg(id) { return (SCENES[id] && SCENES[id].fauna) || FAUNA[id] || {}; }

  function spawnFlock() {
    var n = 5 + Math.floor(Math.random() * 7), dir = Math.random() < 0.5 ? 1 : -1;
    var baseY = fh * fR(0.1, 0.34), sp = fw / fR(15, 24), dep = fR(0.45, 1), s = fh * (0.011 + dep * 0.011);
    var span = n * s * 1.4;
    var x0 = dir > 0 ? -60 - span : fw + 60 + span;
    for (var i = 0; i < n; i++) {
      var k = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      fItems.push({
        t: 'bird', x: x0 - dir * k * s * fR(1.9, 2.5), y: baseY + side * k * s * fR(0.8, 1.3),
        vx: dir * sp * fR(0.95, 1.05), s: s * fR(0.85, 1.15), dep: dep, ph: fR(0, 6.28), fr: fR(3.6, 5.2),
        wob: fR(0, 6.28), fade: 0, leaving: false
      });
    }
  }

  function spawnEyes() {
    var spots = [[0.07, 0.46], [0.11, 0.68], [0.93, 0.42], [0.9, 0.64], [0.05, 0.3]];
    var p = spots[Math.floor(Math.random() * spots.length)];
    fItems.push({
      t: 'eyes', x: p[0] * fw, y: p[1] * fh, r: fh * fR(0.006, 0.009), age: 0, life: fR(6, 9),
      col: Math.random() < 0.5 ? '255,205,90' : '150,255,150', nextBlink: fR(1.2, 3), blink: 0, fade: 0, leaving: false
    });
  }

  function spawnButterfly() {
    var cols = [['#f39a2b', '#d9691a'], ['#f5d54a', '#d9a21c'], ['#7fb6ff', '#4a7fd1']];
    var c = cols[Math.floor(Math.random() * cols.length)];
    fItems.push({
      t: 'fly', x: fR(0.15, 0.85) * fw, y: fR(0.5, 0.85) * fh, a: fR(0, 6.28), sp: fR(26, 48),
      s: fh * fR(0.012, 0.018), ph: fR(0, 6.28), c1: c[0], c2: c[1], fade: 0, leaving: false
    });
  }

  function spawnLeaf(anywhere) {
    var cols = ['#9bb53a', '#c4a62d', '#6f9a3a', '#b4883a'];
    fItems.push({
      t: 'leaf', x: fR(0, 1) * fw, y: anywhere ? fR(-0.1, 1) * fh : -20, vy: fR(22, 42), s: fh * fR(0.008, 0.015),
      rot: fR(0, 6.28), vr: fR(-1.2, 1.2), ph: fR(0, 6.28), sw: fR(10, 26), col: cols[Math.floor(Math.random() * cols.length)],
      fade: 0, leaving: false
    });
  }

  function faunaEnter(id) {
    if (!faunaOn || id === fScene) return;
    fScene = id;
    fItems.forEach(function (it) { it.leaving = true; });
    var c = fCfg(id), k;
    for (k = 0; k < (c.butterflies || 0); k++) spawnButterfly();
    for (k = 0; k < (c.leaves || 0); k++) spawnLeaf(true);
    fNextBird = c.birds ? fT + 0.9 : 1e9;
    fNextEye = c.eyes ? fT + 0.9 : 1e9;
  }

  /* a sidebar click brings new wildlife into view */
  function faunaEvent() {
    if (!faunaOn || fT - fLastEvent < 2.5) return;
    fLastEvent = fT;
    var c = fCfg(fScene);
    if (c.birds) fNextBird = Math.min(fNextBird, fT + 0.2);
    if (c.eyes) fNextEye = Math.min(fNextEye, fT + 0.2);
  }
  function faunaStartle(x, y) {
    if (!faunaOn || fT - fLastStartle < 3 || !fCfg(fScene).birds) return;
    fLastStartle = fT;
    var n = 6 + Math.floor(Math.random() * 4);
    for (var k = 0; k < n; k++) {
      fItems.push({
        t: 'bird', x: x + fR(-50, 50), y: Math.min(y, fh * 0.8) + fR(-10, 30), vx: fR(-140, 140), vy: -fR(130, 230),
        s: fh * fR(0.012, 0.02), dep: fR(0.6, 1), ph: fR(0, 6.28), fr: fR(6, 8.5), wob: fR(0, 6.28), fade: 0.6, leaving: false
      });
    }
  }
  window.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('a,button,input,select,textarea,label,video,.sidebar')) return;
    faunaStartle(e.clientX, e.clientY);
  }, { passive: true });
  [].forEach.call(document.querySelectorAll('.sidebar a[href^="#"]'), function (a) {
    a.addEventListener('click', faunaEvent);
  });

  function drawBird(c, it, a) {
    var s = it.s, f = Math.sin(it.ph), tip = -f * s * 0.6;
    c.globalAlpha = a; c.fillStyle = '#0a0f0c';
    c.beginPath(); c.ellipse(0, 0, s * 0.26, s * 0.09, 0, 0, 6.283); c.fill();
    for (var d = -1; d <= 1; d += 2) {
      c.beginPath(); c.moveTo(0, -s * 0.03);
      c.quadraticCurveTo(d * s * 0.5, -s * 0.4 + tip * 0.45, d * s, tip);
      c.quadraticCurveTo(d * s * 0.5, s * 0.03 + tip * 0.15, 0, s * 0.07);
      c.closePath(); c.fill();
    }
  }

  function drawFly(c, it, a) {
    var s = it.s, w = 0.18 + 0.82 * Math.abs(Math.cos(it.ph));
    c.globalAlpha = a;
    for (var d = -1; d <= 1; d += 2) {
      c.save(); c.scale(d * w, 1);
      c.fillStyle = it.c1; c.strokeStyle = 'rgba(30,15,5,.85)'; c.lineWidth = Math.max(0.6, s * 0.07);
      c.beginPath(); c.ellipse(s * 0.55, -s * 0.35, s * 0.75, s * 0.5, -0.45, 0, 6.283); c.fill(); c.stroke();
      c.fillStyle = it.c2;
      c.beginPath(); c.ellipse(s * 0.4, s * 0.32, s * 0.45, s * 0.38, 0.3, 0, 6.283); c.fill(); c.stroke();
      c.restore();
    }
    c.fillStyle = '#1a0f08';
    c.beginPath(); c.ellipse(0, 0, s * 0.09, s * 0.55, 0, 0, 6.283); c.fill();
  }

  function drawLeaf(c, it, a) {
    var s = it.s, fl = Math.max(0.12, Math.abs(Math.cos(it.ph)));
    c.globalAlpha = a; c.scale(1, fl);
    c.fillStyle = it.col;
    c.beginPath(); c.moveTo(-s, 0); c.quadraticCurveTo(0, -s * 0.7, s, 0); c.quadraticCurveTo(0, s * 0.7, -s, 0); c.fill();
    c.strokeStyle = 'rgba(20,40,10,.5)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.stroke();
  }

  function drawEyes(c, it, a) {
    var r = it.r, sep = r * 3.4, d;
    for (d = -1; d <= 1; d += 2) {
      var ex = d * sep / 2;
      c.globalCompositeOperation = 'lighter';
      var g = c.createRadialGradient(ex, 0, 0, ex, 0, r * 3.6);
      g.addColorStop(0, 'rgba(' + it.col + ',' + (0.5 * a) + ')'); g.addColorStop(1, 'rgba(' + it.col + ',0)');
      c.fillStyle = g; c.beginPath(); c.arc(ex, 0, r * 3.6, 0, 6.283); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(ex, 0); c.scale(1, Math.max(0.08, 1 - it.blink));
      c.fillStyle = 'rgba(' + it.col + ',' + a + ')';
      c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.7, d * 0.15, 0, 6.283); c.fill();
      c.fillStyle = 'rgba(10,8,0,' + (0.9 * a) + ')';
      c.beginPath(); c.ellipse(0, 0, r * 0.2, r * 0.62, 0, 0, 6.283); c.fill();
      c.restore();
    }
  }

  function faunaFrame(dt) {
    if (!faunaOn) return;
    fT += dt;
    var c = fctx, i, it;
    if (fT > fNextBird) { spawnFlock(); fNextBird = fT + fR(14, 26); }
    if (fT > fNextEye) {
      var alive = 0; fItems.forEach(function (e) { if (e.t === 'eyes' && !e.leaving) alive++; });
      if (alive < 2) spawnEyes();
      fNextEye = fT + fR(7, 14);
    }
    c.setTransform(fdpr, 0, 0, fdpr, 0, 0);
    c.clearRect(0, 0, fw, fh);
    var curX = (mx * 0.5 + 0.5) * fw, curY = (1 - (my * 0.5 + 0.5)) * fh;
    var csp = Math.min(1, (Math.abs(curX - fLastCX) + Math.abs(curY - fLastCY)) / Math.max(0.001, dt) / 900);
    fLastCX = curX; fLastCY = curY; fWind += (csp - fWind) * Math.min(1, dt * 6);
    for (i = fItems.length - 1; i >= 0; i--) {
      it = fItems[i];
      it.fade += ((it.leaving ? 0 : 1) - it.fade) * Math.min(1, dt * (it.leaving ? 2.2 : 1.2));
      if (it.leaving && it.fade < 0.02) { fItems.splice(i, 1); continue; }
      var par = (it.dep || 0.6);
      c.save();
      if (it.t === 'bird') {
        it.x += it.vx * dt; it.y += (it.vy || 0) * dt; it.ph += it.fr * dt * 6.283; it.wob += dt;
        var y = it.y + Math.sin(it.wob * 1.3) * it.s * 0.5;
        if ((it.vx > 0 && it.x > fw + 80) || (it.vx < 0 && it.x < -80) || it.y < -90) { fItems.splice(i, 1); c.restore(); continue; }
        c.translate(it.x - mx * 8 * par, y - my * 4 * par);
        drawBird(c, it, (0.5 + 0.3 * it.dep) * Math.min(1, it.fade * 1.4));
      } else if (it.t === 'fly') {
        it.a += (Math.random() - 0.5) * dt * 7;
        var bsp = it.sp, ddx = it.x - curX, ddy = it.y - curY, dd = Math.sqrt(ddx * ddx + ddy * ddy) + 0.01, RR = fh * 0.22;
        if (dd < RR) {
          var away = Math.atan2(ddy, ddx), df = Math.atan2(Math.sin(away - it.a), Math.cos(away - it.a));
          it.a += df * Math.min(1, dt * 7); bsp *= 1 + (1 - dd / RR) * 2.2; it.ph += dt * 10;
        }
        var cx = it.x + Math.cos(it.a) * bsp * dt, cy = it.y + Math.sin(it.a) * bsp * dt * 0.7;
        if (cx < fw * 0.05 || cx > fw * 0.95 || cy < fh * 0.4 || cy > fh * 0.92) it.a += Math.PI * dt * 2.2;
        it.x = cx; it.y = cy; it.ph += dt * 15;
        c.translate(it.x - mx * 10, it.y - my * 6);
        c.rotate(Math.cos(it.a) * 0.25);
        drawFly(c, it, 0.92 * it.fade);
      } else if (it.t === 'leaf') {
        it.y += it.vy * dt; it.rot += it.vr * dt; it.ph += dt * 2.2;
        var lx = it.x + Math.sin(fT * 0.7 + it.sw) * it.sw;
        var ldx = lx - curX, ldy = it.y - curY, ld = Math.sqrt(ldx * ldx + ldy * ldy) + 0.01, LR = fh * 0.26;
        if (ld < LR) {
          var push = (1 - ld / LR) * fWind * 260 * dt;
          it.x += ldx / ld * push; it.y += ldy / ld * push * 0.6;
          it.vr = Math.max(-5, Math.min(5, it.vr + (ldx / ld) * fWind * dt * 14));
        }
        if (it.y > fh + 20) {
          if (it.leaving) { fItems.splice(i, 1); c.restore(); continue; }
          it.y = -20; it.x = fR(0, 1) * fw;
        }
        c.translate(lx - mx * 14, it.y); c.rotate(it.rot);
        drawLeaf(c, it, 0.85 * it.fade);
      } else if (it.t === 'eyes') {
        it.age += dt;
        if (!it.leaving && Math.hypot(it.x - curX, it.y - curY) < fh * 0.2) it.leaving = true;
        if (it.age > it.life && !it.leaving) it.leaving = true;
        if (it.age > it.nextBlink) { it.blink = 1; it.nextBlink = it.age + fR(1.6, 3.8); }
        it.blink = Math.max(0, it.blink - dt * 7);
        c.translate(it.x - mx * 6, it.y - my * 3);
        drawEyes(c, it, Math.min(1, it.fade * 1.2));
      }
      c.restore();
    }
  }

  /* ---------- draw ---------- */
  function bind(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }

  function draw(dt) {
    if (!A) return;
    if (!reduceMotion) time += dt;
    var k = Math.min(1, dt * 3);
    mx += (tmx - mx) * k; my += (tmy - my) * k;
    scrollS += (scrollT - scrollS) * k;
    pulse *= 0.955;
    if (fading) {
      fadeT += dt / 1.4;
      mix = fadeT * fadeT * (3 - 2 * fadeT);
      if (fadeT >= 1) { A = B; mix = 0; fading = false; syncVideos(); }
    }
    var b = B || A;
    uploadVideo(A); if (b !== A) uploadVideo(b);
    bind(0, A.color); bind(1, A.depth); bind(2, b.color); bind(3, b.depth);
    gl.uniform2f(U_.uRes, canvas.width, canvas.height);
    gl.uniform2f(U_.uAsp, A.asp, b.asp);
    gl.uniform2f(U_.uM, mx * 0.9 + Math.sin(time * .11) * .12, my * 0.6 + Math.cos(time * .09) * .06);
    gl.uniform2f(U_.uClick, clickX, clickY);
    gl.uniform1f(U_.uT, time);
    gl.uniform1f(U_.uMix, mix);
    gl.uniform1f(U_.uScroll, scrollS);
    gl.uniform1f(U_.uPulse, pulse);
    var a = A.cfg, c = b.cfg;
    gl.uniform3fv(U_.uG0, a.grade || [1, 1, 1]); gl.uniform3fv(U_.uG1, c.grade || [1, 1, 1]);
    gl.uniform1f(U_.uRay0, a.ray == null ? 1 : a.ray); gl.uniform1f(U_.uRay1, c.ray == null ? 1 : c.ray);
    gl.uniform1f(U_.uMist0, a.mist == null ? 1 : a.mist); gl.uniform1f(U_.uMist1, c.mist == null ? 1 : c.mist);
    focusAmt += (focusT - focusAmt) * Math.min(1, dt * 1.5);
    gl.uniform2f(U_.uP, mx * 0.5 + 0.5, my * 0.5 + 0.5);
    gl.uniform1f(U_.uFocus, focusAmt);
    gl.uniform1f(U_.uPol0, a.pollen == null ? 1 : a.pollen); gl.uniform1f(U_.uPol1, c.pollen == null ? 1 : c.pollen);
    gl.uniform2fv(U_.uS0, a.sun || [.72, 1.1]); gl.uniform2fv(U_.uS1, c.sun || [.72, 1.1]);
    gl.uniform1f(U_.uSp0, a.spore == null ? 1 : a.spore); gl.uniform1f(U_.uSp1, c.spore == null ? 1 : c.spore);
    gl.uniform1f(U_.uRn0, a.rain || 0); gl.uniform1f(U_.uRn1, c.rain || 0);
    gl.uniform3fv(U_.uRC0, a.rayCol || [1, .9, .62]); gl.uniform3fv(U_.uRC1, c.rayCol || [1, .9, .62]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* adaptive resolution if the GPU is slow */
  var last = performance.now(), pf = 0, ps = 0, downs = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.hidden) return;
    draw(dt);
    faunaFrame(dt);
    pf++; ps += dt;
    if (pf >= 60) {
      if (ps / pf > 0.034 && downs < 2 && dpr > 0.6) { dpr *= 0.75; downs++; resize(); }
      pf = 0; ps = 0;
    }
  }

  /* optional helper: swap every scene to one image (used by the preview page) */
  window.WildSenseBackground = {
    current: function () { return currentId; },
    ready: function () { return !!A; },
    useImage: function (url) {
      Object.keys(cache).forEach(function (k) { if (cache[k] && cache[k].video) cache[k].video.pause(); });
      Object.keys(SCENES).forEach(function (k) { SCENES[k].image = url; delete SCENES[k].fallback; delete SCENES[k].video; });
      cache = {}; A = B = null; currentId = ''; pickSection();
    }
  };

  resize();
  pickSection();
  if (!reduceMotion) requestAnimationFrame(loop);
})();

/* ==========================================================
   Interactive UI touches (spotlight, tilt, ripples, reveal)
   Visual only - uses event delegation, so cards created later by
   app.js get the effects too.
   ========================================================== */
(function () {
  'use strict';
  if (window.__wsUi) return;
  window.__wsUi = true;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SPOT = '.sidebar nav a, .main-content .metric, .main-content .camera-card, .main-content .report-card';
  document.addEventListener('pointermove', function (e) {
    var t = e.target.closest && e.target.closest(SPOT);
    if (!t) return;
    var r = t.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    t.style.setProperty('--mx', x + 'px');
    t.style.setProperty('--my', y + 'px');
    if (!reduce && t.closest('.main-content')) {
      t.style.setProperty('--ry', ((x / r.width - 0.5) * 9).toFixed(2) + 'deg');
      t.style.setProperty('--rx', ((0.5 - y / r.height) * 7).toFixed(2) + 'deg');
    }
  }, { passive: true });

  document.addEventListener('pointerout', function (e) {
    var t = e.target.closest && e.target.closest('.main-content .metric, .main-content .camera-card, .main-content .report-card');
    if (t && !t.contains(e.relatedTarget)) { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); }
  }, { passive: true });

  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.primary-btn, .secondary-btn, .delete-btn');
    if (!b || b.disabled || reduce) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
    var sp = document.createElement('span');
    sp.className = 'ws-ripple';
    sp.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    b.appendChild(sp);
    setTimeout(function () { sp.remove(); }, 700);
  }, { passive: true });

  // panels slide up as they scroll into view (only the ones that start below the fold)
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('ws-rise');
        var el = en.target;
        setTimeout(function () { el.classList.remove('ws-rise'); }, 950);
        io.unobserve(en.target);
      });
    }, { threshold: 0.08 });
    [].forEach.call(document.querySelectorAll('.main-content .panel'), function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) io.observe(el);
    });
  }
})();

/* ==========================================================
   Page mode: every sidebar option opens its own full dashboard
   (only changes which sections are visible - all forms, buttons
   and data loading in app.js keep working exactly as before)
   ========================================================== */
(function () {
  'use strict';
  if (window.__wsPageMode) return;
  window.__wsPageMode = true;

  var main = document.querySelector('.main-content');
  var nav = document.querySelector('.sidebar nav');
  if (!main || !nav) return;
  var byId = function (id) { return document.getElementById(id); };
  var topOf = function (el) { while (el && el.parentElement && el.parentElement !== main) el = el.parentElement; return el; };
  var kids = [].slice.call(main.children);
  var topMetrics = main.querySelector(':scope > .metrics');
  var footer = main.querySelector(':scope > footer');

  // panels without a heading bar get one, so every page has the same header
  [].forEach.call(main.querySelectorAll(':scope > .panel'), function (p) {
    if (p.querySelector(':scope > .section-heading')) return;
    var eb = p.querySelector(':scope > .eyebrow'), h = p.querySelector(':scope > h2'), d = p.querySelector(':scope > p.muted');
    if (!eb || !h) return;
    var bar = document.createElement('div'), inner = document.createElement('div');
    bar.className = 'section-heading';
    bar.appendChild(inner);
    p.insertBefore(bar, eb);
    inner.appendChild(eb); inner.appendChild(h); if (d) inner.appendChild(d);
  });

  // Reports page: header + the summary boxes
  var reportsHead = null;
  if (footer && topMetrics && byId('reports')) {
    reportsHead = document.createElement('section');
    reportsHead.className = 'panel';
    reportsHead.innerHTML = '<div class="section-heading"><div><p class="eyebrow">CONSERVATION INTELLIGENCE</p>' +
      '<h2>Reports &amp; Reliability</h2><p class="muted">Summary of your camera network and recorded data reliability.</p></div></div>';
    main.insertBefore(reportsHead, footer);
  }

  var PAGE = {
    'overview': [byId('overview'), main.querySelector(':scope > .hero'), topMetrics],
    'cameras': [byId('cameras')],
    'camera-health': [byId('camera-health')],
    'connected-camera-devices': [byId('connected-camera-devices')],
    'analysis': [byId('analysis')],
    'history': [byId('history')],
    'reports': [reportsHead, topMetrics, byId('reports')]
  };
  // any other sidebar link whose target exists gets its own page too
  [].forEach.call(nav.querySelectorAll('a[href^="#"]'), function (a) {
    var id = a.getAttribute('href').slice(1);
    if (id && !PAGE[id] && byId(id)) PAGE[id] = [byId(id)];
  });

  var assigned = [];
  Object.keys(PAGE).forEach(function (id) {
    PAGE[id] = PAGE[id].filter(Boolean).map(topOf);
    PAGE[id].forEach(function (el) { el.setAttribute('data-ws-page', '1'); if (assigned.indexOf(el) < 0) assigned.push(el); });
  });
  kids.forEach(function (k) {            // anything not claimed stays on the Overview
    if (assigned.indexOf(k) < 0 && k.tagName !== 'SCRIPT') { k.setAttribute('data-ws-page', '1'); PAGE.overview.push(k); }
  });

  var current = '';
  function show(id, first) {
    if (!PAGE[id]) id = 'overview';
    [].forEach.call(main.querySelectorAll(':scope > [data-ws-page]'), function (el) { el.classList.remove('ws-on'); });
    PAGE[id].forEach(function (el) { el.classList.add('ws-on'); });
    document.body.setAttribute('data-ws-page', id);
    window.__wsPage = id;
    [].forEach.call(nav.querySelectorAll('a[href^="#"]'), function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + id);
    });
    if (!first && id !== current) window.scrollTo({ top: 0, behavior: 'auto' });
    current = id;
    window.dispatchEvent(new Event('ws-page'));
  }
  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (PAGE[h]) return h;
    var el = h && byId(h);
    if (el) { var t = topOf(el); for (var k in PAGE) if (PAGE[k].indexOf(t) >= 0) return k; }
    return 'overview';
  }

  document.body.classList.add('ws-paged');
  show(fromHash(), true);
  window.addEventListener('hashchange', function () { show(fromHash()); });
})();