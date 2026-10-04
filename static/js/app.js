/**
 * AI 스마트 가계부 & 자산 플래너 프론트엔드 스크립트
 * - 4자리 PIN 비밀번호 잠금/해제 보안 시스템 (비밀번호: 0412)
 * - 지하철/카페 모드 (👁️ 금액 숨김 마스킹: ₩ ••••••)
 * - 대박 스마트 가계부 캘린더 (날짜별 지출액, 무지출 돼지 도장, 신호등 컬러 뱃지, 고정지출 꼬리표, 날짜 클릭 팝업)
 * - "커피 몇 잔 아꼈을까?" 지출 체감 변환기
 * - 간편 계산기 위젯 (🧮 지출 금액 자동 입력 연동)
 * - 로컬스토리지 영구 저장 및 전체 초기화 (💾 / 🔄)
 * - 비동기 API 통신 (fetch)
 * - 실시간 지출 내역 관리 및 예산 소진율 시각화
 * - 실시간 숫자 단위 천 단위 콤마(,) 자동 서식 적용
 * - Gemini AI 리포트 렌더링 및 복사/다운로드 기능
 */

document.addEventListener("DOMContentLoaded", () => {
  // -----------------------------------------------------------
  // 0-1. 보안 잠금 화면 (PIN: 0412)
  // -----------------------------------------------------------
  const APP_PIN = "0412";
  const lockScreen = document.getElementById("lock-screen");
  const pinForm = document.getElementById("pin-form");
  const pinInput = document.getElementById("pin-input");
  const pinError = document.getElementById("pin-error");
  const btnLockApp = document.getElementById("btn-lock-app");
  const btnToggleMask = document.getElementById("btn-toggle-mask");

  // 이전 세션에서 잠금 해제한 적이 있는지 확인
  if (sessionStorage.getItem("app_unlocked") === "true") {
    lockScreen.classList.add("unlocked");
  } else {
    setTimeout(() => {
      pinInput.focus();
    }, 100);
  }

  // PIN 번호 제출 처리
  pinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const enteredPin = pinInput.value.trim();

    if (enteredPin === APP_PIN) {
      pinError.classList.add("hidden");
      sessionStorage.setItem("app_unlocked", "true");
      lockScreen.classList.add("unlocked");
      pinInput.value = "";
    } else {
      pinError.classList.remove("hidden");
      const card = lockScreen.querySelector(".lock-card");
      card.classList.remove("shake");
      void card.offsetWidth;
      card.classList.add("shake");
      pinInput.value = "";
      pinInput.focus();
    }
  });

  // 우측 상단 '🔒 잠금' 버튼
  if (btnLockApp) {
    btnLockApp.addEventListener("click", () => {
      sessionStorage.removeItem("app_unlocked");
      lockScreen.classList.remove("unlocked");
      pinInput.value = "";
      setTimeout(() => {
        pinInput.focus();
      }, 100);
    });
  }

  // -----------------------------------------------------------
  // 0-1. 모바일 및 스크롤 시 상단 헤더 슬림 축소 효과 (Compact Header)
  // -----------------------------------------------------------
  const appHeader = document.querySelector(".app-header");
  if (appHeader) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 25) {
        appHeader.classList.add("header-scrolled");
      } else {
        appHeader.classList.remove("header-scrolled");
      }
    }, { passive: true });
  }


  const defaultFixedItems = () => [
    { id: "fixed-1", name: "🏠 월세/이자", day: 25 },
    { id: "fixed-2", name: "🍿 OTT 구독료", day: 1 },
    { id: "fixed-3", name: "💡 공과금", day: 15 }
  ];

  // -----------------------------------------------------------
  // 1. 애플리케이션 상태 (State)
  // -----------------------------------------------------------
  const state = {
    budgetPlan: null,  // { total_income, fixed_expenses, savings_goal, disposable_budget, daily_recommended, category_budgets, ai_report }
    expenses: [],      // [ { id, date, category, amount, payment, memo } ]
    fixedItems: defaultFixedItems(), // [ { id, name, day } ] 고정지출 꼬리표 목록
    isMasked: false,   // 지하철/카페 모드 (금액 마스킹 여부)
    selectedDate: null // 캘린더에서 클릭하여 조회 중인 날짜
  };

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const dateInput = document.getElementById("exp-date");
  if (dateInput) dateInput.value = today;

  // -----------------------------------------------------------
  // 2. DOM 요소 참조
  // -----------------------------------------------------------
  const budgetForm = document.getElementById("budget-form");
  const expenseForm = document.getElementById("expense-form");
  const expenseListBody = document.getElementById("expense-list-body");
  const btnAnalyze = document.getElementById("btn-analyze-expenses");

  // 저장 & 초기화 버튼
  const btnSaveData = document.getElementById("btn-save-data");
  const btnResetData = document.getElementById("btn-reset-data");
  const autoSaveHint = document.getElementById("auto-save-hint");

  // 요약 카드 요소들
  const dashboardSummary = document.getElementById("dashboard-summary");
  const sumTotalIncome = document.getElementById("sum-total-income");
  const sumDisposable = document.getElementById("sum-disposable-budget");
  const sumDailyRecommended = document.getElementById("sum-daily-recommended");
  const sumTotalSpent = document.getElementById("sum-total-spent");
  const sumRemaining = document.getElementById("sum-remaining-budget");
  const sumProjectedSavings = document.getElementById("sum-projected-savings");

  // 게이지 바 요소들
  const burnRateBadge = document.getElementById("burn-rate-badge");
  const burnRatePercent = document.getElementById("burn-rate-percent");
  const mainProgressBar = document.getElementById("main-progress-bar");
  const burnRateAlert = document.getElementById("burn-rate-alert");
  const categoryProgressList = document.getElementById("category-progress-list");

  // 동기부여 & 절약 재미 요소 섹션
  const funMotivationSection = document.getElementById("fun-motivation-section");
  const calendarGrid = document.getElementById("calendar-grid");
  const calendarMonthTitle = document.getElementById("calendar-month-title");
  const calDailyBudgetText = document.getElementById("cal-daily-budget-text");
  const zeroSpendCountBadge = document.getElementById("zero-spend-count-badge");
  const feelCoffeeCount = document.getElementById("feel-coffee-count");
  const feelChickenCount = document.getElementById("feel-chicken-count");
  const feelMovieCount = document.getElementById("feel-movie-count");
  const feelCheerText = document.getElementById("feel-cheer-text");

  // 날짜별 상세 팝업 모달 요소들
  const dateDetailModal = document.getElementById("date-detail-modal");
  const dateModalTitle = document.getElementById("date-modal-title");
  const dateModalTotal = document.getElementById("date-modal-total");
  const dateModalTraffic = document.getElementById("date-modal-traffic");
  const dateModalItems = document.getElementById("date-modal-items");
  const btnCloseDateModal = document.getElementById("btn-close-date-modal");
  const btnConfirmDateModal = document.getElementById("btn-confirm-date-modal");
  const btnSetDateToForm = document.getElementById("btn-set-date-to-form");

  // 계산기 요소들
  const btnHeaderCalc = document.getElementById("btn-header-calc");
  const btnFloatingCalc = document.getElementById("btn-floating-calc");
  const calculatorWidget = document.getElementById("calculator-widget");
  const btnCloseCalc = document.getElementById("btn-close-calc");
  const calcDisplay = document.getElementById("calc-display");
  const calcHistory = document.getElementById("calc-history");
  const btnApplyCalcToExpense = document.getElementById("btn-apply-calc-to-expense");

  // AI 리포트 섹션 요소들
  const aiPlanSection = document.getElementById("ai-plan-section");
  const aiPlanContent = document.getElementById("ai-plan-content");
  const btnCopyPlan = document.getElementById("btn-copy-plan");
  const btnDownloadPlan = document.getElementById("btn-download-plan");

  const aiFeedbackSection = document.getElementById("ai-feedback-section");
  const aiFeedbackContent = document.getElementById("ai-feedback-content");
  const btnCopyFeedback = document.getElementById("btn-copy-feedback");
  const btnDownloadFeedback = document.getElementById("btn-download-feedback");

  // 로딩 모달
  const loadingModal = document.getElementById("loading-modal");
  const loadingTitle = document.getElementById("loading-title");
  const loadingDesc = document.getElementById("loading-desc");

  // -----------------------------------------------------------
  // 3. 유틸리티 & 마스킹 & 천단위 콤마 서식 헬퍼 함수
  // -----------------------------------------------------------
  const formatWon = (num) => {
    if (state.isMasked) {
      return "₩ ••••••";
    }
    return `${Math.round(num || 0).toLocaleString("ko-KR")}원`;
  };

  const parseWon = (val) => {
    if (!val) return 0;
    const cleaned = String(val).replace(/[^0-9]/g, "");
    return parseFloat(cleaned) || 0;
  };

  const bindAutoComma = (selector) => {
    const input = document.querySelector(selector);
    if (!input) return;
    input.addEventListener("input", (e) => {
      const cursorPosition = e.target.selectionStart;
      const originalLength = e.target.value.length;
      const rawDigits = e.target.value.replace(/[^0-9]/g, "");

      if (!rawDigits) {
        e.target.value = "";
        return;
      }

      const formatted = Number(rawDigits).toLocaleString("ko-KR");
      e.target.value = formatted;

      const newLength = formatted.length;
      const diff = newLength - originalLength;
      e.target.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
      autoSaveFormData();
    });
  };

  bindAutoComma("#fixed-income");
  bindAutoComma("#variable-income");
  bindAutoComma("#savings-goal");
  bindAutoComma("#fixed-expenses");
  bindAutoComma("#exp-amount");

  const varInc = document.getElementById("variable-income");
  if (varInc && varInc.value) varInc.value = Number(varInc.value).toLocaleString("ko-KR");

  // -----------------------------------------------------------
  // -----------------------------------------------------------
  // 3-0. 로컬스토리지 자동 저장 및 복원 기능 (Persistence)
  // -----------------------------------------------------------
  const STORAGE_KEY_PLAN = "AI_BUDGET_PLAN_DATA";
  const STORAGE_KEY_EXPENSES = "AI_EXPENSES_LIST_DATA";
  const STORAGE_KEY_INPUTS = "AI_BUDGET_INPUTS_DATA";
  const STORAGE_KEY_FIXED_DAYS = "AI_FIXED_DAYS_DATA";

  const fixedDaysList = document.getElementById("fixed-days-list");
  const btnAddFixedDay = document.getElementById("btn-add-fixed-day");

  // 고정지출 결제일 목록 화면 렌더링
  const renderFixedDaysList = () => {
    if (!fixedDaysList) return;
    if (!state.fixedItems || state.fixedItems.length === 0) {
      fixedDaysList.innerHTML = `<p style="font-size:0.82rem; color:#94a3b8; padding: 6px 4px;">등록된 고정지출 결제일이 없습니다. '➕ 고정지출 추가' 버튼을 눌러 결제일을 등록하세요.</p>`;
      return;
    }

    fixedDaysList.innerHTML = state.fixedItems.map(item => `
      <div class="fixed-day-item" data-id="${item.id}">
        <input type="text" class="input-fixed-name" value="${escapeHtml(item.name)}" placeholder="지출명 (예: 월세)" title="고정지출 이름">
        <div class="input-fixed-day-wrapper">
          <span>매월</span>
          <input type="number" class="input-fixed-day" min="1" max="31" value="${item.day}" title="결제일 (1~31일)">
          <span>일</span>
        </div>
        <button type="button" class="btn-del-fixed" title="이 항목 삭제">✕</button>
      </div>
    `).join("");

    fixedDaysList.querySelectorAll(".fixed-day-item").forEach(itemEl => {
      const id = itemEl.getAttribute("data-id");
      const nameInput = itemEl.querySelector(".input-fixed-name");
      const dayInput = itemEl.querySelector(".input-fixed-day");
      const btnDel = itemEl.querySelector(".btn-del-fixed");

      nameInput.addEventListener("input", (e) => {
        const target = state.fixedItems.find(f => f.id === id);
        if (target) {
          target.name = e.target.value.trim() || "고정지출";
          saveAllToLocalStorage();
          renderZeroSpendCalendar();
        }
      });

      dayInput.addEventListener("change", (e) => {
        let val = parseInt(e.target.value) || 1;
        if (val < 1) val = 1;
        if (val > 31) val = 31;
        e.target.value = val;
        const target = state.fixedItems.find(f => f.id === id);
        if (target) {
          target.day = val;
          saveAllToLocalStorage();
          renderZeroSpendCalendar();
        }
      });

      btnDel.addEventListener("click", () => {
        state.fixedItems = state.fixedItems.filter(f => f.id !== id);
        renderFixedDaysList();
        saveAllToLocalStorage();
        renderZeroSpendCalendar();
      });
    });
  };

  if (btnAddFixedDay) {
    btnAddFixedDay.addEventListener("click", () => {
      if (!state.fixedItems) state.fixedItems = [];
      const newId = "fixed-" + Date.now();
      state.fixedItems.push({
        id: newId,
        name: "📌 고정지출",
        day: 10
      });
      renderFixedDaysList();
      saveAllToLocalStorage();
      renderZeroSpendCalendar();
    });
  }

  const autoSaveFormData = () => {
    const formData = {
      fixedIncome: document.getElementById("fixed-income")?.value || "",
      variableIncome: document.getElementById("variable-income")?.value || "",
      savingsGoal: document.getElementById("savings-goal")?.value || "",
      fixedExpenses: document.getElementById("fixed-expenses")?.value || "",
      spendingStyle: document.querySelector('input[name="spending-style"]:checked')?.value || "밸런스형"
    };
    localStorage.setItem(STORAGE_KEY_INPUTS, JSON.stringify(formData));
  };

  const saveAllToLocalStorage = () => {
    if (state.budgetPlan) {
      localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify(state.budgetPlan));
    }
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(state.expenses));
    localStorage.setItem(STORAGE_KEY_FIXED_DAYS, JSON.stringify(state.fixedItems));
    autoSaveFormData();
  };

  const loadFromLocalStorage = () => {
    try {
      // 0. 고정지출 결제일 목록 복원
      const savedFixed = localStorage.getItem(STORAGE_KEY_FIXED_DAYS);
      if (savedFixed) {
        try {
          state.fixedItems = JSON.parse(savedFixed);
        } catch (e) {
          state.fixedItems = defaultFixedItems();
        }
      } else {
        state.fixedItems = defaultFixedItems();
      }
      renderFixedDaysList();

      // 1. 입력 폼 복원
      const savedInputs = localStorage.getItem(STORAGE_KEY_INPUTS);
      if (savedInputs) {
        const inp = JSON.parse(savedInputs);
        if (inp.fixedIncome && document.getElementById("fixed-income")) document.getElementById("fixed-income").value = inp.fixedIncome;
        if (inp.variableIncome && document.getElementById("variable-income")) document.getElementById("variable-income").value = inp.variableIncome;
        if (inp.savingsGoal && document.getElementById("savings-goal")) document.getElementById("savings-goal").value = inp.savingsGoal;
        if (inp.fixedExpenses && document.getElementById("fixed-expenses")) document.getElementById("fixed-expenses").value = inp.fixedExpenses;

        if (inp.spendingStyle) {
          const radio = document.querySelector(`input[name="spending-style"][value="${inp.spendingStyle}"]`);
          if (radio) radio.checked = true;
        }
      }

      // 2. 예산 플랜 복원
      const savedPlan = localStorage.getItem(STORAGE_KEY_PLAN);
      if (savedPlan) {
        state.budgetPlan = JSON.parse(savedPlan);
        dashboardSummary.classList.remove("hidden");
        sumTotalIncome.textContent = formatWon(state.budgetPlan.total_income);
        sumDisposable.textContent = formatWon(state.budgetPlan.disposable_budget);
        sumDailyRecommended.textContent = formatWon(state.budgetPlan.daily_recommended);
        if (calDailyBudgetText) calDailyBudgetText.textContent = formatWon(state.budgetPlan.daily_recommended);

        if (funMotivationSection) funMotivationSection.classList.remove("hidden");
        if (btnAnalyze) btnAnalyze.removeAttribute("disabled");

        if (state.budgetPlan.ai_report && aiPlanSection && aiPlanContent) {
          aiPlanContent.innerHTML = window.marked ? marked.parse(state.budgetPlan.ai_report) : state.budgetPlan.ai_report;
          aiPlanSection.classList.remove("hidden");
        }
      }

      // 3. 지출 목록 복원
      const savedExpenses = localStorage.getItem(STORAGE_KEY_EXPENSES);
      if (savedExpenses) {
        state.expenses = JSON.parse(savedExpenses);
      }

      // 화면 리렌더링
      renderExpenseTable();
      updateCalculations();
      renderZeroSpendCalendar();
      renderFeelConverter();

    } catch (err) {
      console.warn("로컬 저장소 데이터 로드 중 알림:", err);
    }
  };

  // 수동 저장 버튼 클릭 이벤트
  if (btnSaveData) {
    btnSaveData.addEventListener("click", () => {
      saveAllToLocalStorage();
      alert("가계부 데이터가 안전하게 저장되었습니다! 💾\n브라우저를 닫고 다시 접속하셔도 그대로 유지됩니다.");
    });
  }

  // 전체 초기화 버튼 클릭 이벤트
  if (btnResetData) {
    btnResetData.addEventListener("click", () => {
      if (!confirm("⚠️ 정말로 모든 가계부 데이터(예산 및 지출 내역)를 초기화하시겠습니까?\n저장된 모든 데이터가 삭제되며 이 작업은 되돌릴 수 없습니다.")) {
        return;
      }

      localStorage.removeItem(STORAGE_KEY_PLAN);
      localStorage.removeItem(STORAGE_KEY_EXPENSES);
      localStorage.removeItem(STORAGE_KEY_INPUTS);
      localStorage.removeItem(STORAGE_KEY_FIXED_DAYS);

      state.budgetPlan = null;
      state.expenses = [];
      state.fixedItems = defaultFixedItems();
      renderFixedDaysList();

      // 폼 초기화
      budgetForm.reset();
      expenseForm.reset();
      if (dateInput) dateInput.value = today;

      // 화면 숨김 및 초기화
      dashboardSummary.classList.add("hidden");
      if (funMotivationSection) funMotivationSection.classList.add("hidden");
      if (aiPlanSection) aiPlanSection.classList.add("hidden");
      if (aiFeedbackSection) aiFeedbackSection.classList.add("hidden");
      if (btnAnalyze) btnAnalyze.setAttribute("disabled", "true");

      renderExpenseTable();
      updateCalculations();

      alert("가계부 데이터가 깨끗하게 초기화되었습니다. 🌱\n새로운 마음으로 가계부를 시작해 보세요!");
    });
  }

  // -----------------------------------------------------------
  // 3-1. 지하철/카페 모드 (👁️ 금액 숨김/보임 토글)
  // -----------------------------------------------------------
  if (btnToggleMask) {
    btnToggleMask.addEventListener("click", () => {
      state.isMasked = !state.isMasked;

        const bIcon = document.getElementById("bottom-mask-icon");
        const bLabel = document.getElementById("bottom-mask-label");
        if (state.isMasked) {
          btnToggleMask.innerHTML = "🙈 금액 보임";
          btnToggleMask.classList.add("btn-masked-active");
          btnToggleMask.title = "금액 마스킹 해제하기";
          if (bIcon) bIcon.textContent = "🙈";
          if (bLabel) bLabel.textContent = "보임";

          document.querySelectorAll("input[inputmode='numeric']").forEach(inp => {
            inp.type = "password";
          });
        } else {
          btnToggleMask.innerHTML = "👁️ 금액 숨김";
          btnToggleMask.classList.remove("btn-masked-active");
          btnToggleMask.title = "지하철/카페 모드 (금액 마스킹)";
          if (bIcon) bIcon.textContent = "👁️";
          if (bLabel) bLabel.textContent = "숨김";

          document.querySelectorAll("input[inputmode='numeric']").forEach(inp => {
            inp.type = "text";
          });
        }

        if (state.budgetPlan) {
          sumTotalIncome.textContent = formatWon(state.budgetPlan.total_income);
          sumDisposable.textContent = formatWon(state.budgetPlan.disposable_budget);
          sumDailyRecommended.textContent = formatWon(state.budgetPlan.daily_recommended);
          if (calDailyBudgetText) calDailyBudgetText.textContent = formatWon(state.budgetPlan.daily_recommended);
        }
        updateCalculations();
        renderExpenseTable();
        renderFeelConverter();
        renderZeroSpendCalendar();
      });
    }

  // 모바일 전용 하단 퀵 액션바 이벤트 연동
  const btnBottomSave = document.getElementById("btn-bottom-save");
  const btnBottomReset = document.getElementById("btn-bottom-reset");
  const btnBottomMask = document.getElementById("btn-bottom-mask");
  const btnBottomCalc = document.getElementById("btn-bottom-calc");
  const btnBottomLock = document.getElementById("btn-bottom-lock");

  if (btnBottomSave && btnSaveData) btnBottomSave.addEventListener("click", () => btnSaveData.click());
  if (btnBottomReset && btnResetData) btnBottomReset.addEventListener("click", () => btnResetData.click());
  if (btnBottomMask && btnToggleMask) btnBottomMask.addEventListener("click", () => btnToggleMask.click());
  if (btnBottomCalc && btnFloatingCalc) btnBottomCalc.addEventListener("click", () => btnFloatingCalc.click());
  if (btnBottomLock && btnLockApp) btnBottomLock.addEventListener("click", () => btnLockApp.click());

  // -----------------------------------------------------------
  // 3-2. 스마트 가계부 캘린더 렌더러
  // -----------------------------------------------------------
  const renderZeroSpendCalendar = () => {
    if (!calendarGrid) return;

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    if (calendarMonthTitle) {
      calendarMonthTitle.textContent = `${currentYear}년 ${currentMonth + 1}월`;
    }

    const dailyBudget = state.budgetPlan ? (state.budgetPlan.daily_recommended || 0) : 0;
    if (calDailyBudgetText) {
      calDailyBudgetText.textContent = formatWon(dailyBudget);
    }

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const spentByDate = {};
    state.expenses.forEach(exp => {
      if (exp.date) {
        spentByDate[exp.date] = (spentByDate[exp.date] || 0) + exp.amount;
      }
    });

    let zeroSpendCount = 0;
    let html = "";

    for (let i = 0; i < firstDayIndex; i++) {
      html += `<div class="cal-cell empty"></div>`;
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayStr = String(day).padStart(2, "0");
      const monthStr = String(currentMonth + 1).padStart(2, "0");
      const dateKey = `${currentYear}-${monthStr}-${dayStr}`;

      const isToday = (day === currentDay);
      const isPastOrToday = (day <= currentDay);
      const spent = spentByDate[dateKey] || 0;
      const hasExpense = (spent > 0);

      let fixedTagHtml = "";
      const matchedFixed = (state.fixedItems || []).filter(item => item.day === day);
      if (matchedFixed.length > 0) {
        fixedTagHtml = `<div class="cal-tags-container">` +
          matchedFixed.map(f => `<span class="cal-tag-fixed" title="${escapeHtml(f.name)} 결제일">${escapeHtml(f.name)}</span>`).join("") +
          `</div>`;
      }

      let cellClasses = "cal-cell";
      let centerContent = "";
      let bottomBadge = "";

      if (isToday) cellClasses += " today";

      if (isPastOrToday && !hasExpense && state.budgetPlan) {
        zeroSpendCount++;
        cellClasses += " has-stamp";
        centerContent = `<span class="cal-stamp-icon" title="무지출 성공!">🐷</span>`;
      } else if (hasExpense) {
        const isOver = dailyBudget > 0 ? (spent > dailyBudget) : false;
        const badgeClass = isOver ? "badge-over" : "badge-safe";
        const badgeIcon = isOver ? "⚠️ " : "₩";
        const displayAmt = state.isMasked ? "••••" : (spent >= 10000 ? `${(spent/10000).toFixed(1)}만` : spent.toLocaleString("ko-KR"));

        bottomBadge = `
          <div class="cal-money-badge ${badgeClass}" title="총 지출: ${formatWon(spent)} (권장: ${formatWon(dailyBudget)})">
            ${badgeIcon}${displayAmt}
          </div>
        `;
      }

      html += `
        <div class="${cellClasses}" data-date="${dateKey}" data-spent="${spent}" title="${dateKey} 지출 상세 보기">
          <div class="cal-date-num">
            <span>${day}</span>
            ${fixedTagHtml}
          </div>
          <div class="cal-center-content">
            ${centerContent}
          </div>
          ${bottomBadge}
        </div>
      `;
    }

    calendarGrid.innerHTML = html;

    if (zeroSpendCountBadge) {
      zeroSpendCountBadge.textContent = `🐷 무지출 ${zeroSpendCount}일 달성!`;
    }

    calendarGrid.querySelectorAll(".cal-cell:not(.empty)").forEach(cell => {
      cell.addEventListener("click", () => {
        const targetDate = cell.getAttribute("data-date");
        openDateDetailModal(targetDate);
      });
    });
  };

  // -----------------------------------------------------------
  // 3-3. 날짜별 지출 상세 팝업 모달 제어
  // -----------------------------------------------------------
  const openDateDetailModal = (targetDate) => {
    state.selectedDate = targetDate;
    const items = state.expenses.filter(exp => exp.date === targetDate);
    const dayTotal = items.reduce((acc, cur) => acc + cur.amount, 0);
    const dailyRec = state.budgetPlan ? (state.budgetPlan.daily_recommended || 0) : 0;

    dateModalTitle.textContent = `📅 ${targetDate} 지출 상세 내역`;
    dateModalTotal.textContent = formatWon(dayTotal);

    dateModalTraffic.className = "badge-status";
    if (dayTotal === 0) {
      dateModalTraffic.classList.add("status-safe");
      dateModalTraffic.textContent = "🐷 완벽한 무지출 데이!";
    } else if (dailyRec > 0 && dayTotal > dailyRec) {
      dateModalTraffic.classList.add("status-danger");
      dateModalTraffic.textContent = `⚠️ 권장 지출액(${formatWon(dailyRec)}) 초과`;
    } else {
      dateModalTraffic.classList.add("status-safe");
      dateModalTraffic.textContent = `✅ 권장 지출액(${formatWon(dailyRec)}) 이내`;
    }

    if (items.length === 0) {
      dateModalItems.innerHTML = `
        <li class="empty-modal-item">
          이 날짜에는 지출 내역이 없습니다. 알뜰한 하루를 보내셨네요! 👏
        </li>
      `;
    } else {
      dateModalItems.innerHTML = items.map(item => `
        <li class="date-item">
          <div class="date-item-info">
            <span class="date-item-memo">${escapeHtml(item.memo)}</span>
            <span class="date-item-cat">${item.category} • ${item.payment}</span>
          </div>
          <span class="date-item-amt">${formatWon(item.amount)}</span>
        </li>
      `).join("");
    }

    dateDetailModal.classList.remove("hidden");
  };

  const closeDateDetailModal = () => {
    dateDetailModal.classList.add("hidden");
  };

  if (btnCloseDateModal) btnCloseDateModal.addEventListener("click", closeDateDetailModal);
  if (btnConfirmDateModal) btnConfirmDateModal.addEventListener("click", closeDateDetailModal);

  if (btnSetDateToForm) {
    btnSetDateToForm.addEventListener("click", () => {
      if (state.selectedDate && dateInput) {
        dateInput.value = state.selectedDate;
        closeDateDetailModal();
        document.getElementById("exp-amount").focus();
        expenseForm.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  // -----------------------------------------------------------
  // 3-4. "커피 몇 잔 아꼈을까?" 지출 체감 변환기
  // -----------------------------------------------------------
  const renderFeelConverter = () => {
    if (!state.budgetPlan) return;

    const totalSpent = state.expenses.reduce((acc, cur) => acc + cur.amount, 0);
    const disposable = state.budgetPlan.disposable_budget || 0;
    const remaining = disposable - totalSpent;

    if (state.isMasked) {
      if (feelCoffeeCount) feelCoffeeCount.textContent = "••";
      if (feelChickenCount) feelChickenCount.textContent = "••";
      if (feelMovieCount) feelMovieCount.textContent = "••";
      if (feelCheerText) feelCheerText.textContent = "지하철/카페 모드로 체감 수치가 안전하게 숨겨졌습니다. 🔒";
      return;
    }

    const coffeeQty = Math.max(0, (remaining / 4500)).toFixed(1);
    const chickenQty = Math.max(0, (remaining / 20000)).toFixed(1);
    const movieQty = Math.max(0, (remaining / 15000)).toFixed(1);

    if (feelCoffeeCount) feelCoffeeCount.textContent = coffeeQty;
    if (feelChickenCount) feelChickenCount.textContent = chickenQty;
    if (feelMovieCount) feelMovieCount.textContent = movieQty;

    if (feelCheerText) {
      if (remaining > 0) {
        feelCheerText.innerHTML = `현재 알뜰하게 아낀 덕분에 <strong>치킨 ${chickenQty}마리</strong>, <strong>커피 ${coffeeQty}잔</strong>을 여유 있게 즐길 수 있어요! 👏`;
      } else {
        feelCheerText.innerHTML = `예산이 초과되었어요! 오늘 하루 <strong>무지출 챌린지 🐷</strong>에 도전해 절약 체력을 길러보세요! 💪`;
      }
    }
  };

  // -----------------------------------------------------------
  // 3-5. 간편 계산기 위젯 로직 (Quick Calculator)
  // -----------------------------------------------------------
  let calcExpression = "";
  let calcJustEvaluated = false;

  const toggleCalculator = () => {
    calculatorWidget.classList.toggle("hidden");
  };

  if (btnHeaderCalc) btnHeaderCalc.addEventListener("click", toggleCalculator);
  if (btnFloatingCalc) btnFloatingCalc.addEventListener("click", toggleCalculator);
  if (btnCloseCalc) btnCloseCalc.addEventListener("click", () => calculatorWidget.classList.add("hidden"));

  const updateCalcScreen = (val, hist = "") => {
    if (calcDisplay) calcDisplay.textContent = val || "0";
    if (calcHistory && hist !== undefined) calcHistory.textContent = hist;
  };

  document.querySelectorAll(".calc-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const num = btn.getAttribute("data-num");
      const action = btn.getAttribute("data-action");

      if (num !== null) {
        if (calcJustEvaluated) {
          calcExpression = "";
          calcJustEvaluated = false;
        }
        if (calcExpression === "0" && num !== ".") {
          calcExpression = num;
        } else {
          calcExpression += num;
        }
        updateCalcScreen(calcExpression);
      } else if (action) {
        if (action === "clear") {
          calcExpression = "";
          calcJustEvaluated = false;
          updateCalcScreen("0", "");
        } else if (action === "backspace") {
          calcExpression = calcExpression.slice(0, -1);
          updateCalcScreen(calcExpression || "0");
        } else if (action === "=") {
          if (!calcExpression) return;
          try {
            const sanitized = calcExpression.replace(/[^0-9+\-*/.%]/g, "");
            const result = Function(`'use strict'; return (${sanitized})`)();
            const rounded = Math.round(Number(result) * 100) / 100;
            updateCalcScreen(rounded.toLocaleString("ko-KR"), calcExpression + " =");
            calcExpression = String(rounded);
            calcJustEvaluated = true;
          } catch (err) {
            updateCalcScreen("Error", calcExpression);
            calcExpression = "";
          }
        } else {
          calcJustEvaluated = false;
          if (calcExpression === "" && action === "-") {
            calcExpression = "-";
          } else if (calcExpression !== "" && !["+", "-", "*", "/", "%"].includes(calcExpression.slice(-1))) {
            calcExpression += action;
          }
          updateCalcScreen(calcExpression);
        }
      }
    });
  });

  if (btnApplyCalcToExpense) {
    btnApplyCalcToExpense.addEventListener("click", () => {
      let currentVal = calcDisplay.textContent.replace(/[^0-9]/g, "");
      const amtInput = document.getElementById("exp-amount");
      if (amtInput && currentVal) {
        amtInput.value = Number(currentVal).toLocaleString("ko-KR");
        calculatorWidget.classList.add("hidden");
        amtInput.focus();
        expenseForm.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  // 로딩 모달 제어
  const showLoading = (title, desc) => {
    if (loadingTitle) loadingTitle.textContent = title;
    if (loadingDesc) loadingDesc.textContent = desc;
    loadingModal.classList.remove("hidden");
  };

  const hideLoading = () => {
    loadingModal.classList.add("hidden");
  };

  // 클립보드 복사 헬퍼
  const copyToClipboard = (text, successMsg = "클립보드에 복사되었습니다! 📋") => {
    if (!text) {
      alert("복사할 내용이 없습니다.");
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      alert(successMsg);
    }).catch(err => {
      alert("복사에 실패했습니다: " + err);
    });
  };

  // 텍스트/마크다운 파일 다운로드 헬퍼
  const downloadTextFile = (filename, text) => {
    if (!text) {
      alert("저장할 내용이 없습니다.");
      return;
    }
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  // -----------------------------------------------------------
  // 4. Step 1: AI 예산 플랜 수립 (POST /api/plan)
  // -----------------------------------------------------------
  budgetForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fixedIncome = parseWon(document.getElementById("fixed-income").value);
    const variableIncome = parseWon(document.getElementById("variable-income").value);
    const savingsGoal = parseWon(document.getElementById("savings-goal").value);
    const fixedExpenses = parseWon(document.getElementById("fixed-expenses").value);

    const totalIncome = fixedIncome + variableIncome;
    if (totalIncome <= 0) {
      alert("월 총수입은 0원보다 커야 합니다.");
      return;
    }

    if (savingsGoal + fixedExpenses > totalIncome) {
      if (!confirm("⚠️ 목표 저축액과 필수 고정지출의 합이 총수입보다 큽니다. 가용 예산이 적자가 될 수 있습니다. 그래도 계속 진행하시겠습니까?")) {
        return;
      }
    }

    const spendingStyle = document.querySelector('input[name="spending-style"]:checked')?.value || "밸런스형";

    const paymentMethods = [];
    document.querySelectorAll('#payment-methods-chips input[type="checkbox"]:checked').forEach(cb => {
      paymentMethods.push(cb.value);
    });

    const payload = {
      fixed_income: fixedIncome,
      variable_income: variableIncome,
      savings_goal: savingsGoal,
      fixed_expenses: fixedExpenses,
      spending_style: spendingStyle,
      payment_methods: paymentMethods,
      categories: ["식비", "교통", "쇼핑", "여가/문화", "기타"]
    };

    showLoading("AI 맞춤 예산 설계 중...", "Gemini 3.5 Flash Lite가 사용자의 소비 성향과 물가 정보를 분석하고 있습니다.");

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const res = await response.json();
      hideLoading();

      if (!res.success) {
        alert("예산 플랜 수립 실패: " + (res.message || "서버 응답 오류"));
        return;
      }

      state.budgetPlan = res.data;

      dashboardSummary.classList.remove("hidden");
      sumTotalIncome.textContent = formatWon(state.budgetPlan.total_income);
      sumDisposable.textContent = formatWon(state.budgetPlan.disposable_budget);
      sumDailyRecommended.textContent = formatWon(state.budgetPlan.daily_recommended);

      if (funMotivationSection) {
        funMotivationSection.classList.remove("hidden");
        renderZeroSpendCalendar();
        renderFeelConverter();
      }

      if (state.budgetPlan.ai_report) {
        aiPlanContent.innerHTML = window.marked ? marked.parse(state.budgetPlan.ai_report) : state.budgetPlan.ai_report;
        aiPlanSection.classList.remove("hidden");
        aiPlanSection.scrollIntoView({ behavior: "smooth" });
      }

      btnAnalyze.removeAttribute("disabled");
      updateCalculations();
      saveAllToLocalStorage(); // 변경 사항 자동 저장

    } catch (err) {
      hideLoading();
      alert("서버와 통신하는 중 오류가 발생했습니다: " + err.message);
    }
  });



  // -----------------------------------------------------------
  // 5. Step 2: 일일 지출 기록 추가 및 삭제
  // -----------------------------------------------------------
  expenseForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const date = document.getElementById("exp-date").value;
    const category = document.getElementById("exp-category").value;
    const amount = parseWon(document.getElementById("exp-amount").value);
    const payment = document.getElementById("exp-payment").value;
    const memo = document.getElementById("exp-memo").value.trim() || "-";

    if (!amount || amount <= 0) {
      alert("지출 금액을 올바르게 입력해 주세요.");
      return;
    }

    const newExpense = {
      id: Date.now().toString(),
      date,
      category,
      amount,
      payment,
      memo
    };

    state.expenses.unshift(newExpense);

    document.getElementById("exp-amount").value = "";
    document.getElementById("exp-memo").value = "";

    renderExpenseTable();
    updateCalculations();
    renderZeroSpendCalendar();
    renderFeelConverter();
    saveAllToLocalStorage(); // 지출 추가 시 자동 저장
  });

  // 지출 내역 테이블 렌더링
  const renderExpenseTable = () => {
    if (state.expenses.length === 0) {
      expenseListBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="5">기록된 지출 내역이 아직 없습니다. 🌱</td>
        </tr>
      `;
      return;
    }

    expenseListBody.innerHTML = state.expenses.map(exp => `
      <tr>
        <td>${exp.date}</td>
        <td><strong>${exp.category}</strong></td>
        <td>${escapeHtml(exp.memo)}</td>
        <td><strong>${formatWon(exp.amount)}</strong></td>
        <td>
          <button class="btn-delete-row" data-id="${exp.id}" title="삭제">🗑️</button>
        </td>
      </tr>
    `).join("");

    expenseListBody.querySelectorAll(".btn-delete-row").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        state.expenses = state.expenses.filter(item => item.id !== id);
        renderExpenseTable();
        updateCalculations();
        renderZeroSpendCalendar();
        renderFeelConverter();
        saveAllToLocalStorage(); // 삭제 시에도 자동 저장
      });
    });
  };

  // -----------------------------------------------------------
  // 6. 실시간 계산 및 게이지 바 업데이트 로직
  // -----------------------------------------------------------
  const updateCalculations = () => {
    const totalSpent = state.expenses.reduce((acc, cur) => acc + cur.amount, 0);
    sumTotalSpent.textContent = formatWon(totalSpent);

    if (!state.budgetPlan) {
      sumRemaining.textContent = formatWon(0);
      sumProjectedSavings.textContent = formatWon(0);
      return;
    }

    const disposable = state.budgetPlan.disposable_budget || 0;
    const remaining = disposable - totalSpent;
    sumRemaining.textContent = formatWon(remaining);

    const baseSavings = state.budgetPlan.savings_goal || 0;
    const projectedSavings = baseSavings + remaining;
    sumProjectedSavings.textContent = formatWon(projectedSavings);

    let burnRate = 0;
    if (disposable > 0) {
      burnRate = Math.min(200, Math.round((totalSpent / disposable) * 100));
    } else if (totalSpent > 0) {
      burnRate = 100;
    }

    burnRatePercent.textContent = `${burnRate}%`;
    mainProgressBar.style.width = `${Math.min(100, burnRate)}%`;

    mainProgressBar.className = "progress-bar-fill";
    burnRateBadge.className = "badge-status";

    if (burnRate < 50) {
      mainProgressBar.classList.add("fill-safe");
      burnRateBadge.classList.add("status-safe");
      burnRateBadge.textContent = `안전 (${burnRate}%)`;
      burnRateAlert.textContent = "아주 훌륭해요! 예산 범위 안에서 알뜰하게 소비하고 계십니다. 👏";
    } else if (burnRate < 80) {
      mainProgressBar.classList.add("fill-warning");
      burnRateBadge.classList.add("status-warning");
      burnRateBadge.textContent = `주의 (${burnRate}%)`;
      burnRateAlert.textContent = "주의가 필요합니다! 예산의 절반 이상을 소진하셨어요. ⚠️";
    } else {
      mainProgressBar.classList.add("fill-danger");
      burnRateBadge.classList.add("status-danger");
      burnRateBadge.textContent = `초과 위험 (${burnRate}%)`;
      burnRateAlert.textContent = "경고! 예산 소진 한계에 임박했거나 초과되었습니다. 긴축 재정이 필요합니다! 🚨";
    }

    renderCategoryBars(totalSpent);
  };

  const renderCategoryBars = () => {
    if (!state.budgetPlan || !state.budgetPlan.category_budgets) {
      categoryProgressList.innerHTML = `<p class="placeholder-text">예산 플랜을 먼저 수립해 주세요.</p>`;
      return;
    }

    const budgets = state.budgetPlan.category_budgets;
    const catSpent = {};

    state.expenses.forEach(exp => {
      catSpent[exp.category] = (catSpent[exp.category] || 0) + exp.amount;
    });

    const categories = Object.keys(budgets);
    if (categories.length === 0) {
      categoryProgressList.innerHTML = `<p class="placeholder-text">카테고리 정보가 없습니다.</p>`;
      return;
    }

    categoryProgressList.innerHTML = categories.map(cat => {
      const budget = budgets[cat] || 1;
      const spent = catSpent[cat] || 0;
      const rate = Math.min(100, Math.round((spent / budget) * 100));

      return `
        <div class="category-bar-item">
          <div class="cat-label-row">
            <span><strong>${cat}</strong> (${formatWon(spent)} / ${formatWon(budget)})</span>
            <span>${rate}%</span>
          </div>
          <div class="cat-bar-bg">
            <div class="cat-bar-fill" style="width: ${rate}%; background-color: ${rate >= 100 ? '#ef4444' : (rate >= 70 ? '#f59e0b' : '#38bdf8')};"></div>
          </div>
        </div>
      `;
    }).join("");
  };

  // -----------------------------------------------------------
  // 7. Step 3: AI 지출 피드백 & 월말 회고 요청 (POST /api/analyze)
  // -----------------------------------------------------------
  btnAnalyze.addEventListener("click", async () => {
    if (!state.budgetPlan) {
      alert("먼저 상단의 예산 플랜을 수립해 주세요.");
      return;
    }

    showLoading("지출 피드백 생성 중...", "Gemini AI 코치가 현재까지의 소비 패턴을 분석하고 현실적인 절약 조언을 작성하고 있습니다.");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget_plan: state.budgetPlan,
          expenses: state.expenses
        })
      });

      const res = await response.json();
      hideLoading();

      if (!res.success) {
        alert("지출 분석 실패: " + (res.message || "서버 오류"));
        return;
      }

      const feedback = res.data.ai_feedback || "분석 결과가 없습니다.";
      aiFeedbackContent.innerHTML = window.marked ? marked.parse(feedback) : feedback;
      aiFeedbackSection.classList.remove("hidden");
      aiFeedbackSection.scrollIntoView({ behavior: "smooth" });

    } catch (err) {
      hideLoading();
      alert("분석 요청 중 오류가 발생했습니다: " + err.message);
    }
  });

  // -----------------------------------------------------------
  // 8. 클립보드 복사 및 마크다운 파일 저장 이벤트
  // -----------------------------------------------------------
  if (btnCopyPlan) {
    btnCopyPlan.addEventListener("click", () => {
      if (state.budgetPlan && state.budgetPlan.ai_report) {
        copyToClipboard(state.budgetPlan.ai_report, "예산 플랜 리포트가 복사되었습니다! 📋");
      }
    });
  }

  if (btnDownloadPlan) {
    btnDownloadPlan.addEventListener("click", () => {
      if (state.budgetPlan && state.budgetPlan.ai_report) {
        downloadTextFile("AI_예산_플랜_리포트.md", state.budgetPlan.ai_report);
      }
    });
  }

  if (btnCopyFeedback) {
    btnCopyFeedback.addEventListener("click", () => {
      const text = aiFeedbackContent.innerText;
      copyToClipboard(text, "지출 피드백 리포트가 복사되었습니다! 📋");
    });
  }

  if (btnDownloadFeedback) {
    btnDownloadFeedback.addEventListener("click", () => {
      const text = aiFeedbackContent.innerText;
      downloadTextFile("AI_가계부_피드백_회고.md", text);
    });
  }

  function escapeHtml(string) {
    const entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(string).replace(/[&<>"']/g, s => entityMap[s]);
  }

  // -----------------------------------------------------------
  // 9. 페이지 로드 시 이전 저장 데이터 자동 복원 실행
  // -----------------------------------------------------------
  loadFromLocalStorage();
});
