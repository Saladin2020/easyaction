# Easy Action — Godot 4.3+ platformer controller on a level (usually over an Easy Scene street). MIT.
#   var p := EasyActionPlayer.new(); p.setup(doc, "ban_na_di_rooftops", load("res://characters/side_player.png")); add_child(p)
# Keys (InputMap-free): ← → / A D move · Space / Z jump · ↑ ↓ climb (Down + Jump drops through) · signal picked(pickup)
class_name EasyActionPlayer
extends Node2D

signal picked(pickup: Dictionary)

var doc: Dictionary
var level: Dictionary
var P: Dictionary
var body: Dictionary
var sprite: AnimatedSprite2D
var pickups: Array = []
var collected: Array = []
var _acc := 0.0
var _jump_was := false
var ticks := 0

const COLS := {"idle": [0], "run": [4, 5, 6, 7], "jump": [8], "fall": [9], "attack": [18, 19], "hurt": [20, 21], "down": [22, 23], "climb": [1, 2, 3, 2]}


static func make_frames(tex: Texture2D, fs: int = 48) -> SpriteFrames:
	var sf := SpriteFrames.new()
	var rows := {"right": 0, "left": 1, "front": 2}
	for dir in rows:
		for anim in COLS:
			var name: String = "%s_%s" % [dir, anim]
			sf.add_animation(name)
			sf.set_animation_speed(name, 9.0)
			sf.set_animation_loop(name, anim != "down")
			var r: int = rows["front"] if anim == "climb" else rows[dir]
			for c in COLS[anim]:
				var at := AtlasTexture.new()
				at.atlas = tex
				at.region = Rect2(c * fs, r * fs, fs, fs)
				sf.add_frame(name, at)
	return sf


func setup(d: Dictionary, level_id: String = "", sheet: Texture2D = null, ground_row: int = 47) -> void:
	doc = d
	P = d.physics
	level = d.levels[0]
	for l in d.levels:
		if l.id == level_id:
			level = l
	body = EasyActionCore.new_body(P, level.spawn[0], level.spawn[1])
	for p in level.get("pickups", []):
		pickups.append(p.duplicate())
	if sheet:
		sprite = AnimatedSprite2D.new()
		sprite.sprite_frames = make_frames(sheet)
		sprite.offset = Vector2(0, 24 - ground_row)
		sprite.play("right_idle")
		add_child(sprite)
	queue_redraw()


func tick(inp: Dictionary) -> void:
	EasyActionCore.step_body(body, inp, level, P)
	ticks += 1
	for p in pickups:
		if not p.get("taken", false) and absf(p.x - body.x) < 10 and p.y > body.y - body.h - 4 and p.y < body.y + 2:
			p.taken = true
			collected.append(p.id)
			picked.emit(p)
	var a := EasyActionCore.body_anim(body)
	if sprite:
		var name := "%s_%s" % ["right" if body.facing > 0 else "left", a]
		if sprite.animation != name:
			sprite.play(name)
		sprite.position = Vector2(round(body.x), round(body.y))
	queue_redraw()


func read_input() -> Dictionary:
	var jump := Input.is_key_pressed(KEY_SPACE) or Input.is_key_pressed(KEY_Z)
	var inp := {"left": Input.is_key_pressed(KEY_LEFT) or Input.is_key_pressed(KEY_A), "right": Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D), "up": Input.is_key_pressed(KEY_UP) or Input.is_key_pressed(KEY_W), "down": Input.is_key_pressed(KEY_DOWN) or Input.is_key_pressed(KEY_S), "jump": jump, "jumpPressed": jump and not _jump_was}
	_jump_was = jump
	return inp


func _physics_process(delta: float) -> void:
	_acc = minf(_acc + delta, 0.25)
	while _acc >= 1.0 / 60.0:
		_acc -= 1.0 / 60.0
		tick(read_input())


func _draw() -> void:
	for l in level.get("ladders", []):
		draw_rect(Rect2(l.x + 2, l.y, 2, l.h), Color("7a4a22"))
		draw_rect(Rect2(l.x + l.w - 4, l.y, 2, l.h), Color("7a4a22"))
		var y: float = l.y + 4
		while y < l.y + l.h:
			draw_rect(Rect2(l.x + 2, y, l.w - 4, 2), Color("a8703a"))
			y += 6
	for p in level.get("platforms", []):
		draw_rect(Rect2(p.x, p.y - 1, p.w, 2), Color(0.96, 0.82, 0.54, 0.55))
	for p in pickups:
		if not p.get("taken", false):
			draw_circle(Vector2(p.x, p.y), 4, Color("f6c445"))
	if sprite == null:
		draw_rect(Rect2(body.x - 7, body.y - 30, 14, 30), Color("2f7fd0"))
		draw_circle(Vector2(body.x, body.y - 36), 7, Color("f0c8a0"))
