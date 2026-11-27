# Easy Action core — GDScript port of src/shared/physics.ts + combat.ts (parity-tested against the TS engine). MIT.
# Platformer physics (60 ticks / s, feet position, y down) and the real-time Skirmish reusing Easy Battle stats.
class_name EasyActionCore
extends RefCounted

const DEFAULT_PHYSICS := {"gravity": 0.35, "jump": 6.2, "jumpCut": 0.45, "maxFall": 7.0, "run": 1.6, "accel": 0.25, "friction": 0.3, "airControl": 0.6, "climb": 1.2, "coyote": 6.0, "buffer": 6.0, "bodyW": 14.0, "bodyH": 30.0}

# ---------------------------------------------------------------- physics
static func new_body(P: Dictionary, x: float, y: float, speed: float = 1.0) -> Dictionary:
	return {"x": float(x), "y": float(y), "vx": 0.0, "vy": 0.0, "w": float(P.bodyW), "h": float(P.bodyH), "onGround": false, "climbing": false, "jumping": false, "coyote": 0.0, "buffer": 0.0, "facing": 1, "speed": float(speed)}


static func _overlaps(b: Dictionary, r: Dictionary) -> bool:
	return b.x + b.w / 2.0 > r.x and b.x - b.w / 2.0 < r.x + r.w and b.y > r.y and b.y - b.h < r.y + r.h


static func on_ladder(b: Dictionary, lvl: Dictionary):
	for l in lvl.get("ladders", []):
		if b.x > l.x and b.x < l.x + l.w and b.y > l.y and b.y - b.h / 2.0 < l.y + l.h:
			return l
	return null


static func _approach(v: float, target: float, step: float) -> float:
	return minf(target, v + step) if v < target else maxf(target, v - step)


static func _standing_on_platform(b: Dictionary, lvl: Dictionary) -> bool:
	for p in lvl.get("platforms", []):
		if b.y == p.y and b.x > p.x and b.x < p.x + p.w:
			return b.y < lvl.groundY
	return false


static func step_body(b: Dictionary, inp: Dictionary, lvl: Dictionary, P: Dictionary) -> Dictionary:
	var dir := (1 if inp.get("right", false) else 0) - (1 if inp.get("left", false) else 0)
	if dir != 0:
		b.facing = 1 if dir > 0 else -1
	var ladder = on_ladder(b, lvl)
	if ladder == null:
		b.climbing = false
	elif not b.climbing and (inp.get("up", false) or (inp.get("down", false) and not b.onGround)):
		b.climbing = true
	b.buffer = float(P.buffer) if inp.get("jumpPressed", false) else maxf(0.0, b.buffer - 1.0)
	b.coyote = float(P.coyote) if b.onGround else maxf(0.0, b.coyote - 1.0)
	var drop: bool = inp.get("down", false) and inp.get("jumpPressed", false) and b.onGround and _standing_on_platform(b, lvl)
	if drop:
		b.buffer = 0.0
		b.coyote = 0.0
	if b.climbing:
		b.vx = dir * P.climb * 0.5
		b.vy = ((1 if inp.get("down", false) else 0) - (1 if inp.get("up", false) else 0)) * P.climb
		if b.buffer > 0:
			b.climbing = false
			b.vy = -P.jump * 0.8
			b.buffer = 0.0
			b.jumping = true
	else:
		var top: float = P.run * b.speed
		var a: float = P.accel if b.onGround else P.accel * P.airControl
		var f: float = P.friction if b.onGround else P.friction * P.airControl
		b.vx = _approach(b.vx, dir * top, a) if dir != 0 else _approach(b.vx, 0.0, f)
		if b.buffer > 0 and b.coyote > 0 and not drop:
			b.vy = -P.jump
			b.buffer = 0.0
			b.coyote = 0.0
			b.jumping = true
		if b.jumping and not inp.get("jump", false) and b.vy < 0:
			b.vy = b.vy * P.jumpCut
			b.jumping = false
		b.vy = minf(b.vy + P.gravity, P.maxFall)
	if b.vy >= 0:
		b.jumping = false
	b.x += b.vx
	for s in lvl.get("solids", []):
		if _overlaps(b, s):
			b.x = s.x - b.w / 2.0 if b.vx > 0 else s.x + s.w + b.w / 2.0
			b.vx = 0.0
	b.x = maxf(b.w / 2.0, minf(lvl.width - b.w / 2.0, b.x))
	var prev: float = b.y
	b.y += b.vy
	b.onGround = false
	for s in lvl.get("solids", []):
		if _overlaps(b, s):
			if b.vy > 0:
				b.y = float(s.y)
				b.onGround = true
			else:
				b.y = s.y + s.h + b.h
			b.vy = 0.0
	if b.vy >= 0 and not drop and not (b.climbing and inp.get("down", false)):
		for p in lvl.get("platforms", []):
			if prev <= p.y and b.y >= p.y and b.x > p.x and b.x < p.x + p.w:
				b.y = float(p.y)
				b.vy = 0.0
				b.onGround = true
	if b.y >= lvl.groundY:
		b.y = float(lvl.groundY)
		b.vy = 0.0
		b.onGround = true
	if b.y - b.h < 0:
		b.y = b.h
		if b.vy < 0:
			b.vy = 0.0
	if b.onGround and b.climbing and not inp.get("up", false):
		b.climbing = false
	return b


static func body_anim(b: Dictionary) -> String:
	if b.climbing:
		return "climb"
	if not b.onGround:
		return "jump" if b.vy < 0 else "fall"
	return "run" if absf(b.vx) > 0.2 else "idle"


static func simulate_path(lvl: Dictionary, P: Dictionary, script: Array, start: Array) -> Array:
	var b := new_body(P, start[0], start[1])
	var out := []
	for inp in script:
		step_body(b, inp, lvl, P)
		out.append([b.x, b.y, body_anim(b)])
	return out


static func arena(width: float = 480.0, ground_y: float = 200.0) -> Dictionary:
	return {"id": "arena", "name": {"th": "ลานต่อสู้", "en": "Arena", "ms": "Gelanggang"}, "width": width, "height": ground_y + 40.0, "groundY": ground_y, "solids": [], "platforms": [], "ladders": [], "spawn": [40.0, ground_y]}


# ---------------------------------------------------------------- Easy Battle stats (same formulas)
static func hero_stats(h: Dictionary, level: int, tree: Array = []) -> Dictionary:
	var out := {}
	for k in h.base:
		out[k] = floorf(h.base[k] + h.growth.get(k, 0.0) * (level - 1))
	for n in h.get("tree", []):
		if tree.has(n.id) and n.has("stats"):
			for k in n.stats:
				out[k] = out.get(k, 0.0) + n.stats[k]
	return out


static func enemy_stats(db: Dictionary, e: Dictionary, level: int) -> Dictionary:
	var out := {}
	var pct: float = 100.0 + db.rules.enemyScale * (level - e.level)
	for k in e.stats:
		out[k] = maxf(1.0 if k == "hp" else 0.0, floorf((e.stats[k] * pct) / 100.0))
	return out


static func fighters_from_battle(db: Dictionary, party: Array, enemies: Array, width: float) -> Array:
	var out := []
	for i in party.size():
		var p: Dictionary = party[i]
		var h: Dictionary = {}
		for x in db.heroes:
			if x.id == p.id:
				h = x
		out.append({"id": p.id, "side": "hero", "stats": hero_stats(h, int(p.level), p.get("tree", [])), "x": 60.0 - i * 24.0, "name": h.get("name", {}), "player": i == 0})
	for i in enemies.size():
		var e: Dictionary = enemies[i]
		var d: Dictionary = {}
		for x in db.enemies:
			if x.id == e.id:
				d = x
		out.append({"id": "%s#%d" % [e.id, i], "side": "enemy", "stats": enemy_stats(db, d, int(e.get("level", d.level))), "x": float(e.get("x", width - 80.0 - i * 36.0)), "name": d.get("name", {}), "xp": d.get("xp", 0), "coins": d.get("coins", 0), "art": d.get("art", "")})
	return out


# ---------------------------------------------------------------- Skirmish
class Skirmish:
	extends RefCounted
	signal hit(ev: Dictionary)
	signal down(id: String)
	signal ended(result: String, rewards: Dictionary)

	var P: Dictionary
	var R: Dictionary
	var level: Dictionary
	var fighters: Array = []
	var hits: Array = []
	var tick := 0
	var result := "ongoing"
	var _rng_a := 0

	func _init(setup: Dictionary) -> void:
		P = setup.get("physics", EasyActionCore.DEFAULT_PHYSICS)
		R = setup.combat
		level = setup.level
		_rng_a = int(setup.seed) & 0xFFFFFFFF
		for f in setup.fighters:
			var speed: float = R.speedBase + f.stats.get("spd", 0.0) / R.speedDiv
			var body := EasyActionCore.new_body(P, f.x, level.groundY, speed)
			body.facing = 1 if f.side == "hero" else -1
			var g: Dictionary = f.duplicate()
			g.merge({"hp": float(f.stats.hp), "mp": float(f.stats.get("mp", 0.0)), "maxHp": float(f.stats.hp), "maxMp": float(f.stats.get("mp", 0.0)), "body": body, "state": "idle", "move": "", "t": 0, "hitDone": [], "stun": 0, "invuln": 0, "cd": {"light": 0.0, "heavy": 0.0}, "ai": 30.0}, true)
			fighters.append(g)

	func _rnd() -> float:
		_rng_a = (_rng_a + 0x6D2B79F5) & 0xFFFFFFFF
		var t := _rng_a
		t = _imul(t ^ (t >> 15), t | 1)
		t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
		return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

	func _imul(a: int, b: int) -> int:
		var ah := (a >> 16) & 0xFFFF
		var al := a & 0xFFFF
		var bh := (b >> 16) & 0xFFFF
		var bl := b & 0xFFFF
		return (al * bl + (((ah * bl + al * bh) & 0xFFFF) << 16)) & 0xFFFFFFFF

	func alive(side: String = "") -> Array:
		return fighters.filter(func(f): return f.hp > 0 and (side == "" or f.side == side))

	func player():
		for f in fighters:
			if f.get("player", false):
				return f
		return null

	func _nearest_foe(f: Dictionary):
		var best = null
		var bd := INF
		for o in fighters:
			if o.side == f.side or o.hp <= 0:
				continue
			var d := absf(o.body.x - f.body.x)
			if d < bd:
				bd = d
				best = o
		return best

	func _ai_input(f: Dictionary) -> Dictionary:
		var foe = _nearest_foe(f)
		if foe == null:
			return {}
		var dx: float = foe.body.x - f.body.x
		var reach: float = R.moves.light.reach + foe.body.w / 2.0 - 2.0
		if f.ai > 0:
			f.ai -= 1.0
		if absf(dx) > reach:
			return {"left": dx < 0, "right": dx > 0}
		f.body.facing = -1 if dx < 0 else 1
		if f.ai > 0 or f.move != "":
			return {}
		f.ai = maxf(R.minCooldown, R.aiCooldown - f.stats.get("spd", 0.0)) + floorf(_rnd() * R.aiJitter)
		var heavy: bool = f.mp >= R.moves.heavy.mp and f.cd.heavy == 0 and f.side == "hero" and f.hp * 2 > f.maxHp
		return {"heavy": true} if heavy else {"light": true}

	func _start_move(f: Dictionary, m: String) -> void:
		var mv: Dictionary = R.moves[m]
		if f.move != "" or f.stun > 0 or f.cd[m] > 0 or f.mp < mv.mp:
			return
		f.mp -= mv.mp
		f.move = m
		f.t = 0
		f.hitDone = []
		f.cd[m] = float(mv.cooldown)

	func _resolve_hits(f: Dictionary) -> void:
		var mv: Dictionary = R.moves[f.move]
		var b0: Dictionary = f.body
		var hx: float = b0.x if b0.facing > 0 else b0.x - mv.reach
		var hb := {"x": hx, "y": b0.y - mv.height, "w": float(mv.reach), "h": float(mv.height)}
		for o in fighters:
			if o.side == f.side or o.hp <= 0 or o.invuln > 0 or f.hitDone.has(o.id):
				continue
			var b: Dictionary = o.body
			if not (b.x + b.w / 2.0 > hb.x and b.x - b.w / 2.0 < hb.x + hb.w and b.y > hb.y and b.y - b.h < hb.y + hb.h):
				continue
			f.hitDone.append(o.id)
			var crit: bool = _rnd() * 100.0 < R.crit
			var variance: float = floorf(_rnd() * 5.0) - 2.0
			var dmg: float = maxf(1.0, floorf(f.stats.atk * mv.power - o.stats.get("def", 0.0) / 2.0) + variance)
			if crit:
				dmg = floorf(dmg * 1.5)
			o.hp = maxf(0.0, o.hp - dmg)
			o.stun = int(R.stun)
			o.invuln = int(R.invuln)
			o.move = ""
			b.vx = mv.knockback * f.body.facing
			b.vy = -2.0
			b.onGround = false
			var is_down: bool = o.hp <= 0
			if is_down:
				o.state = "down"
			var ev := {"tick": tick, "from": f.id, "to": o.id, "damage": int(dmg), "crit": crit, "down": is_down}
			hits.append(ev)
			hit.emit(ev)
			if is_down:
				down.emit(o.id)

	func step(input: Dictionary = {}) -> String:
		if result != "ongoing":
			return result
		tick += 1
		for f in fighters:
			if f.hp <= 0:
				EasyActionCore.step_body(f.body, {}, level, P)
				continue
			f.cd.light = maxf(0.0, f.cd.light - 1.0)
			f.cd.heavy = maxf(0.0, f.cd.heavy - 1.0)
			if f.invuln > 0:
				f.invuln -= 1
			var inp: Dictionary = input if f.get("player", false) else _ai_input(f)
			if f.stun > 0:
				f.stun -= 1
				inp = {}
			elif f.move != "":
				var mv: Dictionary = R.moves[f.move]
				f.t += 1
				if f.t > mv.startup and f.t <= mv.startup + mv.active:
					_resolve_hits(f)
				if f.t >= mv.startup + mv.active + mv.recovery:
					f.move = ""
				inp = {"jump": inp.get("jump", false)}
			elif inp.get("heavy", false):
				_start_move(f, "heavy")
			elif inp.get("light", false):
				_start_move(f, "light")
			var keep: int = f.body.facing
			EasyActionCore.step_body(f.body, inp, level, P)
			if f.move != "":
				f.body.facing = keep
			var a := EasyActionCore.body_anim(f.body)
			f.state = "hurt" if f.stun > 0 else ("attack" if f.move != "" else ("idle" if a == "climb" else a))
		if alive("enemy").is_empty():
			result = "win"
		elif alive("hero").is_empty():
			result = "lose"
		elif tick >= R.maxTicks:
			result = "draw"
		if result != "ongoing":
			ended.emit(result, rewards())
		return result

	func rewards() -> Dictionary:
		var xp := 0
		var coins := 0
		var party := []
		for f in fighters:
			if f.side == "enemy" and f.hp <= 0:
				xp += int(f.get("xp", 0))
				coins += int(f.get("coins", 0))
			if f.side == "hero":
				party.append({"id": f.id, "hp": int(f.hp)})
		return {"xp": xp, "coins": coins, "party": party}

	func digest() -> String:
		var parts := [str(tick), result]
		for f in fighters:
			parts.append("%s:%d:%d:%d" % [f.id, int(f.hp), int(round(f.body.x * 1000.0)), int(round(f.body.y * 1000.0))])
		return "|".join(parts)


static func simulate_skirmish(fighters_in: Array, lvl: Dictionary, seed: int, P: Dictionary, R: Dictionary) -> Dictionary:
	var fs := []
	for f in fighters_in:
		var g: Dictionary = f.duplicate(true)
		g.player = false
		fs.append(g)
	var s := Skirmish.new({"fighters": fs, "level": lvl, "seed": seed, "physics": P, "combat": R})
	while s.step() == "ongoing" and s.tick < int(R.maxTicks):
		pass
	return {"result": s.result, "ticks": s.tick, "hits": s.hits.size(), "digest": s.digest(), "rewards": s.rewards()}
