# Headless checks: godot --headless --path <export> --script res://test_action.gd
# Prints the parity lines (P| physics paths, S| skirmishes) that the TS engine also prints, then OK.
extends SceneTree


func _init() -> void:
	var par: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://easyaction/parity.json"))
	var doc: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://easyaction/easyaction.json")).doc
	var lvl: Dictionary = doc.levels[0]
	for name in par.scripts:
		var c: Dictionary = par.scripts[name]
		var start: Array = c.get("start", lvl.spawn)
		var pts := EasyActionCore.simulate_path(lvl, doc.physics, c.script, start)
		var samples := []
		for i in pts.size():
			if i % 15 == 14 or i == pts.size() - 1:
				samples.append("%d,%d,%s" % [int(round(pts[i][0] * 1000.0)), int(round(pts[i][1] * 1000.0)), pts[i][2]])
		print("P| %s %s" % [name, ";".join(samples)])
	for c in par.skirmishes:
		var r := EasyActionCore.simulate_skirmish(c.fighters, c.level, int(c.seed), doc.physics, doc.combat)
		print("S| %s %s %d %s" % [c.name, r.result, r.hits, r.digest])
	# runtime nodes build without errors
	var p := EasyActionPlayer.new()
	p.setup(doc, lvl.id)
	for i in 30:
		p.tick({"right": true})
	print("N| player x=%d anim=%s" % [int(round(p.body.x)), EasyActionCore.body_anim(p.body)])
	p.free()
	var db: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://easyaction/battle_db.json"))
	var v := EasySkirmishView.new()
	v.setup(doc, db, doc.encounters[0].id, [{"id": db.heroes[0].id, "level": 3}], {}, 1)
	var steps := 0
	while v.sk.step({}) == "ongoing" and steps < 6000:
		steps += 1
	print("N| skirmish view result=%s" % v.sk.result)
	v.free()
	print("OK")
	quit()
