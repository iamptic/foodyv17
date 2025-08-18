(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn, { passive: false }); };

  const state = {
    api: (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app',
    rid: localStorage.getItem('foody_restaurant_id') || '',
    key: localStorage.getItem('foody_key') || '',
  };

  const KNOWN_CITIES = ["Москва","Санкт-Петербург","Казань","Екатеринбург","Сочи","Новосибирск","Нижний Новгород","Омск","Томск"];
  const CITY_OTHER = "Другой";

  const toastBox = $('#toast');
  const showToast = (msg) => {
    if (!toastBox) return alert(msg);
    try {
      const now = Date.now();
      if (!window.__toast) window.__toast = { last:'', ts:0 };
      if (msg && window.__toast.last === String(msg) && (now - window.__toast.ts) < 1200) return;
      window.__toast.last = String(msg); window.__toast.ts = now;
    } catch(_) {}
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    toastBox.appendChild(el); setTimeout(() => el.remove(), 4200);
  };

  function toggleLogout(visible){
    const btn = $('#logoutBtn'); if (!btn) return;
    btn.style.display = visible ? '' : 'none';
  }

  function updateCreds(){
    const el = $('#creds');
    if (el) el.textContent = JSON.stringify({ restaurant_id: state.rid, api_key: state.key }, null, 2);
  }

  function formatRuPhone(digits){
    if (!digits) return '+7 ';
    if (digits[0] === '8') digits = '7' + digits.slice(1);
    if (digits[0] === '9') digits = '7' + digits;
    if (digits[0] !== '7') digits = '7' + digits;
    digits = digits.replace(/\D+/g,'').slice(0, 11);
    const rest = digits.slice(1);
    let out = '+7 ';
    if (rest.length > 0) out += rest.slice(0,3);
    if (rest.length > 3) out += ' ' + rest.slice(3,6);
    if (rest.length > 6) out += ' ' + rest.slice(6,8);
    if (rest.length > 8) out += ' ' + rest.slice(8,10);
    return out;
  }
  function attachPhoneMask(input){
    if (!input || input.dataset.maskBound === '1') return;
    input.dataset.maskBound = '1';
    input.type = 'tel'; input.inputMode = 'tel'; input.autocomplete = 'tel';
    const handler = () => {
      const digits = (input.value || '').replace(/\D+/g,'');
      input.value = formatRuPhone(digits);
    };
    input.addEventListener('input', handler);
    input.addEventListener('blur', handler);
    handler();
  }
  function getDigits(v){ return (v||'').toString().replace(/\D+/g,''); }

  function setupPwToggle(btnId, inputId){
    const btn = document.getElementById(btnId);
    const inp = document.getElementById(inputId);
    if (!btn || !inp || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    const update = (show) => {
      inp.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      btn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
      btn.textContent = show ? '🙈' : '👁';
    };
    btn.addEventListener('click', () => {
      const show = inp.type === 'password';
      update(show);
      inp.focus({ preventScroll: true });
    });
  }

  function activateTab(tab) {
    try {
      $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      const panes = $$('.pane');
      if (panes.length) panes.forEach(p => p.classList.toggle('active', p.id === tab));
      else { const t = document.getElementById(tab); if (t) t.classList.add('active'); }
      if (tab === 'offers') loadOffers();
      if (tab === 'profile') loadProfile();
      if (tab === 'export') updateCreds();
      if (tab === 'create') initCreateTab();
    } catch (e) { console.warn('activateTab failed', e); }
  }
  on('#tabs','click', (e) => { const btn = e.target.closest('.seg-btn'); if (btn?.dataset.tab) activateTab(btn.dataset.tab); });
  on('.bottom-nav','click', (e) => { const btn = e.target.closest('.nav-btn'); if (btn?.dataset.tab) activateTab(btn.dataset.tab); });

  function gate(){
    const authed = !!(state.rid && state.key);
    if (!authed) {
      activateTab('auth');
      const tabs = $('#tabs'); if (tabs) tabs.style.display = 'none';
      const bn = $('.bottom-nav'); if (bn) bn.style.display = 'none';
      toggleLogout(false);
      return false;
    }
    const tabs = $('#tabs'); if (tabs) tabs.style.display = '';
    const bn = $('.bottom-nav'); if (bn) bn.style.display = '';
    activateTab('offers'); try{ refreshDashboard(); }catch(_){ }
    toggleLogout(true);
    return true;
  }

  on('#logoutBtn','click', () => {
    try { localStorage.removeItem('foody_restaurant_id'); localStorage.removeItem('foody_key'); } catch(_) {}
    state.rid = ''; state.key = ''; showToast('Вы вышли');
    toggleLogout(false); activateTab('auth');
    const tabs = $('#tabs'); if (tabs) tabs.style.display = 'none';
    const bn = $('.bottom-nav'); if (bn) bn.style.display = 'none';
  });

  function dtLocalToIso(v){
    if (!v) return null;
    try {
      const [d, t] = v.split(' ');
      const [Y,M,D] = d.split('-').map(x=>parseInt(x,10));
      const [h,m] = (t||'00:00').split(':').map(x=>parseInt(x,10));
      const dt = new Date(Y, (M-1), D, h, m);
      return new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16)+':00Z';
    } catch(e){ return null; }
  }

  async function api(path, { method='GET', headers={}, body=null, raw=false } = {}) {
    const url = `${state.api}${path}`;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (state.key) h['X-Foody-Key'] = state.key;
    try {
      const res = await fetch(url, { method, headers: h, body });
      if (!res.ok) {
        const ct = res.headers.get('content-type')||'';
        let msg = `${res.status} ${res.statusText}`;
        if (ct.includes('application/json')) {
          const j = await res.json().catch(()=>null);
          if (j && (j.detail || j.message)) msg = j.detail || j.message || msg;
        } else {
          const t = await res.text().catch(()=>'');
          if (t) msg += ` — ${t.slice(0,180)}`;
        }
        throw new Error(msg);
      }
      if (raw) return res;
      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? res.json() : res.text();
    } catch (err) {
      if (String(err.message).includes('Failed to fetch')) throw new Error('Не удалось связаться с сервером. Проверьте соединение или CORS.');
      throw err;
    }
  }

  const CityPicker = (() => {
    let target = null;
    function open(trg){
      target = trg;
      $('#cityModal')?.setAttribute('aria-hidden','false');
      $('#cityOtherWrap').style.display = 'none';
      $('#cityOtherInput').value = '';
      $('#citySearch').value = '';
      renderChips(KNOWN_CITIES.concat([CITY_OTHER]));
      highlightCurrent();
      setTimeout(()=> $('#citySearch')?.focus(), 10);
    }
    function close(){ $('#cityModal')?.setAttribute('aria-hidden','true'); target = null; }
    function highlightCurrent(){
      const val = getTargetInput()?.value || '';
      $$('.city-chip').forEach(ch => ch.classList.toggle('active', ch.dataset.value === val));
    }
    function getTargetInput(){ return target === 'profile' ? $('#profileCityValue') : $('#cityValue'); }
    function getTargetButton(){ return target === 'profile' ? $('#profileCityOpen') : $('#cityOpen'); }
    function setValue(city){
      const inp = getTargetInput();
      const btn = getTargetButton();
      if (inp) inp.value = city || '';
      if (btn) {
        btn.querySelector('.hint').style.display = city ? 'none' : '';
        btn.querySelector('.value').textContent = city || '';
      }
    }
    function applyOther(){
      const v = ($('#cityOtherInput')?.value || '').trim();
      if (!v) return;
      setValue(v); close();
    }
    function renderChips(items){
      const grid = $('#cityGrid'); if (!grid) return;
      grid.innerHTML = items.map(c => `<div class="city-chip" data-value="${c}">${c}</div>`).join('');
      grid.querySelectorAll('.city-chip').forEach(el => {
        el.addEventListener('click', () => {
          const val = el.dataset.value;
          if (val === CITY_OTHER) { $('#cityOtherWrap').style.display = ''; $('#cityOtherInput').focus(); }
          else { setValue(val); close(); }
        });
      });
    }
    function filter(q){
      const list = KNOWN_CITIES.filter(c => c.toLowerCase().includes(q.toLowerCase()));
      const items = q.trim() ? list.concat(list.includes(CITY_OTHER)?[]:[CITY_OTHER]) : KNOWN_CITIES.concat([CITY_OTHER]);
      renderChips(items);
      highlightCurrent();
    }
    function setInitial(btnId, inputId){
      const btn = $(btnId); const inp = $(inputId);
      if (!btn || !inp) return;
      const val = inp.value || '';
      btn.querySelector('.hint').style.display = val ? 'none' : '';
      btn.querySelector('.value').textContent = val || '';
    }
    on('#cityOpen','click', () => open('register'));
    on('#profileCityOpen','click', () => open('profile'));
    on('#cityBackdrop','click', close);
    on('#cityClose','click', close);
    on('#cityOtherApply','click', applyOther);
    on('#citySearch','input', e => filter(e.target.value || ''));
    return { open, close, setValue, setInitial };
  })();

  function bindWorkPresets(containerSel, fromSel, toSel){
    const box = document.querySelector(containerSel); if (!box) return;
    const form = box.closest('form');
    const from = form?.querySelector(fromSel);
    const to = form?.querySelector(toSel);
    if (!from || !to) return;
    box.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const f = chip.dataset.from || '';
      const t = chip.dataset.to || '';
      if (f) from.value = f;
      if (t) to.value = t;
      from.dispatchEvent(new Event('input', { bubbles: true }));
      to.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function bindDiscountPresets(){
    const box = $('#discountPresets'); if (!box) return;
    const priceEl = $('#offerPrice'), oldEl = $('#offerOldPrice');
    const round = (v) => Math.round(Number(v)||0);
    box.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      const d = Number(chip.dataset.discount || '0'); if (!d) return;
      const base = Number(oldEl?.value) || Number(priceEl?.value) || 0;
      if (!base) return;
      const discounted = base * (1 - d/100);
      if (oldEl && !Number(oldEl.value||0)) oldEl.value = String(round(base));
      if (priceEl) priceEl.value = String(round(discounted));
      priceEl?.dispatchEvent(new Event('input', { bubbles: true }));
      oldEl?.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  
  function autoRoundOfferPrice(){
    try {
      const priceEl = $('#offerPrice');
      if (!priceEl || priceEl._roundBound) return;
      const doRound = () => {
        const v = parseFloat(String(priceEl.value||'').replace(',','.'));
        if (isFinite(v)) priceEl.value = String(Math.round(v));
      };
      ['change','blur'].forEach(ev => priceEl.addEventListener(ev, doRound));
      priceEl._roundBound = true;
    } catch(_) {}
  }
function bindExpirePresets(){
    const box = $('#expirePresets'); if (!box) return;
    const ex = $('#expires_at');
    const fp = ex? ex._flatpickr : null;
    const closeChip = $('#expireToClose');
    const closeStr = localStorage.getItem('foody_work_to') || '';
    if (closeChip && closeStr) { closeChip.style.display = ''; } else if (closeChip) { closeChip.style.display = 'none'; }

    function setDate(dt){
      if (fp && typeof fp.setDate === 'function') fp.setDate(dt, true);
      else ex.value = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    }
    function todayAt(h, m){
      const now = new Date(); const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      if (dt <= now) dt.setDate(dt.getDate()+1);
      setDate(dt);
    }
    function toClose(){
      if (!closeStr) return;
      const [h,m] = closeStr.split(':').map(x=>parseInt(x,10));
      todayAt(h||21, m||0);
    }

    box.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      if (chip.dataset.action === 'close') toClose();
    });
  }

  function bindAuthToggle(){
    const loginForm = $('#loginForm');
    const regForm = $('#registerForm');
    const modeLogin = $('#mode-login');
    const modeReg = $('#mode-register');
    const forms = $('.auth-forms');
    function apply(){
      const showLogin = modeLogin ? modeLogin.checked : true;
      if (loginForm) loginForm.style.display = showLogin ? 'grid' : 'none';
      if (regForm) regForm.style.display = showLogin ? 'none' : 'grid';
      if (forms) forms.setAttribute('data-mode', showLogin ? 'login' : 'register');
      const le = $('#loginError'); if (le) le.classList.add('hidden');
      const re = $('#registerError'); if (re) re.classList.add('hidden');
    }
    if (modeLogin) modeLogin.addEventListener('change', apply);
    if (modeReg) modeReg.addEventListener('change', apply);
    try { apply(); } catch(e) { console.warn('auth toggle init failed', e); }
  }

  attachPhoneMask($('#loginPhone'));
  attachPhoneMask($('#registerPhone'));
  attachPhoneMask($('#profilePhone'));
  setupPwToggle('toggleLoginPw','loginPassword');
  setupPwToggle('toggleRegisterPw','registerPassword');
  setupPwToggle('pwOldToggle','pwOld');
  setupPwToggle('pwNewToggle','pwNew');
  bindAuthToggle();

  function showInlineError(id, text){
    const el = $(id); if (!el) { showToast(text); return; }
    el.textContent = text; el.classList.remove('hidden');
    setTimeout(()=> el.classList.add('hidden'), 6000);
  }

  // --- Auth submit handlers ---
  on('#registerForm','submit', async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button[type="submit"]'); if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
    const fd = new FormData(e.currentTarget);
    let city = (fd.get('city')||'').toString().trim();
    if (!city) { showInlineError('#registerError','Пожалуйста, выберите город'); if (btn){btn.disabled=false;btn.textContent='Зарегистрироваться';} return; }
    const phoneDigits = getDigits(fd.get('login'));
    if (phoneDigits.length < 11) { showInlineError('#registerError','Введите телефон в формате +7 900 000 00 00'); if (btn){btn.disabled=false;btn.textContent='Зарегистрироваться';} return; }

    const payload = {
      name: (fd.get('name')||'').toString().trim(),
      login: phoneDigits,
      password: (fd.get('password')||'').toString().trim(),
      city,
    };
    const address = (fd.get('address')||'').toString().trim();
    const work_from = (fd.get('work_from')||'').toString().slice(0,5) || null;
    const work_to = (fd.get('work_to')||'').toString().slice(0,5) || null;
    try {
      const r = await api('/api/v1/merchant/register_public', { method: 'POST', body: JSON.stringify(payload) });
      if (!r.restaurant_id || !r.api_key) throw new Error('Неожиданный ответ API');
      state.rid = r.restaurant_id; state.key = r.api_key;
      try {
        localStorage.setItem('foody_restaurant_id', state.rid);
        localStorage.setItem('foody_key', state.key);
        localStorage.setItem('foody_city', city);
        localStorage.setItem('foody_reg_city', city);
        if (work_from) localStorage.setItem('foody_work_from', work_from);
        if (work_to) localStorage.setItem('foody_work_to', work_to);
      } catch(_) {}
      showToast('Ресторан создан ✅');
      try {
        const body = { restaurant_id: state.rid, address: address || city, city };
        if (work_from) { body.work_from = work_from; body.open_time = work_from; }
        if (work_to)   { body.work_to   = work_to;   body.close_time = work_to; }
        await api('/api/v1/merchant/profile', { method: 'PUT', body: JSON.stringify(body) });
      } catch(e) { console.warn('profile save (hours) failed', e); }
      gate(); activateTab('profile');
    } catch (err) {
      const msg = String(err.message||'Ошибка регистрации');
      if (msg.includes('409') || /already exists/i.test(msg)) showInlineError('#registerError','Такой телефон уже зарегистрирован.');
      else if (msg.includes('password')) showInlineError('#registerError','Пароль слишком короткий (мин. 6 символов).');
      else showInlineError('#registerError', msg);
      console.error(err);
    } finally {
      if (btn){btn.disabled=false;btn.textContent='Зарегистрироваться';}
    }
  });

  on('#loginForm','submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phoneDigits = getDigits(fd.get('login'));
    if (phoneDigits.length < 11) { showInlineError('#loginError','Введите телефон в формате +7 900 000 00 00'); return; }
    const payload = { login: phoneDigits, password: (fd.get('password')||'').toString().trim() };
    try {
      const r = await api('/api/v1/merchant/login', { method: 'POST', body: JSON.stringify(payload) });
      state.rid = r.restaurant_id; state.key = r.api_key;
      try { localStorage.setItem('foody_restaurant_id', state.rid); localStorage.setItem('foody_key', state.key); } catch(_) {}
      showToast('Вход выполнен ✅');
      gate();
    } catch (err) {
      const msg = String(err.message||'');
      if (msg.includes('401') || /invalid login or password/i.test(msg)) showInlineError('#loginError', 'Неверный телефон или пароль.');
      else showInlineError('#loginError', msg || 'Ошибка входа');
      console.error(err);
    }
  });
  // --- end auth handlers ---

  function loadCityToProfileUI(city){
    const btn = $('#profileCityOpen'); const inp = $('#profileCityValue');
    if (btn && inp) {
      btn.querySelector('.hint').style.display = city ? 'none' : '';
      btn.querySelector('.value').textContent = city || '';
      inp.value = city || '';
    }
  }

  async function loadProfile() {
    if (!state.rid || !state.key) return;
    try {
      const p = await api(`/api/v1/merchant/profile?restaurant_id=${encodeURIComponent(state.rid)}`);
      const f = $('#profileForm'); if (!f) return;
      f.name.value = p.name || '';
      const phEl = $('#profilePhone'); if (phEl) { phEl.value = formatRuPhone(getDigits(p.phone)); }

      loadCityToProfileUI(p.city || localStorage.getItem('foody_city') || localStorage.getItem('foody_reg_city') || '');
      f.address.value = p.address || '';

      const lsFrom = localStorage.getItem('foody_work_from') || '';
      const lsTo   = localStorage.getItem('foody_work_to')   || '';
      const apiFrom = (p.work_from || p.open_time || '').slice(0,5);
      const apiTo   = (p.work_to   || p.close_time || '').slice(0,5);
      if (apiFrom) { f.work_from.value = apiFrom; try{ localStorage.setItem('foody_work_from', apiFrom);}catch(_){} }
      else if (lsFrom) { f.work_from.value = lsFrom; }

      if (apiTo) { f.work_to.value = apiTo; try{ localStorage.setItem('foody_work_to', apiTo);}catch(_){} }
      else if (lsTo) { f.work_to.value = lsTo; }

    } catch (err) { console.warn(err); showToast('Не удалось загрузить профиль: ' + err.message); }
  }

  on('#profileForm','submit', async (e) => {
    e.preventDefault();
    if (!state.rid || !state.key) return showToast('Сначала войдите');
    const btn = e.currentTarget.querySelector('button[type="submit"]'); if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
    const saved = $('#profileSaved'); if (saved) saved.style.display = 'none';
    const fd = new FormData(e.currentTarget);
    const city = (fd.get('city')||'').toString().trim();
    if (!city) { showInlineError('#profileError', 'Укажите город'); if (btn){btn.disabled=false;btn.textContent='Сохранить';} return; }

    let work_from = (fd.get('work_from')||'').toString().slice(0,5) || null;
    let work_to   = (fd.get('work_to')||'').toString().slice(0,5) || null;
    if ((work_from && !work_to) || (!work_from && work_to)) {
      showInlineError('#profileError', 'Заполните оба поля времени (с и до), или очистите оба.');
      if (btn){btn.disabled=false;btn.textContent='Сохранить';}
      return;
    }

    const payload = {
      restaurant_id: state.rid,
      name: (fd.get('name')||'').toString().trim() || null,
      phone: getDigits(fd.get('phone')) || null,
      address: (fd.get('address')||'').toString().trim() || null,
      city: city || null,
      open_time: work_from, close_time: work_to,
      work_from, work_to,
    };
    try {
      try {
        localStorage.setItem('foody_city', city || '');
        if (work_from) localStorage.setItem('foody_work_from', work_from);
        if (work_to) localStorage.setItem('foody_work_to', work_to);
      } catch(_) {}
      await api('/api/v1/merchant/profile', { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Профиль обновлен ✅');
      const pe = $('#profileError'); if (pe) pe.classList.add('hidden');
      if (saved) { saved.style.display = ''; setTimeout(()=> saved.style.display='none', 2500); }
      loadProfile();
    } catch (err) {
      const msg = String(err.message||'Ошибка сохранения');
      const pe = $('#profileError'); if (pe) { pe.classList.remove('hidden'); pe.textContent = msg; }
      showToast(msg);
      console.error(err);
    } finally {
      if (btn){btn.disabled=false;btn.textContent='Сохранить';}
    }
  });

  on('#pwForm','submit', async (e) => {
    e.preventDefault();
    if (!state.rid || !state.key) return showToast('Сначала войдите');
    const btn = e.currentTarget.querySelector('button[type="submit"]'); if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
    const err = $('#pwError'); const ok = $('#pwSaved'); if (err) err.classList.add('hidden'); if (ok) ok.style.display = 'none';
    const oldp = $('#pwOld')?.value || ''; const newp = $('#pwNew')?.value || ''; const new2 = $('#pwNew2')?.value || '';
    if (newp.length < 6) { if (err){err.textContent='Новый пароль слишком короткий (мин. 6 символов).'; err.classList.remove('hidden');} if (btn){btn.disabled=false;btn.textContent='Сменить пароль';} return; }
    if (newp !== new2) { if (err){err.textContent='Пароли не совпадают.'; err.classList.remove('hidden');} if (btn){btn.disabled=false;btn.textContent='Сменить пароль';} return; }
    try {
      await api('/api/v1/merchant/password', { method: 'PUT', body: JSON.stringify({ restaurant_id: state.rid, old_password: oldp, new_password: newp }) });
      showToast('Пароль изменён ✅'); if (ok){ ok.style.display=''; setTimeout(()=> ok.style.display='none', 2500); }
      $('#pwOld').value=''; $('#pwNew').value=''; $('#pwNew2').value='';
    } catch (e2) {
      const msg = String(e2.message||'Ошибка'); if (err){ err.textContent = /401|invalid/i.test(msg) ? 'Неверный текущий пароль.' : msg; err.classList.remove('hidden'); }
    } finally {
      if (btn){btn.disabled=false;btn.textContent='Сменить пароль';}
    }
  });

  function initCreateTab(){
    try {
      const ex = $('#expires_at');
      if (window.flatpickr && ex && !ex._flatpickr) {
        if (window.flatpickr.l10ns && window.flatpickr.l10ns.ru) { flatpickr.localize(flatpickr.l10ns.ru); }
        flatpickr('#expires_at', {
          enableTime: true, time_24hr: true, minuteIncrement: 5,
          dateFormat: 'Y-m-d H:i', altInput: true, altFormat: 'd.m.Y H:i',
          defaultDate: new Date(Date.now() + 60*60*1000), minDate: 'today'
        });
      }
      bindDiscountPresets();
      bindExpirePresets();
      const bb = $('#best_before');
      if (window.flatpickr && bb && !bb._flatpickr) {
        if (window.flatpickr.l10ns && window.flatpickr.l10ns.ru) { flatpickr.localize(flatpickr.l10ns.ru); }
        flatpickr('#best_before', {
          enableTime: true, time_24hr: true, minuteIncrement: 5,
          dateFormat: 'Y-m-d H:i', altInput: true, altFormat: 'd.m.Y H:i',
          minDate: 'today'
        });
      }
      
      autoRoundOfferPrice();
    } catch (e) {}
  }

  async function loadOffers() {
    if (!state.rid || !state.key) return;
    const root = $('#offerList'); if (root) root.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const data = await api(`/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(state.rid)}`);
      const list = (data && (data.items || data.results)) ? (data.items || data.results) : (Array.isArray(data) ? data : []);
      renderOffers(list);
    } catch (err) { console.error(err); if (root) root.innerHTML = '<div class="hint">Не удалось загрузить</div>'; }
  }

  function renderOffers(items){
    const root = $('#offerList'); if (!root) return;
    if (!Array.isArray(items) || items.length === 0) { root.innerHTML = '<div class="hint">Пока нет офферов</div>'; return; }
    const fmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    const rows = items.map(o => {
      const price = o.price_cents!=null ? o.price_cents/100 : (o.price!=null ? Number(o.price) : 0);
      const old   = o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price!=null ? Number(o.original_price) : 0);
      const disc = old>0 ? Math.round((1 - price/old)*100) : 0;
      const exp = o.expires_at ? fmt.format(new Date(o.expires_at)) : '—';
      return `<div class="row" data-offer-id="${o.id}">
        <div>${o.title || '—'}</div>
        <div>${price.toFixed(2)}</div>
        <div>${disc?`-${disc}%`:'—'}</div>
        <div>${o.qty_left ?? '—'} / ${o.qty_total ?? '—'}</div>
        <div>${exp}</div>
        <div class="actions"><button class="btn btn-ghost" data-action="delete">Удалить</button></div>
      </div>`;
    }).join('');
    const head = `<div class="row head"><div>Название</div><div>Цена</div><div>Скидка</div><div>Остаток</div><div>До</div><div></div></div>`;
    root.innerHTML = head + rows;
    // bind delete (delegated)
    if (!root.dataset.deleteBound){
      root.dataset.deleteBound = '1';
      root.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="delete"]'); if (!btn) return;
        const row = btn.closest('.row'); const id = row && row.getAttribute('data-offer-id'); if (!id) return;
        if (!confirm('Удалить оффер?')) return;
        try {
          await api(`/api/v1/merchant/offers/${id}`, { method: 'DELETE' });
          row.remove();
          try { refreshDashboard && refreshDashboard(); } catch(_){}
          showToast('Оффер удалён');
        } catch (err) {
          showToast('Не удалось удалить: '+ (err.message||err));
        }
      });
    }
  }

  
let __dashLastData = null;
// === Dashboard helpers (lightweight) ===
function safeNum(v){ const n = Number(v); return isFinite(n) ? n : 0; }
function parseMaybeDate(v){
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return new Date(v.replace(' ', 'T'));
  try { const d = new Date(v); return isNaN(d) ? null : d; } catch(_){ return null; }
}
function moneyFmt(n){ try{ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' '); }catch(_){ return String(n); }}

function renderDashboard(offers){
  const guest = document.getElementById('dashGuest');
  const stats = document.getElementById('dashStats');
  const acts  = document.getElementById('dashActions');
  if (!stats || !acts){ if (guest) guest.style.display='block'; return; }

  const now = new Date();
  const soon = new Date(now.getTime()+2*60*60*1000);

  let active=0, qtySum=0, soonCount=0, revenue=0;

  const arr = Array.isArray(offers) ? offers : (offers?.items || offers?.results || []);
  for (const o of arr){
    const ex = parseMaybeDate(o.expires_at || o.expiresAt || o.expires || o.until);
    const qty = o.qty_left ?? o.qtyLeft ?? o.qty ?? o.qty_total ?? o.qtyTotal ?? 0;
    const pr  = o.price ?? o.new_price ?? o.final_price ?? 0;
    const isActive = (qty>0) && (!ex || ex>now);
    if (isActive){
      active++;
      qtySum += safeNum(qty);
      revenue += safeNum(pr) * safeNum(qty);
      if (ex && ex<=soon) soonCount++;
    }
  }

  const kActive = document.getElementById('kpiActive');
  const kQty    = document.getElementById('kpiQty');
  const kRev    = document.getElementById('kpiRevenue');
  const kSoon   = document.getElementById('kpiSoon');

  if (kActive) kActive.textContent = String(active);
  if (kQty)    kQty.textContent    = String(qtySum);
  if (kRev)    kRev.textContent    = moneyFmt(revenue)+' ₽';
  if (kSoon)   kSoon.textContent   = String(soonCount);

  if (guest) guest.style.display = 'none';
  stats.style.display = '';
  acts.style.display  = '';
}

async function refreshDashboard(){
  const guest = document.getElementById('dashGuest');
  const stats = document.getElementById('dashStats');
  const acts  = document.getElementById('dashActions');

  const authed = !!(state && state.rid && state.key);
  if (!authed){
    if (guest) guest.style.display='block';
    if (stats) stats.style.display='none';
    if (acts)  acts.style.display='none';
    return;
  }
  try{
    const data = await api(`/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(state.rid)}`);
    const list = data?.items || data?.results || data || [];
    renderDashboard(list);
  }catch(e){
    if (guest) guest.style.display='block';
    if (stats) stats.style.display='none';
    if (acts)  acts.style.display='none';
  }
}


// --- Helpers for robust API POST (offers) ---
function foodyBase() {
  try {
    return (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || '';
  } catch(_) { return ''; }
}
function joinApi(path) {
  const base = foodyBase();
  if (/^https?:\/\//i.test(path)) return path;
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, '') + path;
  return path; // fallback to relative
}


// --- Strong auth POST for offers (header X-Foody-Key, no query fallbacks) ---
function foodyBase() {
  try { return (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || ''; }
  catch(_) { return ''; }
}
function joinApi(path) {
  const base = foodyBase();
  if (/^https?:\/\//i.test(path)) return path;
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, '') + path;
  return path;
}


function foodyBase() {
  try { return (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || ''; }
  catch(_) { return ''; }
}
function joinApi(path) {
  const base = foodyBase();
  if (/^https?:\/\//i.test(path)) return path;
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, '') + path;
  return path;
}
async function postOfferStrict(payload) {
  const url = joinApi('/api/v1/merchant/offers');
  const headers = { 'Content-Type': 'application/json' };
  if (state && state.key) headers['X-Foody-Key'] = state.key;
  const doReq = async (u, body) => {
    const res = await fetch(u, { method: 'POST', headers, body: JSON.stringify(body), mode: 'cors' });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json().catch(()=>({})) : await res.text();
    if (!res.ok) {
      const msg = typeof data==='object' && data && data.detail ? data.detail : ('Ошибка ' + res.status);
      const err = new Error(msg); err.status = res.status; err.data = data; throw err;
    }
    return data;
  };
  try {
    return await doReq(url, payload);
  } catch (e) {
    const msg = String(e?.data?.detail || e?.message || '');
    if (e.status === 500 && msg.includes('merchant_id')) {
      const u2 = url + (url.includes('?')?'&':'?') + 'merchant_id=' + encodeURIComponent(payload.merchant_id || payload.restaurant_id || '');
      return await doReq(u2, payload);
    }
    throw e;
  }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
      // Universal [data-tab] router (incl. dashboard buttons)
      document.addEventListener('click', (ev) => {
        try {
          const el = ev.target.closest('[data-tab]');
          if (el) { ev.preventDefault(); const t = el.getAttribute('data-tab') || el.dataset.tab; if (t) activateTab(t); }
        } catch(_) {}
      }, true);


// --- Dedup toasts for login/logout (avoid double "Вы вышли/вошли") ---
try {
  if (!window.__toastDedup && typeof window.showToast === 'function') {
    const __origShowToast = window.showToast;
    window.showToast = function(msg, ...rest) {
      try {
        if (msg && (String(msg).includes('Вы вышли') || String(msg).includes('Вы вошли'))) {
          const now = Date.now();
          if (window.__toastLast === msg && (now - (window.__toastLastTs || 0)) < 1000) {
            return; // drop duplicate within 1s
          }
          window.__toastLast = msg;
          window.__toastLastTs = now;
        }
      } catch(_) {}
      return __origShowToast(msg, ...rest);
    };
    window.__toastDedup = true;
  }
} catch(_) {}

      attachPhoneMask($('#loginPhone'));
      attachPhoneMask($('#registerPhone'));
      attachPhoneMask($('#profilePhone'));
      setupPwToggle('toggleLoginPw','loginPassword');
      setupPwToggle('toggleRegisterPw','registerPassword');
      setupPwToggle('pwOldToggle','pwOld');
      setupPwToggle('pwNewToggle','pwNew');
      CityPicker.setInitial('#cityOpen', '#cityValue');
      CityPicker.setInitial('#profileCityOpen', '#profileCityValue');
      bindWorkPresets('.work-presets[data-for="register"]', 'input[name="work_from"]', 'input[name="work_to"]');
      bindWorkPresets('.work-presets[data-for="profile"]', '#profile_work_from', '#profile_work_to');
      
// --- Dashboard actions: route buttons to tabs ---
try {
  on('#dashActions [data-tab]', 'click', (e) => {
    e.preventDefault();
    const t = e.currentTarget?.getAttribute('data-tab') || e.currentTarget?.dataset?.tab;
    if (t) activateTab(t);
  });
} catch(_) {}

// --- Offer create submit (strict auth + merchant_id) ---

// Offer create submit (strict + aliases + fallback)
on('#offerForm','submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const err = form.querySelector('#offerError');
  if (err) err.classList.add('hidden');

  const fd = new FormData(form);
  const toNum = (v) => { const n = parseFloat(String(v||'').replace(',', '.')); return isFinite(n) ? n : 0; };
  const toInt = (v) => { const n = parseInt(String(v||'').trim(), 10); return isFinite(n) ? n : 0; };
  const trim = (v) => String(v||'').trim();

  const rid = (state && (state.rid || state.restaurant_id)) || (parseInt(localStorage.getItem('foody_restaurant_id')||'0',10)) || null;

  const payload = {
    restaurant_id: rid || undefined,
    restaurantId: rid || undefined,
    merchant_id: rid || undefined,
    merchantId: rid || undefined,
    title: trim(fd.get('title')),
    original_price: toNum(fd.get('original_price')||fd.get('price_base')) || undefined,
    price: toNum(fd.get('price')),
    qty_total: toInt(fd.get('qty_total')||fd.get('quantity')),
    category: trim(fd.get('category')) || 'other',
    description: trim(fd.get('description')) || '',
    image_url: trim(fd.get('image_url')) || undefined,
  };
  const ex = trim(fd.get('expires_at'));
  if (ex) payload.expires_at = dtLocalToIso(ex) || ex;
  const bb = trim(fd.get('best_before'));
  if (bb) payload.best_before = dtLocalToIso(bb) || bb;
  
  // --- VALIDATE: expires_at must not exceed best_before ---
  {
    const parseLocal = (s)=>{
      if (!s) return null;
      try {
        const parts = s.includes('T') ? s.split('T') : s.split(' ');
        const [Y,M,D] = parts[0].split('-').map(x=>parseInt(x,10));
        const [h,m] = (parts[1]||'00:00').split(':').map(x=>parseInt(x,10));
        return new Date(Y, (M-1), D, h||0, m||0, 0, 0);
      } catch(_) { return null; }
    };
    const dEx = parseLocal(ex);
    const dBb = parseLocal(bb);
    if (dEx && dBb && dEx.getTime() > dBb.getTime()){
      showInlineError('#offerError','Срок действия оффера не может превышать срок годности продукта');
      return; // abort submit
    }
  }
;


  if (!payload.title) { showInlineError('#offerError','Укажите название'); return; }
  if (!(payload.qty_total > 0)) { showInlineError('#offerError','Количество должно быть больше 0'); return; }
  if (!(payload.price > 0)) { showInlineError('#offerError','Новая цена должна быть больше 0'); return; }
  if (payload.original_price && payload.price >= payload.original_price) { showInlineError('#offerError','Новая цена должна быть меньше обычной'); return; }
  if (!payload.expires_at) { showInlineError('#offerError','Укажите срок действия оффера'); return; }
  if (!rid) { showInlineError('#offerError','Вы не авторизованы. Войдите и попробуйте снова.'); activateTab('auth'); return; }

  const btn = form.querySelector('button[type="submit"]');
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
    await postOfferStrict(payload);
    showToast('Оффер сохранён ✓');
    try { form.reset(); } catch(_){}
    activateTab('offers');
    try { await loadOffers(); } catch(_){}
    try { refreshDashboard && refreshDashboard(); } catch(_){}
  } catch (e2) {
    showInlineError('#offerError', e2?.message || 'Ошибка при сохранении');
    if (String(e2.message||'').startsWith('401')) activateTab('auth');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить оффер'; }
  }
});
const ok = gate(); 
    try { if (ok) { refreshDashboard(); } } catch(_) {}
if (!ok) activateTab('auth');
    } catch(e){ console.error(e); const a = document.getElementById('auth'); if (a) { a.classList.add('active'); } }
  });
})();


// Foody patch: make "Сохранить оффер" button full width (failsafe)
(function(){
  const onReady = (fn)=>{ if (document.readyState==='complete' || document.readyState==='interactive') setTimeout(fn,0);
                          else document.addEventListener('DOMContentLoaded', fn); };
  onReady(()=>{
    try {
      const form = document.getElementById('offerForm');
      if (!form) return;
      const btn = form.querySelector('button[type="submit"]');
      if (btn){ btn.classList.add('full'); btn.style.width='100%'; btn.style.display='block'; }
    } catch(_){}
  });
})();
