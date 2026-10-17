/**
 * StoryCast Everyday Voices/People — progressive enhancement (vanilla JS, no dependencies).
 *
 * Every page works without this file: navigation is plain links, every tab
 * panel is visible, media uses native controls and the transcript is static.
 * When JS runs it adds: mobile menu, theme toggle, story filter, ARIA tabs,
 * transcript sync, caption/description toggles, media shortcuts and form
 * validation.
 */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ------------------------------------------------------------ app bar */
  function initAppBar() {
    const bar = $('[data-app-bar]');
    if (!bar) return;
    const onScroll = () => bar.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------------------------------------------------- mobile nav menu */
  function initMenu() {
    const toggle = $('[data-menu-toggle]');
    const nav = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
    if (!toggle || !nav) return;
    const icon = $('.icon', toggle);
    const label = $('.visually-hidden', toggle);

    const setOpen = (open, { returnFocus = false } = {}) => {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      icon.textContent = open ? 'close' : 'menu';
      label.textContent = open ? 'Close menu' : 'Menu';
      if (!open && returnFocus) toggle.focus();
    };

    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false, { returnFocus: true });
    });
    // Close when focus or a click leaves the menu.
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    nav.addEventListener('focusout', (e) => {
      if (nav.classList.contains('is-open') && e.relatedTarget && !nav.contains(e.relatedTarget) && e.relatedTarget !== toggle) setOpen(false);
    });
    $$('a', nav).forEach((a) => a.addEventListener('click', () => setOpen(false)));
    window.matchMedia('(min-width: 52.5rem)').addEventListener('change', (e) => e.matches && setOpen(false));
  }

  /* ------------------------------------------------------- theme toggle */
  function initTheme() {
    const btn = $('[data-theme-toggle]');
    if (!btn) return;
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const icon = $('.icon', btn);
    const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);
    const render = () => {
      const dark = isDark();
      btn.setAttribute('aria-pressed', String(dark));
      icon.textContent = dark ? 'light_mode' : 'dark_mode';
      const meta = $$('meta[name="theme-color"]');
      meta.forEach((m) => m.setAttribute('content', dark ? '#131318' : '#4a35d0'));
    };
    btn.hidden = false;
    render();
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('storycast-theme', next); } catch (e) { /* storage unavailable */ }
      render();
    });
    systemDark.addEventListener('change', render);
  }

  /* ----------------------------------------------- home: story filters */
  function initFilters() {
    const bar = $('[data-filter-bar]');
    const grid = $('[data-story-grid]');
    if (!bar || !grid) return;
    const status = $('[data-filter-status]');
    const buttons = $$('[data-filter]', bar);
    const items = $$('[data-kind]', grid);
    bar.hidden = false;

    buttons.forEach((btn) => btn.addEventListener('click', () => {
      const kind = btn.dataset.filter;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      let shown = 0;
      items.forEach((li) => {
        const match = kind === 'all' || li.dataset.kind === kind;
        li.hidden = !match;
        if (match) shown += 1;
      });
      const what = kind === 'all' ? 'stories' : `${kind} stories`;
      status.textContent = `Showing ${shown} ${shown === 1 ? what.replace(/ies$/, 'y') : what}.`;
    }));
  }

  /* --------------------------------------------- tabs (WAI-ARIA pattern) */
  function initTabs() {
    $$('[data-tabs]').forEach((wrap) => {
      const list = $('[data-tablist]', wrap);
      const tabs = $$('.tabs__tab', list);
      const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
      list.hidden = false;
      list.setAttribute('role', 'tablist');

      const select = (index, { focus = true } = {}) => {
        tabs.forEach((tab, i) => {
          const active = i === index;
          tab.setAttribute('aria-selected', String(active));
          tab.tabIndex = active ? 0 : -1;
          panels[i].hidden = !active;
        });
        if (focus) tabs[index].focus();
      };

      tabs.forEach((tab, i) => {
        tab.setAttribute('role', 'tab');
        panels[i].setAttribute('role', 'tabpanel');
        panels[i].setAttribute('aria-labelledby', tab.id);
        panels[i].tabIndex = 0;
        tab.addEventListener('click', () => select(i));
        tab.addEventListener('keydown', (e) => {
          const last = tabs.length - 1;
          const map = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last };
          if (e.key in map) { e.preventDefault(); select(map[e.key]); }
        });
      });
      // The transcript panel itself is a scrollable list with its own name.
      const transcriptPanel = panels.find((p) => p.id === 'transcript-panel');
      if (transcriptPanel) transcriptPanel.removeAttribute('tabindex');

      // Deep links like #credits-panel open the matching tab.
      const fromHash = panels.findIndex((p) => `#${p.id}` === location.hash);
      select(fromHash > -1 ? fromHash : 0, { focus: false });
      wrap.addEventListener('storycast:show-tab', (e) => select(panels.findIndex((p) => p.id === e.detail), { focus: false }));
    });
  }

  /* ----------------------------------------------- player + transcript */
  function initPlayer() {
    const player = $('[data-player]');
    const media = player && $('[data-media]', player);
    if (!media) return;
    const isVideo = player.dataset.kind === 'video';
    const toolbar = $('[data-toolbar]', player);
    const transcript = $('[data-transcript]');
    const items = transcript ? $$('.transcript__item', transcript) : [];
    const liveText = $('[data-live-caption-text]', player);
    const described = $('[data-described]', player);
    const describedText = $('[data-described-text]', player);
    const state = { captions: true, descriptions: false, follow: true };
    toolbar.hidden = false;

    const cue = (type, t) => items.find((li) => li.dataset.type === type && t >= +li.dataset.start && t < +li.dataset.end);

    // --- Captions: native text track for video, visible caption bar for audio.
    const captionTrack = () => Array.from(media.textTracks || []).find((t) => t.kind === 'captions');
    const applyCaptions = () => {
      const track = captionTrack();
      if (isVideo && track) track.mode = state.captions ? 'showing' : 'hidden';
      const bar = $('[data-live-caption]', player);
      if (bar) bar.hidden = !state.captions;
    };
    if (isVideo && media.textTracks) {
      // Keep our toggle in sync if the user uses the browser's own CC menu.
      media.textTracks.addEventListener('change', () => {
        const track = captionTrack();
        if (!track) return;
        const on = track.mode === 'showing';
        if (on !== state.captions) { state.captions = on; setPressed('captions', on); }
      });
    }

    // --- Audio description: speech synthesis when available, otherwise a
    // polite live region so screen readers announce each description.
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    let lastDescribed = null;
    let restoreVolume = null;
    const speak = (text) => {
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB';
      u.rate = 1.05;
      if (restoreVolume === null) restoreVolume = media.volume;
      media.volume = Math.min(restoreVolume, 0.35);
      u.onend = u.onerror = () => {
        if (restoreVolume !== null) { media.volume = restoreVolume; restoreVolume = null; }
      };
      synth.speak(u);
    };
    const applyDescriptions = () => {
      if (!described) return;
      described.hidden = !state.descriptions;
      described.setAttribute('aria-live', state.descriptions && !synth ? 'polite' : 'off');
      if (!state.descriptions && synth) synth.cancel();
      lastDescribed = null;
      update();
    };

    // --- Transcript sync
    let lastActive = [];
    const update = () => {
      const t = media.currentTime;
      const active = items.filter((li) => t >= +li.dataset.start && t < +li.dataset.end && (!media.paused || t > 0));
      if (active.join() !== lastActive.join()) {
        lastActive.forEach((li) => li.removeAttribute('aria-current'));
        active.forEach((li) => li.setAttribute('aria-current', 'true'));
        if (state.follow && active.length && !transcript.matches(':hover') && !transcript.contains(document.activeElement)) {
          const offset = active[0].getBoundingClientRect().top - transcript.getBoundingClientRect().top;
          const top = transcript.scrollTop + offset - transcript.clientHeight / 3;
          transcript.scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        }
        lastActive = active;
      }
      if (liveText) {
        const c = cue('sound', t);
        liveText.textContent = c ? c.querySelector('.transcript__text').lastChild.textContent : '';
      }
      if (describedText && state.descriptions) {
        const v = cue('visual', t);
        const s = cue('screen', t);
        if (v && v !== lastDescribed) {
          lastDescribed = v;
          const text = `${v.querySelector('.transcript__text').lastChild.textContent} ${s ? 'On screen: ' + s.querySelector('.transcript__text').lastChild.textContent : ''}`.trim();
          describedText.textContent = text;
          if (!media.paused) speak(text);
        }
      }
    };
    ['timeupdate', 'seeked', 'play'].forEach((ev) => media.addEventListener(ev, update));
    media.addEventListener('pause', () => synth && synth.cancel());

    // Timestamp buttons seek the media and start playback.
    $$('[data-seek]').forEach((btn) => btn.addEventListener('click', () => {
      media.currentTime = parseFloat(btn.dataset.seek);
      lastDescribed = null;
      const p = media.play();
      if (p && p.catch) p.catch(() => {});
    }));

    // --- Toolbar toggles
    const setPressed = (name, on) => {
      const b = $(`[data-toggle="${name}"]`, toolbar);
      if (b) b.setAttribute('aria-pressed', String(on));
    };
    const toggle = (name) => {
      if (!(name in state) || !$(`[data-toggle="${name}"]`, toolbar)) return;
      state[name] = !state[name];
      setPressed(name, state[name]);
      if (name === 'captions') applyCaptions();
      if (name === 'descriptions') applyDescriptions();
    };
    $$('[data-toggle]', toolbar).forEach((b) => b.addEventListener('click', () => toggle(b.dataset.toggle)));

    // --- Keyboard shortcuts, scoped to the player (WCAG 2.1.4).
    player.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches('input, textarea, select')) return;
      const key = e.key.toLowerCase();
      const actions = {
        k: () => (media.paused ? media.play() : media.pause()),
        j: () => { media.currentTime = Math.max(0, media.currentTime - 5); },
        l: () => { media.currentTime = Math.min(media.duration || Infinity, media.currentTime + 5); },
        c: () => toggle('captions'),
        d: () => toggle('descriptions'),
      };
      if (actions[key]) { e.preventDefault(); actions[key](); }
    });

    // Text tracks may load after this runs — re-apply when they are ready.
    $$('track', media).forEach((tr) => tr.addEventListener('load', applyCaptions));
    applyCaptions();
    applyDescriptions();
  }

  /* --------------------------------------------- about: engagement form */
  function initForm() {
    const form = $('[data-form]');
    if (!form) return;
    const summary = $('[data-error-summary]');
    const list = $('[data-error-list]');
    const success = $('[data-form-success]');

    const rules = {
      name: (f) => (f.name.value.trim() ? '' : 'Enter your name'),
      email: (f) => {
        const v = f.email.value.trim();
        if (!v) return 'Enter your email address';
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter an email address in the correct format, like name@example.com';
      },
      topic: (f) => (f.querySelector('input[name="topic"]:checked') ? '' : 'Select what your message is about'),
      message: (f) => {
        const n = f.message.value.trim().length;
        if (!n) return 'Enter your message';
        return n < 20 ? `Your message must be at least 20 characters (it is ${n} now)` : '';
      },
      consent: (f) => (f.consent.checked ? '' : 'Tick the box to agree that we can store your message'),
    };
    const fieldFor = (name) => (name === 'topic' ? form.querySelector('input[name="topic"]') : form.elements[name]);

    const showError = (name, msg) => {
      const el = $(`[data-error-for="${name}"]`, form);
      el.textContent = msg ? msg : '';
      const controls = name === 'topic' ? $$('input[name="topic"]', form) : [form.elements[name]];
      controls.forEach((c) => (msg ? c.setAttribute('aria-invalid', 'true') : c.removeAttribute('aria-invalid')));
    };

    // Re-validate a field once the user has left it with an error showing.
    Object.keys(rules).forEach((name) => {
      const controls = name === 'topic' ? $$('input[name="topic"]', form) : [form.elements[name]];
      controls.forEach((c) => c.addEventListener('change', () => {
        if ($(`[data-error-for="${name}"]`, form).textContent) showError(name, rules[name](form));
      }));
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const errors = Object.entries(rules).map(([name, rule]) => [name, rule(form)]).filter(([, msg]) => msg);
      Object.keys(rules).forEach((name) => showError(name, (errors.find(([n]) => n === name) || [])[1]));
      if (errors.length) {
        list.innerHTML = '';
        errors.forEach(([name, msg]) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.className = 'error-summary__link';
          a.href = `#${fieldFor(name).id || 'engage-form'}`;
          a.textContent = msg;
          a.addEventListener('click', (ev) => { ev.preventDefault(); fieldFor(name).focus(); });
          li.append(a);
          list.append(li);
        });
        $('#error-summary-title').textContent = errors.length === 1 ? 'There is a problem' : `There are ${errors.length} problems`;
        summary.hidden = false;
        summary.focus();
        return;
      }
      summary.hidden = true;
      form.hidden = true;
      success.hidden = false;
      success.focus();
    });

    $('[data-form-reset]').addEventListener('click', (e) => {
      e.preventDefault();
      form.reset();
      success.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
    });

    // The radio inputs need ids for error-summary links.
    $$('input[name="topic"]', form).forEach((r, i) => { r.id = r.id || `topic-${i}`; });
  }

  /* ---------------------------------------------------------------- misc */
  function initYear() {
    $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
  }

  // Move focus to <main> after using the skip link (for browsers that don't).
  function initSkipLink() {
    const link = $('.skip-link');
    const main = $('#main');
    if (link && main) link.addEventListener('click', () => main.focus({ preventScroll: false }));
  }

  /* ------------------------------------------- hero loop (WCAG 2.2.2) */
  // Muted loop that starts only when the user hasn't asked for reduced
  // motion, with a visible pause / play button.
  function initHeroVideo() {
    const video = $('[data-hero-video]');
    const btn = $('[data-hero-video-toggle]');
    if (!video || !btn) return;
    const icon = $('.icon', btn);
    const label = $('.visually-hidden', btn);

    const sync = () => {
      const paused = video.paused;
      icon.textContent = paused ? 'play_arrow' : 'pause';
      label.textContent = paused ? 'Play background video' : 'Pause background video';
    };
    const play = () => video.play().catch(sync);

    btn.hidden = false;
    btn.addEventListener('click', () => (video.paused ? play() : video.pause()));
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    if (!reducedMotion.matches) play();
    sync();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAppBar();
    initHeroVideo();
    initMenu();
    initTheme();
    initFilters();
    initTabs();
    initPlayer();
    initForm();
    initYear();
    initSkipLink();
  });
})();
