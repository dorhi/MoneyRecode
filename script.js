/**
 * SmartPay - Premium Household Account Book Frontend Logic
 */

// --- CONFIGURATION ---
// IMPORTANT: Paste your Google Apps Script Web App URL here!
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzg5lNZ19nObtGi9AFdS_idFqmDELR-tt26GaW9ubfRVkJPE0JkRfzbh1m9rDYPtmyE/exec";

// IMPORTANT: Paste your Google Client ID here!
const GOOGLE_CLIENT_ID = "755923168348-3b5v8j08o0c4506dcd87i7n56hnni2n0.apps.googleusercontent.com";

// --- STATE MANAGEMENT ---
let state = {
    user: null, // Logged in user info
    transactions: [],
    options: {
        cards: [],
        authors: []
    },
    totalExpense: 0,
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth()
};

// --- DOM ELEMENTS ---
const elements = {
    modal: document.getElementById('transaction-modal'),
    form: document.getElementById('transaction-form'),
    addBtn: document.getElementById('add-transaction-btn'),
    closeBtn: document.querySelector('.close-modal'),
    tableBody: document.getElementById('transaction-body'),
    transactionListBody: document.querySelector('.transaction-list-body'), // New full list body
    cardList: document.getElementById('card-list'),
    categoryList: document.getElementById('category-list'), // Added
    totalExpenseDisplay: document.getElementById('total-expense'),
    toast: document.getElementById('toast'),
    currentDateDisplay: document.getElementById('current-date-display'),
    dateInput: document.getElementById('date'),
    loginOverlay: document.getElementById('login-overlay'),
    appContainer: document.querySelector('.app-container'),
    userNameDisplay: document.getElementById('user-name-display'),
    userAvatar: document.getElementById('user-avatar'),
    logoutBtn: document.getElementById('logout-btn'),
    userInput: document.getElementById('user'),
    categoryInput: document.getElementById('category-input'),
    cardInput: document.getElementById('card-input'),
    amountInput: document.getElementById('amount'),
    periodStatsDate: document.getElementById('period-stats-date'),
    statsDetailModal: document.getElementById('stats-detail-modal'),
    statsDetailBody: document.getElementById('stats-detail-body'),
    closeStatsModalBtn: document.getElementById('close-stats-modal'),
    statsYearSelect: document.getElementById('stats-year'),
    statsMonthSelect: document.getElementById('stats-month'),
    refreshStatsBtn: document.getElementById('refresh-stats-btn'),
    periodStatsContainer: document.getElementById('period-stats-container'),
    cardStatsContainer: document.getElementById('card-stats-container'),
    monthlyStatsContainer: document.getElementById('monthly-stats-container')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    checkLoginState();
    setupEventListeners();
    setupNavigation(); // Added
});

function checkLoginState() {
    const savedUser = localStorage.getItem('smartpay_user');
    if (savedUser) {
        state.user = JSON.parse(savedUser);
        showApp();
    } else {
        initGoogleLogin();
    }
}

function initGoogleLogin() {
    if (typeof google === 'undefined') {
        console.log("Waiting for Google SDK...");
        setTimeout(initGoogleLogin, 200); // SDK가 로드될 때까지 200ms마다 재시도
        return;
    }

    if (GOOGLE_CLIENT_ID.includes("YOUR_GOOGLE_CLIENT_ID")) {
        console.warn("Google Client ID is not set.");
        return;
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        use_fedcm_for_prompt: false // FedCM 오류 해결을 위해 추가
    });

    google.accounts.id.renderButton(
        document.getElementById("google-login-btn"),
        { theme: "outline", size: "large", width: "250" }
    );

    // Optional: prompt One Tap login
    google.accounts.id.prompt();
}

function handleCredentialResponse(response) {
    // Decode JWT token (UTF-8 safe decoding)
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const payload = JSON.parse(jsonPayload);

    state.user = {
        name: payload.name,
        email: payload.email,
        picture: payload.picture
    };

    localStorage.setItem('smartpay_user', JSON.stringify(state.user));
    showApp();
    showToast(`👋 환영합니다, ${state.user.name}님!`);
}

function showApp() {
    elements.loginOverlay.style.display = 'none';
    elements.appContainer.style.display = 'flex';

    // Update UI with user info
    elements.userNameDisplay.textContent = state.user.name;
    elements.userAvatar.src = state.user.picture;

    // Auto-fill form fields
    elements.userInput.value = state.user.name;

    initApp();
}

function initApp() {
    // Set current date in header
    const now = new Date();
    elements.currentDateDisplay.textContent = now.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Set default date in form to today
    elements.dateInput.value = formatDateLocal(now);

    // Initial fetch from Google Sheets
    fetchData();
}

function setupEventListeners() {
    // Modal toggle
    elements.addBtn.addEventListener('click', () => {
        // Always set to current local date when opening
        elements.dateInput.value = formatDateLocal(new Date());

        elements.modal.style.display = 'flex';
        setTimeout(() => elements.modal.classList.add('show'), 10);
    });

    elements.closeBtn.addEventListener('click', closeModal);

    window.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
        if (e.target === elements.statsDetailModal) closeStatsModal();
    });

    elements.closeStatsModalBtn.addEventListener('click', closeStatsModal);

    // Logout
    elements.logoutBtn.addEventListener('click', handleLogout);

    // Amount Formatting
    elements.amountInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = value ? Number(value).toLocaleString() : '';
    });

    // Form submission
    elements.form.addEventListener('submit', handleFormSubmit);

    // Mobile FAB
    const fabBtn = document.getElementById('floating-add-btn');
    if (fabBtn) {
        fabBtn.addEventListener('click', () => {
            elements.dateInput.value = formatDateLocal(new Date());
            elements.modal.style.display = 'flex';
            setTimeout(() => elements.modal.classList.add('show'), 10);
        });
    }

    // Mobile Bottom Nav
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    bottomNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');

            // Trigger the corresponding sidebar nav click
            const sidebarBtn = document.getElementById(`nav-${target}`);
            if (sidebarBtn) sidebarBtn.click();

            // Update bottom nav active state
            bottomNavItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // Auto-submit on Enter or Selection for Category and Card
    const setupAutoSubmit = (inputEl, optionsKey) => {
        if (!inputEl) return;

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleFormSubmit(e);
            }
        });

        // 'input' or 'change' can detect datalist selection
        inputEl.addEventListener('input', (e) => {
            const val = e.target.value;
            if (state.options[optionsKey] && state.options[optionsKey].includes(val)) {
                handleFormSubmit(e);
            }
        });
    };

    setupAutoSubmit(elements.categoryInput, 'categories');
    setupAutoSubmit(elements.cardInput, 'cards');

    // Stats Filters
    if (elements.statsYearSelect) {
        elements.statsYearSelect.addEventListener('change', (e) => {
            state.selectedYear = parseInt(e.target.value);
            renderStatistics();
        });
    }
    if (elements.statsMonthSelect) {
        elements.statsMonthSelect.addEventListener('change', (e) => {
            state.selectedMonth = parseInt(e.target.value);
            renderStatistics();
        });
    }
    if (elements.refreshStatsBtn) {
        elements.refreshStatsBtn.addEventListener('click', fetchData);
    }
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.page-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active class to clicked item
            item.classList.add('active');

            // Hide all sections
            sections.forEach(section => section.classList.remove('active'));

            // Show the corresponding section
            const targetId = item.id.replace('nav-', 'section-');
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');

                // Sync bottom nav
                const targetKey = item.id.replace('nav-', '');
                const bottomNavItem = document.querySelector(`.bottom-nav-item[data-target="${targetKey}"]`);
                if (bottomNavItem) {
                    document.querySelectorAll('.bottom-nav-item').forEach(bn => bn.classList.remove('active'));
                    bottomNavItem.classList.add('active');
                }

                // If stats section, initialize and render
                if (targetId === 'section-stats') {
                    initStatsFilters();
                    renderStatistics();
                }
            }
        });
    });
}

function initStatsFilters() {
    if (!elements.statsYearSelect || elements.statsYearSelect.options.length > 0) return;

    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `${y}년`;
        if (y === state.selectedYear) opt.selected = true;
        elements.statsYearSelect.appendChild(opt);
    }

    elements.statsMonthSelect.value = state.selectedMonth;
}

function handleLogout() {
    localStorage.removeItem('smartpay_user');
    window.location.reload();
}

function closeModal() {
    elements.modal.classList.remove('show');
    setTimeout(() => {
        elements.modal.style.display = 'none';
        elements.form.reset();
        elements.dateInput.value = formatDateLocal(new Date());
    }, 300);
}

// --- DATA FETCHING ---
async function fetchData() {
    if (WEB_APP_URL.includes("YOUR_GOOGLE_APPS_SCRIPT_URL")) {
        showToast("💡 구글 스크립트 URL을 설정해주세요! (script.js)");
        return;
    }

    try {
        const response = await fetch(WEB_APP_URL);
        const data = await response.json();

        state.transactions = (data.transactions || []).sort((a, b) => {
            const dateDiff = parseDate(b.Date) - parseDate(a.Date);
            if (dateDiff !== 0) return dateDiff;
            // Secondary sort: CreatedAt (Registration timestamp)
            return new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0);
        });
        state.options = data.options;

        updateUI();
    } catch (error) {
        console.error("Error fetching data:", error);
        showToast("❌ 데이터를 불러오는 데 실패했습니다.");
    }
}

// --- UI UPDATES ---
function updateUI() {
    renderTransactions();
    renderOptions();
    calculateSummary();
}

function renderTransactions() {
    // Sort transactions by date descending (Safety check)
    const sortedTransactions = [...state.transactions].sort((a, b) => {
        const dateDiff = parseDate(b.Date) - parseDate(a.Date);
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0);
    });

    if (sortedTransactions.length === 0) {
        elements.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 40px; color: var(--text-secondary);">거래 내역이 없습니다. 첫 지출을 기록해보세요!</td></tr>';
        return;
    }

    const html = sortedTransactions.map(row => {
        const amtStr = String(row.Amount || 0).replace(/,/g, '');
        const amount = Number(amtStr).toLocaleString();
        const date = parseDate(row.Date).toLocaleDateString('ko-KR');

        return `
            <tr class="transaction-row">
                <td>${date}</td>
                <td><span class="badge category">${row.Category || '미분류'}</span></td>
                <td class="font-bold">${row.Place || '-'}</td>
                <td class="text-expense">₩ ${amount}</td>
                <td><span class="badge user">${row.User || '-'}</span></td>
                <td class="text-secondary">${row.Details || '-'}</td>
                <td><i class="fas fa-credit-card mini-icon"></i> ${row.Card || '-'}</td>
            </tr>
        `;
    }).join('');

    elements.tableBody.innerHTML = html;
    if (elements.transactionListBody) {
        elements.transactionListBody.innerHTML = html;
    }
}

function renderOptions() {
    // Re-check elements just in case they were detached during DOM moves
    const cList = document.getElementById('card-list');
    const catList = document.getElementById('category-list');

    if (cList && state.options.cards) {
        cList.innerHTML = state.options.cards
            .map(card => `<option value="${card}">`)
            .join('');
    }

    if (catList && state.options.categories) {
        catList.innerHTML = state.options.categories
            .map(cat => `<option value="${cat}">`)
            .join('');
    }
}

function calculateSummary() {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const monthlyExpense = state.transactions.reduce((sum, row) => {
        const d = parseDate(row.Date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            const amtStr = String(row.Amount || 0).replace(/,/g, '');
            return sum + (Number(amtStr) || 0);
        }
        return sum;
    }, 0);

    state.totalExpense = monthlyExpense;
    elements.totalExpenseDisplay.textContent = `₩ ${monthlyExpense.toLocaleString()}`;

    // Add subtle glow animation if expense changed
    elements.totalExpenseDisplay.classList.add('pulse');
    setTimeout(() => elements.totalExpenseDisplay.classList.remove('pulse'), 500);
}

// --- FORM HANDLING ---
async function handleFormSubmit(e) {
    e.preventDefault();

    if (WEB_APP_URL.includes("YOUR_GOOGLE_APPS_SCRIPT_URL")) {
        showToast("💡 구글 스크립트 연동이 필요합니다.");
        return;
    }

    const submitBtn = elements.form.querySelector('.btn-submit');
    const originalText = submitBtn.textContent;

    // Loading state
    submitBtn.textContent = "저장 중...";
    submitBtn.disabled = true;

    const formData = new FormData(elements.form);
    const data = Object.fromEntries(formData.entries());

    // Strip commas from amount
    if (data.amount) data.amount = data.amount.replace(/,/g, '');

    // Validate: Check if all fields are filled
    const requiredFields = ['date', 'place', 'amount', 'user', 'category', 'card'];
    const missing = requiredFields.filter(field => !data[field] || data[field].trim() === "");

    if (missing.length > 0) {
        showToast("⚠️ 모든 항목을 입력해 주세요.");
        return;
    }

    // Automatically add the current logged-in user as the author
    data.author = state.user.name;

    try {
        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.status === "success") {
            showToast("✅ 성공적으로 저장되었습니다!");
            closeModal();
            // Re-fetch to update list and options
            fetchData();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error("Error submitting form:", error);
        showToast("❌ 저장에 실패했습니다: " + error.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// --- STATISTICS ---
function renderStatistics() {
    if (!state.transactions || state.transactions.length === 0) return;

    const targetDate = new Date(state.selectedYear, state.selectedMonth, 1);

    // 1. Period Stats (23rd of previous month ~ 22nd of selected month)
    const periodTransactions = getPeriodTransactionsByDate(targetDate);
    const periodData = generatePeriodStatsByDate(targetDate);
    if (elements.periodStatsDate) {
        elements.periodStatsDate.textContent = periodData.periodStr;
    }

    const periodPivotHTML = createPivotHTML(periodTransactions, 'User', 'Category');
    if (elements.periodStatsContainer) {
        elements.periodStatsContainer.innerHTML = `<table class="pivot-table">${periodPivotHTML}</table>`;
    }

    // 2. Card by User Stats (Pivot Table)
    const cardPivotHTML = createPivotHTML(periodTransactions, 'Card', 'User');
    if (elements.cardStatsContainer) {
        elements.cardStatsContainer.innerHTML = `<table class="pivot-table">${cardPivotHTML}</table>`;
    }

    // 3. Monthly Stats (Pivot Table - Filtered to the EXACT selected Year/Month)
    const monthlyStatsHTML = generateMonthlyPivotStats(state.selectedYear, state.selectedMonth);
    if (elements.monthlyStatsContainer) {
        elements.monthlyStatsContainer.innerHTML = monthlyStatsHTML;
    }

    // Bind click events
    document.querySelectorAll('.stat-amount').forEach(el => {
        el.addEventListener('click', function () {
            const itemsData = this.getAttribute('data-items');
            if (itemsData) {
                const items = JSON.parse(itemsData);
                showStatsDetail(items);
            }
        });
    });
}

function getPeriodTransactionsByDate(targetDate) {
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth();

    // Start: 23rd of previous month
    let startYear = y;
    let startMonth = m - 1;
    if (startMonth < 0) { startMonth = 11; startYear--; }
    const startDate = new Date(startYear, startMonth, 23);

    // End: 22nd of selected month
    const endDate = new Date(y, m, 22);

    return state.transactions.filter(t => {
        const d = parseDate(t.Date);
        return d >= startDate && d <= endDate;
    });
}

function createPivotHTML(transactions, rowField, colField) {
    if (transactions.length === 0) return '<tr><td style="text-align:center; padding:20px;">내역이 없습니다.</td></tr>';

    const rowItems = [...new Set(transactions.map(t => t[rowField] || '미분류'))].sort();
    const colItems = [...new Set(transactions.map(t => t[colField] || '미분류'))].sort();

    // Matrix: [row][col]
    const matrix = {};
    rowItems.forEach(r => {
        matrix[r] = {};
        colItems.forEach(c => matrix[r][c] = { amount: 0, items: [] });
        matrix[r]._total = 0;
    });

    transactions.forEach(t => {
        const r = t[rowField] || '미분류';
        const c = t[colField] || '미분류';
        if (matrix[r] && matrix[r][c]) {
            const amt = (Number(String(t.Amount).replace(/,/g, '')) || 0);
            matrix[r][c].amount += amt;
            matrix[r][c].items.push(t);
            matrix[r]._total += amt;
        }
    });

    // Generate HTML
    let html = `<thead><tr><th class="row-label">${rowField === 'User' ? '이름' : (rowField === 'Card' ? '카드' : rowField)}</th>`;
    colItems.forEach(c => html += `<th>${c}</th>`);
    html += `<th class="col-total">총합계</th></tr></thead><tbody>`;

    rowItems.forEach(r => {
        html += `<tr><td class="row-label">${r}</td>`;
        colItems.forEach(c => {
            const cell = matrix[r][c];
            if (cell.amount > 0) {
                html += `<td><span class="stat-amount" data-items='${JSON.stringify(cell.items)}'>${cell.amount.toLocaleString()}</span></td>`;
            } else {
                html += `<td class="empty-val">-</td>`;
            }
        });
        html += `<td class="row-total">${matrix[r]._total.toLocaleString()}</td></tr>`;
    });

    // Column Totals
    html += `</tbody><tfoot><tr class="row-total"><td class="row-label">합계</td>`;
    colItems.forEach(c => {
        let colTotal = 0;
        rowItems.forEach(r => colTotal += matrix[r][c].amount);
        html += `<td>${colTotal.toLocaleString()}</td>`;
    });
    const grandTotal = rowItems.reduce((sum, r) => sum + matrix[r]._total, 0);
    html += `<td>${grandTotal.toLocaleString()}</td></tr></tfoot>`;

    return html;
}

function generateMonthlyPivotStats(year, month) {
    const monthTransactions = state.transactions.filter(t => {
        const d = parseDate(t.Date);
        return d.getFullYear() === year && d.getMonth() === month;
    });

    if (monthTransactions.length === 0) {
        return `<p style="text-align:center; padding:2rem; color: var(--text-secondary);">${year}년 ${month + 1}월 데이터가 없습니다.</p>`;
    }

    const monthName = `${year}.${(month + 1).toString().padStart(2, '0')}`;
    return `
        <div class="card-header" style="padding-top: 0; padding-left: 0;">
            <h2><i class="fas fa-calendar-check"></i> ${monthName} 전체 지출 (1일~말일)</h2>
            <span class="text-secondary small">${month + 1}월 1일부터 마지막 날까지의 지출입니다.</span>
        </div>
        <div class="pivot-container">
            <table class="pivot-table">
                ${createPivotHTML(monthTransactions, 'User', 'Category')}
            </table>
        </div>
    `;
}

function generatePeriodStatsByDate(targetDate) {
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth();

    let startYear = y;
    let startMonth = m - 1;
    if (startMonth < 0) { startMonth = 11; startYear--; }
    const startDate = new Date(startYear, startMonth, 23);
    const endDate = new Date(y, m, 22);

    const periodStr = `${startDate.toLocaleDateString()} ~ ${endDate.toLocaleDateString()}`;

    return { periodStr: periodStr };
}

function generateMonthlyStats() {
    const groups = {};
    state.transactions.forEach(t => {
        const d = parseDate(t.Date);
        const monthKey = `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        const key = `${monthKey}|${t.User}|${t.Category || '미분류'}`;

        if (!groups[key]) {
            groups[key] = {
                month: monthKey,
                user: t.User,
                category: t.Category || '미분류',
                amount: 0,
                items: []
            };
        }
        groups[key].amount += (Number(t.Amount) || 0);
        groups[key].items.push(t);
    });

    return Object.values(groups).sort((a, b) => b.month.localeCompare(a.month) || b.amount - a.amount);
}

function showStatsDetail(items) {
    elements.statsDetailBody.innerHTML = items.sort((a, b) => {
        const dateDiff = parseDate(b.Date) - parseDate(a.Date);
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0);
    }).map(t => `
        <tr>
            <td>${parseDate(t.Date).toLocaleDateString('ko-KR')}</td>
            <td class="font-bold">${t.Place}</td>
            <td class="text-expense">₩ ${Number(String(t.Amount).replace(/,/g, '')).toLocaleString()}</td>
            <td class="text-secondary">${t.Details || '-'}</td>
            <td><span class="badge author">${t.Card || '-'}</span></td>
        </tr>
    `).join('');

    elements.statsDetailModal.style.display = 'flex';
    setTimeout(() => elements.statsDetailModal.classList.add('show'), 10);
}

function closeStatsModal() {
    elements.statsDetailModal.classList.remove('show');
    setTimeout(() => {
        elements.statsDetailModal.style.display = 'none';
        elements.statsDetailBody.innerHTML = '';
    }, 300);
}

// --- UTILS ---
function parseDate(dateStr) {
    if (!dateStr) return new Date();

    // If it's already a Date object, return it
    if (dateStr instanceof Date) return dateStr;

    // Convert to string and clean
    let s = String(dateStr).trim();

    // Handle "2026-04-02T..." ISO format
    if (s.includes('T')) return new Date(s);

    // Split by . or - or /
    const parts = s.split(/[\.\-\/]/).map(p => p.trim());

    if (parts.length >= 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1; // Month is 0-indexed
        const d = parseInt(parts[2], 10);
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) return date;
    }

    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
}

function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}
