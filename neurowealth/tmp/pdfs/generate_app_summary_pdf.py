from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 36
HEADER_HEIGHT = 82
FOOTER_HEIGHT = 24
COLUMN_GAP = 20
COLUMN_WIDTH = (PAGE_WIDTH - (2 * MARGIN) - COLUMN_GAP) / 2
LEFT_X = MARGIN
RIGHT_X = MARGIN + COLUMN_WIDTH + COLUMN_GAP
BODY_TOP = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT
BODY_BOTTOM = MARGIN + FOOTER_HEIGHT

TITLE_COLOR = HexColor("#0F1C2E")
ACCENT = HexColor("#B78A2B")
TEXT = HexColor("#1B2430")
MUTED = HexColor("#5E6B78")
LINE = HexColor("#D8DEE5")
PANEL = HexColor("#F7F8FA")


LEFT_SECTIONS = [
    (
        "What It Is",
        [
            "A finance-focused web app and content hub that combines portfolio connectivity, market and trading tools, educational modules, and AI-assisted workflows. The UI is branded ProsperPath, while package and backend files use NeuroWealth naming.",
        ],
    ),
    (
        "Who It's For",
        [
            "Primary user inferred from UI copy and feature set: a self-directed investor or trader who wants clearer market education, portfolio visibility, and strategy tooling across brokerage and crypto accounts.",
        ],
    ),
    (
        "What It Does",
        [
            "Public landing site, app hub, and a guided demo with no signup callout.",
            'Clarity Box for structured market "sense-making" and AI-assisted Q&A.',
            "Portfolio hub with Plaid brokerage linking, wallet connections, holdings and transaction analysis, and risk visibility.",
            "Trading workspace with AI backtesting, strategy builder, analytics, A/B compare, and paper watchlist flows.",
            "Market pages for crypto, stocks, forex, commodities, watchlists, liquidity, and news.",
            "Content library for market mechanics, wealth guides, resources, tool reviews, calculators, blog posts, and lesson modules.",
            "Google-authenticated sync for watchlists and chat sessions through the Worker KV store.",
        ],
    ),
]

RIGHT_SECTIONS = [
    (
        "How It Works",
        [
            "Static frontend: HTML pages plus shared CSS and JS (`index.html`, `app.html`, `portfolio.html`, `backtest.html`, `script.js`, `ai-widget.js`).",
            "Local Node server: `server.js` serves the site, handles `/api` routes, runs Plaid token and holdings flows, persists a Plaid session to `plaid_session.json`, and exposes wallet token endpoints with in-memory caching.",
            "Cloudflare Worker: `worker/src/index.js` handles Google token auth, per-user data in `USER_DATA` KV, per-user Plaid session storage, a safe content proxy, AI chat proxying, and wallet token handlers.",
            "Service flow: browser pages call the server, Worker, and public APIs; backend code integrates with Plaid, Alchemy, CoinGecko, Google tokeninfo, Tavily, and AI providers.",
            "Client state: watchlists, chat history, theme, and paper-trading data are also stored in local or session storage.",
        ],
    ),
    (
        "How To Run",
        [
            "cd `neurowealth`",
            "Run `npm install`.",
            "Create the `.env` values referenced by `server.js`: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `SERVER_API_TOKEN`, optional `ALCHEMY_API_KEY`, and `PORT`. Example env file: Not found in repo.",
            "Start the app with `npm start`, then open `http://localhost:3000/`.",
            "A Cloudflare Worker config exists in `worker/`, but full local Worker setup or override steps are Not found in repo.",
        ],
    ),
]


def wrap_text(text, font_name, font_size, max_width):
    text = text.replace("`", "")
    paragraphs = text.split("\n")
    lines = []
    for paragraph in paragraphs:
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            if stringWidth(trial, font_name, font_size) <= max_width:
                current = trial
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def draw_paragraph(c, text, x, y, width, font_name="Helvetica", font_size=8.7, leading=11.0, color=TEXT):
    c.setFillColor(color)
    c.setFont(font_name, font_size)
    lines = wrap_text(text, font_name, font_size, width)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_bullets(c, items, x, y, width, font_size=8.55, leading=10.4):
    bullet_indent = 9
    text_width = width - bullet_indent - 4
    for item in items:
        lines = wrap_text(item, "Helvetica", font_size, text_width)
        c.setFillColor(ACCENT)
        c.setFont("Helvetica-Bold", font_size)
        c.drawString(x, y, "-")
        c.setFillColor(TEXT)
        c.setFont("Helvetica", font_size)
        line_y = y
        for line in lines:
            c.drawString(x + bullet_indent, line_y, line)
            line_y -= leading
        y = line_y - 3.5
    return y


def draw_section(c, title, items, x, y, width, paragraph=False):
    c.setFillColor(ACCENT)
    c.setFont("Helvetica-Bold", 10.4)
    c.drawString(x, y, title.upper())
    y -= 8
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.line(x, y, x + width, y)
    y -= 11
    if paragraph:
        y = draw_paragraph(c, items[0], x, y, width)
    else:
        y = draw_bullets(c, items, x, y, width)
    return y - 8


def build_pdf(output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output_path), pagesize=letter)
    c.setTitle("prosperpath-neurowealth-app-summary")

    c.setFillColor(PANEL)
    c.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)

    c.setFillColor(TITLE_COLOR)
    c.rect(MARGIN, PAGE_HEIGHT - MARGIN - HEADER_HEIGHT, PAGE_WIDTH - 2 * MARGIN, HEADER_HEIGHT, stroke=0, fill=1)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(MARGIN + 16, PAGE_HEIGHT - MARGIN - 28, "ProsperPath / NeuroWealth")
    c.setFont("Helvetica", 9.4)
    c.drawString(
        MARGIN + 16,
        PAGE_HEIGHT - MARGIN - 46,
        "One-page app summary based only on repo evidence",
    )
    c.setFillColor(ACCENT)
    c.rect(PAGE_WIDTH - MARGIN - 118, PAGE_HEIGHT - MARGIN - 44, 102, 20, stroke=0, fill=1)
    c.setFillColor(TITLE_COLOR)
    c.setFont("Helvetica-Bold", 8.6)
    c.drawCentredString(PAGE_WIDTH - MARGIN - 67, PAGE_HEIGHT - MARGIN - 31, "REPO SUMMARY")

    column_height = BODY_TOP - BODY_BOTTOM
    c.setFillColor(white)
    c.roundRect(LEFT_X, BODY_BOTTOM, COLUMN_WIDTH, column_height, 8, stroke=0, fill=1)
    c.roundRect(RIGHT_X, BODY_BOTTOM, COLUMN_WIDTH, column_height, 8, stroke=0, fill=1)
    c.setStrokeColor(LINE)
    c.roundRect(LEFT_X, BODY_BOTTOM, COLUMN_WIDTH, column_height, 8, stroke=1, fill=0)
    c.roundRect(RIGHT_X, BODY_BOTTOM, COLUMN_WIDTH, column_height, 8, stroke=1, fill=0)

    y_left = BODY_TOP - 16
    for index, (title, items) in enumerate(LEFT_SECTIONS):
        y_left = draw_section(c, title, items, LEFT_X + 14, y_left, COLUMN_WIDTH - 28, paragraph=index < 2)

    y_right = BODY_TOP - 16
    for title, items in RIGHT_SECTIONS:
        y_right = draw_section(c, title, items, RIGHT_X + 14, y_right, COLUMN_WIDTH - 28)

    if min(y_left, y_right) < BODY_BOTTOM + 10:
        raise RuntimeError("Content overflowed the one-page layout.")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.8)
    c.drawString(MARGIN, MARGIN + 8, "Sources inspected: repo files only. Missing setup details are marked as Not found in repo.")

    c.showPage()
    c.save()


if __name__ == "__main__":
    out = Path("output/pdf/prosperpath-neurowealth-app-summary.pdf")
    build_pdf(out)
    print(out.resolve())
