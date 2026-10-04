import os
import json
import logging
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import requests

# 1. 환경 변수(.env) 로드
load_dotenv()

# 로그 설정 (서버 동작 과정을 콘솔에 깔끔하게 기록)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# 프로젝트 기본 디렉토리 경로 (Vercel 서버리스 배포 시 템플릿/정적 파일 경로 문제 방지)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Flask 애플리케이션 초기화
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
    static_url_path="/static"
)

# API 키 불러오기
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "").strip()
DEFAULT_MODEL = "gemini-3.5-flash-lite"

# Gemini Client 초기화 (google-genai 최신 SDK 사용)
gemini_client = None
if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here":
    try:
        from google import genai
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        logger.info("Google GenAI 클라이언트가 성공적으로 초기화되었습니다.")
    except Exception as e:
        logger.error(f"GenAI 클라이언트 초기화 실패: {str(e)}")
else:
    logger.warning("GEMINI_API_KEY가 설정되지 않았거나 예시 키 상태입니다.")


# -------------------------------------------------------------
# 헬퍼 함수 1: Serper.dev 웹 검색 연동 모듈
# -------------------------------------------------------------
def search_serper(query: str) -> str:
    """
    최신 금융 혜택, 물가 정보, 절약 팁을 Serper.dev 구글 검색 엔진을 통해 검색합니다.
    """
    if not SERPER_API_KEY or SERPER_API_KEY == "your_serper_api_key_here":
        logger.info("SERPER_API_KEY가 없어 웹 검색을 생략하고 AI 기본 지식으로 답변합니다.")
        return ""

    url = "https://google.serper.dev/search"
    headers = {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "q": query,
        "gl": "kr",
        "hl": "ko",
        "num": 3
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=5)
        if response.status_code == 200:
            data = response.json()
            snippets = []
            for item in data.get("organic", [])[:3]:
                title = item.get("title", "")
                snippet = item.get("snippet", "")
                snippets.append(f"- {title}: {snippet}")
            logger.info(f"Serper 검색 성공 ('{query}')")
            return "\n".join(snippets)
        else:
            logger.warning(f"Serper 검색 실패 (상태 코드: {response.status_code})")
            return ""
    except Exception as e:
        logger.warning(f"Serper API 요청 중 오류 발생: {str(e)}")
        return ""


# -------------------------------------------------------------
# 헬퍼 함수 2: Gemini 인공지능 호출 함수 (3.5 Flash Lite 기본)
# -------------------------------------------------------------
def call_gemini(prompt: str) -> str:
    """
    Gemini 3.5 Flash Lite 모델을 호출하고 응답 텍스트를 반환합니다.
    혹시 최신 프리뷰 모델 식별자 변경 시 자동으로 호환 모델로 안전하게 연동됩니다.
    """
    if not gemini_client:
        return "⚠️ Gemini API 키가 설정되지 않았습니다. .env 파일에 올바른 GEMINI_API_KEY를 입력해 주세요."

    # 지정된 gemini-3.5-flash-lite 모델 호출
    candidate_models = [DEFAULT_MODEL, "gemini-2.5-flash", "gemini-1.5-flash"]
    
    for model_name in candidate_models:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt
            )
            if response and response.text:
                return response.text
        except Exception as e:
            logger.warning(f"모델 '{model_name}' 호출 안내: {str(e)}. 다음 후보 모델을 시도합니다.")
            continue

    return "AI 분석을 생성하는 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."


# -------------------------------------------------------------
# 라우트 1: 메인 화면 (GET /)
# -------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# -------------------------------------------------------------
# 라우트 2: 맞춤형 예산 플랜 생성 API (POST /api/plan)
# -------------------------------------------------------------
@app.route("/api/plan", methods=["POST"])
def create_budget_plan():
    try:
        data = request.get_json() or {}

        # 1. 입력값 검증 (Validation)
        fixed_income = float(data.get("fixed_income", 0))
        variable_income = float(data.get("variable_income", 0))
        savings_goal = float(data.get("savings_goal", 0))
        fixed_expenses = float(data.get("fixed_expenses", 0))
        spending_style = data.get("spending_style", "밸런스형")  # 짠테크형, 밸런스형, 라이프스타일형
        payment_methods = data.get("payment_methods", [])       # 신용카드, 체크카드, 지역화폐 등
        categories = data.get("categories", ["식비", "교통", "쇼핑", "여가/문화", "기타"])

        total_income = fixed_income + variable_income
        if total_income <= 0:
            return jsonify({"success": False, "message": "월 총수입은 0원보다 커야 합니다."}), 400

        # 기본 계산 로직
        # 가처분 변동 예산 = 총수입 - 고정지출 - 목표저축액
        disposable_budget = total_income - fixed_expenses - savings_goal
        days_in_month = 30
        daily_recommended = max(0, round(disposable_budget / days_in_month))

        # 성향별 카테고리 예산 배분 기본 가이드 계산
        category_budgets = {}
        if disposable_budget > 0 and categories:
            ratio_presets = {
                "짠테크형": {"식비": 0.45, "교통": 0.25, "쇼핑": 0.10, "여가/문화": 0.10, "기타": 0.10},
                "밸런스형": {"식비": 0.35, "교통": 0.20, "쇼핑": 0.20, "여가/문화": 0.15, "기타": 0.10},
                "라이프스타일형": {"식비": 0.30, "교통": 0.15, "쇼핑": 0.25, "여가/문화": 0.20, "기타": 0.10}
            }
            preset = ratio_presets.get(spending_style, ratio_presets["밸런스형"])
            default_share = 1.0 / len(categories)

            for cat in categories:
                share = preset.get(cat, default_share)
                category_budgets[cat] = round(disposable_budget * share)

        # 2. 웹 검색 활용 (필요 시 최신 혜택/절약 팁 수집)
        search_context = ""
        if payment_methods:
            search_query = f"{spending_style} {payment_methods[0]} 절약 혜택 생활비 팁"
            search_context = search_serper(search_query)

        # 3. Gemini 3.5 Flash Lite 프롬프트 작성
        prompt = f"""
당신은 최고의 공감 능력과 전문성을 갖춘 친절한 'AI 스마트 자산 플래너'입니다.
사용자의 재정 정보와 소비 성향을 바탕으로 따뜻하고 명쾌한 맞춤형 예산 가이드 리포트를 작성해 주세요.

[사용자 기본 재정 정보]
- 월 총수입: {total_income:,.0f}원 (고정: {fixed_income:,.0f}원, 변동: {variable_income:,.0f}원)
- 필수 고정지출: {fixed_expenses:,.0f}원
- 목표 저축액: {savings_goal:,.0f}원 (저축률: {(savings_goal/total_income*100):.1f}%)
- 한 달 순수 가용 변동예산: {disposable_budget:,.0f}원
- 하루 권장 지출액: {daily_recommended:,.0f}원 (30일 기준)
- 소비 성향: {spending_style}
- 주요 결제 수단: {', '.join(payment_methods) if payment_methods else '미지정'}
- 중점 관리 카테고리: {', '.join(categories)}

[참고할 최신 팁 정보]
{search_context if search_context else "자체 금융 인사이트 활용"}

[작성 가이드라인]
1. 친근하고 용기를 북돋워주는 말투(해요체, 이모지 적극 활용 💡, 💰, 📊).
2. '1. 이번 달 핵심 재정 총평', '2. 하루 지출 가이드 및 짠테크 전략', '3. 결제수단 및 카테고리별 실천 팁', '4. 응원의 한마디' 순으로 명확한 마크다운 헤더로 작성하세요.
3. 숫자는 이해하기 쉽게 콤마(,)를 붙여 표현하세요.
"""

        ai_report = call_gemini(prompt)

        return jsonify({
            "success": True,
            "data": {
                "total_income": total_income,
                "fixed_expenses": fixed_expenses,
                "savings_goal": savings_goal,
                "disposable_budget": disposable_budget,
                "daily_recommended": daily_recommended,
                "category_budgets": category_budgets,
                "ai_report": ai_report
            }
        })

    except Exception as e:
        logger.error(f"예산 플랜 생성 중 오류 발생: {str(e)}")
        return jsonify({"success": False, "message": f"서버 오류: {str(e)}"}), 500


# -------------------------------------------------------------
# 라우트 3: 지출 피드백 및 월말 회고 분석 API (POST /api/analyze)
# -------------------------------------------------------------
@app.route("/api/analyze", methods=["POST"])
def analyze_expenses():
    try:
        data = request.get_json() or {}

        budget_plan = data.get("budget_plan", {})
        expenses = data.get("expenses", [])

        # 1. 지출 집계 및 통계 계산
        total_spent = sum(float(exp.get("amount", 0)) for exp in expenses)
        disposable_budget = float(budget_plan.get("disposable_budget", 0))
        remaining_budget = disposable_budget - total_spent
        
        # 카테고리별 누적 지출액 집계
        category_spending = {}
        for exp in expenses:
            cat = exp.get("category", "기타")
            category_spending[cat] = category_spending.get(cat, 0) + float(exp.get("amount", 0))

        # 소진율 계산
        burn_rate = (total_spent / disposable_budget * 100) if disposable_budget > 0 else 100.0

        # 2. Gemini 피드백 생성
        prompt = f"""
당신은 날카롭고도 다정한 'AI 가계부 코치'입니다.
사용자의 현재까지의 지출 내역과 예산 소진 상황을 분석하고, 현실적인 피드백과 월말 예상 저축액 리포트를 작성해 주세요.

[현재 재정 및 지출 현황]
- 가용 변동예산: {disposable_budget:,.0f}원
- 현재까지 총 지출액: {total_spent:,.0f}원
- 잔여 예산: {remaining_budget:,.0f}원
- 전체 예산 소진율: {burn_rate:.1f}%
- 카테고리별 지출: {json.dumps(category_spending, ensure_ascii=False)}
- 총 기록된 지출 건수: {len(expenses)}건

[요청 사항]
1. **소진율 상태 평가**: 안전(50% 미만), 주의(50%~80%), 초과위험(80% 이상) 중 현재 상태를 진단하고 한 줄 요약.
2. **소비 낭비 분석 및 카테고리 피드백**: 가장 지출이 많은 항목에 대한 구체적인 절약 조언.
3. **무지출 챌린지 칭찬 & 격려**: 일상 속 작은 절약 성공을 응원.
4. **월말 예상 저축 시뮬레이션**: 이 추세대로라면 월말에 남길 수 있는 예상 잉여금(또는 적자 경고) 안내.
5. 읽기 편하게 깔끔한 소제목과 불릿 포인트, 귀여운 이모지를 포함하여 마크다운 서식으로 작성하세요.
"""

        ai_feedback = call_gemini(prompt)

        return jsonify({
            "success": True,
            "data": {
                "total_spent": total_spent,
                "remaining_budget": remaining_budget,
                "burn_rate": round(burn_rate, 1),
                "category_spending": category_spending,
                "ai_feedback": ai_feedback
            }
        })

    except Exception as e:
        logger.error(f"지출 분석 중 오류 발생: {str(e)}")
        return jsonify({"success": False, "message": f"서버 오류: {str(e)}"}), 500


# -------------------------------------------------------------
# 서버 실행 부
# -------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info(f"AI 가계부 서버 시작: http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)