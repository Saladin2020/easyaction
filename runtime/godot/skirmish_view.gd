# Easy Action — Godot 4.3+ real-time skirmish view (alternative to turn-based Easy Battle). MIT.
#   var v := EasySkirmishView.new(); v.setup(doc, battle_db, "monkey_raid", [{"id": "ton", "level": 3}], {"ton": load(...)}, 7); add_child(v)
#   signal finished(result, rewards). Keys: ← → move · Space/Z jump · J strike · K heavy.
class_name EasySkirmishView
extends Node2D

signal finished(result: String, rewards: Dictionary)

var sk
var doc: Dictionary
var sprites := {}
var _acc := 0.0
var _keys_was := {}
var lang := "th"
var size := Vector2(480, 270)


func setup(d: Dictionary, battle_db: Dictionary, encounter_id: String, party: Array, hero_sheets: Dictionary = {}, seed: int = 1, view_size: Vector2 = Vector2(480, 270)) -> void:
	doc = d
	size = view_size
	var enc: Dictionary = d.encounters[0]
	for e in d.encounters:
		if e.id == encounter_id:
			enc = e
	var lvl: Dictionary = EasyActionCore.arena(enc.get("width", size.x), size.y - 40.0)
	if enc.has("level"):
		for l in d.levels:
			if l.id == enc.level:
				lvl = l
	var fighters := EasyActionCore.fighters_from_battle(battle_db, party, enc.enemies, lvl.width)
	sk = EasyActionCore.Skirmish.new({"fighters": fighters, "level": lvl, "seed": seed, "physics": d.physics, "combat": d.combat})
	sk.ended.connect(func(r, rw): finished.emit(r, rw))
	for f in sk.fighters:
		if f.side == "hero" and hero_sheets.has(f.id):
			var s := AnimatedSprite2D.new()
			s.sprite_frames = EasyActionPlayer.make_frames(hero_sheets[f.id])
			s.offset = Vector2(0, -23)
			s.play("right_idle")
			add_child(s)
			sprites[f.id] = s
	queue_redraw()


func _edge(key: int) -> bool:
	var down := Input.is_key_pressed(key)
	var was: bool = _keys_was.get(key, false)
	_keys_was[key] = down
	return down and not was


func _physics_process(delta: float) -> void:
	if sk == null or sk.result != "ongoing":
		return
	_acc = minf(_acc + delta, 0.25)
	while _acc >= 1.0 / 60.0 and sk.result == "ongoing":
		_acc -= 1.0 / 60.0
		var jump := Input.is_key_pressed(KEY_SPACE) or Input.is_key_pressed(KEY_Z)
		sk.step({"left": Input.is_key_pressed(KEY_LEFT) or Input.is_key_pressed(KEY_A), "right": Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D), "jump": jump, "jumpPressed": _edge(KEY_SPACE) or _edge(KEY_Z), "light": _edge(KEY_J), "heavy": _edge(KEY_K)})
	for f in sk.fighters:
		if sprites.has(f.id):
			var s: AnimatedSprite2D = sprites[f.id]
			s.position = Vector2(round(f.body.x), round(f.body.y))
			var anim: String = "down" if f.hp <= 0 else ("attack" if f.state == "attack" else ("hurt" if f.state == "hurt" else f.state))
			if not s.sprite_frames.has_animation("right_" + anim):
				anim = "idle"
			var name := "%s_%s" % ["right" if f.body.facing > 0 else "left", anim]
			if s.animation != name:
				s.play(name)
	queue_redraw()


func _draw() -> void:
	if sk == null:
		return
	draw_rect(Rect2(0, 0, size.x, size.y), Color("87b7d9"))
	draw_rect(Rect2(0, sk.level.groundY, size.x, size.y - sk.level.groundY), Color("6b4a2a"))
	for f in sk.fighters:
		var x: float = round(f.body.x)
		var y: float = round(f.body.y)
		if not sprites.has(f.id):
			var col := Color("2f7fd0") if f.side == "hero" else Color("c04030")
			if f.hp <= 0:
				col.a = 0.4
			draw_rect(Rect2(x - 8, y - 24, 16, 24), col)
		if f.hp > 0:
			draw_rect(Rect2(x - 12, y - 46, 24, 3), Color("301010"))
			draw_rect(Rect2(x - 12, y - 46, 24.0 * f.hp / f.maxHp, 3), Color("5fd35f") if f.side == "hero" else Color("e05040"))
