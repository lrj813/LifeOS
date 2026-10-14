/* Session orchestration. Chat remains in this page only; backend owns memory. */
(() => {
  const UI = window.LifeUI, API = window.LifeAPI, { $, element, paragraph, button } = UI;
  let active = null, conversation = '', editing = null, epoch = 0, followupId = '';
  let operation = null, memoryEnabled = false;
  const context = () => ({ epoch, owner: active?.id });
  const current = ctx => ctx.epoch === epoch && ctx.owner === active?.id;
  const status = UI.status;

  function unlink() { followupId = ''; $('linked-row').hidden = true; }
  function emptyChat() {
    $('chat').replaceChildren();
    paragraph($('chat'), '先说一个困扰吧，也可以从上次的问题继续聊。', 'empty');
  }
  function closeEditor() { editing = null; $('editor').hidden = true; }
  function resetSession(message = '') {
    epoch++; API.abortAll(); operation = null; active = null; conversation = '';
    unlink(); closeEditor(); $('query').value = ''; $('password').value = '';
    $('chat').replaceChildren(); $('home').replaceChildren(); $('memories').replaceChildren();
    $('account').textContent = ''; $('workspace').hidden = true; $('login').hidden = false;
    $('logout').hidden = true; syncControls(); status(message);
  }
  function syncControls() {
    const busy = !!operation;
    for (const control of document.querySelectorAll('#workspace button, #workspace select, #editor input, #editor textarea, #enabled, #loginform button, [id^="demo-"]')) control.disabled = busy;
    $('ask').textContent = operation?.kind === 'chat' ? '正在整理…' : '提问';
    $('login-submit').textContent = operation?.kind === 'login' ? '正在登录…' : '登录';
    $('askform').setAttribute('aria-busy', String(operation?.kind === 'chat'));
    $('home').setAttribute('aria-busy', String(operation?.kind === 'home'));
    $('clear').disabled = busy || !$('memories').querySelector('.memory');
  }
  function begin(kind) {
    if (operation) { status('上一项操作还在处理，请稍等。'); return null; }
    const token = { kind }; operation = token; syncControls(); return token;
  }
  function end(token) { if (operation === token) { operation = null; syncControls(); } }
  function handleError(error, ctx) {
    if (error.name === 'AbortError' || !current(ctx)) return;
    if (error.status === 401) { resetSession('登录已失效，请重新登录。'); $('username').focus(); }
    else status(error.message, 'error');
  }

  function editMemory(record) {
    editing = record.id;
    $('memory').value = record.text || ''; $('problem').value = record.problem || '';
    $('user_state').value = record.user_state || ''; $('problem_status').value = record.problem_status || 'unknown';
    $('editor').hidden = false; $('memory').focus();
  }
  async function loadMemories(ctx) {
    const data = await API.request('/api/memories');
    if (!current(ctx)) return;
    memoryEnabled = !!data.enabled; $('enabled').checked = memoryEnabled;
    $('memories').replaceChildren();
    const records = [...(data.memories || [])].sort((a, b) => b.updated - a.updated);
    if (!records.length) paragraph($('memories'), '暂无摘要。开启记忆并完成一轮对话后，这里会自动更新。', 'empty');
    const history = element('details', undefined, 'memory-history');
    const oldCount = records.filter(record => record.state === 'superseded').length;
    history.append(element('summary', '查看已更新的旧摘要（' + oldCount + '）'));
    for (const record of records) {
      const node = element('article', undefined, 'memory'); node.dataset.state = record.state;
      paragraph(node, record.text);
      paragraph(node, (record.origin === 'model_summary' ? '模型会话摘要 · ' + (UI.labels[record.problem_status] || '未说明') : '补充记录') + (record.state === 'superseded' ? ' · 已被后续摘要更新' : ''), 'hint');
      if (record.guides?.length) paragraph(node, '咨询过的指南：' + record.guides.map(g => g.title).join('；'), 'hint');
      const row = element('div', undefined, 'row');
      if (record.origin === 'model_summary') button(row, '纠正', () => editMemory(record));
      button(row, '删除', () => {
        if (confirm('删除这条长期摘要？删除后无法恢复。')) mutate({ action: 'delete', id: record.id });
      }, 'danger');
      node.append(row); (record.state === 'superseded' ? history : $('memories')).append(node);
    }
    if (oldCount) $('memories').append(history);
    syncControls();
  }
  function renderHome(data) {
    $('home').replaceChildren();
    let result = data.result;
    if (typeof result === 'string') { try { result = JSON.parse(result); } catch { result = null; } }
    if (!result?.followups?.length) {
      paragraph($('home'), memoryEnabled ? '暂无待回访问题。可以先聊一个困扰。' : '记忆已关闭。开启后，才会根据会话摘要跟进问题。', 'empty');
      return;
    }
    for (const item of result.followups) {
      const node = element('article', undefined, 'followup');
      node.append(element('h3', item.progress_question)); paragraph(node, item.guide_question);
      const row = element('div', undefined, 'row');
      button(row, '已经解决', () => send('上次提到“' + item.topic + '”的问题已经解决了。', item.memory_id));
      button(row, '还没解决', () => send('上次提到“' + item.topic + '”的问题还没解决，暂时先帮我记录进展。', item.memory_id));
      button(row, '继续问相关指南', () => {
        followupId = item.memory_id;
        $('linked').textContent = '继续讨论：' + item.topic; $('linked-row').hidden = false;
        $('query').value = '关于“' + item.topic + '”，我还需要继续咨询' + (item.guides?.length ? '“' + item.guides[0].title + '”等相关指南。' : '相关指南。');
        $('query').focus();
      });
      node.append(row); $('home').append(node);
    }
    syncControls();
  }
  async function loadHome(ctx) {
    const data = await API.request('/api/run', { mode: 'home', query: '', conversation_id: '', followup_memory_id: '' });
    if (current(ctx)) renderHome(data);
  }
  function refreshFailure(error, ctx, area, action) {
    if (error.status === 401 || error.name === 'AbortError' || !current(ctx)) { handleError(error, ctx); return; }
    const box = $(area); box.replaceChildren(); paragraph(box, error.message, 'error');
    button(box, '重新加载', action);
  }
  // Secondary reads never cause a successful chat or memory write to be retried.
  async function refreshAfterWrite(ctx) {
    let failed = false;
    try { await loadMemories(ctx); }
    catch (error) { failed = true; refreshFailure(error, ctx, 'memories', refreshMemories); }
    if (!current(ctx)) return false;
    try { await loadHome(ctx); }
    catch (error) { failed = true; refreshFailure(error, ctx, 'home', refreshHome); }
    return !failed;
  }
  async function refreshHome() {
    const token = begin('home'); if (!token) return;
    const ctx = context(); status('正在整理上次的问题…');
    try { await loadHome(ctx); if (current(ctx)) status('回访已更新。'); }
    catch (error) { refreshFailure(error, ctx, 'home', refreshHome); handleError(error, ctx); }
    finally { end(token); }
  }
  async function refreshMemories() {
    const token = begin('memory'); if (!token) return;
    const ctx = context(); status('正在读取会话摘要…');
    try { await loadMemories(ctx); if (current(ctx)) status('记忆已更新。'); }
    catch (error) { refreshFailure(error, ctx, 'memories', refreshMemories); handleError(error, ctx); }
    finally { end(token); }
  }
  async function send(queryOverride, linkedOverride, retryTurn) {
    if (!active) return;
    const query = String(queryOverride ?? $('query').value).trim();
    if (!query) { status('先写下你想解决的问题。', 'error'); $('query').focus(); return; }
    if (query.length > 2000) { status('问题太长，请缩短到 2000 字以内。', 'error'); return; }
    const token = begin('chat'); if (!token) return;
    const ctx = context(), linked = linkedOverride ?? followupId, originalInput = $('query').value;
    if (!retryTurn && $('chat').querySelector('.empty')) $('chat').replaceChildren();
    const turn = retryTurn || UI.turn(query); turn.answer.replaceChildren();
    const pending = paragraph(turn.answer, '正在查找指南并整理会话摘要，请稍等…', 'pending');
    const slow = setTimeout(() => { if (current(ctx)) pending.textContent = '仍在处理，模型回答和摘要可能需要一些时间。请勿重复提交。'; }, 15000);
    status('正在回答并整理会话摘要…');
    try {
      const data = await API.request('/api/run', { mode: 'chat', query, conversation_id: conversation, followup_memory_id: linked });
      if (!current(ctx)) return;
      conversation = data.conversation_id || conversation;
      turn.answer.replaceChildren(); UI.result(turn.answer, data, memoryEnabled); unlink();
      if ((queryOverride === undefined || (retryTurn && originalInput.trim() === query)) && $('query').value === originalInput) $('query').value = '';
      const refreshed = await refreshAfterWrite(ctx);
      if (current(ctx)) status((data.summary?.message || '本轮对话完成。') + (!refreshed ? ' 部分列表刷新失败，可单独重新加载。' : ''), data.summary && !data.summary.saved && memoryEnabled ? 'error' : '');
    } catch (error) {
      if (current(ctx) && error.name !== 'AbortError' && error.status !== 401) {
        turn.answer.replaceChildren(); paragraph(turn.answer, error.message, 'error');
        paragraph(turn.answer, '本页未收到完整结果；服务器可能仍在处理。稍后再试，重试可能产生新的摘要。', 'hint');
        button(turn.answer, '重试这次提问', () => send(query, linked, turn));
      }
      handleError(error, ctx);
    } finally { clearTimeout(slow); end(token); }
  }
  async function mutate(data) {
    const token = begin('memory'); if (!token) return;
    const ctx = context(); status('正在更新记忆…');
    try {
      await API.request('/api/memory-action', data);
      if (!current(ctx)) return;
      epoch++; conversation = ''; unlink(); closeEditor(); emptyChat();
      const refreshed = await refreshAfterWrite(context());
      if (active) status('记忆已更新，已开始新会话。' + (!refreshed ? ' 部分列表刷新失败，可单独重新加载。' : ''));
    } catch (error) { if (current(ctx)) $('enabled').checked = memoryEnabled; handleError(error, ctx); }
    finally { end(token); }
  }
  async function enter(user) {
    epoch++; active = user; conversation = ''; unlink(); closeEditor(); $('query').value = ''; emptyChat();
    $('home').replaceChildren(); $('memories').replaceChildren();
    $('account').textContent = user.name; $('logout').hidden = false; $('login').hidden = true; $('workspace').hidden = false;
    const ctx = context(); const refreshed = await refreshAfterWrite(ctx);
    if (current(ctx)) status(refreshed ? '已登录。可以直接提问，或继续上次的问题。' : '已登录，但部分列表加载失败，请重新加载。', refreshed ? '' : 'error');
  }

  $('loginform').onsubmit = async event => {
    event.preventDefault(); const token = begin('login'); if (!token) return;
    const ctx = context(); status('正在登录…');
    try {
      const data = await API.request('/api/login', { username: $('username').value.trim(), password: $('password').value });
      if (current(ctx)) { $('password').value = ''; await enter(data.user); }
    } catch (error) {
      if (current(ctx) && error.name !== 'AbortError') status(error.status === 401 ? '账号或密码不正确，请重新输入。' : error.message, 'error');
    } finally { end(token); }
  };
  $('logout').onclick = async () => {
    resetSession('正在退出登录…'); const token = begin('logout');
    try { await API.request('/api/logout', {}); status('已退出登录。'); }
    catch (error) { status('本页已清除会话显示，但退出请求未成功。请关闭页面或稍后重试退出。', 'error'); $('logout').hidden = false; }
    finally { end(token); }
  };
  $('askform').onsubmit = event => { event.preventDefault(); send(); };
  $('query').onkeydown = event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); $('askform').requestSubmit(); } };
  $('refresh').onclick = refreshHome; $('reload-memories').onclick = refreshMemories;
  $('unlink').onclick = unlink;
  $('newchat').onclick = () => { epoch++; conversation = ''; unlink(); emptyChat(); status('已开始新会话；开启记忆时仍可读取以往会话摘要。'); $('query').focus(); };
  $('enabled').onchange = () => mutate({ action: 'settings', enabled: $('enabled').checked });
  $('editor').onsubmit = event => { event.preventDefault(); if (editing) mutate({ action: 'correct_summary', id: editing, text: $('memory').value.trim(), problem: $('problem').value, user_state: $('user_state').value, problem_status: $('problem_status').value }); };
  $('cancel').onclick = () => { closeEditor(); $('memory-title').tabIndex = -1; $('memory-title').focus(); };
  $('clear').onclick = () => { if (confirm('清空全部长期会话摘要和旧记录？清空后无法恢复。')) mutate({ action: 'clear' }); };

  (async () => {
    const token = begin('init'), ctx = context();
    let warning = '';
    try {
      try { const health = await API.request('/health'); if (!health.model?.configured) warning = '模型尚未配置。登录后可以管理记忆，真实问答需组员完成模型配置。'; }
      catch (error) { warning = error.message; }
      if (!current(ctx)) return;
      try { const data = await API.request('/api/me'); if (current(ctx)) await enter(data.user); }
      catch (error) { if (error.status !== 401) handleError(error, ctx); }
      if (warning && (current(ctx) || active)) status(warning, 'error');
    } finally { end(token); }
  })();
})();
