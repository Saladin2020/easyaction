"""Headless Chrome check of a PixiJS export: no console errors, the platformer runs / jumps, a skirmish starts and ticks.

  PIXI_JS=… npx tsx src/cli.ts export three_towns --preset pixi --out /tmp/ea-pixi
  python3 scripts/check-pixi.py /tmp/ea-pixi [screenshot-prefix]

Prints a JSON report; exit 1 on any failure.
"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

DIR = sys.argv[1]
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
PORT = 8987
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME_PATH", "/usr/bin/google-chrome"), args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1000, "height": 640})
        errs = []
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("response", lambda r: errs.append(f"http {r.status}: {r.url}") if r.status >= 400 and not r.url.endswith("/pixi.min.js") else None)
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        await pg.wait_for_function("window.__ready === true", timeout=40000)
        pos = "() => ({ x: window.__ea.pl.body.x, y: window.__ea.pl.body.y, anim: window.__ea.pl.anim })"
        start = await pg.evaluate(pos)
        await pg.keyboard.down("ArrowRight")
        await pg.wait_for_timeout(300)
        await pg.keyboard.down("Space")
        await pg.wait_for_timeout(150)
        air = await pg.evaluate(pos)
        await pg.keyboard.up("Space")
        await pg.wait_for_timeout(900)
        await pg.keyboard.up("ArrowRight")
        await pg.wait_for_timeout(300)
        end = await pg.evaluate(pos)
        if SHOT:
            await pg.locator("canvas").screenshot(path=f"{SHOT}-platformer.png")
        await pg.keyboard.press("Enter")
        await pg.wait_for_function("window.__ea.fight !== null", timeout=10000)
        for _ in range(12):
            await pg.keyboard.down("j")
            await pg.wait_for_timeout(120)
            await pg.keyboard.up("j")
            await pg.wait_for_timeout(120)
        fight = await pg.evaluate("(() => { const s = window.__ea.fight?.sk; return s ? { tick: s.tick, hits: s.hits.length, result: s.result } : { ended: true }; })()")
        if SHOT:
            await pg.locator("canvas").screenshot(path=f"{SHOT}-skirmish.png")
        problems = list(errs)
        if not end["x"] > start["x"] + 20:
            problems.append(f"did not run right: {start} → {end}")
        if not air["y"] < start["y"] - 4:
            problems.append(f"did not jump: {air}")
        if not (fight.get("ended") or fight["tick"] > 60):
            problems.append(f"skirmish not ticking: {fight}")
        print(json.dumps({"start": start, "air": air, "end": end, "fight": fight, "problems": problems}, indent=1))
        await b.close()
        return 1 if problems else 0


try:
    code = asyncio.run(main())
finally:
    srv.terminate()
sys.exit(code)
