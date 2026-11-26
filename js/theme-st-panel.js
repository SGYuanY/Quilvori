/* Opt-in connection to a selected local SillyTavern profile. */
(function (root) {
  'use strict';
  const preference = 'quilvori.st-theme-profile.v1';
  const t = (key, values) => root.TAI18n.t('themeST.' + key, values);
  let state, active;
  const errors = {
    'invalid-profile':'invalidProfile','unsafe-path':'unsafePath','choose-user':'chooseUser','unknown-user':'unknownUser',
    'invalid-settings':'invalidSettings','invalid-theme':'invalidTheme','profile-changed':'stale','theme-changed':'stale',
    'unsupported-filesystem':'unsupported','recovery-needed':'recovery','theme-not-found':'notFound','target-busy':'busy',
    'read-failed':'readFailed','write-failed':'writeFailed','theme-format':'invalidTheme','theme-json':'invalidTheme',
    'theme-value':'invalidTheme','theme-css':'invalidTheme','theme-size':'themeSize',
  };

  function restore() {
    let path='', user='';
    try {
      const local = JSON.parse(root.localStorage.getItem(preference) || 'null');
      if (typeof local?.path === 'string' && typeof local.user === 'string') ({path,user}=local);
    } catch (_) { /* The path can always be entered manually. */ }
    return {path,user,users:[],themes:[],current:'',selected:'',revision:'',connected:false,busy:'',
      includeExistingCSS:false,includeDraftCSS:false,themeRevision:'',draftRevision:0,notice:null,rememberFailed:false};
  }

  function status(key, values, kind='info') { state.notice={key,values,kind}; }
  function resetConsent() { state.includeExistingCSS=false; state.includeDraftCSS=false; state.themeRevision=''; }
  function disconnect(clearUsers) {
    state.connected=false; state.current=''; state.themes=[]; state.selected=''; state.revision='';
    resetConsent();
    if (clearUsers) { state.users=[]; state.user=''; }
  }
  function successful(result, fallback) {
    if (result?.ok !== true) throw Object.assign(new Error(fallback),{code:result?.code || fallback, users:result?.users});
    return result;
  }
  function target() { return {path:state.path.trim(),user:state.user,revision:state.revision}; }
  function options(select, names, selected, prompt) {
    const children=[];
    if (prompt) children.push(new Option(t(prompt),''));
    for (const name of names) children.push(new Option(name,name));
    select.replaceChildren(...children);
    select.value=selected;
  }

  function paint() {
    if (!active || !state) return;
    const {nodes}=active;
    const pending=!!state.busy;
    nodes.section.setAttribute('aria-busy',String(pending));
    nodes.path.value=state.path;
    nodes.path.disabled=nodes.pick.disabled=nodes.connect.disabled=pending;
    nodes.profileField.hidden=!state.users.length;
    options(nodes.user,state.users,state.user,'chooseProfile');
    nodes.user.disabled=pending;
    nodes.actions.hidden=!state.connected;
    if (state.connected) {
      nodes.current.textContent=state.current ? t('current',{name:state.current}) : t('noCurrent');
      options(nodes.theme,state.themes,state.selected,state.themes.length ? '' : 'noThemes');
      nodes.theme.disabled=pending || !state.themes.length;
      nodes.read.disabled=nodes.switch.disabled=nodes.existingCSS.disabled=pending || !state.selected;
      nodes.install.disabled=pending || !active.draftAvailable;
      nodes.draftCSS.disabled=pending || !active.draftHasCSS;
    }
    nodes.existingCSS.checked=state.includeExistingCSS;
    nodes.draftCSS.checked=state.includeDraftCSS;
    nodes.notice.dataset.kind=state.notice?.kind || 'info';
    nodes.notice.textContent=state.busy ? t(state.busy) : state.notice ? t(state.notice.key,state.notice.values) : '';
    nodes.saveNote.hidden=!state.rememberFailed;
  }

  function draftChanged() {
    if (!state) return;
    state.includeDraftCSS=false;
    state.draftRevision++;
    if (!active) return;
    let raw=null;
    try { raw=active.getTheme?.(); } catch (_) { /* A partial edit may not yet form a valid theme. */ }
    active.draftAvailable=!!raw;
    active.draftHasCSS=typeof raw?.custom_css === 'string' && !!raw.custom_css.trim();
    paint();
  }

  async function during(label, fallback, action) {
    if (state.busy) return;
    state.busy=label;
    paint();
    try { await action(); }
    catch (error) {
      const code = error?.code || error?.message;
      if (['profile-changed','theme-changed','theme-not-found','unknown-user','invalid-profile','unsafe-path','invalid-settings','recovery-needed'].includes(code)) {
        disconnect(code === 'invalid-profile' || code === 'unsafe-path');
      }
      if (Array.isArray(error?.users)) state.users=error.users.filter(user=>typeof user === 'string');
      status(errors[code] || fallback,{},'error');
    } finally {
      state.busy='';
      paint();
    }
  }

  async function inspect(bridge) {
    const path=state.path.trim();
    if (!path) { disconnect(true); status('needPath',{},'warning'); return; }
    const previous=state.selected;
    disconnect(false);
    let result=await bridge.themeInspect({path,user:state.user});
    if (result?.code === 'unknown-user' && state.user) result=await bridge.themeInspect({path});
    if (result?.code === 'choose-user') {
      disconnect(true);
      state.users=(result.users || []).filter(user=>typeof user === 'string');
      status('chooseUser',{},'info');
      return;
    }
    successful(result,'read-failed');
    state.path=path; state.user=result.user;
    state.users=(result.users || [result.user]).filter(user=>typeof user === 'string');
    state.themes=(result.themes || []).filter(name=>typeof name === 'string');
    state.current=result.currentTheme || ''; state.revision=result.revision; state.connected=true;
    state.selected=state.themes.includes(previous) ? previous : state.themes.includes(state.current) ? state.current : state.themes[0] || '';
    resetConsent();
    state.rememberFailed=false;
    try { root.localStorage.setItem(preference,JSON.stringify({path,user:state.user})); }
    catch (_) { state.rememberFailed=true; }
    status('connected',{user:state.user});
  }

  function applied(result) {
    successful(result,'write-failed');
    state.current=result.themeName;
    if (!state.themes.includes(result.themeName)) state.themes.push(result.themeName);
    state.selected=result.themeName;
    state.revision=result.revision;
    resetConsent();
    status(result.backup ? 'appliedBackup' : 'applied',{name:result.themeName,backup:result.backup},'success');
  }

  function mount(host, {getTheme,openTheme} = {}) {
    const doc=host.ownerDocument;
    function element(tag, className, key) {
      const node=doc.createElement(tag);
      if (className) node.className=className;
      if (key) node.textContent=t(key);
      return node;
    }
    function field(labelKey, input) {
      const label=element('label','field');
      label.append(element('span','field-label',labelKey),input);
      return label;
    }
    function button(label, hook, primary=false) {
      const node=element('button',primary ? 'btn btn-primary' : 'btn',label);
      node.type='button'; node.dataset.themeSt=hook;
      return node;
    }
    function checkbox(labelKey, hook) {
      const input=element('input');
      input.type='checkbox'; input.dataset.themeSt=hook;
      const label=element('label','check');
      label.append(input,element('span','',labelKey));
      return {label,input};
    }
    const section=element('section','paper stack theme-st-connection');
    const heading=element('h3','','heading');
    section.append(heading);
    host.replaceChildren(section);
    const bridge=root.nijanDesktop;
    if (!bridge?.themeInspect) {
      active=null;
      section.append(element('p','help','browser'),element('p','help','extras'));
      return;
    }
    state ||= restore();
    const path=element('input'); path.type='text'; path.autocomplete='off'; path.spellcheck=false; path.dataset.themeSt='path'; path.dataset.noTranslate='';
    const pick=button('browse','pick'), connect=button('connect','connect',true), pathRow=element('div','row theme-st-actions');
    pathRow.append(pick,connect);
    const user=element('select'); user.dataset.themeSt='user'; user.dataset.noTranslate='';
    const profileField=field('profile',user);
    const theme=element('select'); theme.dataset.themeSt='theme'; theme.dataset.noTranslate='';
    const actions=element('div','stack theme-st-options'), current=element('p','help'); current.dataset.noTranslate='';
    const existing=checkbox('existingCSS','existing-css'), draft=checkbox('draftCSS','draft-css');
    const read=button('open','read'), switchButton=button('switch','switch'), install=button('install','install',true);
    const listActions=element('div','row theme-st-actions');
    listActions.append(read,switchButton);
    actions.append(current,field('existing',theme),existing.label,listActions,element('h4','','draft'),draft.label,install,element('p','help','cssNote'));
    const notice=element('p','theme-st-status'); notice.dataset.themeSt='status'; notice.dataset.noTranslate=''; notice.setAttribute('role','status'); notice.setAttribute('aria-live','polite');
    const saveNote=element('p','help','rememberFailed');
    section.append(field('path',path),pathRow,profileField,actions,notice,saveNote,element('p','help','extras'));
    active={getTheme,nodes:{section,path,pick,connect,profileField,user,actions,current,theme,existingCSS:existing.input,draftCSS:draft.input,read,switch:switchButton,install,notice,saveNote}};
    // A working draft can change on remount. Consent belongs to one action on the selected material.
    if (!state.busy) resetConsent();

    path.oninput=()=>{
      state.path=path.value;
      disconnect(true);
      state.notice=null; state.rememberFailed=false;
      paint();
    };
    connect.onclick=()=>during('checking','readFailed',()=>inspect(bridge));
    path.onkeydown=event=>{ if (event.key === 'Enter') { event.preventDefault(); connect.click(); } };
    pick.onclick=()=>during('choosing','readFailed',async()=>{
      const picked=await bridge.themePick();
      if (!picked) { status('canceled'); return; }
      if (typeof picked !== 'string') throw new Error('invalid-profile');
      if (picked !== state.path) disconnect(true);
      state.path=picked;
      await inspect(bridge);
    });
    user.onchange=()=>{
      const value=user.value;
      disconnect(false);
      state.user=value;
      if (value) return during('checking','readFailed',()=>inspect(bridge));
      status('chooseUser');
      paint();
    };
    theme.onchange=()=>{
      state.selected=theme.value;
      resetConsent();
      state.notice=null;
      paint();
    };
    read.onclick=()=>during('reading','readFailed',async()=>{
      const selected=state.selected;
      const result=successful(await bridge.themeRead(target(),selected),'read-failed');
      if (typeof openTheme !== 'function') throw new Error('invalid-theme');
      resetConsent();
      if (await openTheme(result.theme) === false) { status('openCanceled'); return; }
      state.themeRevision=result.themeRevision;
      status('opened',{name:selected});
    });
    existing.input.onchange=()=>{
      if (!existing.input.checked) { state.includeExistingCSS=false; state.themeRevision=''; paint(); return; }
      return during('reading','readFailed',async()=>{
        const result=successful(await bridge.themeRead(target(),state.selected),'read-failed');
        const hasSheet=typeof result.theme?.custom_css === 'string' && !!result.theme.custom_css.trim();
        state.includeExistingCSS=hasSheet;
        state.themeRevision=result.themeRevision;
        status(hasSheet ? 'cssSelected' : 'noCSS');
      });
    };
    draft.input.onchange=()=>{ state.includeDraftCSS=draft.input.checked; };
    switchButton.onclick=()=>during('switching','writeFailed',async()=>{
      const allowCss=state.includeExistingCSS, themeRevision=state.themeRevision;
      resetConsent();
      applied(await bridge.themeActivate(target(),state.selected,{allowCss,themeRevision}));
    });
    install.onclick=()=>during('installing','writeFailed',async()=>{
      const allowCss=state.includeDraftCSS, revision=state.draftRevision;
      resetConsent();
      const theme=await getTheme?.();
      if (revision !== state.draftRevision) { status('draftChanged',{},'warning'); return; }
      if (!theme) { status('noDraft',{},'warning'); return; }
      applied(await bridge.themeInstall(target(),{theme,allowCss}));
    });
    draftChanged();
  }

  root.TAThemeSTPanel={mount,draftChanged};
})(globalThis);
