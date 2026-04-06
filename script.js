/**
 * SmartPay - Premium Household Account Book Frontend Logic
 */

// --- CONFIGURATION ---
// IMPORTANT: Paste your Google Apps Script Web App URL here!
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx5e-NkNq_dZFAJ_hDw0n90LFA3ARb-iiIuHNvh89Wxp-NMUyupld7Dd1l_9KLL6hYx/exec";

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
    totalExpense: 0
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
    periodStatsBody: document.getElementById('period-stats-body'),
    monthlyStatsBody: document.getElementById('monthly-stats-body'),
    periodStatsDate: document.getElementById('period-stats-date'),
    statsDetailModal: document.getElementById('stats-detail-modal'),
    statsDetailBody: document.getElementById('stats-detail-body'),
    closeStatsModalBtn: document.getElementById('close-stats-modal')
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

                // If stats section, render it
                if (targetId === 'section-stats') {
                    renderStatistics();
                }
            }
        });
    });
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
            return parseDate(b.Date) - parseDate(a.Date);
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
        return parseDate(b.Date) - parseDate(a.Date);
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

    // 1. Period Stats (Pivot Table)
    const periodTransactions = getPeriodTransactions();
    const periodData = generatePeriodStats(); // For the date string
    elements.periodStatsDate.textContent = periodData.periodStr;

    const periodPivotHTML = createPivotHTML(periodTransactions);
    elements.periodStatsBody.parentElement.parentElement.innerHTML = `
        <div class="pivot-container">
            <table class="pivot-table">
                ${periodPivotHTML}
            </table>
        </div>
    `;

    // 2. Monthly Stats (Pivot Table - Grouped by Month)
    const monthlyStatsHTML = generateMonthlyPivotStats();
    elements.monthlyStatsBody.parentElement.parentElement.innerHTML = monthlyStatsHTML;

    // Bind click events (Global for all pivot tables)
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

function getPeriodTransactions() {
    const today = new Date();
    let startYear = today.getFullYear();
    let startMonth = today.getMonth() - 1;
    if (startMonth < 0) { startMonth = 11; startYear--; }
    const startDate = new Date(startYear, startMonth, 23);

    return state.transactions.filter(t => {
        const d = parseDate(t.Date);
        return d >= startDate && d <= today;
    });
}

function createPivotHTML(transactions) {
    if (transactions.length === 0) return '<tr><td style="text-align:center; padding:20px;">내역이 없습니다.</td></tr>';

    const users = [...new Set(transactions.map(t => t.User))].sort();
    const categories = [...new Set(transactions.map(t => t.Category || '미분류'))].sort();

    // Matrix: [user][category]
    const matrix = {};
    users.forEach(u => {
        matrix[u] = {};
        categories.forEach(c => matrix[u][c] = { amount: 0, items: [] });
        matrix[u]._total = 0;
    });

    transactions.forEach(t => {
        const u = t.User;
        const c = t.Category || '미분류';
        if (matrix[u] && matrix[u][c]) {
            const amt = (Number(t.Amount) || 0);
            matrix[u][c].amount += amt;
            matrix[u][c].items.push(t);
            matrix[u]._total += amt;
        }
    });

    // Generate HTML
    let html = `<thead><tr><th class="row-label">이름</th>`;
    categories.forEach(c => html += `<th>${c}</th>`);
    html += `<th class="col-total">총합계</th></tr></thead><tbody>`;

    users.forEach(u => {
        html += `<tr><td class="row-label">${u}</td>`;
        categories.forEach(c => {
            const cell = matrix[u][c];
            if (cell.amount > 0) {
                html += `<td><span class="stat-amount" data-items='${JSON.stringify(cell.items)}'>${cell.amount.toLocaleString()}</span></td>`;
            } else {
                html += `<td class="empty-val">-</td>`;
            }
        });
        html += `<td class="row-total">${matrix[u]._total.toLocaleString()}</td></tr>`;
    });

    // Column Totals (Footer)
    html += `</tbody><tfoot><tr class="row-total"><td class="row-label">항목별 합계</td>`;
    categories.forEach(c => {
        let colTotal = 0;
        users.forEach(u => colTotal += matrix[u][c].amount);
        html += `<td>${colTotal.toLocaleString()}</td>`;
    });
    const grandTotal = users.reduce((sum, u) => sum + matrix[u]._total, 0);
    html += `<td>${grandTotal.toLocaleString()}</td></tr></tfoot>`;

    return html;
}

function generateMonthlyPivotStats() {
    const months = [...new Set(state.transactions.map(t => {
        const d = new Date(t.Date);
        return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    }))].sort().reverse();

    let fullHtml = '';
    months.forEach(m => {
        const monthTransactions = state.transactions.filter(t => {
            const d = new Date(t.Date);
            const mKey = `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            return mKey === m;
        });

        fullHtml += `
            <div class="card glass stats-card" style="margin-bottom: 2rem;">
                <div class="card-header">
                    <h2><i class="fas fa-calendar-check"></i> ${m} 사용 내역</h2>
                </div>
                <div class="pivot-container">
                    <table class="pivot-table">
                        ${createPivotHTML(monthTransactions)}
                    </table>
                </div>
            </div>
        `;
    });
    return fullHtml;
}

function generatePeriodStats() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    // Calculate start date (23rd of previous month)
    let startYear = currentYear;
    let startMonth = currentMonth - 1;
    if (startMonth < 0) {
        startMonth = 11;
        startYear--;
    }
    const startDate = new Date(startYear, startMonth, 23);
    const periodStr = `${startDate.toLocaleDateString()} ~ ${today.toLocaleDateString()}`;

    // Filter and group
    const filtered = state.transactions.filter(t => {
        const d = parseDate(t.Date);
        return d >= startDate && d <= today;
    });

    const groups = {};
    filtered.forEach(t => {
        const key = `${t.User}|${t.Category || '미분류'}`;
        if (!groups[key]) groups[key] = { user: t.User, category: t.Category || '미분류', amount: 0, items: [] };
        groups[key].amount += (Number(t.Amount) || 0);
        groups[key].items.push(t);
    });

    return {
        periodStr: periodStr,
        stats: Object.values(groups).sort((a, b) => b.amount - a.amount)
    };
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
    elements.statsDetailBody.innerHTML = items.sort((a, b) => parseDate(b.Date) - parseDate(a.Date)).map(t => `
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
