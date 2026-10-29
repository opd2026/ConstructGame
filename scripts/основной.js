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

const BoostMax = 5;       // запас ускорения, секунд
const BoostFactor = 2;    // во сколько раз быстрее на Shift
let BoostLeft = BoostMax; // сколько осталось
let BoostLocked = false;  // true — запас кончился, ждём полного восстановления
let BarWidth = 0;         // полная ширина шкалы

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
	BoostLeft = BoostMax;
	BoostLocked = false;
	BarWidth = runtime.objects.ШкалаУскорения?.getFirstInstance()?.width ?? 0;

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
	UpdateInvuln(runtime, Player);
	CheckWin(runtime);
	UpdateCamera(runtime, Player);
	UpdateBoostBar(runtime);
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