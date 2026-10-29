// ===== main.js: игра + бот-Охотник в одном файле =====
// Отдельный hunter.js и import больше не нужны.
// Код охотника находится в самом конце файла (раздел «БОТ-ОХОТНИК»).

// ===== Переменные игры =====
let HP = 3;          // жизни
let Phase = 0;       // 0 — ловим врагов, 1 — враги гонятся за нами, 2 — победа
let TimeLeft = 30;   // секунд до смены фазы
let Invuln = 0;      // секунд неуязвимости после удара
const ZoomStart = 1.6;    // приближение на старте и при стоянии (больше = ближе)
const ZoomMin = 1.0;      // отдаление на максимальной скорости (меньше = дальше)
let CamZoom = ZoomStart;  // текущий масштаб камеры
const SpeedMax = 600;     // скорость, при которой отдаление максимальное
const ZoomSmooth = 4;     // плавность: больше = резче реакция
let Player = null;

let IsHunter = true;      // выбор в меню: true — охотник, false — миник

// ===== Имена макетов =====
const MENU_LAYOUT = "Меню";
const GAME_LAYOUT = "Макет 1";

// ===== Запуск =====
runOnStartup(async runtime =>
{
	// --- Макеты ---
	runtime.getLayout(MENU_LAYOUT).addEventListener("afterlayoutstart", () => StartMenu(runtime));
	runtime.getLayout(GAME_LAYOUT).addEventListener("afterlayoutstart", () => StartGame(runtime));

	// каждый кадр — игра, но только на игровом макете
	runtime.addEventListener("tick", () =>
	{
		if (runtime.layout.name === GAME_LAYOUT) Tick(runtime);
	});
});

// ===== Меню: кнопки выбора роли =====
function StartMenu(runtime)
{
	const hunterBtn = runtime.objects.КнопкаОхотника.getFirstInstance();
	const minicBtn  = runtime.objects.КнопкаМиника.getFirstInstance();

	hunterBtn?.addEventListener("click", () => SelectRole(runtime, true));
	minicBtn?.addEventListener("click",  () => SelectRole(runtime, false));
}

function SelectRole(runtime, hunter)
{
	IsHunter = hunter;
	runtime.goToLayout(GAME_LAYOUT);
}

// ===== Начало игры =====
function StartGame(runtime)
{
	HP = 3;
	Phase = 0;
	TimeLeft = 30;
	Invuln = 0;

	ResetHunters(runtime);   // обнуляет выстрелы, HP монстров и летящие лучи

	for (const heart of runtime.objects.hearth.instances())
		heart.setAnimation("full_hearth");

	for (const enemy of runtime.objects.enemy.instances())
		enemy.setAnimation("Animation 1");

	// выбираем, кем управляет игрок
	const enemies = runtime.objects.enemy.getAllInstances();

	Player = IsHunter
		? runtime.objects.car.getFirstInstance()
		: enemies[Math.floor(Math.random() * enemies.length)] ?? null;

	// сразу приближаемся к игроку, без «наезда» камеры
	ResetCamera(runtime, Player);
}

// ===== Камера: следим за машиной, на скорости отдаляемся =====
function UpdateCamera(runtime, car)
{
	const move = car.behaviors.Машина ?? car.behaviors.Пуля;
	const speed = Math.abs(move ? move.speed : 0);
	const t = Math.min(speed / SpeedMax, 1);                  // 0..1
	let target = ZoomStart + (ZoomMin - ZoomStart) * t;       // целевой масштаб

	// нельзя отдаляться так, чтобы было видно пустоту за краями макета
	const layout = runtime.layout;
	const fitScale = Math.max(runtime.viewportWidth / layout.width,
	                          runtime.viewportHeight / layout.height);
	target = Math.max(target, fitScale);

	// плавно тянем текущий масштаб к целевому
	CamZoom += (target - CamZoom) * (1 - Math.exp(-ZoomSmooth * runtime.dt));
	CamZoom = Math.max(CamZoom, fitScale);

	layout.scale = CamZoom;

	// держим камеру внутри макета
	const halfW = runtime.viewportWidth  / CamZoom / 2;
	const halfH = runtime.viewportHeight / CamZoom / 2;
	const x = Math.min(Math.max(car.x, halfW), layout.width  - halfW);
	const y = Math.min(Math.max(car.y, halfH), layout.height - halfH);
	layout.scrollTo(x, y);
}

// мгновенно поставить камеру на машину (без плавного наезда)
function ResetCamera(runtime, car)
{
	CamZoom = ZoomStart;
	if (car) UpdateCamera(runtime, car);
}

// ===== Каждый кадр =====
function Tick(runtime)
{
	if (!Player || Player.isDestroyed) return;

	const car = runtime.objects.car.getFirstInstance();
	if (!car) return;

	Controls(runtime, Player);
	UpdateTimer(runtime);
	MoveEnemies(runtime, car);
	CheckHits(runtime, car);
	TickHunters(runtime);    // ИИ охотников и полёт лучей
	UpdateInvuln(runtime, Player);
	CheckWin(runtime);
	UpdateCamera(runtime, Player);
}

// ===== Управление: WASD или стрелки =====
function Controls(runtime, car)
{
	const key = runtime.keyboard;
	const up    = key.isKeyDown("KeyW") || key.isKeyDown("ArrowUp");
	const down  = key.isKeyDown("KeyS") || key.isKeyDown("ArrowDown");
	const left  = key.isKeyDown("KeyA") || key.isKeyDown("ArrowLeft");
	const right = key.isKeyDown("KeyD") || key.isKeyDown("ArrowRight");

	// машина — через поведение «Машина»
	const drive = car.behaviors.Машина;
	if (drive)
	{
		if (up)    drive.simulateControl("up");
		if (down)  drive.simulateControl("down");
		if (left)  drive.simulateControl("left");
		if (right) drive.simulateControl("right");
		return;
	}

	// враг — через поведение «Пуля»: A/D поворот, W/S газ/назад
	const bullet = car.behaviors.Пуля;
	if (!bullet) return;

	const TurnSpeed = 3;   // градусов за кадр
	const MoveSpeed = 250;

	if (left)  car.angle -= TurnSpeed * Math.PI / 180;
	if (right) car.angle += TurnSpeed * Math.PI / 180;

	bullet.speed = up ? MoveSpeed : down ? -MoveSpeed / 2 : 0;
	bullet.angleOfMotion = car.angle;
}

// ===== Таймер: 30 с ловим, 10 с убегаем =====
function UpdateTimer(runtime)
{
	if (Phase === 2) return;   // уже победили

	TimeLeft -= runtime.dt;

	if (TimeLeft <= 0)
	{
		if (Phase === 0)
		{
			Phase = 1;
			TimeLeft = 10;
			SetEnemyAnimation(runtime, "red");
		}
		else
		{
			Phase = 0;
			TimeLeft = 30;
			SetEnemyAnimation(runtime, "Animation 1");
		}
	}

	const label = (Phase === 0) ? "Catch! " : "Run! ";
	runtime.objects.Таймер.getFirstInstance().text = label + Math.ceil(TimeLeft);
}

function SetEnemyAnimation(runtime, name)
{
	for (const enemy of runtime.objects.enemy.instances())
		enemy.setAnimation(name);
}

// ===== Враги: убегают или догоняют =====
function MoveEnemies(runtime, car)
{
	for (const enemy of runtime.objects.enemy.instances())
	{
		if (enemy === Player) continue;   // игроком управляет клавиатура

		const bullet = enemy.behaviors.Пуля;

		if (Phase === 0)
		{
			// убегают, если машина ближе 300
			if (Distance(car, enemy) < 300)
			{
				bullet.speed = 200;
				TurnTo(enemy, AngleFromTo(car, enemy), 5);
			}
			else
			{
				bullet.speed = 0;
			}
		}
		else if (Phase === 1)
		{
			// догоняют машину
			bullet.speed = 250;
			TurnTo(enemy, AngleFromTo(enemy, car), 4);
		}

		bullet.angleOfMotion = enemy.angle;   // едут туда, куда смотрят
	}
}

// ===== Столкновения =====
function CheckHits(runtime, car)
{
	for (const enemy of runtime.objects.enemy.instances())
	{
		if (!car.testOverlap(enemy)) continue;

		if (Phase === 0)
		{
			enemy.destroy();          // поймали врага
		}
		else if (Phase === 1 && Invuln <= 0)
		{
			LoseLife(runtime);        // враг поймал нас
		}
	}
}

function LoseLife(runtime)
{
	HP -= 1;
	Invuln = 1.5;

	// гасим лишние сердечки
	for (const heart of runtime.objects.hearth.instances())
		if (heart.instVars.num > HP) heart.setAnimation("none_hearth");

	// жизни кончились — заново
	if (HP <= 0) runtime.goToLayout(runtime.layout.name);
}

// ===== Неуязвимость: машина полупрозрачная =====
function UpdateInvuln(runtime, car)
{
	if (Invuln > 0)
	{
		Invuln -= runtime.dt;
		car.opacity = 0.5;
	}
	else
	{
		car.opacity = 1;
	}
}

// ===== Победа: врагов не осталось =====
function CheckWin(runtime)
{
	if (Phase === 2) return;

	if (runtime.objects.enemy.getAllInstances().length === 0)
	{
		Phase = 2;
		runtime.objects.Таймер.getFirstInstance().text = "Победа!";
	}
}

// ===== Помощники =====

// расстояние между двумя объектами
function Distance(a, b)
{
	return Math.hypot(b.x - a.x, b.y - a.y);
}

// угол от объекта a к объекту b
function AngleFromTo(a, b)
{
	return Math.atan2(b.y - a.y, b.x - a.x);
}

// плавно повернуть объект к углу target, не больше чем на degrees градусов за кадр
function TurnTo(obj, target, degrees)
{
	const step = degrees * Math.PI / 180;
	const diff = Math.atan2(Math.sin(target - obj.angle), Math.cos(target - obj.angle));

	if (Math.abs(diff) <= step) obj.angle = target;
	else obj.angle += Math.sign(diff) * step;
}


// ===================================================
// ===================== БОТ-ОХОТНИК  ================
// ===================================================
// Видит Монстра, держится на дистанции и стреляет лучом (railgun):
// луч летит с конечной скоростью, не наводится сам и не проходит сквозь стены.

// ===== Настройки =====
const CFG =
{
	// имена объектов в редакторе Construct 3
	HunterType:  "Hunter",      // бот-охотник
	MonsterType: "car",     // цель
	WallType:    "wall",        // стены: не пропускают ни взгляд, ни луч
	LaserType:   "LaserBolt",   // спрайт луча (тонкая светящаяся полоска)

	// зрение и движение
	VisionRange:       700,     // px, дальше Монстра не видно
	KeepDistance:      350,     // px, желаемая дистанция до Монстра
	DistanceTolerance: 50,      // px, «коридор»: внутри него не приближается и не отступает
	MoveSpeed:         140,     // px/с
	StrafeSpeed:       90,      // px/с, боковые шаги, пока держит дистанцию
	TurnSpeed:         270,     // град/с, скорость наведения
	AimTolerance:      4,       // град, допустимая ошибка наведения для выстрела
	SearchTime:        3,       // с, сколько идёт к последней точке, где видел Монстра

	// оружие
	FireInterval: 0.5,          // с между выстрелами
	MaxShots:     10,           // выстрелов за раунд на каждого охотника
	LaserSpeed:   1400,         // px/с (конечная скорость = не моментальное попадание)
	LaserRange:   900,          // px, дальше луч гаснет
	LaserDamage:  15,
	MonsterMaxHp: 100,
	LeadAim:      true,         // целиться с упреждением по скорости Монстра
};

const Deg = Math.PI / 180;

// ===== Состояние (хранится в коде, переменные в редакторе не нужны) =====
const hunterState  = new WeakMap();  // Hunter  -> { shots, cooldown, ... }
const monsterState = new WeakMap();  // Monster -> { hp, px, py, vx, vy }
let lasers = [];                     // летящие лучи

function HunterData(h)
{
	let s = hunterState.get(h);
	if (!s)
	{
		s = { shots: 0, cooldown: 0, lastSeen: null, searchLeft: 0,
		      strafeDir: Math.random() < 0.5 ? 1 : -1, strafeTimer: 1 };
		hunterState.set(h, s);
	}
	return s;
}

function MonsterData(m)
{
	let s = monsterState.get(m);
	if (!s)
	{
		s = { hp: CFG.MonsterMaxHp, px: m.x, py: m.y, vx: 0, vy: 0 };
		monsterState.set(m, s);
	}
	return s;
}

// ===== API охотника =====

// вызывается в начале раунда (StartGame): обнуляет выстрелы, HP и летящие лучи
function ResetHunters(runtime)
{
	for (const l of lasers)
		if (!l.inst.isDestroyed) l.inst.destroy();
	lasers = [];

	for (const h of Instances(runtime, CFG.HunterType))  hunterState.delete(h);
	for (const m of Instances(runtime, CFG.MonsterType)) monsterState.delete(m);
}

// вызывается каждый кадр (Tick)
function TickHunters(runtime)
{
	const dt = runtime.dt;
	const monsters = Instances(runtime, CFG.MonsterType);

	TrackMonsters(monsters, dt);

	for (const hunter of Instances(runtime, CFG.HunterType))
		UpdateHunter(runtime, hunter, monsters, dt);

	UpdateLasers(runtime, dt);
}

// для интерфейса
function GetShotsLeft(hunter) { return CFG.MaxShots - HunterData(hunter).shots; }
function GetMonsterHp(monster) { return MonsterData(monster).hp; }

// ===== ИИ охотника =====
function UpdateHunter(runtime, hunter, monsters, dt)
{
	const st = HunterData(hunter);
	if (st.cooldown > 0) st.cooldown -= dt;

	// 1. ближайший Монстр, которого охотник реально видит (дальность + нет стены на линии)
	let target = null;
	let dist = Infinity;
	for (const m of monsters)
	{
		const d = Math.hypot(m.x - hunter.x, m.y - hunter.y);
		if (d < dist && d <= CFG.VisionRange &&
		    HasLineOfSight(runtime, hunter.x, hunter.y, m.x, m.y))
		{
			target = m;
			dist = d;
		}
	}

	// 2. не видит — идёт к последней известной точке, потом стоит
	if (!target)
	{
		st.searchLeft -= dt;
		if (st.lastSeen && st.searchLeft > 0)
		{
			const a = Math.atan2(st.lastSeen.y - hunter.y, st.lastSeen.x - hunter.x);
			TurnToward(hunter, a, CFG.TurnSpeed * Deg * dt);
			Move(runtime, hunter, Math.cos(a) * CFG.MoveSpeed * dt, Math.sin(a) * CFG.MoveSpeed * dt);
		}
		return;
	}

	st.lastSeen = { x: target.x, y: target.y };
	st.searchLeft = CFG.SearchTime;

	// 3. держим дистанцию
	const toTarget = Math.atan2(target.y - hunter.y, target.x - hunter.x);
	let dx = 0, dy = 0;

	if (dist > CFG.KeepDistance + CFG.DistanceTolerance)        // далеко — приближаемся
	{
		dx = Math.cos(toTarget) * CFG.MoveSpeed * dt;
		dy = Math.sin(toTarget) * CFG.MoveSpeed * dt;
	}
	else if (dist < CFG.KeepDistance - CFG.DistanceTolerance)   // близко — отступаем
	{
		dx = -Math.cos(toTarget) * CFG.MoveSpeed * dt;
		dy = -Math.sin(toTarget) * CFG.MoveSpeed * dt;
	}
	else                                                         // в коридоре — боковые шаги
	{
		st.strafeTimer -= dt;
		if (st.strafeTimer <= 0)
		{
			st.strafeDir = -st.strafeDir;
			st.strafeTimer = 1 + Math.random() * 1.5;
		}
		dx = -Math.sin(toTarget) * st.strafeDir * CFG.StrafeSpeed * dt;
		dy =  Math.cos(toTarget) * st.strafeDir * CFG.StrafeSpeed * dt;
	}
	Move(runtime, hunter, dx, dy);

	// 4. наводимся (с упреждением, если включено)
	let ax = target.x, ay = target.y;
	if (CFG.LeadAim)
	{
		const ms = MonsterData(target);
		const flight = dist / CFG.LaserSpeed;
		ax += ms.vx * flight;
		ay += ms.vy * flight;
	}
	const aim = Math.atan2(ay - hunter.y, ax - hunter.x);
	const error = TurnToward(hunter, aim, CFG.TurnSpeed * Deg * dt);

	// 5. таймер атаки: раз в FireInterval, пока наведён и остались выстрелы
	if (st.cooldown <= 0 && st.shots < CFG.MaxShots && error <= CFG.AimTolerance * Deg)
		Fire(runtime, hunter, st);
}

// ===== Выстрел =====
function Fire(runtime, hunter, st)
{
	const type = runtime.objects[CFG.LaserType];
	if (!type) return;

	const a = hunter.angle;
	const inst = type.createInstance(hunter.layer.name, hunter.x, hunter.y);
	inst.angle = a;

	lasers.push({ inst, x: hunter.x, y: hunter.y, dx: Math.cos(a), dy: Math.sin(a), travelled: 0 });

	st.shots++;
	st.cooldown = CFG.FireInterval;
}

// ===== Полёт лучей: проверяем отрезок, пройденный за кадр =====
// Проверка отрезком (а не точкой) не даёт быстрому лучу «проскочить» тонкую стену.
function UpdateLasers(runtime, dt)
{
	const walls = Instances(runtime, CFG.WallType);
	const monsters = Instances(runtime, CFG.MonsterType);
	const step = CFG.LaserSpeed * dt;

	for (let i = lasers.length - 1; i >= 0; i--)
	{
		const l = lasers[i];
		if (l.inst.isDestroyed) { lasers.splice(i, 1); continue; }

		const x1 = l.x, y1 = l.y;
		const x2 = x1 + l.dx * step;
		const y2 = y1 + l.dy * step;

		// ближайшая стена на пути
		let tWall = Infinity;
		for (const w of walls)
		{
			const t = SegmentHit(w, x1, y1, x2, y2);
			if (t !== null && t < tWall) tWall = t;
		}

		// ближайший Монстр на пути
		let tMonster = Infinity;
		let hit = null;
		for (const m of monsters)
		{
			const t = SegmentHit(m, x1, y1, x2, y2);
			if (t !== null && t < tMonster) { tMonster = t; hit = m; }
		}

		if (hit && tMonster <= tWall)        // Монстр оказался раньше стены — попадание
		{
			DamageMonster(hit, CFG.LaserDamage);
			l.inst.destroy();
			lasers.splice(i, 1);
		}
		else if (tWall !== Infinity)         // стена раньше Монстра — луч гаснет
		{
			l.inst.destroy();
			lasers.splice(i, 1);
		}
		else
		{
			l.x = x2; l.y = y2;
			l.inst.x = x2; l.inst.y = y2;
			l.travelled += step;
			if (l.travelled >= CFG.LaserRange)
			{
				l.inst.destroy();
				lasers.splice(i, 1);
			}
		}
	}
}

function DamageMonster(monster, damage)
{
	const st = MonsterData(monster);
	st.hp -= damage;
	if (st.hp <= 0) monster.destroy();
}

// скорость Монстров по смещению за кадр (нужна для упреждения)
function TrackMonsters(monsters, dt)
{
	if (dt <= 0) return;
	for (const m of monsters)
	{
		const s = MonsterData(m);
		s.vx += ((m.x - s.px) / dt - s.vx) * 0.3;
		s.vy += ((m.y - s.py) / dt - s.vy) * 0.3;
		s.px = m.x;
		s.py = m.y;
	}
}

// ===== Геометрия =====

// есть ли прямая видимость (ни одна стена не пересекает отрезок)
function HasLineOfSight(runtime, x1, y1, x2, y2)
{
	for (const w of Instances(runtime, CFG.WallType))
		if (SegmentHit(w, x1, y1, x2, y2) !== null) return false;
	return true;
}

// где отрезок (x1,y1)-(x2,y2) впервые входит в объект: число 0..1 вдоль отрезка или null
function SegmentHit(inst, x1, y1, x2, y2)
{
	// быстрый отсев по рамке
	const r = inst.getBoundingBox();
	if (Math.max(x1, x2) < r.left || Math.min(x1, x2) > r.right ||
	    Math.max(y1, y2) < r.top  || Math.min(y1, y2) > r.bottom) return null;

	if (inst.containsPoint(x1, y1)) return 0;   // начало уже внутри

	const q = inst.getBoundingQuad();
	const p = [q.p1, q.p2, q.p3, q.p4];
	let best = null;

	for (let i = 0; i < 4; i++)
	{
		const a = p[i], b = p[(i + 1) % 4];
		const t = SegmentSegment(x1, y1, x2, y2, a.x, a.y, b.x, b.y);
		if (t !== null && (best === null || t < best)) best = t;
	}
	return best;
}

// пересечение двух отрезков; возвращает t вдоль первого или null
function SegmentSegment(x1, y1, x2, y2, x3, y3, x4, y4)
{
	const rx = x2 - x1, ry = y2 - y1;
	const sx = x4 - x3, sy = y4 - y3;
	const den = rx * sy - ry * sx;
	if (Math.abs(den) < 1e-9) return null;      // параллельны

	const t = ((x3 - x1) * sy - (y3 - y1) * sx) / den;
	const u = ((x3 - x1) * ry - (y3 - y1) * rx) / den;
	return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? t : null;
}

// ===== Помощники охотника =====

function Instances(runtime, typeName)
{
	return runtime.objects[typeName]?.getAllInstances() ?? [];
}

// сдвиг с «скольжением» вдоль стен: каждая ось проверяется отдельно
function Move(runtime, inst, dx, dy)
{
	inst.x += dx;
	if (HitsWall(runtime, inst)) inst.x -= dx;

	inst.y += dy;
	if (HitsWall(runtime, inst)) inst.y -= dy;
}

function HitsWall(runtime, inst)
{
	for (const w of Instances(runtime, CFG.WallType))
		if (inst.testOverlap(w)) return true;
	return false;
}

// повернуть к углу target не больше чем на maxStep радиан; вернуть оставшуюся ошибку
function TurnToward(inst, target, maxStep)
{
	const diff = Math.atan2(Math.sin(target - inst.angle), Math.cos(target - inst.angle));
	const abs = Math.abs(diff);

	if (abs <= maxStep) inst.angle = target;
	else inst.angle += Math.sign(diff) * maxStep;

	return Math.max(abs - maxStep, 0);
}