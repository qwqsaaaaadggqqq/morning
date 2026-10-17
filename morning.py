"""Утренний дашборд: скачивает расписание группы и открывает index.html.

Запуск: двойной клик по файлу или `python morning.py`.
`python morning.py --no-open` только обновит расписание.
"""
import json
import sys
import urllib.request
import webbrowser
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Москва всегда UTC+3; так время верное и на серверах GitHub, где часы в UTC.
MSK = timezone(timedelta(hours=3))
GROUP = "24290907/3093"
SITE = "https://polytech-shedule.ru/data/"
HERE = Path(__file__).resolve().parent
OUT = HERE / "schedule.js"


def current_week(today: date) -> int:
    # Та же логика, что на сайте: файл N покрывает две недели с 1 сентября.
    start = date(today.year if today.month >= 9 else today.year - 1, 9, 1)
    days = (today - start).days
    return max(1, min(20, days // 14 + 1))


def fetch(week: int):
    url = f"{SITE}{week}.xml?t={int(datetime.now().timestamp())}"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return ET.fromstring(r.read())
    except Exception as e:
        print(f"Неделя {week}: не удалось скачать ({e})")
        return None


def text(el, tag):
    v = el.findtext(tag)
    return v.strip() if v else ""


def lessons_from(root):
    for my in root.iter("My"):
        if text(my, "SPGRUP.NAIM") != GROUP:
            continue
        zam = int(text(my, "ZAM") or 0)
        if zam == 2:  # исходная пара, которую заменили, сайт её тоже скрывает
            continue
        yield {
            "date": text(my, "DAT")[:10],
            "n": int(text(my, "UR") or 0),
            "sub": int(text(my, "IDGG") or 0),
            "subject": text(my, "SPPRED.NAIM"),
            "teacher": text(my, "FAMIO"),
            "aud": text(my, "AUD"),
            "campus": text(my, "CAMPUS"),
            "note": text(my, "NOTE"),
            "zam": zam,
        }


def update() -> bool:
    week = current_week(datetime.now(MSK).date())
    by_date = {}
    ok = False
    for w in (week - 1, week, week + 1):
        if w < 1:
            continue
        root = fetch(w)
        if root is None:
            continue
        ok = True
        fresh = {}
        for l in lessons_from(root):
            fresh.setdefault(l["date"], []).append(l)
        # Более свежий файл целиком заменяет день: так не остаются отменённые пары.
        by_date.update(fresh)
    if not ok:
        return False
    lessons = [l for day in by_date.values() for l in day]
    data = {
        "group": GROUP,
        "updated": datetime.now(MSK).isoformat(timespec="minutes"),
        "lessons": sorted(lessons, key=lambda l: (l["date"], l["n"], l["sub"])),
    }
    OUT.write_text("window.SCHEDULE = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"Расписание обновлено: {len(data['lessons'])} пар")
    return True


if __name__ == "__main__":
    if not update():
        print("Сайт недоступен, страница покажет последнее сохранённое расписание")
        if "--no-open" in sys.argv:
            sys.exit(1)  # чтобы GitHub Actions пометил запуск как упавший
    if "--no-open" not in sys.argv:
        webbrowser.open((HERE / "index.html").as_uri())
