# Easy Action demo: platformer on the first level; Enter starts the first encounter as a real-time skirmish.
extends Node2D

var doc: Dictionary
var db: Dictionary
var player
var fight


func _ready() -> void:
	doc = JSON.parse_string(FileAccess.get_file_as_string("res://easyaction/easyaction.json")).doc
	db = JSON.parse_string(FileAccess.get_file_as_string("res://easyaction/battle_db.json"))
	player = EasyActionPlayer.new()
	player.setup(doc, "")
	add_child(player)
	var cam := Camera2D.new()
	cam.zoom = Vector2(2, 2)
	player.add_child(cam)


func _process(_delta: float) -> void:
	if fight == null and Input.is_key_pressed(KEY_ENTER) and not db.is_empty():
		player.queue_free()
		fight = EasySkirmishView.new()
		fight.setup(doc, db, doc.encounters[0].id, [{"id": db.heroes[0].id, "level": 3}], {}, 1)
		add_child(fight)
