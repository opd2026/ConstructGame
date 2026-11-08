// ===== Переменные игры =====
const HPMax = 3;     // жизни монстра
let HP = HPMax;      // сколько жизней осталось
let Victory = false; // true — победа, игра окончена
let Invuln = 0;     // секунд неуязвимости после удара
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

	// встроенного isDestroyed у объектов нет — помечаем уничтоженные сами
	runtime.addEventListener("instancedestroy", e => { e.instance.dead = true; });

	// каждый кадр — игра, но только на игровом макете
	runtime.addEventListener("tick", () =>
	{
		if (runtime.layout.name === GAME_LAYOUT) Tick(runtime);
	});
});

// ===== Меню: кнопки выбора роли =====
function StartMenu(runtime)
{
	runtime.timeScale = 1;   // снимаем паузу, если вышли в меню из окна

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
	runtime.timeScale = 1;   // новый раунд всегда без паузы
	HP = HPMax;
	Victory = false;
	GameTimeLeft = Minutes * 60;
	Invuln = 0;

	ResetHunters(runtime);   // обнуляет выстрелы, HP монстров и летящие лучи
	BoostLeft = BoostMax;
	BoostLocked = false;
	BarWidth = runtime.objects.ШкалаУскорения?.getFirstInstance()?.width ?? 0;

	for (const enemy of runtime.objects.enemy.instances())
	{
		enemy.hp = EnemyMaxHp;
		enemy.ramCooldown = 0;
		enemy.pushX = 0;
		enemy.pushY = 0;
	}

	CreateGuns(runtime);          // прикрепляем рельсотрон к каждому охотнику
	CreateHealthBars(runtime);
	CreateEnemyWheels(runtime);

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
	if (!Player || Player.dead) return;

	const car = runtime.objects.car.getFirstInstance();
	if (!car) return;

	Controls(runtime, Player);
	TimerToEndThisGame(runtime);
	MoveEnemies(runtime, car);
	UpdateEnemyWheels(runtime);
	ApplyPush(runtime);
	CheckHits(runtime, car);
	TickHunters(runtime);    // ИИ охотников и полёт лучей
	UpdateGuns(runtime);     // пушки едут вместе с охотниками и поворачиваются на цель
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
	if (Victory || GameTimeLeft <= 0) return;

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
		if (car.dead)
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

	if (enemy.hp <= 0) enemy.destroy();   // пушка уберётся сама в UpdateGuns
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

//Подсчёт оставшихся машинок
function CountEnemys(runtime)
{
	const label = runtime.objects.КоличествоМашинок?.getFirstInstance();
	if (!label) return;

	const counter = runtime.objects.enemy.getAllInstances().length;
	label.text = "Осталось: " + counter + " охотников";
}

// ===== Враги: держатся на безопасном расстоянии =====
const SafeDistance = 700;   // дальше этого — подъезжают к монстру (меньше дальности лазера 700)

function MoveEnemies(runtime, car)
{
	for (const enemy of runtime.objects.enemy.instances())
	{
		if (enemy === Player) continue;   // игроком управляет клавиатура

		const bullet = enemy.behaviors.Пуля;
		const dist = Distance(car, enemy);

		if (dist < 300)
		{
			// убегают, если машина ближе 300
			bullet.speed = 200;
			TurnTo(enemy, AngleFromTo(car, enemy), 5);
		}
		else if (dist > SafeDistance)
		{
			// далеко — подбираются к монстру
			bullet.speed = 250;
			TurnTo(enemy, AngleFromTo(enemy, car), 4);
		}
		else
		{
			// на безопасном расстоянии — стоят
			bullet.speed = 0;
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

// ===== Колёса охотников =====
// На макете ставишь колёса «КолесоВрага» на ОДНОГО охотника (как на машине).
// В начале раунда код запоминает, где они стоят, и даёт такие же колёса каждому охотнику.

function CreateEnemyWheels(runtime)
{
	const Wheel = runtime.objects.КолесоВрага;
	if (!Wheel) return;

	// запоминаем положение образцов относительно ближайшего охотника и убираем их
	const places = [];
	for (const sample of Wheel.getAllInstances())
	{
		let owner = null, best = Infinity;
		for (const e of runtime.objects.enemy.instances())
		{
			const d = Distance(sample, e);
			if (d < best) { best = d; owner = e; }
		}
		if (owner)
		{
			// сдвиг колеса переводим в систему координат машины: x — вперёд, y — вбок
			const dx = sample.x - owner.x, dy = sample.y - owner.y;
			const c = Math.cos(owner.angle), s = Math.sin(owner.angle);
			places.push({ x: dx * c + dy * s, y: -dx * s + dy * c, w: sample.width, h: sample.height });
		}
		sample.destroy();
	}

	// каждому охотнику — такие же колёса, прикреплённые к нему
	for (const enemy of runtime.objects.enemy.instances())
	{
		enemy.wheels = [];
		enemy.wheelTurn = 0;
		enemy.prevAngle = enemy.angle;

		const c = Math.cos(enemy.angle), s = Math.sin(enemy.angle);
		for (const p of places)
		{
			const wheel = Wheel.createInstance(enemy.layer.name,
				enemy.x + p.x * c - p.y * s,
				enemy.y + p.x * s + p.y * c);
			wheel.width = p.w;
			wheel.height = p.h;
			wheel.angle = enemy.angle;
			wheel.moveAdjacentToInstance?.(enemy, false);   // под кузов

			enemy.addChild(wheel, { transformX: true, transformY: true, transformAngle: true, destroyWithParent: true });
			enemy.wheels.push(wheel);
		}
	}
}

// колёса охотника поворачиваются в ту сторону, куда он сейчас разворачивается
function UpdateEnemyWheels(runtime)
{
	if (runtime.dt <= 0) return;   // пауза

	for (const enemy of runtime.objects.enemy.instances())
	{
		if (!enemy.wheels) continue;

		// на сколько охотник повернулся за кадр (TurnTo крутит не больше 5° за кадр)
		const diff = Math.atan2(Math.sin(enemy.angle - enemy.prevAngle), Math.cos(enemy.angle - enemy.prevAngle));
		enemy.prevAngle = enemy.angle;
		const steer = Math.max(-1, Math.min(1, diff / (5 * Math.PI / 180)));   // -1 влево … 1 вправо

		// плавно доворачиваем колёса, как у машины
		enemy.wheelTurn += (steer * WheelMaxTurn - enemy.wheelTurn) * Math.min(1, runtime.dt * 10);

		for (const wheel of enemy.wheels)
			wheel.angle = enemy.angle + enemy.wheelTurn * Math.PI / 180;
	}
}

// ===== Столкновения =====
function CheckHits(runtime, car)
{
	const speed = Math.abs(car.behaviors.Машина?.speed ?? 0);

	for (const enemy of runtime.objects.enemy.instances())
	{
		enemy.ramCooldown = Math.max(0, (enemy.ramCooldown ?? 0) - runtime.dt);

		if (!car.testOverlap(enemy)) continue;

		if (speed > RamMinSpeed && enemy.ramCooldown <= 0)
			Ram(runtime, car, enemy, speed);   // таран!
	}
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
	if (Victory) return;

	if (runtime.objects.enemy.getAllInstances().length === 0)
	{
		Victory = true;
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

// на сколько радиан отличаются два угла (всегда 0..π)
function AngleDiff(a, b)
{
	return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
}


// ===================================================
// ===================== БОТ-ОХОТНИК  ================
// ===================================================
// Охотники — это enemy, Монстр — это car.
// Двигаются охотники в MoveEnemies, этот блок отвечает только за стрельбу:
// охотник видит Монстра, целится в него и стреляет лучом (railgun) очередями:
// в очереди 2–4 выстрела с неровными интервалами (в среднем 0.5 с), потом пауза,
// у каждой очереди своя точность, а боезапас ограничен (10 выстрелов за раунд).
// Луч летит с конечной скоростью, не наводится сам и не проходит сквозь стены.
//
// Спрайт «railgun» прикреплён к каждому охотнику: едет вместе с ним, поворачивается
// на Монстра, а луч вылетает из среза ствола. Нет цели — ствол смотрит вперёд.

// ===== Настройки =====
const CFG =
{
	// имена объектов в редакторе Construct 3
	HunterType:  "enemy",       // кто стреляет
	MonsterType: "car",         // в кого стреляют
	WallType:    "wall",        // стены: не пропускают ни взгляд, ни луч
	LaserType:   "LaserBolt",   // спрайт луча (тонкая светящаяся полоска)
	GunType:     "railgun",     // спрайт пушки (прикрепляется к охотнику)

	// пушка (где она стоит относительно машины — берётся с макета, см. CreateGuns)
	GunOffsetX:   0,            // px: доп. сдвиг пушки вперёд по ходу машины (минус — назад), для подгонки
	GunOffsetY:   0,            // px:                         вбок
	GunMuzzle:    40,           // px от центра пушки до среза ствола (отсюда вылетает луч)
	GunTurnSpeed: 540,          // град/с: как быстро ствол поворачивается на цель
	AimTolerance: 8,            // град: стреляет, только когда ствол довернулся на цель с такой точностью

	// зрение
	VisionRange: 700,           // px, дальше Монстра не видно

	// боезапас
	MaxShots:     10,           // выстрелов за раунд на каждого охотника (кончились — больше не стреляет)

	// очереди и скорострельность (всё случайное в диапазоне, поэтому ритм не угадать)
	BurstMin:     2,            // выстрелов в очереди: от
	BurstMax:     4,            //                      до
	ShotGapMin:   0.3,          // с между выстрелами внутри очереди: от
	ShotGapMax:   0.7,          //                                    до (в среднем 0.5 с)
	PauseMin:     1.5,          // с паузы между очередями: от
	PauseMax:     3.5,          //                          до

	// точность (у каждой очереди своя, внутри очереди каждый выстрел ещё и отклоняется случайно)
	SpreadMin:    4,            // разброс очереди, град: от
	SpreadMax:    14,           //                        до (выстрел уходит на угол от -разброс до +разброс)
	LeadAim:      true,         // целиться с упреждением по скорости Монстра
	LeadMin:      0.5,          // насколько точно учитывает скорость Монстра (1 = идеально): от
	LeadMax:      1.0,          //                                                           до

	// луч
	LaserSpeed:   1400,         // px/с (конечная скорость = не моментальное попадание)
	LaserRange:   900,          // px, дальше луч гаснет
	LaserDamage:  0.25,         // урон в единицах HP Монстра (у него HPMax = 3, значит 12 попаданий)
};

// ===== Состояние (хранится в коде, переменные в редакторе не нужны) =====
const hunterState  = new WeakMap();  // enemy -> { shots, cooldown, burstLeft, burstSpread, aim }
const monsterState = new WeakMap();  // car   -> { px, py, vx, vy }
let lasers = [];                     // летящие лучи

function HunterData(h)
{
	let s = hunterState.get(h);
	if (!s)
	{
		// случайная задержка первой очереди, чтобы охотники не стреляли залпом
		// aim — угол, куда сейчас смотрит ствол (null — цели нет, ствол смотрит вперёд)
		s = { shots: 0, cooldown: Rand(0, CFG.PauseMax), burstLeft: 0, burstSpread: CFG.SpreadMax, aim: null };
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

// ===== Пушка, прикреплённая к охотнику =====
// Работает как поведение Pin, только в коде: на макете можно положить один спрайт «railgun»
// (он нужен как образец размера и сам удаляется), а у каждого охотника появится своя пушка.

// где пушка стоит относительно охотника, в системе координат машины: x — вперёд, y — вбок.
// Заполняется в CreateGuns по образцу пушки на макете
let GunLocal = { x: 0, y: 0 };

// по образцу пушки на макете считает, где она стоит относительно ближайшего охотника.
// Нет образца или он лежит далеко от машин — (0, 0)
function LearnGunPlacement(runtime, sample)
{
	if (!sample) return { x: 0, y: 0 };

	let nearest = null;
	let best = Infinity;
	for (const e of Instances(runtime, CFG.HunterType))
	{
		const d = Distance(sample, e);
		if (d < best) { best = d; nearest = e; }
	}
	if (!nearest || best > Math.max(nearest.width, nearest.height)) return { x: 0, y: 0 };

	// смещение пушки от машины переводим в систему координат машины (поворачиваем на -angle)
	const dx = sample.x - nearest.x;
	const dy = sample.y - nearest.y;
	const c = Math.cos(nearest.angle);
	const s = Math.sin(nearest.angle);
	return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

// точка, где стоит пушка охотника: так же, как на макете, и с учётом поворота машины
function MountPoint(hunter)
{
	const lx = GunLocal.x + CFG.GunOffsetX;
	const ly = GunLocal.y + CFG.GunOffsetY;
	const c = Math.cos(hunter.angle);
	const s = Math.sin(hunter.angle);
	return {
		x: hunter.x + lx * c - ly * s,
		y: hunter.y + lx * s + ly * c
	};
}

// создаёт по пушке на каждого охотника (вызывается в начале раунда)
function CreateGuns(runtime)
{
	const Gun = runtime.objects[CFG.GunType];
	if (!Gun) return;

	// запоминаем размер образца с макета и убираем лишние пушки, которые лежат на макете
	const sample = Gun.getFirstInstance();
	const w = sample?.width;
	const h = sample?.height;
	GunLocal = LearnGunPlacement(runtime, sample);   // где пушка стоит на машине на макете
	for (const old of Gun.getAllInstances()) old.destroy();

	for (const enemy of runtime.objects.enemy.instances())
	{
		const m = MountPoint(enemy);
		const gun = Gun.createInstance(enemy.layer.name, m.x, m.y);
		if (w !== undefined) { gun.width = w; gun.height = h; }

		gun.angle = enemy.angle;
		gun.owner = enemy;       // чья пушка
		enemy.gun = gun;         // и в обратную сторону: какая пушка у охотника

		gun.moveAdjacentToInstance(enemy, true);   // рисуем пушку прямо над машиной
	}
}

// каждый кадр: пушка едет за охотником и поворачивается на цель
function UpdateGuns(runtime)
{
	const Gun = runtime.objects[CFG.GunType];
	if (!Gun) return;

	for (const gun of Gun.instances())
	{
		const owner = gun.owner;
		if (!owner) continue;

		// охотник уничтожен — пушка тоже
		if (owner.dead)
		{
			gun.destroy();
			continue;
		}

		const m = MountPoint(owner);
		gun.x = m.x;
		gun.y = m.y;

		// есть цель — смотрим на неё, нет цели (или игрок сам рулит этим enemy) — вперёд по ходу машины
		const aim = hunterState.get(owner)?.aim;
		TurnTo(gun, aim ?? owner.angle, CFG.GunTurnSpeed * runtime.dt);
	}
}

// ===== API охотника =====

// вызывается в начале раунда (StartGame): у каждого охотника снова 10 выстрелов
function ResetHunters(runtime)
{
	// лучи прошлого раунда Construct уже удалил вместе с макетом —
	// destroy() у них вызывать нельзя (ошибка «reading 'DestroyInstance'»), просто забываем их
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

// точка, куда надо целиться: там, где Монстр будет к моменту прилёта луча
// lead — насколько точно учитываем скорость Монстра (1 = идеально)
function LeadPoint(target, dist, lead)
{
	let ax = target.x, ay = target.y;
	if (CFG.LeadAim)
	{
		const ms = MonsterData(target);
		const flight = dist / CFG.LaserSpeed;
		ax += ms.vx * flight * lead;
		ay += ms.vy * flight * lead;
	}
	return { x: ax, y: ay };
}

// ===== Охотник: увидел → навёл ствол → выстрелил =====
function UpdateHunter(runtime, hunter, monsters, dt)
{
	const st = HunterData(hunter);

	// таймер атаки
	if (st.cooldown > 0) st.cooldown -= dt;

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

	if (!target)
	{
		st.aim = null;   // не видит — ствол возвращается вперёд, выстрел не тратится
		return;
	}

	// ствол всё время следит за Монстром (даже между выстрелами)
	const mount = MountPoint(hunter);
	const track = LeadPoint(target, dist, (CFG.LeadMin + CFG.LeadMax) / 2);
	st.aim = Math.atan2(track.y - mount.y, track.x - mount.x);

	if (st.cooldown > 0 || st.shots >= CFG.MaxShots) return;   // ещё рано или выстрелы кончились

	// ствол ещё не довернулся на цель — ждём (выстрел не тратится)
	const gun = hunter.gun;
	if (gun && !gun.dead && AngleDiff(gun.angle, st.aim) > CFG.AimTolerance * Math.PI / 180) return;

	// начало новой очереди: сколько в ней выстрелов и насколько точно она будет стрелять
	if (st.burstLeft <= 0)
	{
		st.burstLeft = RandInt(CFG.BurstMin, CFG.BurstMax);
		st.burstSpread = Rand(CFG.SpreadMin, CFG.SpreadMax);   // одни очереди точные, другие «в молоко»
	}

	// прицел выстрела: скорость Монстра каждый раз учитывается неидеально
	const aimPoint = LeadPoint(target, dist, Rand(CFG.LeadMin, CFG.LeadMax));

	// случайное отклонение выстрела в пределах разброса этой очереди
	const error = (Math.random() * 2 - 1) * st.burstSpread * Math.PI / 180;

	Fire(runtime, hunter, st, Math.atan2(aimPoint.y - mount.y, aimPoint.x - mount.x) + error);

	// ритм: внутри очереди — короткие неровные интервалы, после очереди — длинная пауза
	st.burstLeft--;
	st.cooldown = (st.burstLeft > 0)
		? Rand(CFG.ShotGapMin, CFG.ShotGapMax)
		: Rand(CFG.PauseMin, CFG.PauseMax);
}

// ===== Выстрел =====
// Направление берём из прицела, а не из hunter.angle: угол enemy задаёт, куда он едет (MoveEnemies).
// Луч вылетает из среза ствола пушки.
function Fire(runtime, hunter, st, angle)
{
	const type = runtime.objects[CFG.LaserType];
	if (!type) return;

	// ствол смотрит туда же, куда полетит луч
	const gun = hunter.gun;
	if (gun && !gun.dead) gun.angle = angle;

	// срез ствола
	const mount = MountPoint(hunter);
	const mx = mount.x + Math.cos(angle) * CFG.GunMuzzle;
	const my = mount.y + Math.sin(angle) * CFG.GunMuzzle;

	st.shots++;   // боезапас уменьшился

	// ствол упёрся в стену — луч гаснет сразу
	if (!HasLineOfSight(runtime, mount.x, mount.y, mx, my)) return;

	const inst = type.createInstance(hunter.layer.name, mx, my);
	inst.angle = angle;

	lasers.push({ inst, x: mx, y: my, dx: Math.cos(angle), dy: Math.sin(angle), travelled: 0 });
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
		if (l.inst.dead) { lasers.splice(i, 1); continue; }

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

// попадание лазера снимает HP Монстра (общий HP игры)
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

// случайное число от min до max
function Rand(min, max)
{
	return min + Math.random() * (max - min);
}

// случайное целое от min до max включительно
function RandInt(min, max)
{
	return Math.floor(Rand(min, max + 1));
}

function Instances(runtime, typeName)
{
	return runtime.objects[typeName]?.getAllInstances() ?? [];
}