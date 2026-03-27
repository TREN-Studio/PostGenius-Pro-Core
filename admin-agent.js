(function () {
  if (window.__pgpAdminAgentAlive) return;
  window.__pgpAdminAgentAlive = true;
  const PANEL_ID = 'pgp-admin-agent-panel';
  const STYLE_ID = 'pgp-admin-agent-style';
  const PATH = '/admin';
  const STATUS_ENDPOINT = '/api/automation/admin_agent_status.php';
  const TICK_ENDPOINT = '/api/automation/admin_agent_tick.php';
  const POLL_MS = 60000;
  const HEADER_LINKS = [
    { href: '/my-articles', label: 'My Articles' },
  ];
  const HIDDEN_HEADER_LINKS = [
    '/blog?tag=Kitchen%20Gear',
    '/blog?tag=Electronics',
    '/blog?tag=Home%20Essentials',
    '/blog?tag=Best%20Deals',
  ];
  const MENU_LINKS = [
    { href: '/my-articles', label: 'My Articles' },
    { href: '/settings', label: 'Settings' },
  ];
  const REVIEW_HEADING_TEXT = 'product reviews';

  let state = {
    open: true,
    loading: false,
    busy: false,
    error: '',
    notice: '',
    data: null,
    lastFetchedAt: 0,
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const formatRelative = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return diffMinutes + ' min ago';

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return diffHours + ' hr ago';

    const diffDays = Math.round(diffHours / 24);
    return diffDays + ' day' + (diffDays === 1 ? '' : 's') + ' ago';
  };

  const getToken = () => localStorage.getItem('auth_token') || '';

  const request = async (endpoint, method, payload) => {
    const res = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getToken(),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok || data.success === false) {
      throw new Error(data.error || ('Agent request failed (' + res.status + ')'));
    }
    return data;
  };

  const cloneLink = (source, href, label) => {
    const link = source.cloneNode(true);
    link.setAttribute('href', href);
    link.textContent = label;
    link.removeAttribute('aria-current');
    link.dataset.pgpAgentInjected = 'true';
    return link;
  };

  const patchHeaderNav = () => {
    const headerNavs = Array.from(document.querySelectorAll('header nav'));
    headerNavs.forEach((nav) => {
      HIDDEN_HEADER_LINKS.forEach((href) => {
        nav.querySelectorAll(`a[href="${href}"]`).forEach((link) => link.remove());
      });

      const dashboardLink = nav.querySelector('a[href="/admin"]');
      if (!dashboardLink) return;

      let insertAfter = dashboardLink;
      HEADER_LINKS.forEach(({ href, label }) => {
        if (nav.querySelector(`a[href="${href}"]`)) {
          insertAfter = nav.querySelector(`a[href="${href}"]`) || insertAfter;
          return;
        }
        const newLink = cloneLink(dashboardLink, href, label);
        insertAfter.insertAdjacentElement('afterend', newLink);
        insertAfter = newLink;
      });
    });
  };

  const patchUserMenus = () => {
    const candidates = Array.from(document.querySelectorAll('div')).filter((node) => {
      return !!node.querySelector(':scope > a[href="/admin"]') && !!node.querySelector(':scope > button') && /logout/i.test(node.textContent || '');
    });

    candidates.forEach((menu) => {
      const dashboardLink = menu.querySelector(':scope > a[href="/admin"]');
      if (!dashboardLink) return;

      let insertAfter = dashboardLink;
      MENU_LINKS.forEach(({ href, label }) => {
        const existing = menu.querySelector(`:scope > a[href="${href}"]`);
        if (existing) {
          insertAfter = existing;
          return;
        }
        const newLink = cloneLink(dashboardLink, href, label);
        insertAfter.insertAdjacentElement('afterend', newLink);
        insertAfter = newLink;
      });
    });
  };

  const isReviewRenderSurface = () => {
    return location.pathname === '/generator' || location.pathname.startsWith('/blog/');
  };

  const shouldStripLargeReviewBlocks = () => {
    if (!isReviewRenderSurface()) return false;

    return Boolean(document.querySelector('.amazon-comparison-grid, .amazon-review-card, .amazon-reviews-section'));
  };

  const stripLargeReviewBlocks = () => {
    if (!shouldStripLargeReviewBlocks()) return;

    document.querySelectorAll('.amazon-reviews-section, .amazon-review-card, .amazon-editorial-pick, .product-verdict-box')
      .forEach((node) => node.remove());

    Array.from(document.querySelectorAll('h2, h3')).forEach((heading) => {
      const text = String(heading.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!text.includes(REVIEW_HEADING_TEXT)) return;

      const parent = heading.parentElement;
      heading.remove();

      if (
        parent &&
        parent !== document.body &&
        !parent.querySelector('.amazon-compare-card, .amazon-comparison-grid, .postgenius-faq-section') &&
        !String(parent.textContent || '').replace(/\s+/g, '').trim()
      ) {
        parent.remove();
      }
    });
  };

  const isMetadataBoundary = (node) => {
    if (!node) return false;
    if (node.matches('hr, aside, footer')) return true;

    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!text) return false;

    return (
      text.includes('author:') ||
      text.includes('filed under:') ||
      text.includes('back to magazine') ||
      text.includes('privacy policy') ||
      text.includes('terms of service')
    );
  };

  const findFeaturedPickAnchor = (contentRoot) => {
    const headings = Array.from(contentRoot.querySelectorAll('h2, h3, h4'));
    const conclusionHeading = headings.find((heading) => {
      const text = String(heading.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return text.includes('conclusion');
    });

    if (!conclusionHeading) return null;

    let anchor = conclusionHeading;
    let next = anchor.nextElementSibling;
    while (next) {
      if (next.matches('h1, h2, h3, h4')) break;
      if (isMetadataBoundary(next)) break;
      anchor = next;
      next = anchor.nextElementSibling;
    }

    return anchor;
  };

  const appendBottomFeaturedPick = () => {
    if (!isReviewRenderSurface()) return;

    document.querySelectorAll('[data-pgp-bottom-pick="true"]').forEach((node) => node.remove());

    const comparisonGrid = document.querySelector('.amazon-comparison-grid');
    const sourceCard = comparisonGrid?.querySelector('.amazon-compare-card');
    if (!comparisonGrid || !sourceCard) return;

    const contentRoot =
      comparisonGrid.closest('.mag-content') ||
      comparisonGrid.closest('article') ||
      comparisonGrid.parentElement;
    if (!contentRoot) return;

    const anchor = findFeaturedPickAnchor(contentRoot);
    if (!anchor) return;

    const section = document.createElement('section');
    section.className = 'pgp-bottom-pick';
    section.dataset.pgpBottomPick = 'true';

    const title = document.createElement('h3');
    title.className = 'pgp-bottom-pick-title';
    title.textContent = 'Our Featured Pick';

    const grid = document.createElement('div');
    grid.className = 'pgp-bottom-pick-grid';
    grid.appendChild(sourceCard.cloneNode(true));

    section.appendChild(title);
    section.appendChild(grid);
    anchor.insertAdjacentElement('afterend', section);
  };

  const applyUiPatches = () => {
    patchHeaderNav();
    patchUserMenus();
    stripLargeReviewBlocks();
    appendBottomFeaturedPick();
  };

  const ensureStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: 420px;
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 36px);
        z-index: 99999;
        font-family: Inter, system-ui, sans-serif;
        color: #e2e8f0;
      }
      #${PANEL_ID} .pgp-agent-shell {
        background: rgba(7, 14, 31, 0.96);
        border: 1px solid rgba(0, 243, 255, 0.16);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(18px);
        border-radius: 20px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 36px);
      }
      #${PANEL_ID} .pgp-agent-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 15px 16px;
        background: linear-gradient(135deg, rgba(0, 243, 255, 0.14), rgba(255, 186, 36, 0.10));
        border-bottom: 1px solid rgba(255,255,255,0.08);
        flex-shrink: 0;
      }
      #${PANEL_ID} .pgp-agent-title {
        margin: 0;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #ffffff;
      }
      #${PANEL_ID} .pgp-agent-sub {
        margin: 4px 0 0;
        font-size: 11px;
        color: #9fb3c8;
      }
      #${PANEL_ID} .pgp-agent-toggle {
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04);
        color: #fff;
        border-radius: 999px;
        font-weight: 700;
        font-size: 12px;
        padding: 8px 12px;
        cursor: pointer;
      }
      #${PANEL_ID} .pgp-agent-body {
        padding: 16px;
        display: grid;
        gap: 14px;
        overflow: auto;
        overscroll-behavior: contain;
      }
      #${PANEL_ID}.collapsed .pgp-agent-body {
        display: none;
      }
      #${PANEL_ID} .pgp-agent-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      #${PANEL_ID} .pgp-agent-card {
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        border-radius: 16px;
        padding: 12px;
      }
      #${PANEL_ID} .pgp-agent-card-wide {
        grid-column: 1 / -1;
      }
      #${PANEL_ID} .pgp-agent-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #8da2b8;
        margin-bottom: 7px;
      }
      #${PANEL_ID} .pgp-agent-value {
        font-size: 24px;
        line-height: 1;
        font-weight: 900;
        color: #ffffff;
      }
      #${PANEL_ID} .pgp-agent-value-sm {
        font-size: 18px;
      }
      #${PANEL_ID} .pgp-agent-meta {
        font-size: 11px;
        color: #9fb3c8;
        margin-top: 6px;
        line-height: 1.45;
      }
      #${PANEL_ID} .pgp-agent-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      #${PANEL_ID} .pgp-agent-status-pill::before {
        content: '';
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: currentColor;
        box-shadow: 0 0 12px currentColor;
      }
      #${PANEL_ID} .pgp-agent-status-healthy {
        color: #6ee7b7;
        background: rgba(16, 185, 129, 0.10);
        border: 1px solid rgba(16, 185, 129, 0.25);
      }
      #${PANEL_ID} .pgp-agent-status-warning {
        color: #fbbf24;
        background: rgba(251, 191, 36, 0.10);
        border: 1px solid rgba(251, 191, 36, 0.25);
      }
      #${PANEL_ID} .pgp-agent-status-offline {
        color: #fca5a5;
        background: rgba(239, 68, 68, 0.10);
        border: 1px solid rgba(239, 68, 68, 0.25);
      }
      #${PANEL_ID} .pgp-agent-note {
        font-size: 12px;
        line-height: 1.6;
        color: #b8c6d4;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
      }
      #${PANEL_ID} .pgp-agent-inline {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 12px;
        color: #9fb3c8;
      }
      #${PANEL_ID} .pgp-agent-progress {
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
      }
      #${PANEL_ID} .pgp-agent-progress > div {
        height: 100%;
        background: linear-gradient(90deg, #00f3ff, #ffba24);
      }
      #${PANEL_ID} .pgp-agent-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      #${PANEL_ID} .pgp-agent-btn {
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        cursor: pointer;
        border: 1px solid transparent;
      }
      #${PANEL_ID} .pgp-agent-btn-primary {
        background: #00f3ff;
        color: #001018;
      }
      #${PANEL_ID} .pgp-agent-btn-secondary {
        background: rgba(255,255,255,0.05);
        color: #e2e8f0;
        border-color: rgba(255,255,255,0.12);
      }
      #${PANEL_ID} .pgp-agent-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      #${PANEL_ID} .pgp-agent-msg {
        font-size: 12px;
        line-height: 1.5;
        border-radius: 12px;
        padding: 10px 12px;
      }
      #${PANEL_ID} .pgp-agent-msg-error {
        background: rgba(239,68,68,0.10);
        border: 1px solid rgba(239,68,68,0.25);
        color: #fecaca;
      }
      #${PANEL_ID} .pgp-agent-msg-ok {
        background: rgba(0,243,255,0.08);
        border: 1px solid rgba(0,243,255,0.20);
        color: #c4fbff;
      }
      #${PANEL_ID} .pgp-agent-list {
        display: grid;
        gap: 8px;
        max-height: 240px;
        overflow: auto;
      }
      #${PANEL_ID} .pgp-agent-item {
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        padding: 10px 12px;
      }
      #${PANEL_ID} .pgp-agent-item-title {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #00f3ff;
      }
      #${PANEL_ID} .pgp-agent-item-body {
        font-size: 12px;
        color: #e2e8f0;
        margin-top: 4px;
        line-height: 1.5;
      }
      #${PANEL_ID} .pgp-agent-item-meta {
        font-size: 11px;
        color: #8da2b8;
        margin-top: 4px;
      }
      .pgp-bottom-pick {
        margin: 2rem 0 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid rgba(148, 163, 184, 0.22);
      }
      .pgp-bottom-pick-title {
        margin: 0 0 1rem;
        font-size: 1rem;
        font-weight: 800;
        line-height: 1.2;
        color: inherit;
      }
      .pgp-bottom-pick-grid {
        max-width: 340px;
      }
      .pgp-bottom-pick .amazon-compare-card {
        margin: 0 !important;
      }
    `;
    document.head.appendChild(style);
  };

  const ensurePanel = () => {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('aside');
    panel.id = PANEL_ID;
    document.body.appendChild(panel);
    return panel;
  };

  const cleanup = () => {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
  };

  const summarizeLiveRun = (payload) => {
    const queued = (payload.queuedJobs || []).length;
    const published = (payload.publishedNow || []).filter((item) => item.status === 'published').length;
    const workerRuns = (payload.workerRuns || []).length;
    return 'Agent run complete. queued=' + queued + ', workerRuns=' + workerRuns + ', published=' + published + '.';
  };

  const buildEventList = (items) => {
    if (!items || !items.length) {
      return '<div class="pgp-agent-item"><div class="pgp-agent-item-body">No automation activity recorded yet.</div></div>';
    }

    return items.map((item) => {
      const type = escapeHtml(item.event_type || item.eventType || item.run_type || 'event');
      const message = escapeHtml(item.message || item.details || 'Activity recorded.');
      const createdAt = escapeHtml(formatDate(item.created_at || item.createdAt));
      return `
        <div class="pgp-agent-item">
          <div class="pgp-agent-item-title">${type}</div>
          <div class="pgp-agent-item-body">${message}</div>
          <div class="pgp-agent-item-meta">${createdAt}</div>
        </div>
      `;
    }).join('');
  };

  const getStatusClass = (status) => {
    switch (String(status || '').toLowerCase()) {
      case 'healthy':
        return 'pgp-agent-status-healthy';
      case 'warning':
      case 'delayed':
      case 'attention':
        return 'pgp-agent-status-warning';
      default:
        return 'pgp-agent-status-offline';
    }
  };

  const fetchStatus = async (force) => {
    if (state.loading && !force) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      state.data = await request(STATUS_ENDPOINT, 'GET');
      state.lastFetchedAt = Date.now();
    } catch (error) {
      state.error = error.message || 'Failed to load agent status.';
    } finally {
      state.loading = false;
      render();
    }
  };

  const runTick = async (dryRun) => {
    state.busy = true;
    state.error = '';
    state.notice = '';
    render();
    try {
      const result = await request(TICK_ENDPOINT, 'POST', { dryRun: !!dryRun });
      state.notice = dryRun ? 'Dry run complete. No content was published.' : summarizeLiveRun(result);
      await fetchStatus(true);
    } catch (error) {
      state.error = error.message || 'Agent run failed.';
    } finally {
      state.busy = false;
      render();
    }
  };

  const render = () => {
    if (location.pathname !== PATH) {
      cleanup();
      return;
    }

    ensureStyles();
    const panel = ensurePanel();
    const data = state.data || {};
    const lambda = data.lambda || {};
    const agent = data.agent || {};
    const counts = data.counts || {};
    const queue = data.queue || (agent.backlog || {});
    const recentEvents = data.recentEvents || data.recentRuns || [];
    const publishedToday = Number(counts.publishedToday || agent.publishedToday || 0);
    const target = Number(agent.dailyTarget || 0);
    const targetLabel = target > 0 ? String(target) : (String(agent.dailyMin || 12) + '-' + String(agent.dailyMax || 17));
    const progressPercent = target > 0 ? Math.min(100, Math.round((publishedToday / target) * 100)) : 0;
    const lambdaClass = getStatusClass(lambda.status);

    panel.className = state.open ? '' : 'collapsed';
    panel.innerHTML = `
      <div class="pgp-agent-shell">
        <div class="pgp-agent-head">
          <div>
            <h3 class="pgp-agent-title">Platform Agent Monitor</h3>
            <p class="pgp-agent-sub">Admin-only health panel for autonomous Postgenius publishing</p>
          </div>
          <button type="button" class="pgp-agent-toggle" data-agent-toggle>${state.open ? 'Hide' : 'Show'}</button>
        </div>
        <div class="pgp-agent-body">
          <div class="pgp-agent-card pgp-agent-card-wide">
            <div class="pgp-agent-label">AWS Lambda</div>
            <div class="pgp-agent-status-pill ${lambdaClass}">${escapeHtml(lambda.label || 'Offline')}</div>
            <div class="pgp-agent-meta">${escapeHtml(lambda.summary || 'No automation activity recorded yet.')}</div>
          </div>

          <div class="pgp-agent-grid">
            <div class="pgp-agent-card">
              <div class="pgp-agent-label">Last Agent Run</div>
              <div class="pgp-agent-value pgp-agent-value-sm">${escapeHtml(formatRelative(lambda.agentLastRunAt || lambda.lastRunAt))}</div>
              <div class="pgp-agent-meta">${escapeHtml(formatDate(lambda.agentLastRunAt || lambda.lastRunAt))}</div>
            </div>

            <div class="pgp-agent-card">
              <div class="pgp-agent-label">Last Worker Run</div>
              <div class="pgp-agent-value pgp-agent-value-sm">${escapeHtml(formatRelative(lambda.workerLastRunAt))}</div>
              <div class="pgp-agent-meta">${escapeHtml(formatDate(lambda.workerLastRunAt))}</div>
            </div>

            <div class="pgp-agent-card">
              <div class="pgp-agent-label">Published Today</div>
              <div class="pgp-agent-value">${publishedToday}</div>
              <div class="pgp-agent-meta">Target ${escapeHtml(targetLabel)} today</div>
            </div>

            <div class="pgp-agent-card">
              <div class="pgp-agent-label">Queue Pending</div>
              <div class="pgp-agent-value">${Number(queue.pendingTotal || 0)}</div>
              <div class="pgp-agent-meta">${Number(queue.queuedJobs || 0)} queued, ${Number(queue.processingJobs || 0)} processing</div>
            </div>

            <div class="pgp-agent-card">
              <div class="pgp-agent-label">Draft Buffer</div>
              <div class="pgp-agent-value">${Number(queue.pendingDrafts || 0)}</div>
              <div class="pgp-agent-meta">${Number(queue.awaitingReview || 0)} awaiting review</div>
            </div>

            <div class="pgp-agent-card">
              <div class="pgp-agent-label">Last Refresh</div>
              <div class="pgp-agent-value pgp-agent-value-sm">${escapeHtml(state.lastFetchedAt ? formatRelative(state.lastFetchedAt) : '-')}</div>
              <div class="pgp-agent-meta">${state.loading ? 'Refreshing now...' : escapeHtml(formatDate(state.lastFetchedAt))}</div>
            </div>
          </div>

          <div>
            <div class="pgp-agent-inline">
              <span>Daily publishing progress</span>
              <span>${publishedToday}/${target > 0 ? target : targetLabel}</span>
            </div>
            <div class="pgp-agent-progress"><div style="width:${progressPercent}%"></div></div>
          </div>

          <div class="pgp-agent-note">
            <strong>Queue health:</strong> ${Number(queue.pendingTotal || 0)} total pending items. This monitor reads the same automation tables your AWS Lambda updates and does not touch blueprint logic.
          </div>

          <div class="pgp-agent-actions">
            <button type="button" class="pgp-agent-btn pgp-agent-btn-secondary" data-agent-refresh ${state.busy ? 'disabled' : ''}>Refresh</button>
            <button type="button" class="pgp-agent-btn pgp-agent-btn-secondary" data-agent-dry ${state.busy ? 'disabled' : ''}>Dry Run</button>
            <button type="button" class="pgp-agent-btn pgp-agent-btn-primary" data-agent-live ${state.busy ? 'disabled' : ''}>Run Agent Now</button>
          </div>

          ${state.notice ? `<div class="pgp-agent-msg pgp-agent-msg-ok">${escapeHtml(state.notice)}</div>` : ''}
          ${state.error ? `<div class="pgp-agent-msg pgp-agent-msg-error">${escapeHtml(state.error)}</div>` : ''}

          <div>
            <div class="pgp-agent-label">Recent Activity</div>
            <div class="pgp-agent-list">${buildEventList(recentEvents)}</div>
          </div>
        </div>
      </div>
    `;

    panel.querySelector('[data-agent-toggle]').onclick = () => {
      state.open = !state.open;
      render();
    };
    panel.querySelector('[data-agent-refresh]').onclick = () => fetchStatus(true);
    panel.querySelector('[data-agent-dry]').onclick = () => runTick(true);
    panel.querySelector('[data-agent-live]').onclick = () => {
      const approved = window.confirm('Run the platform agent now? It may queue, generate, and publish review articles on Postgenius.');
      if (approved) runTick(false);
    };
  };

  const tick = () => {
    applyUiPatches();

    if (location.pathname !== PATH) {
      cleanup();
      return;
    }

    render();
    if (!state.data || Date.now() - state.lastFetchedAt > POLL_MS) {
      fetchStatus(false);
    }
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function () {
    originalPushState.apply(this, arguments);
    setTimeout(tick, 50);
  };

  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    setTimeout(tick, 50);
  };

  window.addEventListener('popstate', () => setTimeout(tick, 50));
  window.addEventListener('click', () => setTimeout(applyUiPatches, 50), true);
  window.addEventListener('load', () => setTimeout(tick, 400));
  setInterval(tick, 1500);
})();
