const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const $ = (id) => document.getElementById(id);

const API_BASE_URL = (window.API_BASE_URL || 'https://193-233-85-156.sslip.io').replace(/\/$/, '');
const APP_VERSION = '2026-03-11-entry-unify-runtimefix';
const FRONTEND_URL = window.location.href;

const debugLog = [];
function logDebug(kind, data={}){
  const row = { ts: new Date().toISOString(), kind, ...data };
  debugLog.push(row);
  if (debugLog.length > 100) debugLog.shift();
  console.log('[miniapp-debug]', row);
  const el = $('runtimeDebug');
  if (el) el.textContent = JSON.stringify(debugLog.slice(-12), null, 2);
}

function detectTelegramUserId(){
  const unsafeId = tg?.initDataUnsafe?.user?.id;
  if (unsafeId) return Number(unsafeId);
  const initData = tg?.initData || '';
  try {
    const p = new URLSearchParams(initData);
    const rawUser = p.get('user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u?.id) return Number(u.id);
    }
  } catch {}
  return 0;
}

const state = {
  userId: detectTelegramUserId(),
  network: 'base',
  lastIntent: null,
  selectedToken: null,
  inviteLink: '',
};

if (!tg?.initData || !state.userId) {
  logDebug('bootstrap_error', { hasTg: !!tg, hasInitData: !!tg?.initData, userId: state.userId });
  alert('Open this mini app via Telegram bot');
  throw new Error('Telegram auth missing');
}
logDebug('bootstrap_ok', { userId: state.userId, hasInitData: !!tg?.initData, apiBase: API_BASE_URL });
logDebug('runtime_fingerprint', {
  APP_VERSION,
  FRONTEND_URL,
  API_BASE_URL,
  telegram_id: state.userId,
  telegram_detected: !!tg,
});
if ($('buildBadge')) $('buildBadge').textContent = `TEST BUILD · ${APP_VERSION}`;

function show(id, text, kind='muted'){ const el=$(id); if(!el) return; el.className=`quote ${kind}`; el.textContent=text; }
function fmt(n){ return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:6}); }

async function apiFetch(url, options={}){
  const headers = Object.assign({}, options.headers||{}, {'X-Telegram-Init-Data': tg.initData});
  const abs = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  logDebug('api_request', { url: abs, method: options.method || 'GET' });
  const res = await fetch(abs, {...options, headers});
  let j={}; try{j=await res.json();}catch{}
  logDebug('api_response', { url: abs, status: res.status, ok: res.ok, body: typeof j === 'object' ? j : String(j) });
  if(!res.ok) throw new Error(j.detail||j.error||`HTTP ${res.status}`);
  return j;
}

function switchScreen(sc){
  ['onboarding','home','token','trade','wallet','hub','ref'].forEach(x=>$("screen-"+x)?.classList.toggle('hidden', x!==sc));
  document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.screen===sc));
  if(sc==='home') renderFeed();
  if(sc==='wallet') renderPortfolio();
  if(sc==='hub') { renderFollow(); renderAlerts(); }
  if(sc==='ref') { renderWatchlist(); renderInviteLink(); }
}

document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>switchScreen(b.dataset.screen));
$('onboardingDone')?.addEventListener('click',()=>switchScreen('home'));
$('onboardFeed')?.addEventListener('click',()=>switchScreen('home'));
$('onboardWatch')?.addEventListener('click',()=>switchScreen('ref'));
$('onboardPortfolio')?.addEventListener('click',()=>switchScreen('wallet'));

function cardSkeleton(){
  return `<div class='card skeleton'><div class='line w60'></div><div class='line w90'></div><div class='line w70'></div></div>`;
}

function micro(vals){ return `<div class='micro'>${vals.map(v=>`<span style='height:${v}px'></span>`).join('')}</div>`; }

function signalTag(s){ return `<span class='tag signal'>${s}</span>`; }

async function track(event, payload={}){
  try{
    await apiFetch('/api/telemetry/event', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({telegram_id:state.userId, event, payload})});
  }catch{}
}

function tgShare(text, url){
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl); else window.open(shareUrl, '_blank');
}

function miniappDeepLink(kind, value){
  return `https://t.me/Swap_mzemlu_bot/app?startapp=${kind}_${state.network}_${value}`;
}

function oppCard(op){
  return `<div class='card opp-card tap-anim' data-token='${op.address}' data-symbol='${op.symbol}'>
    <div class='row-inline'><b>${op.symbol}</b>${signalTag(op.signal)}</div>
    <div class='muted'>Price $${fmt(op.price_usd || 0)} · ${op.indicator || 'liquidity check'}</div>
    <div class='muted'>${op.note}</div>
    <div class='micro-grid'>
      <div><span class='label'>Momentum</span>${micro(op.momentum || [5,6,7,8,9])}</div>
      <div><span class='label'>Liquidity</span>${micro(op.liquidity || [8,8,9,9,10])}</div>
      <div><span class='label'>Volume</span>${micro(op.volume || [3,4,6,8,10])}</div>
    </div>
    <div class='row two-col'>
      <button class='primary trade-cta' data-token='${op.address}' data-symbol='${op.symbol}'>Trade</button>
      <button class='secondary token-open' data-token='${op.address}' data-symbol='${op.symbol}'>Token</button>
    </div>
    <div class='row two-col'>
      <button class='secondary opp-share' data-token='${op.address}' data-symbol='${op.symbol}'>Share</button>
      <button class='secondary opp-watch' data-token='${op.address}' data-symbol='${op.symbol}'>Watch</button>
    </div>
  </div>`;
}

async function renderFeed(){
  const root = $('feedList');
  root.innerHTML = cardSkeleton() + cardSkeleton();
  try {
    const j = await apiFetch(`/api/feed/${state.userId}`);
    const items = j.items || [];
    root.innerHTML = items.map(oppCard).join('') || `<div class='card empty'>No live opportunities right now</div>`;
  } catch (e) {
    root.innerHTML = `<div class='card empty'>No live opportunities right now</div>`;
    logDebug('feed_error', { error: e.message });
    return;
  }

  document.querySelectorAll('.token-open').forEach(el=>el.addEventListener('click', (e)=>{
    e.stopPropagation();
    const token = e.currentTarget.dataset.token;
    const symbol = e.currentTarget.dataset.symbol;
    openToken(symbol, token);
    track('opportunity_open', {symbol, token});
  }));
  document.querySelectorAll('.trade-cta').forEach(el=>el.addEventListener('click', (e)=>{
    e.stopPropagation();
    const token = e.currentTarget.dataset.token;
    const symbol = e.currentTarget.dataset.symbol;
    state.selectedToken = {symbol, address: token};
    $('tokenInput').value = token;
    switchScreen('trade');
    lookupToken(token);
    track('trade_attempt', {source:'feed_trade_cta', symbol, token});
  }));
  document.querySelectorAll('.opp-share').forEach(el=>el.addEventListener('click', (e)=>{
    e.stopPropagation();
    const token = e.currentTarget.dataset.token;
    const symbol = e.currentTarget.dataset.symbol;
    const deep = miniappDeepLink('token', token);
    tgShare(`📡 Opportunity: ${symbol} on Swapbot`, deep);
    track('opportunity_share', {symbol, token});
  }));
  document.querySelectorAll('.opp-watch').forEach(el=>el.addEventListener('click', async (e)=>{
    e.stopPropagation();
    const token = e.currentTarget.dataset.token;
    const symbol = e.currentTarget.dataset.symbol || 'TOKEN';
    try{
      await apiFetch('/api/watchlist/add',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({telegram_id:state.userId,network:'base',token_address:token,token_symbol:symbol})});
      e.currentTarget.textContent = 'Watching';
      renderWatchlist();
    }catch(err){
      logDebug('feed_watch_error', { token, error: err.message });
    }
  }));
}

async function lookupToken(address){
  if(!address?.startsWith('0x')) return null;
  try{
    const t = await apiFetch(`/api/token/${address}?network=${state.network}`);
    if(t?.ok){
      const symbol = t.symbol || 'TOKEN';
      state.selectedToken = { symbol, address: t.address || address, name: t.name || '' };
      $('tokenTitle').textContent = `${symbol} · ${state.selectedToken.address.slice(0,6)}...${state.selectedToken.address.slice(-4)}`;
      if(t.entry_zone?.low && t.entry_zone?.high){
        $('entryZone').textContent = `$${fmt(t.entry_zone.low)} - $${fmt(t.entry_zone.high)}`;
      }
      $('momentumState').textContent = t.momentum_state || 'Unknown';
      $('liquidityState').textContent = t.liquidity_state || 'Unknown';
      const summary = (t.momentum_state?.toLowerCase().includes('breakout') ? 'Smart wallets accumulating' : 'Monitoring flow') + ' + ' + ((t.liquidity_usd||0) > 10000 ? 'healthy liquidity' : 'thin liquidity');
      $('decisionNote').textContent = `${summary} · Price $${fmt(t.price_usd)} · Liquidity $${fmt(t.liquidity_usd)}`;
      return t;
    }
    $('decisionNote').textContent = 'Token not found';
  } catch(e){
    $('decisionNote').textContent = 'Token not found';
    logDebug('token_lookup_error', { error: e.message, address });
  }
  return null;
}

function openToken(symbol, address){
  state.selectedToken = {symbol, address};
  $('tokenTitle').textContent = `${symbol} · Token Detail`;
  $('decisionNote').textContent = `${symbol}: entry zone valid, momentum positive, liquidity healthy.`;
  switchScreen('token');
  lookupToken(address);
  track('token_detail_open', {symbol, token: address});
}

$('tokenTradeNow')?.addEventListener('click', ()=>{
  if(state.selectedToken){ $('tokenInput').value = state.selectedToken.address; }
  switchScreen('trade');
});

$('tokenInput')?.addEventListener('blur', ()=>{
  const token = ($('tokenInput').value || '').trim();
  if(token.startsWith('0x')) lookupToken(token);
});

$('tokenWatchToggle')?.addEventListener('click', async ()=>{
  if(!state.selectedToken) return;
  try{
    await apiFetch('/api/watchlist/add', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({telegram_id:state.userId, network:'base', token_address:state.selectedToken.address, token_symbol:state.selectedToken.symbol})});
    $('tokenWatchToggle').textContent = 'Watching';
  }catch(e){ $('tokenWatchToggle').textContent = 'Watch failed'; }
});

$('quoteBtn')?.addEventListener('click', async ()=>{
  const to = ($('tokenInput').value || '').trim() || 'USDC';
  const amount = parseFloat($('amount').value || '0');
  if(!amount || amount<=0) return show('quote','Enter valid amount','warn');

  show('quote','Loading quote...');
  try{
    const j = await apiFetch('/api/quote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({telegram_id:state.userId,network:'base',from_symbol:$('fromSymbol').value,to_symbol:to,amount})});
    state.lastIntent={network:'base',prefix:j.idempotency_prefix};
    $('confirmBtn').disabled=false;
    const slippagePct = ((j.fee_bps || 0) / 100).toFixed(2);
    $('entryPrice').textContent = `Expected entry: ${fmt(j.gross_out)} ${j.to} · Received ${fmt(j.net_out)} ${j.to}`;
    $('protectionState').textContent = `Slippage/Fee: ${slippagePct}% · ${j.risk_badge || 'Protected'}`;
    show('quote',`Quote ready · Confirm to execute`,'ok');
  } catch(e){ show('quote','Quote error: '+e.message,'warn'); }
});

$('confirmBtn')?.addEventListener('click', async ()=>{
  if(!state.lastIntent) return;
  $('tracker').textContent='Confirming…';
  track('trade_attempt', {network: state.lastIntent.network});
  try{
    const j = await apiFetch('/api/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({telegram_id:state.userId,network:state.lastIntent.network,idempotency_prefix:state.lastIntent.prefix})});
    $('tracker').textContent='Success ✅';
    show('quote',`Success: ${j.tx_hash?.slice(0,16)}...`, 'ok');
    $('confirmBtn').disabled=true;
    track('trade_success', {network: j.network, tx_hash: j.tx_hash});
    state.lastIntent=null;
  } catch(e){ $('tracker').textContent='Failed ❌'; show('quote', 'Confirm error: '+e.message, 'warn'); track('trade_failure', {error: e.message}); }
});

$('watchBtn')?.addEventListener('click', async ()=>{
  const token = ($('tokenInput').value||'').trim();
  if(!token.startsWith('0x')) return show('quote','Need token address 0x...','warn');
  const tokenSymbol = state.selectedToken?.symbol || 'TOKEN';
  try{
    await apiFetch('/api/watchlist/add',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({telegram_id:state.userId,network:'base',token_address:token,token_symbol:tokenSymbol})});
    show('quote',`Added ${tokenSymbol} to watchlist`,'ok');
    renderWatchlist();
  } catch(e){ show('quote','Watch failed: '+e.message,'warn'); }
});

$('tradeShareBtn')?.addEventListener('click', ()=>{
  const token = ($('tokenInput').value||'').trim();
  const deep = token.startsWith('0x') ? miniappDeepLink('token', token) : 'https://t.me/Swap_mzemlu_bot/app';
  const entry = $('entryPrice')?.textContent || 'Expected entry: -';
  tgShare(`📈 My trade on Swapbot\n${entry}\n${new Date().toISOString()}`, deep);
  track('trade_share', {token, entry});
});

$('inviteShareBtn')?.addEventListener('click', ()=>{
  if(!state.inviteLink){ return; }
  tgShare('🔑 Join Swapbot invite-only beta', state.inviteLink);
  track('invite_share', {link: state.inviteLink});
});

$('feedbackSubmit')?.addEventListener('click', async ()=>{
  const kind = $('feedbackType')?.value || 'feedback';
  const text = ($('feedbackText')?.value || '').trim();
  if(!text){ $('feedbackStatus').textContent = 'Enter feedback text'; return; }
  try{
    await apiFetch('/api/beta/feedback', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({telegram_id: state.userId, kind, text})});
    $('feedbackStatus').textContent = 'Thanks, feedback sent ✅';
    $('feedbackText').value='';
  }catch(e){ $('feedbackStatus').textContent = `Feedback failed: ${e.message}`; }
});

async function renderPortfolio(){
  const root = $('positionsList');
  root.innerHTML = `<li class='muted'>Loading positions…</li>`;
  try{
    const j = await apiFetch(`/api/portfolio/${state.userId}`);
    if(!j.items?.length){ root.innerHTML = `<li class='muted'>No open positions yet</li>`; return; }
    root.innerHTML = j.items.slice(0,8).map(it=>`<li><b>${it.to}</b> · size ${fmt(it.amount_in)} ${it.from}<br><small>value ${fmt(it.amount_out_est || 0)} ${it.to}</small></li>`).join('');
  }catch(e){ root.innerHTML = `<li class='muted'>No open positions yet</li>`; logDebug('portfolio_error', { error: e.message, userId: state.userId }); }
}

['protectReduce','protectExit','protectHold'].forEach(id=>$(id)?.addEventListener('click', ()=>{
  $('portfolioFeedback').textContent = `${id.replace('protect','')} action queued`;
}));

async function renderFollow(){
  const root = $('followList');
  root.innerHTML = `<li class='muted'>Loading wallets…</li>`;
  try {
    const wl = await apiFetch(`/api/watchlist/${state.userId}`);
    const wallets = (wl.items || []).filter(x=>x.entity_type==='wallet');
    if(!wallets.length){
      root.innerHTML = `<li class='muted'>No wallets followed yet</li>`;
      return;
    }
    root.innerHTML = wallets.map(w=>`<li><b>${w.entity_value}</b><br><small>Recent actions: no recent wallet actions yet</small><div class='row-inline'><button class='secondary small unfollow-wallet-btn' data-wallet='${w.entity_value}'>Unfollow</button><button class='secondary small share-wallet-btn' data-wallet='${w.entity_value}' data-label='${w.label || 'SMART_WALLET'}'>Share</button></div></li>`).join('');

    root.querySelectorAll('.unfollow-wallet-btn').forEach(btn=>btn.addEventListener('click', async ()=>{
      const wallet = btn.dataset.wallet;
      try{
        await apiFetch('/api/watchlist/remove_wallet',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({telegram_id:state.userId,network:state.network,wallet_address:wallet,wallet_label:'SMART_WALLET'})});
        btn.textContent='Unfollowed';
        renderFollow();
        renderWatchlist();
      }catch(e){ logDebug('unfollow_wallet_error', { wallet, error: e.message }); }
    }));

    root.querySelectorAll('.share-wallet-btn').forEach(btn=>btn.addEventListener('click', ()=>{
      const wallet = btn.dataset.wallet;
      const deep = miniappDeepLink('wallet', wallet);
      tgShare(`👛 Wallet signal: ${btn.dataset.label}`, deep);
      track('opportunity_share', {source:'wallet_share', wallet});
    }));
  } catch (e) {
    root.innerHTML = `<li class='muted'>No wallets followed yet</li>`;
    logDebug('follow_error', { error: e.message });
  }
}

$('watchWalletBtn')?.addEventListener('click', async ()=>{
  const wallet = ($('walletWatchInput').value||'').trim();
  if(!wallet.startsWith('0x')) { logDebug('button_blocked', { button: 'watchWalletBtn', reason: 'invalid_wallet' }); return; }
  try {
    await apiFetch('/api/watchlist/add_wallet',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({telegram_id:state.userId,network:'base',wallet_address:wallet,wallet_label:'SMART_WALLET'})});
    $('walletWatchInput').value='';
    renderWatchlist();
  } catch(e){
    logDebug('button_error', { button: 'watchWalletBtn', error: e.message });
  }
});

async function renderWatchlist(){
  const ul=$('watchList'); ul.innerHTML='<li class="muted">Loading…</li>';
  try{
    const j=await apiFetch(`/api/watchlist/${state.userId}`);
    if(!j.items?.length){ul.innerHTML='<li class="muted">No watched tokens yet</li>'; return;}
    const tokens = j.items.filter(x=>x.entity_type==='token');
    const wallets = j.items.filter(x=>x.entity_type==='wallet');
    const rows = [];
    if(tokens.length){
      rows.push(`<li class='muted'><b>🪙 Tokens</b></li>`);
      rows.push(...tokens.map(it=>`<li><b>${it.label||'TOKEN'}</b> · ${it.network}<br><small>${it.entity_value}</small></li>`));
    }
    if(wallets.length){
      rows.push(`<li class='muted'><b>👛 Wallets</b></li>`);
      rows.push(...wallets.map(it=>`<li><b>${it.label||'WALLET'}</b> · ${it.network}<br><small>${it.entity_value}</small></li>`));
    }
    ul.innerHTML = rows.join('');
  } catch (e) { ul.innerHTML='<li class="muted">No watched tokens yet</li>'; logDebug('watchlist_error', { error: e.message, userId: state.userId }); }
}

async function renderInviteLink(){
  const box = $('inviteLinkBox');
  if(!box) return;
  box.textContent = 'Generating invite link...';
  try{
    const j = await apiFetch(`/api/beta/invite/link/${state.userId}`);
    state.inviteLink = j.invite?.link || '';
    box.textContent = state.inviteLink || 'Invite unavailable';
  } catch (e) {
    box.textContent = 'Invite unavailable';
    logDebug('invite_error', { error: e.message, userId: state.userId });
  }
}

async function renderAlerts(){
  const ul=$('alertsList'); ul.innerHTML='<li class="muted">Loading alerts…</li>';
  try{
    await apiFetch(`/api/smart-alerts/run/${state.userId}`,{method:'POST'});
    const j = await apiFetch(`/api/smart-alerts/${state.userId}`);
    if(!j.items?.length){ ul.innerHTML='<li class="muted">No alerts yet</li>'; return; }
    ul.innerHTML = j.items.slice(0,6).map((a,idx)=>`<li><b>${a.alert_type}</b> · ${a.severity}<br>${a.message}<br><a href='${a.deep_link}' target='_blank' data-alert='${idx}'>Open</a></li>`).join('');
    ul.querySelectorAll('a[data-alert]').forEach((el)=>el.addEventListener('click', ()=>{
      track('alert_click', {deep_link: el.getAttribute('href')});
      track('alert_engagement', {action: 'open'});
    }));
  } catch (e) { ul.innerHTML='<li class="muted">Alerts unavailable</li>'; logDebug('alerts_error', { error: e.message, userId: state.userId }); }
}

(function init(){
  const saved = localStorage.getItem('onboarding_done');
  if(saved==='1') switchScreen('home'); else switchScreen('onboarding');
  $('onboardingDone')?.addEventListener('click', ()=>localStorage.setItem('onboarding_done','1'));
  track('miniapp_open', {network: state.network});
})();