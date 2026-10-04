import os
import sys

# 프로젝트 루트 경로를 sys.path에 추가하여 app 모듈을 정상적으로 import할 수 있도록 설정
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app import app

# Vercel Serverless Function entry point
app = app
