// Lightbox แกลเลอรี — คลิกรูปเพื่อขยาย เลื่อนซ้าย-ขวาภายในชุดเดียวกัน (ชุด SepSook แยกจากชุดของเรา)
(() => {
  const grids = [...document.querySelectorAll('.gal-grid')];
  if (!grids.length) return;
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.innerHTML = '<button class="lb-close" aria-label="ปิด">✕</button>' +
    '<button class="lb-prev" aria-label="ภาพก่อนหน้า">‹</button>' +
    '<img alt="">' +
    '<button class="lb-next" aria-label="ภาพถัดไป">›</button>' +
    '<div class="lb-cap"></div><div class="lb-count"></div>';
  document.body.appendChild(lb);
  const im = lb.querySelector('img'), cap = lb.querySelector('.lb-cap'), cnt = lb.querySelector('.lb-count');
  let list = [], idx = 0, credit = '';
  const show = i => {
    idx = (i + list.length) % list.length;
    im.src = list[idx].src; im.alt = list[idx].alt;
    cap.textContent = list[idx].alt + credit;
    cnt.textContent = (idx + 1) + ' / ' + list.length;
  };
  const close = () => { lb.classList.remove('open'); document.body.style.overflow = ''; im.removeAttribute('src'); };
  grids.forEach(g => g.addEventListener('click', e => {
    if (e.target.tagName !== 'IMG') return;
    list = [...g.querySelectorAll('img')];
    const label = g.previousElementSibling;
    credit = (label && /SepSook/i.test(label.textContent)) ? ' — 📷 เพจ SepSook' : '';
    show(list.indexOf(e.target));
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }));
  lb.querySelector('.lb-close').onclick = close;
  lb.querySelector('.lb-prev').onclick = () => show(idx - 1);
  lb.querySelector('.lb-next').onclick = () => show(idx + 1);
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === 'ArrowRight') show(idx + 1);
  });
  let tx = null;
  lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
})();

// เมนูมือถือ (hamburger)
(() => {
  const btn = document.querySelector('.menu-btn'), nav = document.querySelector('nav.main');
  if (!btn || !nav) return;
  const set = open => {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open);
    btn.textContent = open ? '\u2715' : '\u2630';
    btn.setAttribute('aria-label', open ? '\u0e1b\u0e34\u0e14\u0e40\u0e21\u0e19\u0e39' : '\u0e40\u0e1b\u0e34\u0e14\u0e40\u0e21\u0e19\u0e39');
  };
  btn.addEventListener('click', () => set(!nav.classList.contains('open')));
  nav.addEventListener('click', e => { if (e.target.tagName === 'A') set(false); });
  document.addEventListener('click', e => {
    if (nav.classList.contains('open') && !nav.contains(e.target) && e.target !== btn) set(false);
  });
})();
