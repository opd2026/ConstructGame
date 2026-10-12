// ===== Переменные игры =====
let HP = 3;          // жизни
let Phase = 0;       // 0 — ловим врагов, 1 — враги гонятся за нами, 2 — победа
let TimeLeft = 30;   // секунд до смены фазы
let Invuln = 0;      // секунд неуязвимости после удара

// ===== Запуск =====
runOnStartup(async runtime =>
{
	// при каждом старте макета (и после рестарта) — сброс
	runtime.addEventListener("afteranylayoutstart", () => StartGame(runtime));

	// каждый кадр — игра
	runtime.addEventListener("tick", () => Tick(runtime));
});

// ===== Начало игры =====
function StartGame(runtime)
{
	HP = 3;
	Phase = 0;
	TimeLeft = 30;
	Invuln = 0;

	for (const heart of runtime.objects.hearth.instances())
		heart.setAnimation("full_hearth");

	for (const enemy of runtime.objects.enemy.instances())
		enemy.setAnimation("Animation 1");
}

// ===== Каждый кадр =====
function Tick(runtime)
{
	const car = runtime.objects.car.getFirstInstance();
	if (!car) return;

	Controls(runtime, car);
	UpdateTimer(runtime);
	MoveEnemies(runtime, car);
	CheckHits(runtime, car);
	UpdateInvuln(runtime, car);
	CheckWin(runtime);
}

// ===== Управление: WASD или стрелки =====
function Controls(runtime, car)
{
	const key = runtime.keyboard;
	const drive = car.behaviors.Машина;

	if (key.isKeyDown("KeyW") || key.isKeyDown("ArrowUp"))    drive.simulateControl("up");
	if (key.isKeyDown("KeyS") || key.isKeyDown("ArrowDown"))  drive.simulateControl("down");
	if (key.isKeyDown("KeyA") || key.isKeyDown("ArrowLeft"))  drive.simulateControl("left");
	if (key.isKeyDown("KeyD") || key.isKeyDown("ArrowRight")) drive.simulateControl("right");
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
