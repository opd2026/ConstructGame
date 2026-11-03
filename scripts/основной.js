// ===== Переменные игры =====
const HPMax = 3;     // жизни монстра
let HP = HPMax;      // сколько жизней осталось
let Phase = 0;       // 0 — ловим врагов, 1 — враги гонятся за нами, 2 — победа
let TimeLeft = 30;   // секунд до смены фазы
let Invuln = 0;      // секунд неуязвимости после удара
const ZoomStart = 1.6;    // приближение на старте и при стоянии (больше = ближе)
const ZoomMin = 1.0;      // отдаление на максимальной скорости (меньше = дальше)
let CamZoom = ZoomStart;  // текущий масштаб камеры
const SpeedMax = 600;     // скорость, при которой отдаление максимальное
const ZoomSmooth = 4;     // плавность: больше = резче реакция
let Player = null;
let Minutes = 5;		//Общее количество минут, лимит на игру
let GameTimeLeft = Minutes * 60;	// сколько секунд осталось до конца игры

const BoostMax = 5;       // запас ускорения, секунд
const BoostFactor = 2;    // во сколько раз быстрее на Shift
let BoostLeft = BoostMax; // сколько осталось
let BoostLocked = false;  // true — запас кончился, ждём полного восстановления
let BarWidth = 0;         // полная ширина шкалы

let IsHunter = true;      // выбор в меню: true — охотник, false — миник

const WheelMaxTurn = 30;  // на сколько градусов поворачиваются колёса
let WheelTurn = 0;        // текущий поворот колёс

// ===== Таран =====
const EnemyMaxHp = 100;   // здоровье охотника
const RamMinSpeed = 150;  // таран срабатывает, если монстр быстрее этого (X)
const RamDamage = 0.15;   // урон = скорость * RamDamage (350 → ~52, на Shift 700 → ~105)
const RamPush = 1.5;      // сила отталкивания: скорость отлёта = скорость монстра * RamPush
const RamCooldown = 0.5;  // секунд, пока одного и того же охотника нельзя таранить снова

// ===== Полоски здоровья над машинами =====
const HpBarWidth = 80;    // ширина полоски
const HpBarHeight = 8;    // высота полоски
const HpBarOffset = 60;   // на сколько выше центра машины

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
	HP = HPMax;
	Phase = 0;
	TimeLeft = 30;
	GameTimeLeft = Minutes * 60;
	Invuln = 0;

	ResetHunters(runtime);   // обнуляет выстрелы, HP монстров и летящие лучи
	BoostLeft = BoostMax;
	BoostLocked = false;
	BarWidth = runtime.objects.ШкалаУскорения?.getFirstInstance()?.width ?? 0;

	for (const enemy of runtime.objects.enemy.instances())
	{
		enemy.setAnimation("Animation 1");
		enemy.hp = EnemyMaxHp;
		enemy.ramCooldown = 0;
		enemy.pushX = 0;
		enemy.pushY = 0;
	}

	CreateHealthBars(runtime);

	// выбираем, кем управляет игрок
	const enemies = runtime.objects.enemy.getAllInstances();

	Player = IsHunter
		? runtime.objects.car.getFirstInstance()
		: enemies[Math.floor(Math.random() * enemies.length)] ?? null;

	// сразу приближаемся к игроку, без «наезда» камеры
	ResetCamera(runtime, Player);

	SetupPopup(runtime);
}

// ===== Всплывающее окно (лежит на HUD) =====
// объекты, из которых состоит окно — впиши сюда свои имена
const PopupObjects = ["ОкноФон", "ОкноТекст", "КнопкаЗакрыть", "КнопкаМеню"];

function SetupPopup(runtime)
{
	const openBtn  = runtime.objects.КнопкаОкна?.getFirstInstance();
	const closeBtn = runtime.objects.КнопкаЗакрыть?.getFirstInstance();
	const mainMenuBtn = runtime.objects.КнопкаМеню?.getFirstInstance();

	openBtn?.addEventListener("click",  () => ShowPopup(runtime, true));
	closeBtn?.addEventListener("click", () => ShowPopup(runtime, false));
	mainMenuBtn?.addEventListener("click", () => {runtime.goToLayout(MENU_LAYOUT)})

	ShowPopup(runtime, false);   // при старте окно скрыто
}

function ShowPopup(runtime, show, victory = false)
{
	const victoryTxt = runtime.objects.ПобедныйТекст?.getFirstInstance();
	const closeBtn = runtime.objects.КнопкаЗакрыть?.getFirstInstance();

	for (const name of PopupObjects)
		for (const inst of runtime.objects[name]?.instances() ?? [])
			inst.isVisible = show;

	if(victory){
		victoryTxt.isVisible = true;
		closeBtn.isVisible = false;
	}else if(HP <= 0 || GameTimeLeft <= 0){
		victoryTxt.text = (HP <= 0) ? "Прикинь я проиграл..." : "Время вышло!";
		closeBtn.isVisible = false;
		victoryTxt.isVisible = true;
	}else{
		victoryTxt.isVisible = false;
	}

	// пауза: 0 — время стоит, 1 — идёт
	runtime.timeScale = show ? 0 : 1;
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
	TimerToEndThisGame(runtime);
	MoveEnemies(runtime, car);
	ApplyPush(runtime);
	CheckHits(runtime, car);
	TickHunters(runtime);    // ИИ охотников и полёт лучей
	UpdateInvuln(runtime, Player);
	CheckWin(runtime);
	UpdateCamera(runtime, Player);
	UpdateBoostBar(runtime);
	UpdateHealthBars(runtime);
	CountEnemys(runtime);
}

// ===== Полоски здоровья =====
// На макете лежит один спрайт «ПолоскаЗдоровья» — образец.
// Делаем из него по полоске на каждую машину, а сам образец убираем.
function CreateHealthBars(runtime)
{
	const Bar = runtime.objects.ПолоскаЗдоровья;
	if (!Bar) return;

	const sample = Bar.getFirstInstance();
	if (!sample) return;

	const cars = [runtime.objects.car.getFirstInstance(), ...runtime.objects.enemy.instances()];
	for (const car of cars)
	{
		if (!car) continue;
		const bar = Bar.createInstance(car.layer.name, car.x, car.y);
		bar.height = HpBarHeight;
		bar.owner = car;
	}

	sample.destroy();
}

// ===== Общий таймер игры: кончился — проигрыш =====
function TimerToEndThisGame(runtime)
{
	// уже победили или время уже вышло — больше не считаем
	if (Phase === 2 || GameTimeLeft <= 0) return;

	GameTimeLeft -= runtime.dt;
	if (GameTimeLeft < 0) GameTimeLeft = 0;

	// показываем в виде 4:05
	const total = Math.ceil(GameTimeLeft);
	const min = Math.floor(total / 60);
	const sec = total % 60;
	const label = runtime.objects.ОбщееВремяИгрыТекст?.getFirstInstance();
	if (label) label.text = "Осталось: " + min + ":" + String(sec).padStart(2, "0");

	if (GameTimeLeft === 0)
		ShowPopup(runtime, true);   // меню проигрыша
}

function UpdateHealthBars(runtime)
{
	const Bar = runtime.objects.ПолоскаЗдоровья;
	if (!Bar) return;

	for (const bar of Bar.instances())
	{
		const car = bar.owner;
		if (!car) continue;               // образец, ещё не удалён

		// машина уничтожена — полоска тоже
		if (car.isDestroyed)
		{
			bar.destroy();
			continue;
		}

		// у монстра — жизни HP, у охотника — его hp
		const part = (car === runtime.objects.car.getFirstInstance())
			? HP / HPMax
			: car.hp / EnemyMaxHp;

		// полоска убывает слева направо и висит над машиной
		const left = car.x - HpBarWidth / 2;
		bar.width = HpBarWidth * Math.max(part, 0);
		bar.x = left + bar.width / 2;
		bar.y = car.y - HpBarOffset;

		// зелёная → жёлтая → красная
		bar.colorRgb = [Math.min(1, 2 - 2 * part), Math.min(1, 2 * part), 0];
	}
}

// ===== Таран: охотника отбрасывает =====
function ApplyPush(runtime)
{
	for (const enemy of runtime.objects.enemy.instances())
	{
		if (!enemy.pushX && !enemy.pushY) continue;

		enemy.x += enemy.pushX * runtime.dt;
		enemy.y += enemy.pushY * runtime.dt;

		// отлёт быстро затухает
		const fade = Math.exp(-5 * runtime.dt);
		enemy.pushX *= fade;
		enemy.pushY *= fade;
		if (Math.hypot(enemy.pushX, enemy.pushY) < 5) enemy.pushX = enemy.pushY = 0;
	}
}

function Ram(runtime, car, enemy, speed)
{
	enemy.hp -= speed * RamDamage;
	enemy.ramCooldown = RamCooldown;

	// отталкиваем от монстра
	const angle = AngleFromTo(car, enemy);
	enemy.pushX = Math.cos(angle) * speed * RamPush;
	enemy.pushY = Math.sin(angle) * speed * RamPush;

	if (enemy.hp <= 0) enemy.destroy();
}

// ===== Шкала ускорения на HUD =====
function UpdateBoostBar(runtime)
{
	const bar = runtime.objects.ШкалаУскорения?.getFirstInstance();
	if (!bar) return;

	bar.width = BarWidth * BoostLeft / BoostMax;
	bar.colorRgb = BoostLocked ? [1, 0.3, 0.3] : [1, 1, 1];   // красная — ждём восстановления
}

// ===== Управление: WASD или стрелки =====
function Controls(runtime, car)	
{
	const key = runtime.keyboard;
	const up    = key.isKeyDown("KeyW") || key.isKeyDown("ArrowUp");
	const down  = key.isKeyDown("KeyS") || key.isKeyDown("ArrowDown");
	const left  = key.isKeyDown("KeyA") || key.isKeyDown("ArrowLeft");
	const right = key.isKeyDown("KeyD") || key.isKeyDown("ArrowRight");
	const shift = key.isKeyDown("ShiftLeft") || key.isKeyDown("ShiftRight");

	// ускорение: на Shift тратится, без Shift восстанавливается
	const boost = shift && !BoostLocked;
	BoostLeft += boost ? -runtime.dt : runtime.dt;
	BoostLeft = Math.min(Math.max(BoostLeft, 0), BoostMax);
	if (BoostLeft === 0) BoostLocked = true;           // кончилось — ждём до полного
	if (BoostLeft === BoostMax) BoostLocked = false;
	const speedFactor = boost ? BoostFactor : 1;

	// машина — через поведение «Машина»
	const drive = car.behaviors.Машина;
	if (drive)
	{
		car.normalMaxSpeed ??= drive.maxSpeed;          // запоминаем обычную скорость
		drive.maxSpeed = car.normalMaxSpeed * speedFactor;

		if (up)    drive.simulateControl("up");
		if (down)  drive.simulateControl("down");
		if (left)  drive.simulateControl("left");
		if (right) drive.simulateControl("right");
		UpdateWheels(runtime, car, left, right);
		return;
	}

	// враг — через поведение «Пуля»: A/D поворот, W/S газ/назад
	const bullet = car.behaviors.Пуля;
	if (!bullet) return;

	const TurnSpeed = 3;   // градусов за кадр
	const MoveSpeed = 250 * speedFactor;

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

//Подсчёт оставшихся машинок
function CountEnemys(runtime)
{
	const label = runtime.objects.КоличествоМашинок?.getFirstInstance();
	if (!label) return;

	const counter = runtime.objects.enemy.getAllInstances().length;
	label.text = "Осталось: " + counter + " охотников";
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

// ===== Колёса: поворачиваются, когда рулим =====
function UpdateWheels(runtime, car, left, right)
{
	let target = 0;
	if (left)  target = -WheelMaxTurn;
	if (right) target =  WheelMaxTurn;

	// плавно доворачиваем колёса к нужному углу
	WheelTurn += (target - WheelTurn) * Math.min(1, runtime.dt * 10);

	for (const wheel of runtime.objects.Колесо?.instances() ?? [])
		wheel.angle = car.angle + WheelTurn * Math.PI / 180;
}

// ===== Столкновения =====
function CheckHits(runtime, car)
{
	const speed = Math.abs(car.behaviors.Машина?.speed ?? 0);

	for (const enemy of runtime.objects.enemy.instances())
	{
		enemy.ramCooldown = Math.max(0, (enemy.ramCooldown ?? 0) - runtime.dt);

		if (!car.testOverlap(enemy)) continue;

		if (speed > RamMinSpeed)
		{
			if (enemy.ramCooldown <= 0) Ram(runtime, car, enemy, speed);   // таран!
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

	// жизни кончились — заново
	if (HP <= 0){
		ShowPopup(runtime, true, false);
	};
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
		ShowPopup(runtime, true, true);
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
// Охотники — это enemy, Монстр — это car.
// Двигаются охотники как раньше (MoveEnemies), этот блок отвечает только за стрельбу:
// охотник видит Монстра, целится в него и раз в 0.5 с стреляет лучом (railgun).
// Луч летит с конечной скоростью, не наводится сам и не проходит сквозь стены.

// ===== Настройки =====
const CFG =
{
	// имена объектов в редакторе Construct 3
	HunterType:  "enemy",       // кто стреляет
	MonsterType: "car",         // в кого стреляют
	WallType:    "wall",        // стены: не пропускают ни взгляд, ни луч
	LaserType:   "LaserBolt",   // спрайт луча (тонкая светящаяся полоска)

	// зрение
	VisionRange: 700,           // px, дальше Монстра не видно

	// оружие
	FireInterval: 0.5,          // с между выстрелами
	MaxShots:     10,           // выстрелов за раунд на каждого охотника
	LaserSpeed:   1400,         // px/с (конечная скорость = не моментальное попадание)
	LaserRange:   900,          // px, дальше луч гаснет
	LaserDamage:  0.25,         // урон в единицах HP Монстра (у него HPMax = 3, значит 12 попаданий)
	LeadAim:      true,         // целиться с упреждением по скорости Монстра
};

// ===== Состояние (хранится в коде, переменные в редакторе не нужны) =====
const hunterState  = new WeakMap();  // enemy -> { shots, cooldown }
const monsterState = new WeakMap();  // car   -> { px, py, vx, vy }
let lasers = [];                     // летящие лучи

function HunterData(h)
{
	let s = hunterState.get(h);
	if (!s)
	{
		// случайная задержка первого выстрела, чтобы охотники не стреляли залпом
		s = { shots: 0, cooldown: Math.random() * CFG.FireInterval };
		hunterState.set(h, s);
	}
	return s;
}

function MonsterData(m)
{
	let s = monsterState.get(m);
	if (!s)
	{
		s = { px: m.x, py: m.y, vx: 0, vy: 0 };
		monsterState.set(m, s);
	}
	return s;
}

// ===== API охотника =====

// вызывается в начале раунда (StartGame): у каждого охотника снова 10 выстрелов, лучи убираются
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
	if (dt <= 0) return;   // пауза (всплывающее окно)

	const monsters = Instances(runtime, CFG.MonsterType);
	TrackMonsters(monsters, dt);

	for (const hunter of Instances(runtime, CFG.HunterType))
	{
		if (hunter === Player) continue;   // enemy, которым управляет игрок, сам не стреляет
		UpdateHunter(runtime, hunter, monsters, dt);
	}

	UpdateLasers(runtime, dt);
}

// для интерфейса: сколько выстрелов осталось у охотника
function GetShotsLeft(hunter) { return CFG.MaxShots - HunterData(hunter).shots; }

// ===== Охотник: увидел → прицелился → выстрелил =====
function UpdateHunter(runtime, hunter, monsters, dt)
{
	const st = HunterData(hunter);

	// таймер атаки
	if (st.cooldown > 0) st.cooldown -= dt;
	if (st.cooldown > 0 || st.shots >= CFG.MaxShots) return;   // ещё рано или выстрелы кончились

	// ближайший Монстр, которого охотник реально видит (дальность + нет стены на линии)
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
	if (!target) return;   // не видит — не стреляет, выстрел не тратится

	// прицел: в точку, где Монстр будет к моменту прилёта луча
	let ax = target.x, ay = target.y;
	if (CFG.LeadAim)
	{
		const ms = MonsterData(target);
		const flight = dist / CFG.LaserSpeed;
		ax += ms.vx * flight;
		ay += ms.vy * flight;
	}

	Fire(runtime, hunter, st, Math.atan2(ay - hunter.y, ax - hunter.x));
}

// ===== Выстрел =====
// Направление берём из прицела, а не из hunter.angle: угол enemy задаёт, куда он едет (MoveEnemies).
function Fire(runtime, hunter, st, angle)
{
	const type = runtime.objects[CFG.LaserType];
	if (!type) return;

	const inst = type.createInstance(hunter.layer.name, hunter.x, hunter.y);
	inst.angle = angle;

	lasers.push({ inst, x: hunter.x, y: hunter.y, dx: Math.cos(angle), dy: Math.sin(angle), travelled: 0 });

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
		for (const m of monsters)
		{
			const t = SegmentHit(m, x1, y1, x2, y2);
			if (t !== null && t < tMonster) tMonster = t;
		}

		if (tMonster !== Infinity && tMonster <= tWall)   // Монстр оказался раньше стены — попадание
		{
			DamageMonster(runtime, CFG.LaserDamage);
			l.inst.destroy();
			lasers.splice(i, 1);
		}
		else if (tWall !== Infinity)                      // стена раньше Монстра — луч гаснет
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

// попадание лазера снимает HP Монстра (общий HP игры, как в LoseLife)
function DamageMonster(runtime, damage)
{
	if (Invuln > 0 || HP <= 0) return;   // пока машина неуязвима, урон не проходит

	HP -= damage;
	if (HP <= 0) ShowPopup(runtime, true);   // жизни кончились — меню проигрыша
}

// скорость Монстра по смещению за кадр (нужна для упреждения)
function TrackMonsters(monsters, dt)
{
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
