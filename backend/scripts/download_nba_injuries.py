"""批量下载NBA伤病报告并解析为结构化CSV。

数据源: https://ak-static.cms.nba.com/referee/injury/Injury-Report_YYYY-MM-DD_HH_MMPM.pdf
方法: requests下载PDF + PyPDF2解析文本(绕过tabula-py/Java)
输出: backend/data/nba_injuries/nba_injuries_YYYY-MM_season.csv
"""
from __future__ import annotations
import requests
import PyPDF2
import re
import csv
import time
from datetime import datetime, timedelta
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "nba_injuries"
URL_STEM = "https://ak-static.cms.nba.com/referee/injury/Injury-Report_{}.pdf"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# 伤病状态关键词
STATUSES = ['Available', 'Questionable', 'Probable', 'Doubtful', 'Out']
# 球队名(用于分割)
TEAMS = [
    'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets',
    'Chicago Bulls', 'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets',
    'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
    'LA Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies', 'Miami Heat',
    'Milwaukee Bucks', 'Minnesota Timberwolves', 'New Orleans Pelicans',
    'New York Knicks', 'Oklahoma City Thunder', 'Orlando Magic',
    'Philadelphia 76ers', 'Phoenix Suns', 'Portland Trail Blazers',
    'Sacramento Kings', 'San Antonio Spurs', 'Toronto Raptors', 'Utah Jazz',
    'Washington Wizards',
]


def gen_url(dt: datetime) -> str:
    """生成NBA伤病报告URL(5:30 PM ET格式)。"""
    date_str = dt.strftime('%Y-%m-%d')
    # 2025-12-22后用新格式 05_30PM, 之前用旧格式 05PM
    if dt >= datetime(2025, 12, 22, 9, 0):
        time_str = '05_30PM'
    else:
        time_str = '05PM'
    return URL_STEM.format(f"{date_str}_{time_str}")


def download_pdf(dt: datetime) -> bytes | None:
    """下载指定日期的伤病报告PDF, 返回bytes或None。"""
    url = gen_url(dt)
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code == 200 and len(r.content) > 1000:
            return r.content
    except Exception:
        pass
    return None


def parse_pdf(pdf_bytes: bytes, report_date: str) -> list[dict]:
    """解析PDF文本, 提取伤病记录。"""
    records = []
    try:
        reader = PyPDF2.PdfReader(__import__('io').BytesIO(pdf_bytes))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text() + "\n"
    except Exception:
        return records

    # 合并文本(去掉多余空格/换行)
    text = re.sub(r'\s+', ' ', full_text)

    # 用状态关键词分割, 每段含一个球员记录
    # 模式: 球员名 状态 伤病原因
    # 球员名格式: LastName, FirstName 或 LastName, FirstName Jr.
    pattern = r'([A-Z][a-zA-Z\'-]+(?:\sJr\.?|\sSr\.?|\sIII|\sII|\sIV)?,\s[A-Z][a-zA-Z\'-]+(?:\s[A-Z][a-zA-Z\'-]+)?)\s+(Available|Questionable|Probable|Doubtful|Out)\s+(Injury/Illness\s*-\s*[^A-Z]+|Illness[^A-Z]+|Rest[^A-Z]+|Personal[^A-Z]+|Health[^A-Z]+|[A-Z][^A-Z]+)'

    for match in re.finditer(pattern, text):
        player = match.group(1).strip()
        status = match.group(2).strip()
        reason = match.group(3).strip().rstrip(';')
        records.append({
            'report_date': report_date,
            'player_name': player,
            'current_status': status,
            'reason': reason,
            'raw_snippet': match.group(0)[:100],
        })

    # 备用解析: 按球队分割
    if not records:
        records = _parse_by_team(text, report_date)

    return records


def _parse_by_team(text: str, report_date: str) -> list[dict]:
    """备用解析: 按球队名分割文本。"""
    records = []
    # 找所有球队位置
    team_positions = []
    for team in TEAMS:
        for m in re.finditer(re.escape(team), text):
            team_positions.append((m.start(), team))
    team_positions.sort()

    # 在球队之间找球员
    for i, (pos, team) in enumerate(team_positions):
        next_pos = team_positions[i + 1][0] if i + 1 < len(team_positions) else len(text)
        segment = text[pos + len(team):next_pos]

        # 找状态关键词
        for status in STATUSES:
            if status in segment:
                idx = segment.index(status)
                player_part = segment[:idx].strip()
                reason_part = segment[idx + len(status):].strip()

                # 球员名: 至少2个词
                if ',' in player_part or len(player_part.split()) >= 2:
                    records.append({
                        'report_date': report_date,
                        'player_name': player_part[:50],
                        'team': team,
                        'current_status': status,
                        'reason': reason_part[:80],
                        'raw_snippet': '',
                    })
                break

    return records


def _save_csv(records: list[dict], csv_path: Path):
    """保存CSV(增量保存用)。"""
    if not records:
        return
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=records[0].keys())
        writer.writeheader()
        writer.writerows(records)


def download_season(start_date: str, end_date: str, label: str = "season"):
    """批量下载指定日期范围的伤病报告(增量保存, 防中断丢数据)。"""
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    all_records = []
    downloaded = 0
    failed = 0
    csv_path = OUTPUT_DIR / f"nba_injuries_{label}.csv"

    current = start
    day_count = 0
    while current <= end:
        date_str = current.strftime('%Y-%m-%d')
        pdf = download_pdf(current)
        if pdf:
            records = parse_pdf(pdf, date_str)
            all_records.extend(records)
            downloaded += 1
            print(f"  {date_str}: ✅ {len(records)}条记录")
        else:
            failed += 1

        current += timedelta(days=1)
        day_count += 1
        time.sleep(0.3)

        # 增量保存: 每10天保存一次(防中断丢数据)
        if day_count % 10 == 0 and all_records:
            _save_csv(all_records, csv_path)

    # 最终保存
    if all_records:
        _save_csv(all_records, csv_path)

    print(f"\n=== 汇总 ===")
    print(f"成功下载: {downloaded} 天")
    print(f"无报告: {failed} 天")
    print(f"总伤病记录: {len(all_records)} 条")
    print(f"CSV保存: {csv_path}")
    return all_records


if __name__ == '__main__':
    import sys
    if len(sys.argv) >= 3:
        start_date = sys.argv[1]
        end_date = sys.argv[2]
        label = sys.argv[3] if len(sys.argv) >= 4 else "custom"
    else:
        # 默认: 2025-26赛季常规赛(2025-10-15 到 2026-04-15)
        start_date = "2026-03-01"
        end_date = "2026-03-14"
        label = "2025-26_mar_sample"

    print(f"下载NBA伤病报告: {start_date} ~ {end_date}")
    download_season(start_date, end_date, label)
